import {
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import {
  EXCHANGE_TYPES,
  type ExchangeType,
  type ServiceType,
  type VouchRecord,
  getGuildConfig,
  updateGuildConfig,
} from "./config.js";
import { lookupAddress, type AddressLookup, type TxSummary } from "./crypto.js";
import { buildPanelMessage, postPanel } from "./exchange.js";
import { startAutoMsgFlow, startJoinVCFlow } from "./dmflow.js";
import { getTasksForUser, stopTask } from "./selfbot.js";

export const commands = [
  new SlashCommandBuilder()
    .setName("tx")
    .setDescription("Show the latest transactions for a crypto wallet address.")
    .addStringOption((o) =>
      o.setName("address").setDescription("Wallet address (BTC, ETH, TRX, SOL, LTC, DOGE)").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Post the RainyDay Exchange panel in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()),
  new SlashCommandBuilder()
    .setName("setexchange")
    .setDescription("Configure the exchange ticket system.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((s) =>
      s
        .setName("role")
        .setDescription("Map a staff role to an exchange type")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Exchange type")
            .setRequired(true)
            .addChoices(
              ...EXCHANGE_TYPES.map((t) => ({ name: `${t.value} — ${t.label}`, value: t.value })),
            ),
        )
        .addRoleOption((o) =>
          o.setName("role").setDescription("Staff role that can access this ticket type").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("category")
        .setDescription("Set the channel category where tickets are created")
        .addChannelOption((o) =>
          o.setName("category").setDescription("Category channel").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("rates")
        .setDescription("Set the text shown when a customer clicks Rate")
        .addStringOption((o) =>
          o.setName("text").setDescription("Rate text (supports markdown)").setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("show").setDescription("Show the current configuration")),
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Auto-create roles, ticket category, vouch channel and post the panel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator.toString())
    .addChannelOption((o) =>
      o
        .setName("panel_channel")
        .setDescription("Channel where the panel will be posted (optional — defaults to current).")
        .setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("setpanel")
    .setDescription("Customize the panel embed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addSubcommand((s) =>
      s
        .setName("title")
        .setDescription("Set the panel title")
        .addStringOption((o) => o.setName("text").setDescription("New title").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("description")
        .setDescription("Set the panel description (use \\n for new lines)")
        .addStringOption((o) =>
          o.setName("text").setDescription("Description").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("color")
        .setDescription("Set the embed color (hex, e.g. #5865f2)")
        .addStringOption((o) => o.setName("hex").setDescription("Hex color").setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("image")
        .setDescription("Set a large image (URL). Pass empty to remove.")
        .addStringOption((o) =>
          o.setName("url").setDescription("Image URL or empty").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("thumbnail")
        .setDescription("Set a small thumbnail (URL). Pass empty to remove.")
        .addStringOption((o) =>
          o.setName("url").setDescription("Thumbnail URL or empty").setRequired(false),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("footer")
        .setDescription("Set the footer text. Pass empty to remove.")
        .addStringOption((o) =>
          o.setName("text").setDescription("Footer text").setRequired(false),
        ),
    )
    .addSubcommand((s) => s.setName("preview").setDescription("Preview the current panel"))
    .addSubcommand((s) => s.setName("reset").setDescription("Reset the panel to defaults")),
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Post a vouch for a successful trade.")
    .addUserOption((o) =>
      o.setName("user").setDescription("Who you traded with").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("service")
        .setDescription("Type of service")
        .setRequired(true)
        .addChoices(
          { name: "Exchange", value: "exchange" },
          { name: "Middleman", value: "middleman" },
          { name: "Buy", value: "buy" },
          { name: "Sell", value: "sell" },
        ),
    )
    .addStringOption((o) =>
      o.setName("amount").setDescription("Trade amount (e.g. ₹5000, 0.01 BTC)").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("comment").setDescription("Short comment (optional)").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("setvouchchannel")
    .setDescription("Set the channel where vouches are posted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Vouch channel").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close the current ticket (staff only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString()),
  new SlashCommandBuilder()
    .setName("add")
    .setDescription("Add a user to the current ticket (staff only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .addUserOption((o) => o.setName("user").setDescription("User to add").setRequired(true)),
  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a user from the current ticket (staff only).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
    .addUserOption((o) => o.setName("user").setDescription("User to remove").setRequired(true)),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Show trade profile and vouch stats for a user.")
    .addUserOption((o) =>
      o.setName("user").setDescription("User to look up (defaults to you)").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("joinvc")
    .setDescription("Join a voice channel using a user token (setup in DMs)."),
  new SlashCommandBuilder()
    .setName("automsg")
    .setDescription("Auto-send messages via a user token (setup in DMs)."),
  new SlashCommandBuilder()
    .setName("stoptask")
    .setDescription("Stop a running automsg or joinvc task.")
    .addStringOption((o) =>
      o.setName("id").setDescription("Task ID (from the confirmation DM)").setRequired(false),
    ),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available commands."),
].map((c) => c.toJSON());

export async function registerCommands(token: string, clientId: string, guildId?: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  }
}

function statusBadge(tx: TxSummary): string {
  if (!tx.confirmed) return "🟡 Pending";
  if (tx.confirmations != null) return `🟢 Confirmed · ${tx.confirmations} conf`;
  return "🟢 Confirmed";
}

function arrow(d: TxSummary["direction"]): string {
  switch (d) {
    case "in":
      return "⬇️ IN";
    case "out":
      return "⬆️ OUT";
    case "self":
      return "🔄 SELF";
    default:
      return "•";
  }
}

function shortHash(h: string): string {
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}

function shortAddr(a?: string): string {
  if (!a) return "—";
  return a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

export function buildTxEmbed(lookup: AddressLookup): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(lookup.txs.some((t) => !t.confirmed) ? 0xf1c40f : 0x2ecc71)
    .setTitle(`${lookup.chain} Wallet · Latest Transactions`)
    .setURL(lookup.explorerUrl)
    .setDescription(
      `**Address:** \`${lookup.address}\`${lookup.balance ? `\n**Balance:** ${lookup.balance}` : ""}`,
    )
    .setTimestamp(new Date());

  if (lookup.txs.length === 0) {
    embed.addFields({ name: "No transactions found", value: "This address has no recorded activity." });
    return embed;
  }

  for (const tx of lookup.txs) {
    const ts = tx.timestamp ? `<t:${tx.timestamp}:R>` : "—";
    const lines = [
      `${statusBadge(tx)} · ${arrow(tx.direction)}`,
      `**Amount:** ${tx.amount}`,
      tx.counterparty ? `**${tx.direction === "in" ? "From" : "To"}:** \`${shortAddr(tx.counterparty)}\`` : "",
      `**When:** ${ts}`,
      `[\`${shortHash(tx.hash)}\`](${tx.url})`,
    ].filter(Boolean);
    embed.addFields({ name: "\u200b", value: lines.join("\n") });
  }

  embed.setFooter({ text: "RainyDay · powered by public block explorers" });
  return embed;
}

async function handleTx(addressArg: string): Promise<EmbedBuilder> {
  const lookup = await lookupAddress(addressArg);
  return buildTxEmbed(lookup);
}

async function handleSetExchange(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const sub = interaction.options.getSubcommand();
  if (sub === "role") {
    const type = interaction.options.getString("type", true) as ExchangeType;
    const role = interaction.options.getRole("role", true);
    await updateGuildConfig(interaction.guildId, (c) => {
      c.roles[type] = role.id;
    });
    await interaction.reply({
      content: `✅ Role <@&${role.id}> mapped to **${type}**.`,
      ephemeral: true,
    });
  } else if (sub === "category") {
    const ch = interaction.options.getChannel("category", true);
    if (ch.type !== 4) {
      await interaction.reply({ content: "❌ That isn't a category channel.", ephemeral: true });
      return;
    }
    await updateGuildConfig(interaction.guildId, (c) => {
      c.ticketCategoryId = ch.id;
    });
    await interaction.reply({ content: `✅ Ticket category set to **${ch.name}**.`, ephemeral: true });
  } else if (sub === "rates") {
    const text = interaction.options.getString("text", true);
    await updateGuildConfig(interaction.guildId, (c) => {
      c.rates = text;
    });
    await interaction.reply({ content: "✅ Rates updated.", ephemeral: true });
  } else if (sub === "show") {
    const cfg = await getGuildConfig(interaction.guildId);
    const lines = [
      `**Ticket category:** ${cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "_unset_"}`,
      `**Rates set:** ${cfg.rates ? "yes" : "no"}`,
      "",
      "**Role mappings:**",
      ...EXCHANGE_TYPES.map(
        (t) => `• \`${t.value}\` ${t.label} → ${cfg.roles[t.value] ? `<@&${cfg.roles[t.value]}>` : "_unset_"}`,
      ),
    ];
    await interaction.reply({ content: lines.join("\n"), ephemeral: true });
  }
}

async function handleSetup(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;
  const guild = interaction.guild;
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "❌ I need **Manage Roles** and **Manage Channels** permissions. Please re-invite me with the link `/help` shows, or grant Administrator.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const log: string[] = [];

  // 1. Create or reuse roles
  const ROLE_COLORS: Record<ExchangeType, number> = {
    i2c: 0xf1c40f,
    c2i: 0xe67e22,
    p2c: 0x3498db,
    c2p: 0x2980b9,
    ca2c: 0x2ecc71,
    c2ca: 0x27ae60,
    n2c: 0xe74c3c,
    c2n: 0xc0392b,
  };

  const roleMap: Partial<Record<ExchangeType, string>> = {};
  for (const t of EXCHANGE_TYPES) {
    const roleName = `exchange-${t.value}`;
    let role = guild.roles.cache.find((r) => r.name === roleName);
    if (!role) {
      try {
        role = await guild.roles.create({
          name: roleName,
          color: ROLE_COLORS[t.value],
          mentionable: true,
          reason: `Auto-created by RainyDay setup for ${t.label}`,
        });
        log.push(`• Created role <@&${role.id}> (${t.label})`);
      } catch (e) {
        log.push(`• ❌ Failed to create role \`${roleName}\`: ${(e as Error).message}`);
        continue;
      }
    } else {
      log.push(`• Reused existing role <@&${role.id}> (${t.label})`);
    }
    roleMap[t.value] = role.id;
  }

  // 1b. Create or reuse service roles (middleman, buy, sell)
  const SERVICES: { value: ServiceType; label: string; color: number }[] = [
    { value: "middleman", label: "Middleman", color: 0x9b59b6 },
    { value: "buy", label: "Buy", color: 0x1abc9c },
    { value: "sell", label: "Sell", color: 0xd35400 },
  ];
  const serviceMap: Partial<Record<ServiceType, string>> = {};
  for (const s of SERVICES) {
    const roleName = `${s.value}-staff`;
    let role = guild.roles.cache.find((r) => r.name === roleName);
    if (!role) {
      try {
        role = await guild.roles.create({
          name: roleName,
          color: s.color,
          mentionable: true,
          reason: `Auto-created by RainyDay setup for ${s.label}`,
        });
        log.push(`• Created role <@&${role.id}> (${s.label} staff)`);
      } catch (e) {
        log.push(`• ❌ Failed to create role \`${roleName}\`: ${(e as Error).message}`);
        continue;
      }
    } else {
      log.push(`• Reused existing role <@&${role.id}> (${s.label} staff)`);
    }
    serviceMap[s.value] = role.id;
  }

  // 2. Create or reuse the ticket category
  const categoryName = "Exchange Tickets";
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
  );
  if (!category) {
    try {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.SendMessages,
            ],
          },
        ],
      });
      log.push(`• Created ticket category **${categoryName}**`);
    } catch (e) {
      log.push(`• ❌ Failed to create ticket category: ${(e as Error).message}`);
    }
  } else {
    log.push(`• Reused existing ticket category **${categoryName}**`);
  }

  // 2b. Create or reuse the vouches channel
  const vouchName = "vouches";
  let vouchChannel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === vouchName,
  ) as TextChannel | undefined;
  if (!vouchChannel) {
    try {
      vouchChannel = await guild.channels.create({
        name: vouchName,
        type: ChannelType.GuildText,
        topic: "Post your trade vouches here using /vouch",
      });
      log.push(`• Created <#${vouchChannel.id}> for vouches`);
    } catch (e) {
      log.push(`• ❌ Failed to create #vouches: ${(e as Error).message}`);
    }
  } else {
    log.push(`• Reused existing <#${vouchChannel.id}>`);
  }

  // 3. Save config
  await updateGuildConfig(guild.id, (cfg) => {
    for (const [k, v] of Object.entries(roleMap)) {
      cfg.roles[k as ExchangeType] = v;
    }
    for (const [k, v] of Object.entries(serviceMap)) {
      cfg.serviceRoles[k as ServiceType] = v;
    }
    if (category) cfg.ticketCategoryId = category.id;
    if (vouchChannel) cfg.vouchChannelId = vouchChannel.id;
    if (!cfg.rates) {
      cfg.rates = "Rates have not been set yet. Use `/setexchange rates` to update.";
    }
  });

  // 4. Post the panel
  const panelChannelOpt = interaction.options.getChannel("panel_channel");
  const panelChannel =
    panelChannelOpt && panelChannelOpt.type === ChannelType.GuildText
      ? (guild.channels.cache.get(panelChannelOpt.id) as TextChannel)
      : interaction.channel?.type === ChannelType.GuildText
        ? (interaction.channel as TextChannel)
        : null;

  if (panelChannel) {
    try {
      const fresh = await getGuildConfig(guild.id);
      await panelChannel.send(buildPanelMessage(fresh));
      await updateGuildConfig(guild.id, (cfg) => {
        cfg.panelChannelId = panelChannel.id;
      });
      log.push(`• Posted services panel in <#${panelChannel.id}>`);
    } catch (e) {
      log.push(`• ❌ Failed to post panel: ${(e as Error).message}`);
    }
  } else {
    log.push(`• ⚠️ Skipped posting panel (no text channel available — run \`/panel\` later).`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("✅ Setup complete")
    .setDescription(log.join("\n"))
    .addFields({
      name: "Next step",
      value:
        "Assign the `exchange-*` roles to your staff members. They'll automatically get access to the matching ticket type.\n\nOptionally, run `/setexchange rates text:\"...\"` to set your live rates.",
    });

  await interaction.editReply({ embeds: [embed] });
}

async function handleSetPanel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Guild only.", ephemeral: true });
    return;
  }
  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  if (sub === "preview") {
    const cfg = await getGuildConfig(interaction.guildId);
    await interaction.editReply(buildPanelMessage(cfg));
    return;
  }

  if (sub === "reset") {
    await updateGuildConfig(interaction.guildId, (c) => {
      c.panel = {};
    });
    await interaction.editReply("✅ Panel reset to defaults. Use `/panel` to repost.");
    return;
  }

  await updateGuildConfig(interaction.guildId, (c) => {
    if (sub === "title") c.panel.title = interaction.options.getString("text", true);
    else if (sub === "description")
      c.panel.description = interaction.options
        .getString("text", true)
        .replace(/\\n/g, "\n");
    else if (sub === "color") {
      const hex = interaction.options.getString("hex", true).replace(/^#/, "");
      const n = parseInt(hex, 16);
      if (!Number.isNaN(n)) c.panel.color = n;
    } else if (sub === "image") {
      const url = interaction.options.getString("url") ?? "";
      c.panel.imageUrl = url || undefined;
    } else if (sub === "thumbnail") {
      const url = interaction.options.getString("url") ?? "";
      c.panel.thumbnailUrl = url || undefined;
    } else if (sub === "footer") {
      const txt = interaction.options.getString("text") ?? "";
      c.panel.footer = txt || undefined;
    }
  });

  await interaction.editReply("✅ Panel updated. Repost with `/panel` to refresh.");
}

async function handleVouch(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Guild only.", ephemeral: true });
    return;
  }
  const cfg = await getGuildConfig(interaction.guildId);
  if (!cfg.vouchChannelId) {
    await interaction.reply({
      content: "❌ Vouch channel not set. Admin: `/setvouchchannel` or `/setup`.",
      ephemeral: true,
    });
    return;
  }
  const target = interaction.options.getUser("user", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "❌ You can't vouch for yourself.", ephemeral: true });
    return;
  }
  const service = interaction.options.getString("service", true);
  const amount = interaction.options.getString("amount", true);
  const comment = interaction.options.getString("comment") ?? "";

  const channel = interaction.guild.channels.cache.get(cfg.vouchChannelId) as
    | TextChannel
    | undefined;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "❌ Vouch channel is invalid.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("⭐ New Vouch")
    .setDescription(`<@${interaction.user.id}> vouches for <@${target.id}>`)
    .addFields(
      { name: "Service", value: service, inline: true },
      { name: "Amount", value: amount, inline: true },
    )
    .setTimestamp(new Date());
  if (comment) embed.addFields({ name: "Comment", value: comment });

  await channel.send({ embeds: [embed] });

  const record: VouchRecord = {
    fromUserId: interaction.user.id,
    service,
    amount,
    comment: comment || undefined,
    timestamp: Date.now(),
  };
  await updateGuildConfig(interaction.guildId, (c) => {
    if (!c.userVouches) c.userVouches = {};
    if (!c.userVouches[target.id]) c.userVouches[target.id] = [];
    c.userVouches[target.id].push(record);
  });

  await interaction.reply({ content: `✅ Vouch posted in <#${channel.id}>.`, ephemeral: true });
}

async function handleProfile(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "Guild only.", ephemeral: true });
    return;
  }
  await interaction.deferReply();

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const cfg = await getGuildConfig(interaction.guildId);
  const vouches = cfg.userVouches?.[targetUser.id] ?? [];

  const totalVouches = vouches.length;
  const byService: Record<string, number> = {};
  for (const v of vouches) {
    byService[v.service] = (byService[v.service] ?? 0) + 1;
  }

  let badge = "🆕 New Trader";
  if (totalVouches >= 50) badge = "💎 Diamond Trader";
  else if (totalVouches >= 25) badge = "🥇 Gold Trader";
  else if (totalVouches >= 10) badge = "🥈 Silver Trader";
  else if (totalVouches >= 3) badge = "🥉 Bronze Trader";

  const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`${badge} — ${targetUser.username}`)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "Total Vouches", value: String(totalVouches), inline: true },
      { name: "Badge", value: badge, inline: true },
    );

  if (Object.keys(byService).length > 0) {
    embed.addFields({
      name: "Vouches by Service",
      value: Object.entries(byService)
        .map(([s, n]) => `**${s}**: ${n}`)
        .join(" · "),
    });
  }

  const recent = vouches.slice(-3).reverse();
  if (recent.length > 0) {
    embed.addFields({
      name: "Recent Vouches",
      value: recent
        .map(
          (v) =>
            `<t:${Math.floor(v.timestamp / 1000)}:R> · <@${v.fromUserId}> · **${v.service}** · ${v.amount}${v.comment ? ` — *${v.comment}*` : ""}`,
        )
        .join("\n"),
    });
  }

  if (member) {
    const exchangeRoles = Object.values(cfg.roles).filter((id) =>
      id ? member.roles.cache.has(id) : false,
    );
    const serviceRoles = Object.values(cfg.serviceRoles).filter((id) =>
      id ? member.roles.cache.has(id) : false,
    );
    const staffRoles = [...exchangeRoles, ...serviceRoles].filter(Boolean) as string[];
    if (staffRoles.length > 0) {
      embed.addFields({
        name: "Staff Roles",
        value: staffRoles.map((id) => `<@&${id}>`).join(" "),
      });
    }
  }

  embed.setTimestamp(new Date()).setFooter({ text: "RainyDay Exchange" });
  await interaction.editReply({ embeds: [embed] });
}

async function handleJoinVC(interaction: ChatInputCommandInteraction, client: Client) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Guild only.", ephemeral: true });
    return;
  }
  try {
    await startJoinVCFlow(
      interaction.user.id,
      client,
      interaction.guildId,
      interaction.channelId,
      interaction.channel?.toString() ?? interaction.channelId,
    );
    await interaction.reply({
      content: "📨 Check your DMs! I'll walk you through the setup there.",
      ephemeral: true,
    });
  } catch {
    await interaction.reply({
      content: "❌ Couldn't send you a DM. Enable DMs from server members and try again.",
      ephemeral: true,
    });
  }
}

async function handleAutoMsg(interaction: ChatInputCommandInteraction, client: Client) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Guild only.", ephemeral: true });
    return;
  }
  try {
    await startAutoMsgFlow(
      interaction.user.id,
      client,
      interaction.guildId,
      interaction.channelId,
      interaction.channel?.toString() ?? interaction.channelId,
    );
    await interaction.reply({
      content: "📨 Check your DMs! I'll walk you through the setup there.",
      ephemeral: true,
    });
  } catch {
    await interaction.reply({
      content: "❌ Couldn't send you a DM. Enable DMs from server members and try again.",
      ephemeral: true,
    });
  }
}

async function handleStopTask(interaction: ChatInputCommandInteraction) {
  const taskId = interaction.options.getString("id");
  const myTasks = getTasksForUser(interaction.user.id);

  if (taskId) {
    const ok = stopTask(taskId);
    if (!ok) {
      await interaction.reply({ content: `❌ Task \`${taskId}\` not found or not yours.`, ephemeral: true });
    } else {
      await interaction.reply({ content: `✅ Task \`${taskId}\` stopped.`, ephemeral: true });
    }
    return;
  }

  if (myTasks.length === 0) {
    await interaction.reply({ content: "You have no active tasks.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Your Active Tasks")
    .setDescription("Use `/stoptask id:<ID>` to stop a specific task.")
    .addFields(
      myTasks.map((t) => ({
        name: `\`${t.id}\` — ${t.type}`,
        value: `Started <t:${Math.floor(t.startedAt / 1000)}:R> · Duration: ${t.durationMs ? humanMs(t.durationMs) : "forever"}`,
      })),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

function humanMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86400_000) return `${(ms / 3600_000).toFixed(1)}h`;
  return `${(ms / 86400_000).toFixed(1)}d`;
}

async function handleSetVouchChannel(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;
  const ch = interaction.options.getChannel("channel", true);
  if (ch.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "❌ Pick a text channel.", ephemeral: true });
    return;
  }
  await updateGuildConfig(interaction.guildId, (c) => {
    c.vouchChannelId = ch.id;
  });
  await interaction.reply({ content: `✅ Vouch channel set to <#${ch.id}>.`, ephemeral: true });
}

async function handleSlashClose(interaction: ChatInputCommandInteraction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Run inside a ticket channel.", ephemeral: true });
    return;
  }
  const ch = interaction.channel as TextChannel;
  if (!ch.parentId) {
    await interaction.reply({ content: "❌ This isn't a ticket channel.", ephemeral: true });
    return;
  }
  await interaction.reply({ content: "Closing ticket in 5 seconds…" });
  setTimeout(() => {
    ch.delete().catch(() => undefined);
  }, 5000);
}

async function handleTicketUser(
  interaction: ChatInputCommandInteraction,
  action: "add" | "remove",
) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Run inside a ticket channel.", ephemeral: true });
    return;
  }
  const ch = interaction.channel as TextChannel;
  const user = interaction.options.getUser("user", true);
  try {
    if (action === "add") {
      await ch.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
      await interaction.reply({ content: `✅ Added <@${user.id}> to the ticket.` });
    } else {
      await ch.permissionOverwrites.delete(user.id).catch(async () => {
        await ch.permissionOverwrites.edit(user.id, { ViewChannel: false });
      });
      await interaction.reply({ content: `✅ Removed <@${user.id}> from the ticket.` });
    }
  } catch (e) {
    await interaction.reply({
      content: `❌ Failed: ${(e as Error).message}`,
      ephemeral: true,
    });
  }
}

export async function handleSlashCommand(interaction: ChatInputCommandInteraction, client: Client) {
  switch (interaction.commandName) {
    case "tx": {
      const addr = interaction.options.getString("address", true);
      await interaction.deferReply();
      try {
        const embed = await handleTx(addr);
        await interaction.editReply({ embeds: [embed] });
      } catch (e) {
        await interaction.editReply({
          content: `❌ ${(e as Error).message}`,
        });
      }
      break;
    }
    case "panel":
      await postPanel(interaction);
      break;
    case "setup":
      await handleSetup(interaction);
      break;
    case "setexchange":
      await handleSetExchange(interaction);
      break;
    case "setpanel":
      await handleSetPanel(interaction);
      break;
    case "vouch":
      await handleVouch(interaction);
      break;
    case "setvouchchannel":
      await handleSetVouchChannel(interaction);
      break;
    case "close":
      await handleSlashClose(interaction);
      break;
    case "add":
      await handleTicketUser(interaction, "add");
      break;
    case "remove":
      await handleTicketUser(interaction, "remove");
      break;
    case "profile":
      await handleProfile(interaction);
      break;
    case "joinvc":
      await handleJoinVC(interaction, client);
      break;
    case "automsg":
      await handleAutoMsg(interaction, client);
      break;
    case "stoptask":
      await handleStopTask(interaction);
      break;
    case "help":
      await interaction.reply({
        content: [
          "**RainyDay Bot — commands**",
          "`/setup` — auto-create staff roles, ticket category, and post the panel (admin)",
          "`/tx <address>` or `.tx <address>` — latest transactions for a wallet",
          "`/panel` — post the exchange panel (admin)",
          "`/setexchange role` — map a staff role to an exchange type (admin)",
          "`/setexchange category` — set the ticket channel category (admin)",
          "`/setexchange rates` — set the text shown by the **Rate** button (admin)",
          "`/setexchange show` — show current configuration (admin)",
          "`/setpanel` — customize the panel embed (title/desc/color/image/footer)",
          "`/vouch user service amount [comment]` — post a trade vouch",
          "`/setvouchchannel #channel` — set the vouches channel (admin)",
          "`/close`, `/add @user`, `/remove @user` — ticket controls (staff)",
          "`/profile [@user]` — show trade profile & vouch badge",
          "`/joinvc` — join a VC using a user token (setup in DMs)",
          "`/automsg` — auto-send messages via a user token (setup in DMs)",
          "`/stoptask [id]` — stop a running automsg/joinvc task",
          "",
          "Prefix: `.help`, `.tx <address>`, `.panel`, `.joinvc`, `.automsg` (admin)",
        ].join("\n"),
        ephemeral: true,
      });
      break;
    default:
      break;
  }
}

export const PREFIX = ".";

export async function handlePrefixMessage(message: Message) {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;
  const body = message.content.slice(PREFIX.length).trim();
  if (!body) return;
  const [cmd, ...rest] = body.split(/\s+/);
  const lower = cmd.toLowerCase();

  if (lower === "tx") {
    const addr = rest[0];
    if (!addr) {
      await message.reply("Usage: `.tx <address>`");
      return;
    }
    if ("sendTyping" in message.channel) {
      message.channel.sendTyping().catch(() => undefined);
    }
    try {
      const embed = await handleTx(addr);
      await message.reply({ embeds: [embed] });
    } catch (e) {
      await message.reply(`❌ ${(e as Error).message}`);
    }
    return;
  }

  if (lower === "panel") {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await message.reply("You need **Manage Server** to use this.");
      return;
    }
    if (!message.channel.isTextBased() || !("send" in message.channel)) return;
    const cfg = message.guildId ? await getGuildConfig(message.guildId) : undefined;
    await message.channel.send(buildPanelMessage(cfg));
    if (message.guildId) {
      await updateGuildConfig(message.guildId, (c) => {
        c.panelChannelId = message.channelId;
      });
    }
    return;
  }

  if (lower === "setup") {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply("You need **Administrator** to use this.");
      return;
    }
    await message.reply("Run `/setup` (slash command) — it needs to use Discord's interaction system to create roles, the category, and post the panel cleanly.");
    return;
  }

  if (lower === "joinvc" || lower === "automsg") {
    if (!message.guild) {
      await message.reply("Run this in a server channel.");
      return;
    }
    const client = message.client;
    try {
      if (lower === "joinvc") {
        await startJoinVCFlow(
          message.author.id,
          client,
          message.guild.id,
          message.channelId,
          message.channel.toString(),
        );
      } else {
        await startAutoMsgFlow(
          message.author.id,
          client,
          message.guild.id,
          message.channelId,
          message.channel.toString(),
        );
      }
      await message.reply("📨 Check your DMs! Setup started there.");
    } catch {
      await message.reply("❌ Couldn't DM you. Enable DMs from server members and try again.");
    }
    return;
  }

  if (lower === "help") {
    await message.reply({
      content: [
        "**RainyDay Bot**",
        "`.tx <address>` — latest transactions for a wallet",
        "`.panel` — post the exchange panel (admin)",
        "`.joinvc` — join a VC using a user token (setup in DMs)",
        "`.automsg` — auto-send messages via a user token (setup in DMs)",
        "Slash: `/tx`, `/panel`, `/setexchange`, `/profile`, `/vouch`, `/joinvc`, `/automsg`, `/help`",
      ].join("\n"),
    });
  }
}
