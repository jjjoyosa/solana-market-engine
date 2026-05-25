import axios from 'axios';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (err) => {
  console.error('🚨 [Redis Error]', err.message);
});

const CACHE_TTL_SECONDS = 30;

export class ScannerService {
  static async scanToken(mintAddress: string, forceRefresh = false) {
    try {
      const cacheKey = `token:${mintAddress}`;
      let cachedString = null;

      if (!forceRefresh) {
        try {
          cachedString = await redis.get(cacheKey);
        } catch (redisErr: any) {
          console.warn(`[Redis Warning] Cache unreachable, falling back to API: ${redisErr.message}`);
        }
      }

      if (cachedString) {
        console.log(`[Cache] Serving ${mintAddress} from memory.`);
        return JSON.parse(cachedString);
      }

      console.log(`[Scanner] Fetching market data & scanning RPC for: ${mintAddress}`);

      const birdeyeRes = await axios.get(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY, 'x-chain': 'solana' }
      }).catch(() => null);
      
      const overview = birdeyeRes?.data?.data || {};

      const rugKey = process.env.RUGCHECK_API_KEY;
      const rugUrl = `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`; 
      
      const rugRes = await axios.get(rugUrl, {
        headers: { 'Authorization': `Bearer ${rugKey}` },
        params: { key: rugKey }
      }).catch((err) => {
        console.error(`🚨 [RugCheck Error]`, err?.message);
        return null;
      });
      
      const rug = rugRes?.data || {};
      const lp = rug.lp || {};
      const creator = rug.creator || {};

      const exts = overview.extensions || {};
      const socials = {
          twitter: exts.twitter || null,
          telegram: exts.telegram || null,
          website: exts.website || null
      };

      const isPump = mintAddress.toLowerCase().endsWith('pump');
      const fallbackMc = isPump && overview.price ? (overview.price * 1_000_000_000) : null;
      const calculatedMc = overview.price && overview.supply ? (overview.price * overview.supply) : null;
      const finalMarketCap = overview.mc || overview.realMc || calculatedMc || fallbackMc || 0;

      const topHolders = Array.isArray(rug.topHolders) ? rug.topHolders : [];
      
      const tokenSupply = (rug.token && Number(rug.token.supply) > 0) ? Number(rug.token.supply) : 1;

      const top10Amount = topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (Number(h.amount) || 0), 0);
      const top20Amount = topHolders.slice(0, 20).reduce((acc: number, h: any) => acc + (Number(h.amount) || 0), 0);
      
      const top10Pct = Math.min((top10Amount / tokenSupply) * 100, 100);
      const top20Pct = Math.min((top20Amount / tokenSupply) * 100, 100);

      const insiderNetworks = Array.isArray(rug.insiderNetworks) ? rug.insiderNetworks : [];
      let bundlePct = 0;
      if (rug.token && rug.token.supply) {
         const totalBundleVolume = insiderNetworks.reduce((acc: number, n: any) => acc + (Number(n.tokenAmount) || 0), 0);
         bundlePct = Math.min((totalBundleVolume / tokenSupply) * 100, 100);
      }

      const creatorAddress = rug.creator || "N/A";
      const devHoldings = topHolders.find((h: any) => h.owner === creatorAddress);
      
      const devHeldPct = devHoldings ? ((Number(devHoldings.amount) || 0) / tokenSupply) * 100 : 0;
      const devSoldPct = creatorAddress !== "N/A" ? Math.max(0, Math.min(100, 100 - devHeldPct)) : 0;
      const reportData = {
        mint: mintAddress,
        market: {
          symbol: overview.symbol || 'N/A',
          price: overview.price || 0,
          marketCap: finalMarketCap,
          liquidity: overview.liquidity || 0,
          volume24h: overview.v24hUSD || 0,
          buys: overview.buy24h || 0,
          sells: overview.sell24h || 0,
          holders: overview.holder || 0,
          totalSupply: overview.supply || 1_000_000_000,
          socials: socials
        },
        security: {
          score: rug.score || 0,
          isScam: rug.isScam || false,
          risks: rug.risks ? rug.risks.map((r: any) => r.name) : [],
          lpLocked: lp.lpLockedPct || 0,
          mintRevoked: rug.token?.mintAuthority === null,
          freezeRevoked: rug.token?.freezeAuthority === null,
          top10Holders: top10Pct,
          top20Holders: top20Pct, 
          creator: {
            address: creatorAddress,
            balance: rug.creatorBalance || 0,
            heldPct: devHeldPct, 
            soldPct: devSoldPct 
          },
          distribution: {        
            bundleCount: insiderNetworks.length,
            bundlePct: bundlePct,
            sniperCount: rug.graphInsidersDetected || 0
          }
        }
      };

      if (reportData.market.symbol !== 'N/A') {
        try {
          await redis.set(cacheKey, JSON.stringify(reportData), 'EX', CACHE_TTL_SECONDS);
        } catch (redisErr: any) {
          console.warn(`[Redis Warning] Failed to save to cache: ${redisErr.message}`);
        }
      }

      return reportData;
    } catch (e) {
      console.error(e);
      throw new Error('Failed to generate token report');
    }
  }
}