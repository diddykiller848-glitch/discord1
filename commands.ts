import {
  EmbedBuilder,
  type Client,
  type Message,
  type TextChannel,
  type DMChannel,
} from "discord.js";
import {
  startAutoMsg,
  startJoinVC,
  validateToken,
  parseDurationMs,
  parseRate,
} from "./selfbot.js";

type FlowStep = string;

interface FlowState {
  type: "automsg" | "joinvc";
  step: FlowStep;
  data: Record<string, string>;
  sourceGuildId: string;
  sourceChannelId: string;
  sourceChannelName: string;
}

const pending = new Map<string, FlowState>();

export function hasPendingFlow(userId: string): boolean {
  return pending.has(userId);
}

export async function startAutoMsgFlow(
  userId: string,
  client: Client,
  sourceGuildId: string,
  sourceChannelId: string,
  sourceChannelName: string,
): Promise<void> {
  pending.set(userId, {
    type: "automsg",
    step: "token",
    data: {},
    sourceGuildId,
    sourceChannelId,
    sourceChannelName,
  });
  const dm = await client.users.fetch(userId).then((u) => u.createDM());
  await dm.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📨 Auto Message Setup")
        .setDescription(
          [
            "**Step 1/4 — Discord Token**",
            "Send your Discord account token.",
            "",
            "⚠️ Your token gives full access to your account. This bot does **not** store it.",
            "Type `cancel` at any time to stop.",
          ].join("\n"),
        ),
    ],
  });
}

export async function startJoinVCFlow(
  userId: string,
  client: Client,
  sourceGuildId: string,
  sourceChannelId: string,
  sourceChannelName: string,
): Promise<void> {
  pending.set(userId, {
    type: "joinvc",
    step: "token",
    data: {},
    sourceGuildId,
    sourceChannelId,
    sourceChannelName,
  });
  const dm = await client.users.fetch(userId).then((u) => u.createDM());
  await dm.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("🔊 Join VC Setup")
        .setDescription(
          [
            "**Step 1/4 — Discord Token**",
            "Send your Discord account token.",
            "",
            "⚠️ Your token gives full access to your account. This bot does **not** store it.",
            "Type `cancel` at any time to stop.",
          ].join("\n"),
        ),
    ],
  });
}

export async function handleDMFlowMessage(msg: Message, client: Client): Promise<boolean> {
  if (!msg.author || msg.author.bot) return false;
  if (msg.guild) return false;

  const state = pending.get(msg.author.id);
  if (!state) return false;

  const text = msg.content.trim();
  const dm = msg.channel as DMChannel;

  if (text.toLowerCase() === "cancel") {
    pending.delete(msg.author.id);
    await dm.send("❌ Setup cancelled.");
    return true;
  }

  if (state.type === "automsg") {
    await handleAutoMsgStep(state, text, dm, msg.author.id, client);
  } else {
    await handleJoinVCStep(state, text, dm, msg.author.id, client);
  }
  return true;
}

async function handleAutoMsgStep(
  state: FlowState,
  text: string,
  dm: DMChannel,
  userId: string,
  client: Client,
): Promise<void> {
  switch (state.step) {
    case "token": {
      await dm.send({ embeds: [stepEmbed("Validating token…", 0x5865f2)] });
      const info = await validateToken(text);
      if (!info) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid token. Please send a valid Discord token or type `cancel`.", 0xe74c3c)] });
        return;
      }
      state.data.token = text;
      state.data.tokenUser = info.username;
      state.step = "channelId";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📨 Auto Message Setup")
            .setDescription(
              [
                `✅ Token valid — **${info.username}**`,
                "",
                "**Step 2/4 — Channel ID**",
                "Send the ID of the channel where messages should be sent.",
                "(Right-click channel → Copy Channel ID. Developer Mode must be on.)",
              ].join("\n"),
            ),
        ],
      });
      break;
    }
    case "channelId": {
      if (!/^\d{17,20}$/.test(text)) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid channel ID. Must be a 17-20 digit number.", 0xe74c3c)] });
        return;
      }
      state.data.channelId = text;
      state.step = "message";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📨 Auto Message Setup")
            .setDescription("**Step 3/4 — Message Text**\nWhat message should be sent repeatedly?"),
        ],
      });
      break;
    }
    case "message": {
      if (text.length > 2000) {
        await dm.send({ embeds: [stepEmbed("❌ Message too long (max 2000 chars).", 0xe74c3c)] });
        return;
      }
      state.data.message = text;
      state.step = "rate";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📨 Auto Message Setup")
            .setDescription(
              [
                "**Step 4/4 — Rate & Duration**",
                "Format: `<msgs>/<min> <duration>`",
                "",
                "Examples:",
                "• `3/1 24/7` — 3 msgs per min, forever",
                "• `1/2 2h` — 1 msg per 2 min, for 2 hours",
                "• `5/1 30m` — 5 msgs per min, for 30 minutes",
                "• `2/1 1d` — 2 msgs per min, for 1 day",
              ].join("\n"),
            ),
        ],
      });
      break;
    }
    case "rate": {
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        await dm.send({ embeds: [stepEmbed("❌ Format: `<msgs>/<min> <duration>` (e.g. `3/1 24/7`)", 0xe74c3c)] });
        return;
      }
      const rate = parseRate(parts[0]);
      if (!rate) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid rate. Use format like `3/1` (3 msgs per 1 min).", 0xe74c3c)] });
        return;
      }
      const durationMs = parseDurationMs(parts[1]);
      pending.delete(userId);

      const durationLabel = durationMs === null ? "forever (24/7)" : humanDuration(durationMs);

      const task = startAutoMsg({
        userId,
        token: state.data.token,
        channelId: state.data.channelId,
        message: state.data.message,
        intervalMs: rate.intervalMs,
        durationMs,
        onStop: () => {
          notifyCompletion(client, state, "automsg", {
            channelId: state.data.channelId,
            message: state.data.message,
            rate: parts[0],
            duration: durationLabel,
            tokenUser: state.data.tokenUser,
            taskId: task.id,
          }).catch(() => undefined);
        },
      });

      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Auto Message Started")
            .addFields(
              { name: "Token Account", value: state.data.tokenUser, inline: true },
              { name: "Channel", value: `\`${state.data.channelId}\``, inline: true },
              { name: "Rate", value: parts[0], inline: true },
              { name: "Duration", value: durationLabel, inline: true },
              { name: "Task ID", value: `\`${task.id}\``, inline: true },
            )
            .setFooter({ text: "Use /stoptask to cancel" })
            .setTimestamp(new Date()),
        ],
      });
      break;
    }
  }
  pending.set(userId, state);
}

async function handleJoinVCStep(
  state: FlowState,
  text: string,
  dm: DMChannel,
  userId: string,
  client: Client,
): Promise<void> {
  switch (state.step) {
    case "token": {
      await dm.send({ embeds: [stepEmbed("Validating token…", 0x9b59b6)] });
      const info = await validateToken(text);
      if (!info) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid token. Please send a valid Discord token or type `cancel`.", 0xe74c3c)] });
        return;
      }
      state.data.token = text;
      state.data.tokenUser = info.username;
      state.step = "guildId";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("🔊 Join VC Setup")
            .setDescription(
              [
                `✅ Token valid — **${info.username}**`,
                "",
                "**Step 2/4 — Server (Guild) ID**",
                "Send the ID of the Discord server containing the VC.",
              ].join("\n"),
            ),
        ],
      });
      break;
    }
    case "guildId": {
      if (!/^\d{17,20}$/.test(text)) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid server ID. Must be a 17-20 digit number.", 0xe74c3c)] });
        return;
      }
      state.data.guildId = text;
      state.step = "channelId";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("🔊 Join VC Setup")
            .setDescription(
              [
                "**Step 3/4 — Voice Channel ID**",
                "Send the ID of the voice channel to join.",
              ].join("\n"),
            ),
        ],
      });
      break;
    }
    case "channelId": {
      if (!/^\d{17,20}$/.test(text)) {
        await dm.send({ embeds: [stepEmbed("❌ Invalid channel ID. Must be a 17-20 digit number.", 0xe74c3c)] });
        return;
      }
      state.data.channelId = text;
      state.step = "duration";
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle("🔊 Join VC Setup")
            .setDescription(
              [
                "**Step 4/4 — Duration**",
                "How long should the account stay in VC?",
                "",
                "Examples:",
                "• `24/7` or `forever` — stay indefinitely",
                "• `2h` — 2 hours",
                "• `30m` — 30 minutes",
                "• `1d` — 1 day",
              ].join("\n"),
            ),
        ],
      });
      break;
    }
    case "duration": {
      const durationMs = parseDurationMs(text);
      pending.delete(userId);

      const durationLabel = durationMs === null ? "forever (24/7)" : humanDuration(durationMs);

      const task = startJoinVC({
        userId,
        token: state.data.token,
        guildId: state.data.guildId,
        channelId: state.data.channelId,
        durationMs,
        onStop: () => {
          notifyCompletion(client, state, "joinvc", {
            guildId: state.data.guildId,
            channelId: state.data.channelId,
            duration: durationLabel,
            tokenUser: state.data.tokenUser,
            taskId: task.id,
          }).catch(() => undefined);
        },
      });

      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("✅ Join VC Started")
            .addFields(
              { name: "Token Account", value: state.data.tokenUser, inline: true },
              { name: "Server ID", value: `\`${state.data.guildId}\``, inline: true },
              { name: "Channel ID", value: `\`${state.data.channelId}\``, inline: true },
              { name: "Duration", value: durationLabel, inline: true },
              { name: "Task ID", value: `\`${task.id}\``, inline: true },
            )
            .setFooter({ text: "Use /stoptask to cancel" })
            .setTimestamp(new Date()),
        ],
      });
      break;
    }
  }
  pending.set(userId, state);
}

async function notifyCompletion(
  client: Client,
  state: FlowState,
  type: "automsg" | "joinvc",
  details: Record<string, string>,
): Promise<void> {
  const guild = client.guilds.cache.get(state.sourceGuildId);
  if (!guild) return;
  const channel = guild.channels.cache.get(state.sourceChannelId) as TextChannel | undefined;
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(type === "automsg" ? "✅ Auto Message — Task Complete" : "✅ Join VC — Task Complete")
    .setDescription(`Task \`${details.taskId}\` has finished.`)
    .addFields(Object.entries(details).map(([k, v]) => ({ name: k, value: v, inline: true })))
    .setTimestamp(new Date())
    .setFooter({ text: `Requested by user ${state.sourceChannelName}` });

  await channel.send({ embeds: [embed] });
}

function stepEmbed(text: string, color: number): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

function humanDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86400_000) return `${Math.round(ms / 3600_000)}h`;
  return `${Math.round(ms / 86400_000)}d`;
}
