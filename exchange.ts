export type Chain = "BTC" | "ETH" | "TRX" | "SOL" | "LTC" | "DOGE";

export interface TxSummary {
  hash: string;
  url: string;
  amount: string;
  direction: "in" | "out" | "self" | "unknown";
  counterparty?: string;
  timestamp?: number;
  confirmed: boolean;
  confirmations?: number;
}

export interface AddressLookup {
  chain: Chain;
  address: string;
  balance?: string;
  explorerUrl: string;
  txs: TxSummary[];
}

export function detectChain(addr: string): Chain | null {
  const a = addr.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(a)) return "ETH";
  if (/^(bc1|tb1)[0-9a-z]{20,80}$/i.test(a)) return "BTC";
  if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,39}$/.test(a)) return "BTC";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return "TRX";
  if (/^(ltc1|[LM3])[a-km-zA-HJ-NP-Z0-9]{25,80}$/.test(a)) return "LTC";
  if (/^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(a)) return "DOGE";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return "SOL";
  return null;
}

const UA = { "User-Agent": "RainyDayBot/1.0" };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function lookupBTC(addr: string): Promise<AddressLookup> {
  const base = "https://blockstream.info/api";
  type AddrInfo = {
    chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
    mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
  };
  type Tx = {
    txid: string;
    status: { confirmed: boolean; block_time?: number; block_height?: number };
    vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
    vout: { scriptpubkey_address?: string; value: number }[];
  };
  const [info, txs] = await Promise.all([
    getJson<AddrInfo>(`${base}/address/${addr}`),
    getJson<Tx[]>(`${base}/address/${addr}/txs`),
  ]);
  const balanceSat =
    info.chain_stats.funded_txo_sum -
    info.chain_stats.spent_txo_sum +
    info.mempool_stats.funded_txo_sum -
    info.mempool_stats.spent_txo_sum;
  const balance = (balanceSat / 1e8).toFixed(8) + " BTC";

  const summaries: TxSummary[] = txs.slice(0, 5).map((tx) => {
    const inFromAddr = tx.vin.some((v) => v.prevout?.scriptpubkey_address === addr);
    const outToAddr = tx.vout.find((v) => v.scriptpubkey_address === addr);
    let direction: TxSummary["direction"] = "unknown";
    let satValue = 0;
    let counterparty: string | undefined;
    if (inFromAddr && outToAddr) {
      direction = "self";
      satValue = outToAddr.value;
    } else if (inFromAddr) {
      direction = "out";
      const dest = tx.vout.find((v) => v.scriptpubkey_address && v.scriptpubkey_address !== addr);
      satValue = dest?.value ?? 0;
      counterparty = dest?.scriptpubkey_address;
    } else if (outToAddr) {
      direction = "in";
      satValue = outToAddr.value;
      counterparty = tx.vin[0]?.prevout?.scriptpubkey_address;
    }
    return {
      hash: tx.txid,
      url: `https://blockstream.info/tx/${tx.txid}`,
      amount: `${(satValue / 1e8).toFixed(8)} BTC`,
      direction,
      counterparty,
      timestamp: tx.status.block_time,
      confirmed: tx.status.confirmed,
    };
  });

  return {
    chain: "BTC",
    address: addr,
    balance,
    explorerUrl: `https://blockstream.info/address/${addr}`,
    txs: summaries,
  };
}

async function lookupETH(addr: string): Promise<AddressLookup> {
  const base = "https://eth.blockscout.com/api/v2";
  type Bal = { coin_balance: string };
  type TxResp = {
    items: {
      hash: string;
      from: { hash: string };
      to: { hash: string } | null;
      value: string;
      timestamp: string;
      status: string | null;
      block: number | null;
      confirmations?: string | number;
    }[];
  };
  const [bal, txs] = await Promise.all([
    getJson<Bal>(`${base}/addresses/${addr}`).catch(() => ({ coin_balance: "0" }) as Bal),
    getJson<TxResp>(`${base}/addresses/${addr}/transactions?filter=to%20%7C%20from`),
  ]);
  const balance =
    (Number(bal.coin_balance ?? "0") / 1e18).toFixed(6) + " ETH";

  const lower = addr.toLowerCase();
  const summaries: TxSummary[] = (txs.items ?? []).slice(0, 5).map((t) => {
    const from = t.from?.hash?.toLowerCase();
    const to = t.to?.hash?.toLowerCase();
    let direction: TxSummary["direction"] = "unknown";
    let counterparty: string | undefined;
    if (from === lower && to === lower) direction = "self";
    else if (from === lower) {
      direction = "out";
      counterparty = t.to?.hash;
    } else if (to === lower) {
      direction = "in";
      counterparty = t.from?.hash;
    }
    const eth = (Number(t.value ?? "0") / 1e18).toFixed(6);
    const ts = Date.parse(t.timestamp);
    return {
      hash: t.hash,
      url: `https://etherscan.io/tx/${t.hash}`,
      amount: `${eth} ETH`,
      direction,
      counterparty,
      timestamp: Number.isFinite(ts) ? Math.floor(ts / 1000) : undefined,
      confirmed: t.status === "ok" && t.block != null,
      confirmations: t.confirmations != null ? Number(t.confirmations) : undefined,
    };
  });

  return {
    chain: "ETH",
    address: addr,
    balance,
    explorerUrl: `https://etherscan.io/address/${addr}`,
    txs: summaries,
  };
}

async function lookupTRX(addr: string): Promise<AddressLookup> {
  type Resp = {
    data: {
      txID: string;
      block_timestamp: number;
      ret?: { contractRet: string }[];
      raw_data: {
        contract: {
          parameter: {
            value: {
              owner_address?: string;
              to_address?: string;
              amount?: number;
            };
          };
          type: string;
        }[];
      };
    }[];
  };
  type Acct = { data: { balance?: number }[] };
  const [acct, txs] = await Promise.all([
    getJson<Acct>(`https://api.trongrid.io/v1/accounts/${addr}`).catch(
      () => ({ data: [] }) as Acct,
    ),
    getJson<Resp>(
      `https://api.trongrid.io/v1/accounts/${addr}/transactions?limit=5&only_confirmed=false`,
    ),
  ]);
  const balance = (((acct.data?.[0]?.balance ?? 0) as number) / 1e6).toFixed(6) + " TRX";

  const hexToBase58 = (_h: string): string | undefined => undefined;

  const summaries: TxSummary[] = (txs.data ?? []).slice(0, 5).map((t) => {
    const c = t.raw_data.contract[0];
    const v = c?.parameter?.value;
    const amount = v?.amount ?? 0;
    const status = t.ret?.[0]?.contractRet ?? "PENDING";
    const fromHex = v?.owner_address;
    const toHex = v?.to_address;
    const fromBase = fromHex ? hexToBase58(fromHex) : undefined;
    const toBase = toHex ? hexToBase58(toHex) : undefined;
    let direction: TxSummary["direction"] = "unknown";
    let counterparty: string | undefined;
    if (fromBase === addr && toBase === addr) direction = "self";
    else if (fromBase === addr) {
      direction = "out";
      counterparty = toBase ?? toHex;
    } else if (toBase === addr) {
      direction = "in";
      counterparty = fromBase ?? fromHex;
    }
    return {
      hash: t.txID,
      url: `https://tronscan.org/#/transaction/${t.txID}`,
      amount: `${(amount / 1e6).toFixed(6)} TRX`,
      direction,
      counterparty,
      timestamp: Math.floor(t.block_timestamp / 1000),
      confirmed: status === "SUCCESS",
    };
  });

  return {
    chain: "TRX",
    address: addr,
    balance,
    explorerUrl: `https://tronscan.org/#/address/${addr}`,
    txs: summaries,
  };
}

async function lookupSOL(addr: string): Promise<AddressLookup> {
  const rpc = "https://api.mainnet-beta.solana.com";
  const post = async <T,>(method: string, params: unknown[]): Promise<T> => {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json", ...UA },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`${method} → ${res.status}`);
    const json = (await res.json()) as { result: T; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result;
  };

  const [bal, sigs] = await Promise.all([
    post<{ value: number }>("getBalance", [addr]).catch(() => ({ value: 0 })),
    post<
      { signature: string; slot: number; blockTime: number | null; err: unknown; confirmationStatus?: string }[]
    >("getSignaturesForAddress", [addr, { limit: 5 }]),
  ]);
  const balance = (bal.value / 1e9).toFixed(6) + " SOL";

  const summaries: TxSummary[] = (sigs ?? []).map((s) => ({
    hash: s.signature,
    url: `https://solscan.io/tx/${s.signature}`,
    amount: "—",
    direction: "unknown",
    timestamp: s.blockTime ?? undefined,
    confirmed: s.err == null && (s.confirmationStatus === "finalized" || s.confirmationStatus === "confirmed"),
  }));

  return {
    chain: "SOL",
    address: addr,
    balance,
    explorerUrl: `https://solscan.io/account/${addr}`,
    txs: summaries,
  };
}

async function lookupLTC(addr: string): Promise<AddressLookup> {
  type ConfirmedRef = { tx_hash: string; confirmed?: string; confirmations: number; value: number; spent: boolean; tx_input_n: number };
  type PendingRef = { tx_hash: string; value: number; spent: boolean; tx_input_n: number };
  type Resp = {
    balance: number;
    txrefs?: ConfirmedRef[];
    unconfirmed_txrefs?: PendingRef[];
  };
  const data = await getJson<Resp>(`https://api.blockcypher.com/v1/ltc/main/addrs/${addr}?limit=5`);
  const confirmedAll: (ConfirmedRef | PendingRef)[] = [
    ...(data.unconfirmed_txrefs ?? []),
    ...(data.txrefs ?? []),
  ];
  const summaries: TxSummary[] = confirmedAll.slice(0, 5).map((t) => {
    const confirmedTs = "confirmed" in t && t.confirmed ? Math.floor(Date.parse(t.confirmed) / 1000) : undefined;
    const confirmations = "confirmations" in t ? t.confirmations : undefined;
    return {
      hash: t.tx_hash,
      url: `https://live.blockcypher.com/ltc/tx/${t.tx_hash}/`,
      amount: `${(t.value / 1e8).toFixed(8)} LTC`,
      direction: t.tx_input_n >= 0 ? "out" : "in",
      timestamp: confirmedTs,
      confirmed: confirmations != null && confirmations > 0,
      confirmations,
    } satisfies TxSummary;
  });
  return {
    chain: "LTC",
    address: addr,
    balance: (data.balance / 1e8).toFixed(8) + " LTC",
    explorerUrl: `https://live.blockcypher.com/ltc/address/${addr}/`,
    txs: summaries,
  };
}

async function lookupDOGE(addr: string): Promise<AddressLookup> {
  type ConfirmedRef = { tx_hash: string; confirmed?: string; confirmations: number; value: number; tx_input_n: number };
  type PendingRef = { tx_hash: string; value: number; tx_input_n: number };
  type Resp = {
    balance: number;
    txrefs?: ConfirmedRef[];
    unconfirmed_txrefs?: PendingRef[];
  };
  const data = await getJson<Resp>(`https://api.blockcypher.com/v1/doge/main/addrs/${addr}?limit=5`);
  const all: (ConfirmedRef | PendingRef)[] = [
    ...(data.unconfirmed_txrefs ?? []),
    ...(data.txrefs ?? []),
  ];
  const summaries: TxSummary[] = all.slice(0, 5).map((t) => {
    const confirmedTs = "confirmed" in t && t.confirmed ? Math.floor(Date.parse(t.confirmed) / 1000) : undefined;
    const confirmations = "confirmations" in t ? t.confirmations : undefined;
    return {
      hash: t.tx_hash,
      url: `https://dogechain.info/tx/${t.tx_hash}`,
      amount: `${(t.value / 1e8).toFixed(8)} DOGE`,
      direction: t.tx_input_n >= 0 ? "out" : "in",
      timestamp: confirmedTs,
      confirmed: confirmations != null && confirmations > 0,
      confirmations,
    } satisfies TxSummary;
  });
  return {
    chain: "DOGE",
    address: addr,
    balance: (data.balance / 1e8).toFixed(8) + " DOGE",
    explorerUrl: `https://dogechain.info/address/${addr}`,
    txs: summaries,
  };
}

export async function lookupAddress(addr: string): Promise<AddressLookup> {
  const chain = detectChain(addr);
  if (!chain) throw new Error("Could not detect chain for that address.");
  switch (chain) {
    case "BTC":
      return lookupBTC(addr);
    case "ETH":
      return lookupETH(addr);
    case "TRX":
      return lookupTRX(addr);
    case "SOL":
      return lookupSOL(addr);
    case "LTC":
      return lookupLTC(addr);
    case "DOGE":
      return lookupDOGE(addr);
  }
}
