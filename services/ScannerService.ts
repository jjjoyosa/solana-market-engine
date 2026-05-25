import axios from 'axios';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('🚨 [Redis Error]', err);
});

const CACHE_TTL_SECONDS = 30;

export class ScannerService {
  static async scanToken(mintAddress: string, forceRefresh = false) {
    try {
      const cacheKey = `token:${mintAddress}`;

      if (!forceRefresh) {
        const cachedString = await redis.get(cacheKey);
        if (cachedString) {
          console.log(`[Redis Cache] Serving ${mintAddress} from distributed memory.`);
          return JSON.parse(cachedString);
        }
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

      const topHolders = Array.isArray(rug.topHolders) ? rug.topHolders : [];
      const top10Pct = topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (h.pct || 0), 0);
      const top20Pct = topHolders.slice(0, 20).reduce((acc: number, h: any) => acc + (h.pct || 0), 0);

      const insiderNetworks = Array.isArray(rug.insiderNetworks) ? rug.insiderNetworks : [];
      let bundlePct = 0;
      if (rug.token && rug.token.supply) {
         const totalBundleVolume = insiderNetworks.reduce((acc: number, n: any) => acc + (n.tokenAmount || 0), 0);
         bundlePct = (totalBundleVolume / rug.token.supply) * 100;
      }

      const creatorAddress = rug.creator || "N/A";
      const devHoldings = topHolders.find((h: any) => h.owner === creatorAddress);
      const devHeldPct = devHoldings ? (devHoldings.pct || 0) : 0;
      const devSoldPct = creatorAddress !== "N/A" ? Math.max(0, Math.min(100, 100 - devHeldPct)) : 0;

      const apiMc = overview.mc || overview.realMc || 0;
      const calculatedMc = (overview.price && rug.token?.supply) ? (overview.price * rug.token.supply) : 0;
      let finalMarketCap = apiMc > 0 ? apiMc : calculatedMc;

      if (finalMarketCap > 100_000_000 && overview.liquidity < 1000) {
          finalMarketCap = 0;
      }

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

      await redis.set(cacheKey, JSON.stringify(reportData), 'EX', CACHE_TTL_SECONDS);
      
      return reportData;
    } catch (e) {
      console.error(e);
      throw new Error('Failed to generate token report');
    }
  }
}