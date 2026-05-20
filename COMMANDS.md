import { Client, Events, GatewayIntentBits, Partials } from "discord.js";
import { handlePrefixMessage, handleSlashCommand, registerCommands } from "./commands.js";
import { routeExchangeInteraction } from "./exchange.js";
import { handleDMFlowMessage } from "./dmflow.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID env vars.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  try {
    if (GUILD_ID) {
      try {
        await registerCommands(TOKEN, CLIENT_ID, GUILD_ID);
        console.log(`✅ Registered slash commands in guild ${GUILD_ID}`);
      } catch (e) {
        console.warn(
          `⚠️  Guild registration failed (${(e as Error).message}). Falling back to global registration.`,
        );
        await registerCommands(TOKEN, CLIENT_ID);
        console.log("✅ Registered slash commands globally (may take up to 1 hour to appear).");
      }
    } else {
      await registerCommands(TOKEN, CLIENT_ID);
      console.log("✅ Registered slash commands globally");
    }
  } catch (e) {
    console.error("Failed to register commands:", e);
  }

  const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&scope=bot+applications.commands&permissions=8`;
  console.log(`🔗 Invite URL: ${inviteUrl}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction, client);
      return;
    }
    await routeExchangeInteraction(interaction);
  } catch (e) {
    console.error("Interaction error:", e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: "❌ Something went wrong handling that.", ephemeral: true })
        .catch(() => undefined);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (await handleDMFlowMessage(message, client)) return;
    await handlePrefixMessage(message);
  } catch (e) {
    console.error("Message error:", e);
  }
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection", e));

void client.login(TOKEN);
