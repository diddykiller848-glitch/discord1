import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  type Interaction,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import {
  EXCHANGE_TYPES,
  PAYMENT_APPS,
  CURRENCY_LABEL,
  type ExchangeType,
  type ServiceType,
  getGuildConfig,
  updateGuildConfig,
  type GuildConfig,
} from "./config.js";

interface DraftTicket {
  type?: ExchangeType;
  paymentApp?: string;
  amount: string;
}

const drafts = new Map<string, DraftTicket>();

const draftKey = (guildId: string, userId: string) => `${guildId}:${userId}`;

function getDraft(guildId: string, userId: string): DraftTicket {
  const k = draftKey(guildId, userId);
  let d = drafts.get(k);
  if (!d) {
    d = { amount: "0" };
    drafts.set(k, d);
  }
  return d;
}

const DEFAULT_PANEL_TITLE = "RainyDay Services";
const DEFAULT_PANEL_DESCRIPTION = [
  "**Click a button below to get started:**",
  "• **Rate** — Check current exchange rates",
  "• **Exchange** — Open a currency exchange ticket",
  "• **Middleman** — Request a trusted middleman for a deal",
  "• **Buy** — Open a ticket to buy from us",
  "• **Sell** — Open a ticket to sell to us",
  "",
  "**__Important Notes:__**",
  "↪ Third-party payments are strictly prohibited.",
  "↪ We do **not** cover transaction fees.",
  "↪ Please check the rules channel before opening a ticket.",
].join("\n");

export function buildPanelMessage(cfg?: GuildConfig) {
  const p = cfg?.panel ?? {};
  const embed = new EmbedBuilder()
    .setColor(p.color ?? 0x5865f2)
    .setTitle(p.title ?? DEFAULT_PANEL_TITLE)
    .setDescription(p.description ?? DEFAULT_PANEL_DESCRIPTION);
  if (p.imageUrl) embed.setImage(p.imageUrl);
  if (p.thumbnailUrl) embed.setThumbnail(p.thumbnailUrl);
  if (p.footer) embed.setFooter({ text: p.footer });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("exchange:rate")
      .setLabel("Rate")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("exchange:create")
      .setLabel("Exchange")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("service:middleman")
      .setLabel("Middleman")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("service:buy")
      .setLabel("Buy")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("service:sell")
      .setLabel("Sell")
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1] };
}

function buildCategorySelect() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("exchange:type")
    .setPlaceholder("What you will be sending / receiving?")
    .addOptions(
      EXCHANGE_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
        description: t.description,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildPaymentAppSelect(type: ExchangeType) {
  const apps = PAYMENT_APPS[type] ?? [];
  const select = new StringSelectMenuBuilder()
    .setCustomId("exchange:app")
    .setPlaceholder("Select a Payment App?")
    .addOptions(apps.map((a) => ({ label: a, value: a })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildAmountKeypad(type: ExchangeType, amount: string) {
  const currency = CURRENCY_LABEL[type];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Currency Amount Selection")
    .setDescription("Click the buttons below to enter an amount.")
    .addFields({
      name: "Current Amount",
      value: `\`\`\`${currency === "INR" ? "₹" : currency === "NPR" ? "रु" : "$"}${
        amount || "0"
      }\`\`\``,
    });

  const mkBtn = (key: string, label?: string, style: ButtonStyle = ButtonStyle.Secondary) =>
    new ButtonBuilder()
      .setCustomId(`exchange:key:${key}`)
      .setLabel(label ?? key)
      .setStyle(style);

  const r1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    mkBtn("1"),
    mkBtn("2"),
    mkBtn("3"),
  );
  const r2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    mkBtn("4"),
    mkBtn("5"),
    mkBtn("6"),
  );
  const r3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    mkBtn("7"),
    mkBtn("8"),
    mkBtn("9"),
  );
  const r4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    mkBtn("dot", "."),
    mkBtn("0"),
    mkBtn("modal", `Enter Amount in ${currency}`, ButtonStyle.Primary),
    mkBtn("clear", "Clear", ButtonStyle.Danger),
  );
  const r5 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    mkBtn("submit", "Submit", ButtonStyle.Success),
  );

  return { embeds: [embed], components: [r1, r2, r3, r4, r5] };
}

async function handleRate(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const cfg = await getGuildConfig(interaction.guildId);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Current Exchange Rates")
    .setDescription(cfg.rates ?? "Rates have not been configured yet. Ask an admin to run `/setexchange rates`.");
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleCreate(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  drafts.delete(draftKey(interaction.guildId, interaction.user.id));
  await interaction.reply({
    content: "Select what you'd like to exchange:",
    components: [buildCategorySelect()],
    ephemeral: true,
  });
}

async function handleTypeSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.guildId) return;
  const type = interaction.values[0] as ExchangeType;
  const draft = getDraft(interaction.guildId, interaction.user.id);
  draft.type = type;
  draft.amount = "0";
  draft.paymentApp = undefined;

  if (PAYMENT_APPS[type] && PAYMENT_APPS[type].length > 0) {
    await interaction.update({
      content: `**${EXCHANGE_TYPES.find((t) => t.value === type)?.label}** — pick a payment app:`,
      components: [buildPaymentAppSelect(type)],
    });
  } else {
    await interaction.update({
      content: `**${EXCHANGE_TYPES.find((t) => t.value === type)?.label}** — enter the amount:`,
      ...buildAmountKeypad(type, draft.amount),
    });
  }
}

async function handleAppSelect(interaction: StringSelectMenuInteraction) {
  if (!interaction.guildId) return;
  const draft = getDraft(interaction.guildId, interaction.user.id);
  draft.paymentApp = interaction.values[0];
  if (!draft.type) {
    await interaction.update({ content: "Session expired, please start again.", components: [] });
    return;
  }
  await interaction.update({
    content: `**Payment app:** ${draft.paymentApp}\nNow enter the amount:`,
    ...buildAmountKeypad(draft.type, draft.amount),
  });
}

async function handleKeypad(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const draft = getDraft(interaction.guildId, interaction.user.id);
  if (!draft.type) {
    await interaction.update({ content: "Session expired, please start again.", components: [] });
    return;
  }
  const key = interaction.customId.split(":")[2];

  if (key === "modal") {
    const modal = new ModalBuilder().setCustomId("exchange:amountModal").setTitle("Enter Amount");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`Amount in ${CURRENCY_LABEL[draft.type]}`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(draft.amount === "0" ? "" : draft.amount),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (key === "submit") {
    await openTicket(interaction, draft);
    return;
  }
  if (key === "clear") {
    draft.amount = "0";
  } else if (key === "dot") {
    if (!draft.amount.includes(".")) draft.amount = (draft.amount || "0") + ".";
  } else if (/^[0-9]$/.test(key)) {
    if (draft.amount === "0") draft.amount = key;
    else if (draft.amount.length < 16) draft.amount += key;
  }

  await interaction.update(buildAmountKeypad(draft.type, draft.amount));
}

async function handleAmountModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guildId) return;
  const draft = getDraft(interaction.guildId, interaction.user.id);
  if (!draft.type) {
    await interaction.reply({ content: "Session expired, please start again.", ephemeral: true });
    return;
  }
  const raw = interaction.fields.getTextInputValue("amount").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    await interaction.reply({ content: "Invalid amount.", ephemeral: true });
    return;
  }
  draft.amount = raw;
  await interaction.reply({
    content: `Amount set to **${raw} ${CURRENCY_LABEL[draft.type]}**. Click **Submit** to open your ticket.`,
    ephemeral: true,
  });
}

async function openTicket(interaction: ButtonInteraction, draft: DraftTicket) {
  if (!interaction.guild || !draft.type) return;
  const cfg = await getGuildConfig(interaction.guild.id);
  if (!cfg.ticketCategoryId) {
    await interaction.update({
      content: "❌ Ticket category not set. Ask an admin to run `/setexchange category`.",
      components: [],
      embeds: [],
    });
    return;
  }
  const roleId = cfg.roles[draft.type];
  if (!roleId) {
    await interaction.update({
      content: `❌ No staff role configured for **${draft.type}**. Ask an admin to run \`/setexchange role\`.`,
      components: [],
      embeds: [],
    });
    return;
  }

  const amountNum = Number(draft.amount);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    await interaction.update({
      content: "❌ Please enter a valid amount before submitting.",
      components: [],
      embeds: [],
    });
    return;
  }

  await interaction.deferUpdate();

  const newCounter = (
    await updateGuildConfig(interaction.guild.id, (c) => {
      c.ticketCounter = (c.ticketCounter ?? 0) + 1;
    })
  ).ticketCounter;

  const exchangeLabel = EXCHANGE_TYPES.find((t) => t.value === draft.type)!.label;
  const channelName = `ticket-${draft.type}-${String(newCounter).padStart(4, "0")}`;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  const ticketEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${exchangeLabel} Exchange — #${String(newCounter).padStart(4, "0")}`)
    .addFields(
      { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Type", value: exchangeLabel, inline: true },
      { name: "Amount", value: `${draft.amount} ${CURRENCY_LABEL[draft.type]}`, inline: true },
      ...(draft.paymentApp
        ? [{ name: "Payment App", value: draft.paymentApp, inline: true }]
        : []),
    )
    .setTimestamp(new Date());

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("exchange:close")
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `<@${interaction.user.id}> <@&${roleId}>`,
    embeds: [ticketEmbed],
    components: [closeRow],
  });

  drafts.delete(draftKey(interaction.guild.id, interaction.user.id));

  await interaction.editReply({
    content: `✅ Ticket created: <#${channel.id}>`,
    components: [],
    embeds: [],
  });
}

async function handleClose(interaction: ButtonInteraction) {
  if (!interaction.guild || !interaction.channel) return;
  const member = interaction.member as GuildMember | null;
  const cfg = await getGuildConfig(interaction.guild.id);
  const allowedRoles = new Set(Object.values(cfg.roles));
  const hasStaff =
    member?.permissions.has(PermissionFlagsBits.ManageChannels) ||
    [...allowedRoles].some((r) => r && member?.roles.cache.has(r));
  if (!hasStaff) {
    await interaction.reply({
      content: "Only staff can close this ticket.",
      ephemeral: true,
    });
    return;
  }
  await interaction.reply({ content: "Closing ticket in 5s…" });
  setTimeout(() => {
    (interaction.channel as TextChannel)?.delete().catch(() => undefined);
  }, 5000);
}

export async function postPanel(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Run this in a text channel.", ephemeral: true });
    return;
  }
  const cfg = interaction.guildId ? await getGuildConfig(interaction.guildId) : undefined;
  await (interaction.channel as TextChannel).send(buildPanelMessage(cfg));
  if (interaction.guildId) {
    await updateGuildConfig(interaction.guildId, (c) => {
      c.panelChannelId = interaction.channelId;
    });
  }
  await interaction.reply({ content: "✅ Panel posted.", ephemeral: true });
}

const SERVICE_LABEL: Record<ServiceType, string> = {
  middleman: "Middleman",
  buy: "Buy",
  sell: "Sell",
};

async function handleServiceButton(interaction: ButtonInteraction) {
  const svc = interaction.customId.split(":")[1] as ServiceType;
  if (!SERVICE_LABEL[svc]) return;

  const modal = new ModalBuilder()
    .setCustomId(`service:modal:${svc}`)
    .setTitle(`${SERVICE_LABEL[svc]} Ticket`);

  const dealInput = new TextInputBuilder()
    .setCustomId("deal")
    .setLabel(
      svc === "middleman"
        ? "Deal details (what's being traded?)"
        : svc === "buy"
          ? "What do you want to buy?"
          : "What do you want to sell?",
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);

  const valueInput = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Total value / price (with currency)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const partyInput = new TextInputBuilder()
    .setCustomId("party")
    .setLabel(svc === "middleman" ? "Other party (@mention or username)" : "Notes (payment method, timing, etc.)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(dealInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(valueInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(partyInput),
  );
  await interaction.showModal(modal);
}

async function handleServiceModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;
  const svc = interaction.customId.split(":")[2] as ServiceType;
  if (!SERVICE_LABEL[svc]) return;

  const cfg = await getGuildConfig(interaction.guild.id);
  if (!cfg.ticketCategoryId) {
    await interaction.reply({
      content: "❌ Ticket category not set. Ask an admin to run `/setup`.",
      ephemeral: true,
    });
    return;
  }
  const roleId = cfg.serviceRoles[svc];
  if (!roleId) {
    await interaction.reply({
      content: `❌ No staff role configured for **${SERVICE_LABEL[svc]}**. Ask an admin to run \`/setup\`.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const newCounter = (
    await updateGuildConfig(interaction.guild.id, (c) => {
      c.ticketCounter = (c.ticketCounter ?? 0) + 1;
    })
  ).ticketCounter;

  const channelName = `${svc}-${String(newCounter).padStart(4, "0")}`;
  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: cfg.ticketCategoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
      {
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });

  const deal = interaction.fields.getTextInputValue("deal");
  const value = interaction.fields.getTextInputValue("value");
  const party = interaction.fields.getTextInputValue("party") || "—";

  const embed = new EmbedBuilder()
    .setColor(svc === "middleman" ? 0x9b59b6 : svc === "buy" ? 0x2ecc71 : 0xe67e22)
    .setTitle(`${SERVICE_LABEL[svc]} Ticket — #${String(newCounter).padStart(4, "0")}`)
    .addFields(
      { name: "Customer", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Service", value: SERVICE_LABEL[svc], inline: true },
      { name: "Value", value: value, inline: true },
      {
        name: svc === "middleman" ? "Deal" : svc === "buy" ? "Wants to buy" : "Wants to sell",
        value: deal,
      },
      { name: svc === "middleman" ? "Other party" : "Notes", value: party },
    )
    .setTimestamp(new Date());

  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("exchange:close").setLabel("Close Ticket").setStyle(ButtonStyle.Danger),
  );

  await channel.send({
    content: `<@${interaction.user.id}> <@&${roleId}>`,
    embeds: [embed],
    components: [closeRow],
  });

  await interaction.editReply({ content: `✅ Ticket created: <#${channel.id}>` });
}

export async function routeExchangeInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id === "exchange:rate") {
      await handleRate(interaction);
      return true;
    }
    if (id === "exchange:create") {
      await handleCreate(interaction);
      return true;
    }
    if (id === "exchange:close") {
      await handleClose(interaction);
      return true;
    }
    if (id.startsWith("exchange:key:")) {
      await handleKeypad(interaction);
      return true;
    }
    if (id.startsWith("service:") && !id.startsWith("service:modal:")) {
      await handleServiceButton(interaction);
      return true;
    }
  }
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "exchange:type") {
      await handleTypeSelect(interaction);
      return true;
    }
    if (interaction.customId === "exchange:app") {
      await handleAppSelect(interaction);
      return true;
    }
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "exchange:amountModal") {
      await handleAmountModal(interaction);
      return true;
    }
    if (interaction.customId.startsWith("service:modal:")) {
      await handleServiceModal(interaction);
      return true;
    }
  }
  return false;
}
