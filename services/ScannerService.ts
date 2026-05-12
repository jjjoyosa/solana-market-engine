import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class ScannerService {
  static async scanToken(mintAddress: string) {
    try {
      console.log(`[Scanner] Fetching market data & scanning RPC for: ${mintAddress}`);

      const birdeyeRes = await axios.get(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY, 'x-chain': 'solana' }
      }).catch(() => null);
      
      const overview = birdeyeRes?.data?.data || {};

      const rugKey = process.env.RUGCHECK_API_KEY;
      const rugUrl = `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report`; // Switched to full report
      
      const rugRes = await axios.get(rugUrl, {
        headers: { 'Authorization': `Bearer ${rugKey}` },
        params: { key: rugKey }
      }).catch((err) => {
        console.error(`🚨 [RugCheck Error]`, err?.message);
        return null;
      });
      
      const rug = rugRes?.data || {};

      let ageStr = "Unknown";
      if (overview.createdAt) {
        const createdDate = new Date(overview.createdAt);
        const diffMs = Date.now() - createdDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 60) {
            ageStr = `${diffMins}m`;
        } else if (diffMins < 1440) {
            ageStr = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
        } else {
            ageStr = `${Math.floor(diffMins / 1440)}d`;
        }
      }

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

      let top10Pct = rug.top10HolderPercent || 0;
      if (!top10Pct && Array.isArray(rug.topHolders)) {
          top10Pct = rug.topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (h.pct || 0), 0) * 100;
      }

      return {
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
          age: ageStr,
          socials: socials
        },
        security: {
          score: rug.score || 0,
          isScam: rug.isScam || false,
          top10Holders: top10Pct,
          risks: rug.risks ? rug.risks.map((r: any) => r.name) : []
        }
      };
    } catch (e) {
      console.error(e);
      throw new Error('Failed to generate token report');
    }
  }
}