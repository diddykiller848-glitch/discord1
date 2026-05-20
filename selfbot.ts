import { promises as fs } from "node:fs";
import path from "node:path";

export type ExchangeType =
  | "i2c"
  | "c2i"
  | "p2c"
  | "c2p"
  | "ca2c"
  | "c2ca"
  | "n2c"
  | "c2n";

export const EXCHANGE_TYPES: { value: ExchangeType; label: string; description: string }[] = [
  { value: "i2c", label: "INR → Crypto", description: "Indian Rupee to Crypto" },
  { value: "c2i", label: "Crypto → INR", description: "Crypto to Indian Rupee" },
  { value: "p2c", label: "PayPal → Crypto", description: "PayPal to Crypto" },
  { value: "c2p", label: "Crypto → PayPal", description: "Crypto to PayPal" },
  { value: "ca2c", label: "CashApp → Crypto", description: "CashApp to Crypto" },
  { value: "c2ca", label: "Crypto → CashApp", description: "Crypto to CashApp" },
  { value: "n2c", label: "NPR → Crypto", description: "Nepali Rupee to Crypto" },
  { value: "c2n", label: "Crypto → NPR", description: "Crypto to Nepali Rupee" },
];

export const PAYMENT_APPS: Record<string, string[]> = {
  i2c: ["Paytm", "PhonePe", "Google Pay", "Slice", "MobiKwik"],
  c2i: ["Paytm", "PhonePe", "Google Pay", "Slice", "MobiKwik"],
  p2c: ["PayPal F&F", "PayPal G&S"],
  c2p: ["PayPal F&F", "PayPal G&S"],
  ca2c: ["CashApp"],
  c2ca: ["CashApp"],
  n2c: ["eSewa", "Khalti", "IME Pay", "ConnectIPS"],
  c2n: ["eSewa", "Khalti", "IME Pay", "ConnectIPS"],
};

export const CURRENCY_LABEL: Record<ExchangeType, string> = {
  i2c: "INR",
  c2i: "INR",
  p2c: "USD",
  c2p: "USD",
  ca2c: "USD",
  c2ca: "USD",
  n2c: "NPR",
  c2n: "NPR",
};

export type ServiceType = "middleman" | "buy" | "sell";

export interface VouchRecord {
  fromUserId: string;
  service: string;
  amount: string;
  comment?: string;
  timestamp: number;
}

export interface PanelEmbed {
  title?: string;
  description?: string;
  color?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
  footer?: string;
}

export interface GuildConfig {
  ticketCategoryId?: string;
  panelChannelId?: string;
  vouchChannelId?: string;
  rates?: string;
  tos?: string;
  roles: Partial<Record<ExchangeType, string>>;
  serviceRoles: Partial<Record<ServiceType, string>>;
  panel: PanelEmbed;
  ticketCounter: number;
  userVouches?: Record<string, VouchRecord[]>;
}

interface ConfigFile {
  guilds: Record<string, GuildConfig>;
}

const DATA_DIR = path.resolve(process.cwd(), "services/discord-bot/data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

let cache: ConfigFile | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<ConfigFile> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    cache = JSON.parse(raw) as ConfigFile;
  } catch {
    cache = { guilds: {} };
  }
  if (!cache!.guilds) cache!.guilds = {};
  return cache!;
}

async function persist(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const file = await load();
  ensureDefaults(file, guildId);
  return file.guilds[guildId];
}

function ensureDefaults(file: ConfigFile, guildId: string): void {
  if (!file.guilds[guildId]) {
    file.guilds[guildId] = { roles: {}, serviceRoles: {}, panel: {}, ticketCounter: 0 };
  } else {
    const cfg = file.guilds[guildId];
    if (!cfg.serviceRoles) cfg.serviceRoles = {};
    if (!cfg.panel) cfg.panel = {};
    if (!cfg.roles) cfg.roles = {};
  }
}

export async function updateGuildConfig(
  guildId: string,
  mutator: (cfg: GuildConfig) => void,
): Promise<GuildConfig> {
  const file = await load();
  ensureDefaults(file, guildId);
  mutator(file.guilds[guildId]);
  writeQueue = writeQueue.then(persist).catch(() => undefined);
  await writeQueue;
  return file.guilds[guildId];
}
