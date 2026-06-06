import axios from 'axios';
import dotenv from 'dotenv';
import redis from './Redis';

dotenv.config();



const CACHE_FRESH_TTL  = 20;   // seconds until stale
const CACHE_STALE_TTL  = 60;   // seconds until evicted
const TIMEOUT_MARKET   = 3500; // DexScreener/Birdeye — fast APIs
const TIMEOUT_RUGCHECK = 9000; // RugCheck is slow, give it more room
const TIMEOUT_BG       = 9000; // background refresh — be patient



interface DexScreenerPair {
  chainId: string;
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: {
    h24?: { buys?: number; sells?: number };
  };
  info?: {
    socials?: Array<{ type: string; url: string }>;
    websites?: Array<{ url: string }>;
  };
}

interface DexScreenerResponse {
  pairs?: DexScreenerPair[] | null;
}

interface BirdeyeOverview {
  symbol?: string;
  price?: number;
  mc?: number;
  realMc?: number;
  supply?: number;
  liquidity?: number;
  v24hUSD?: number;
  buy24h?: number;
  sell24h?: number;
  holder?: number;
  extensions?: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
}

interface RugCheckHolder {
  owner: string;
  amount: string | number;
  pct?: number;
}

interface RugCheckInsiderNetwork {
  tokenAmount?: string | number;
}

export interface RugCheckRisk {
  name: string;
  level?: string;
  description?: string;
}

interface RugCheckReport {
  // Scoring & risk
  score?: number;
  score_normalised?: number;
  rugged?: boolean;
  risks?: RugCheckRisk[];

  // Authorities (top-level in the real API, not nested under token)
  mint_authority?: string | null;
  freeze_authority?: string | null;

  // Token info (supply is still nested here)
  token?: {
    supply?: string | number;
  };

  // Creator / dev
  creator?: string;
  creator_balance?: number;
  creator_tokens?: string | number;

  // Holders
  top_holders?: RugCheckHolder[];
  total_holders?: number;

  // Insider / bundle detection
  insider_networks?: RugCheckInsiderNetwork[];
  graph_insiders_detected?: number;

  // LP lock — usdc_locked is per-locker; we sum lp_lockers to get locked %
  lp_lockers?: Record<string, { usdc_locked?: number }>;
  total_market_liquidity?: number;
}



export interface TokenReport {
  mint: string;
  market: {
    symbol: string;
    price: number;
    marketCap: number;
    liquidity: number;
    volume24h: number;
    buys: number;
    sells: number;
    holders: number;
    totalSupply: number;
    socials: {
      twitter: string | null;
      telegram: string | null;
      website: string | null;
    };
  };
  security: {
    score: number;
    isScam: boolean;
    risks: RugCheckRisk[];
    lpLocked: number;
    mintRevoked: boolean;
    freezeRevoked: boolean;
    top10Holders: number;
    top20Holders: number;
    creator: {
      address: string;
      balance: number;
      heldPct: number;
      soldPct: number | null;
    };
    distribution: {
      bundleCount: number;
      bundlePct: number;
      sniperCount: number;
    };
  };
}



function safeNum(val: unknown): number {
  const n = Number(val);
  return isFinite(n) ? n : 0;
}

export function isValidMintAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}



async function fetchDexScreener(
  mint: string,
  timeout: number
): Promise<Partial<TokenReport['market']>> {
  const res = await axios.get<DexScreenerResponse>(
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
    { timeout }
  );

  const pairs = res.data?.pairs ?? [];

  const pair = pairs
    .filter((p) => p.chainId === 'solana')
    .sort((a, b) => safeNum(b.liquidity?.usd) - safeNum(a.liquidity?.usd))[0];

  if (!pair) return {};

  const socials  = pair.info?.socials ?? [];
  const twitter  = socials.find((s) => s.type === 'twitter')?.url  ?? null;
  const telegram = socials.find((s) => s.type === 'telegram')?.url ?? null;
  const website  = pair.info?.websites?.[0]?.url ?? null;

  return {
    symbol:    pair.baseToken.symbol,
    price:     safeNum(pair.priceUsd),
    marketCap: safeNum(pair.marketCap ?? pair.fdv),
    liquidity: safeNum(pair.liquidity?.usd),
    volume24h: safeNum(pair.volume?.h24),
    buys:      safeNum(pair.txns?.h24?.buys),
    sells:     safeNum(pair.txns?.h24?.sells),
    socials:   { twitter, telegram, website },
  };
}

async function fetchBirdeye(
  mint: string,
  timeout: number
): Promise<Partial<TokenReport['market']>> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return {};

  const res = await axios.get<{ data: BirdeyeOverview }>(
    `https://public-api.birdeye.so/defi/token_overview?address=${mint}`,
    {
      headers: { 'X-API-KEY': key, 'x-chain': 'solana' },
      timeout,
    }
  );

  const d    = res.data?.data ?? {};
  const exts = d.extensions ?? {};

  const isPump       = mint.toLowerCase().endsWith('pump');
  const fallbackMc   = isPump && d.price ? d.price * 1_000_000_000 : null;
  const calculatedMc = d.price && d.supply ? d.price * d.supply : null;
  const marketCap    = d.mc ?? d.realMc ?? calculatedMc ?? fallbackMc ?? 0;

  return {
    symbol:      d.symbol,
    price:       d.price,       // Birdeye price is more real-time
    marketCap,
    liquidity:   d.liquidity,
    volume24h:   d.v24hUSD,
    buys:        d.buy24h,
    sells:       d.sell24h,
    holders:     d.holder,
    totalSupply: d.supply,
    socials: {
      twitter:  exts.twitter  ?? null,
      telegram: exts.telegram ?? null,
      website:  exts.website  ?? null,
    },
  };
}



/**
 * Fetches the SOL balance of a wallet directly from the Solana RPC.
 * Used as a fallback when RugCheck returns 0 for creatorBalance.
 */
async function fetchSolBalance(address: string): Promise<number> {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const res = await axios.post<{ result?: { value?: number } }>(
    rpc,
    { jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address] },
    { timeout: 3000, headers: { 'Content-Type': 'application/json' } }
  );
  const lamports = res.data?.result?.value ?? 0;
  return lamports / 1_000_000_000; // lamports → SOL
}

/**
 * Computes the LP locked percentage from rug.lp_lockers.
 * RugCheck returns per-locker USDC values; we sum them and divide by total liquidity.
 */
function computeLpLocked(rug: RugCheckReport): number {
  const lockers = rug.lp_lockers;
  const totalLiq = rug.total_market_liquidity ?? 0;
  if (!lockers || totalLiq === 0) return 0;

  const lockedUsd = Object.values(lockers)
    .reduce((sum, l) => sum + (l.usdc_locked ?? 0), 0);

  return Math.min((lockedUsd / totalLiq) * 100, 100);
}

/**
 * ES2020-compatible replacement for Promise.any().
 * Resolves with the first promise that fulfills.
 * Rejects only if every promise rejects.
 */
function firstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let remaining = promises.length;
    if (remaining === 0) {
      reject(new Error('No promises provided'));
      return;
    }
    for (const p of promises) {
      p.then(resolve).catch(() => {
        remaining -= 1;
        if (remaining === 0) reject(new Error('All promises rejected'));
      });
    }
  });
}

export class ScannerService {

  static async scanToken(mintAddress: string, forceRefresh = false): Promise<TokenReport> {
    if (!isValidMintAddress(mintAddress)) {
      throw new Error(`Invalid mint address: ${mintAddress}`);
    }

    const cacheKey = `token:${mintAddress}`;
    const staleKey = `stale:${mintAddress}`;

    // Track scan popularity (used for trending pre-cache)
    redis.incr(`scans:${mintAddress}`).catch(() => {});

    if (!forceRefresh) {
      try {
        const [cached, isStale] = await Promise.all([
          redis.get(cacheKey),
          redis.get(staleKey),
        ]);

        if (cached) {
          const report = JSON.parse(cached) as TokenReport;

          if (isStale) {
            console.log(`[Cache] Stale hit for ${mintAddress} — serving instantly, refreshing in bg`);
            ScannerService.refreshInBackground(mintAddress, cacheKey, staleKey).catch(() => {});
          } else {
            console.log(`[Cache] Fresh hit for ${mintAddress}`);
          }

          return report;
        }
      } catch (redisErr: unknown) {
        console.warn(`[Redis] Cache read failed: ${(redisErr as Error).message}`);
      }
    }

    return ScannerService.fetchAndCache(mintAddress, cacheKey, staleKey, TIMEOUT_MARKET, TIMEOUT_RUGCHECK);
  }

  private static async refreshInBackground(
    mintAddress: string,
    cacheKey: string,
    staleKey: string
  ): Promise<void> {
    try {
      // Background refresh gets a more generous timeout
      await ScannerService.fetchAndCache(mintAddress, cacheKey, staleKey, TIMEOUT_BG, TIMEOUT_BG);
      console.log(`[Cache] Background refresh complete for ${mintAddress}`);
    } catch {
      console.warn(`[Cache] Background refresh failed for ${mintAddress}`);
    }
  }

  private static async fetchAndCache(
    mintAddress: string,
    cacheKey: string,
    staleKey: string,
    marketTimeout: number,
    rugTimeout: number
  ): Promise<TokenReport> {
    console.log(`[Scanner] Fetching live data for: ${mintAddress}`);

    // Race DexScreener vs Birdeye for market data — fastest wins.
    // RugCheck gets its own longer timeout since it's consistently slower.
    const [marketResult, rugResult] = await Promise.allSettled([
      firstSuccess([
        fetchBirdeye(mintAddress, marketTimeout),
        fetchDexScreener(mintAddress, marketTimeout),
      ]),
      axios.get<RugCheckReport>(
        `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`,
        {
          headers: { Authorization: `Bearer ${process.env.RUGCHECK_API_KEY}` },
          params:  { key: process.env.RUGCHECK_API_KEY },
          timeout: rugTimeout,
        }
      ),
    ]);

    // If both market sources failed, try the other one individually for a better error log
    if (marketResult.status === 'rejected') {
      console.error(`[Market Error] Both DexScreener and Birdeye failed for ${mintAddress}`);
    }
    if (rugResult.status === 'rejected') {
      console.error(`[RugCheck Error] ${(rugResult.reason as Error)?.message}`);
    }

    const market = marketResult.status === 'fulfilled' ? marketResult.value : {};
    const rug: RugCheckReport = rugResult.status === 'fulfilled'
      ? (rugResult.value.data ?? {})
      : {};

    // Merge with safe fallbacks
    const merged = {
      symbol:      market.symbol      ?? 'N/A',
      price:       market.price       ?? 0,
      marketCap:   market.marketCap   ?? 0,
      liquidity:   market.liquidity   ?? 0,
      volume24h:   market.volume24h   ?? 0,
      buys:        market.buys        ?? 0,
      sells:       market.sells       ?? 0,
      holders:     market.holders     ?? rug.total_holders ?? 0,
      totalSupply: market.totalSupply ?? 1_000_000_000,
      socials: {
        twitter:  market.socials?.twitter  ?? null,
        telegram: market.socials?.telegram ?? null,
        website:  market.socials?.website  ?? null,
      },
    };

    // Security calculations
    const topHolders: RugCheckHolder[] = Array.isArray(rug.top_holders) ? rug.top_holders : [];
    const tokenSupply = Math.max(safeNum(rug.token?.supply), 1);

    const top10Pct = Math.min(
      (topHolders.slice(0, 10).reduce((a, h) => a + safeNum(h.amount), 0) / tokenSupply) * 100,
      100
    );
    const top20Pct = Math.min(
      (topHolders.slice(0, 20).reduce((a, h) => a + safeNum(h.amount), 0) / tokenSupply) * 100,
      100
    );

    const insiderNetworks = Array.isArray(rug.insider_networks) ? rug.insider_networks : [];
    const bundlePct = Math.min(
      (insiderNetworks.reduce((a, n) => a + safeNum(n.tokenAmount), 0) / tokenSupply) * 100,
      100
    );

    const creatorAddress    = typeof rug.creator === 'string' ? rug.creator : 'N/A';
    const devHolding        = topHolders.find((h) => h.owner === creatorAddress);
    const devCurrentTokens  = safeNum(devHolding?.amount);
    const devHeldPct        = (devCurrentTokens / tokenSupply) * 100;

    let devSoldPct: number | null = null;
    if (rug.creator_tokens !== undefined) {
      const initial = safeNum(rug.creator_tokens);
      if (initial > 0) {
        devSoldPct = Math.min(Math.max(((initial - devCurrentTokens) / initial) * 100, 0), 100);
      }
    }

    // If RugCheck returned 0 for creator balance, fall back to RPC.
    // RugCheck sometimes omits this field for newer or low-activity wallets.
    let creatorBalance = rug.creator_balance ?? 0;
    if (creatorBalance === 0 && creatorAddress !== 'N/A') {
      creatorBalance = await fetchSolBalance(creatorAddress).catch(() => 0);
    }

    const report: TokenReport = {
      mint: mintAddress,
      market: merged,
      security: {
        score:         rug.score  ?? 0,
        isScam:        rug.rugged  ?? false,
        risks:         Array.isArray(rug.risks) ? rug.risks : [],
        lpLocked:      computeLpLocked(rug),
        mintRevoked:   rug.mint_authority   === null,
        freezeRevoked: rug.freeze_authority === null,
        top10Holders:  top10Pct,
        top20Holders:  top20Pct,
        creator: {
          address: creatorAddress,
          balance: creatorBalance,
          heldPct: devHeldPct,
          soldPct: devSoldPct,
        },
        distribution: {
          bundleCount:  insiderNetworks.length,
          bundlePct,
          sniperCount:  rug.graph_insiders_detected ?? 0,
        },
      },
    };

    // Only cache if we got real data back
    if (report.market.symbol !== 'N/A') {
      try {
        // Pipeline batches both writes into one round-trip — avoids partial cache state
        const pipe = redis.pipeline();
        pipe.set(cacheKey, JSON.stringify(report), 'EX', CACHE_STALE_TTL);
        pipe.set(staleKey, '1', 'EX', CACHE_FRESH_TTL);
        await pipe.exec();
      } catch (redisErr: unknown) {
        console.warn(`[Redis] Cache write failed: ${(redisErr as Error).message}`);
      }
    }

    return report;
  }

  /**
   * Pre-warms the cache for a list of mint addresses.
   * Call this on a schedule (e.g. every 60s) with trending tokens
   * so users get instant results for popular tokens.
   */
  static async warmCache(mints: string[]): Promise<void> {
    const results = await Promise.allSettled(
      mints.map((mint) => ScannerService.scanToken(mint, true))
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    console.log(`[Cache Warm] ${succeeded}/${mints.length} tokens pre-cached`);
  }

  /**
   * Returns the top N most-scanned token addresses.
   * Use to feed warmCache() on a cron schedule.
   */
  static async getTopScanned(limit = 20): Promise<string[]> {
    try {
      const keys = await redis.keys('scans:*');
      if (keys.length === 0) return [];

      const pipe = redis.pipeline();
      keys.forEach((k) => pipe.get(k));
      const results = await pipe.exec();

      const scored = keys
        .map((key, i) => ({
          mint:  key.replace('scans:', ''),
          count: parseInt((results?.[i]?.[1] as string) ?? '0', 10),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((x) => x.mint);

      return scored;
    } catch {
      return [];
    }
  }
}