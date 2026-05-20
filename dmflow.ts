const DISCORD_API = "https://discord.com/api/v10";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

function authHeader(token: string): Record<string, string> {
  return { Authorization: token, "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" };
}

export interface ActiveTask {
  id: string;
  type: "automsg" | "joinvc";
  userId: string;
  stop: () => void;
  startedAt: number;
  durationMs: number | null;
}

const activeTasks = new Map<string, ActiveTask>();

export function getTasksForUser(userId: string): ActiveTask[] {
  return [...activeTasks.values()].filter((t) => t.userId === userId);
}

export function stopTask(taskId: string): boolean {
  const t = activeTasks.get(taskId);
  if (!t) return false;
  t.stop();
  activeTasks.delete(taskId);
  return true;
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function parseDurationMs(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (s === "24/7" || s === "forever" || s === "0" || s === "inf" || s === "∞") return null;
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(s|sec|m|min|h|hr|d|day)?$/);
  if (!match) return null;
  const n = parseFloat(match[1]);
  const unit = match[2] ?? "s";
  if (unit.startsWith("d")) return n * 86400_000;
  if (unit.startsWith("h")) return n * 3600_000;
  if (unit.startsWith("m")) return n * 60_000;
  return n * 1000;
}

export function parseRate(input: string): { msgs: number; intervalMs: number } | null {
  const m = input.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const msgs = parseInt(m[1]);
  const perMin = parseInt(m[2]);
  if (msgs < 1 || perMin < 1) return null;
  const intervalMs = Math.floor((perMin * 60_000) / msgs);
  return { msgs, intervalMs };
}

export async function validateToken(token: string): Promise<{ id: string; username: string } | null> {
  try {
    const res = await fetch(`${DISCORD_API}/users/@me`, { headers: authHeader(token) });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string; username: string; discriminator: string };
    return { id: data.id, username: `${data.username}${data.discriminator !== "0" ? "#" + data.discriminator : ""}` };
  } catch {
    return null;
  }
}

export function startAutoMsg(opts: {
  taskId?: string;
  userId: string;
  token: string;
  channelId: string;
  message: string;
  intervalMs: number;
  durationMs: number | null;
  onStop?: () => void;
}): ActiveTask {
  const id = opts.taskId ?? makeId();
  let stopped = false;
  let msgCount = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  async function sendOne() {
    if (stopped) return;
    try {
      await fetch(`${DISCORD_API}/channels/${opts.channelId}/messages`, {
        method: "POST",
        headers: authHeader(opts.token),
        body: JSON.stringify({ content: opts.message }),
      });
      msgCount++;
    } catch {
    }
    if (!stopped) {
      timer = setTimeout(sendOne, opts.intervalMs);
    }
  }

  timer = setTimeout(sendOne, 0);

  if (opts.durationMs !== null) {
    stopTimer = setTimeout(() => {
      task.stop();
    }, opts.durationMs);
  }

  const task: ActiveTask = {
    id,
    type: "automsg",
    userId: opts.userId,
    startedAt: Date.now(),
    durationMs: opts.durationMs,
    stop() {
      if (stopped) return;
      stopped = true;
      if (timer) clearTimeout(timer);
      if (stopTimer) clearTimeout(stopTimer);
      activeTasks.delete(id);
      opts.onStop?.();
    },
  };
  activeTasks.set(id, task);
  return task;
}

export function startJoinVC(opts: {
  taskId?: string;
  userId: string;
  token: string;
  guildId: string;
  channelId: string;
  durationMs: number | null;
  onStop?: () => void;
}): ActiveTask {
  const id = opts.taskId ?? makeId();
  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let seq: number | null = null;

  function cleanup() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (stopTimer) clearTimeout(stopTimer);
    heartbeatTimer = null;
    stopTimer = null;
    try { ws?.close(); } catch {}
    ws = null;
  }

  function connect() {
    if (stopped) return;
    ws = new WebSocket(GATEWAY_URL);

    ws.onopen = () => {};

    ws.onmessage = (event) => {
      if (stopped) return;
      let payload: { op: number; d: unknown; s?: number; t?: string };
      try {
        payload = JSON.parse(event.data as string) as typeof payload;
      } catch { return; }

      if (payload.s) seq = payload.s;

      if (payload.op === 10) {
        const heartbeatInterval = (payload.d as { heartbeat_interval: number }).heartbeat_interval;
        heartbeatTimer = setInterval(() => {
          if (!stopped && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 1, d: seq }));
          }
        }, heartbeatInterval);

        ws!.send(JSON.stringify({
          op: 2,
          d: {
            token: opts.token,
            intents: 0,
            properties: { os: "linux", browser: "chrome", device: "chrome" },
            presence: { status: "online", afk: false },
          },
        }));
      }

      if (payload.op === 0 && payload.t === "READY") {
        ws!.send(JSON.stringify({
          op: 4,
          d: {
            guild_id: opts.guildId,
            channel_id: opts.channelId,
            self_mute: false,
            self_deaf: false,
          },
        }));
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      if (!stopped) {
        setTimeout(connect, 5000);
      }
    };
  }

  connect();

  if (opts.durationMs !== null) {
    stopTimer = setTimeout(() => {
      task.stop();
    }, opts.durationMs);
  }

  const task: ActiveTask = {
    id,
    type: "joinvc",
    userId: opts.userId,
    startedAt: Date.now(),
    durationMs: opts.durationMs,
    stop() {
      if (stopped) return;
      stopped = true;
      cleanup();
      activeTasks.delete(id);
      opts.onStop?.();
    },
  };
  activeTasks.set(id, task);
  return task;
}
