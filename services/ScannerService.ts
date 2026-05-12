import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class ScannerService {
  static async scanToken(mintAddress: string) {
    try {
      console.log(`[Scanner] Fetching market data & scanning RPC for: ${mintAddress}`);

      // 1. Fetch Birdeye Market Data
      const birdeyeRes = await axios.get(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY, 'x-chain': 'solana' }
      }).catch(() => null);
      
      const overview = birdeyeRes?.data?.data || {};

      // 2. Fetch Security Data (Full Report Endpoint)
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

      // --- 3. PRINT RAW PAYLOADS TO CONSOLE ---
      console.log(`\n=========================================`);
      console.log(`[DEBUG] RAW BIRDEYE OVERVIEW RESPONSE`);
      console.log(JSON.stringify(overview, null, 2)); 
      console.log(`\n[DEBUG] RAW RUGCHECK FULL REPORT`);
      console.log(JSON.stringify(rug, null, 2)); 
      console.log(`=========================================\n`);

      // --- 4. TOKEN AGE CALCULATION ---
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

      // --- 5. SOCIAL LINKS EXTRACTION ---
      const exts = overview.extensions || {};
      const socials = {
          twitter: exts.twitter || null,
          telegram: exts.telegram || null,
          website: exts.website || null
      };

      // --- BULLETPROOF MARKET CAP MATH ---
      const isPump = mintAddress.toLowerCase().endsWith('pump');
      const fallbackMc = isPump && overview.price ? (overview.price * 1_000_000_000) : null;
      const calculatedMc = overview.price && overview.supply ? (overview.price * overview.supply) : null;
      const finalMarketCap = overview.mc || overview.realMc || calculatedMc || fallbackMc || 0;

      // Ensure Top 10% is parsed correctly from full report
      let top10Pct = rug.top10HolderPercent || 0;
      if (!top10Pct && Array.isArray(rug.topHolders)) {
          // Fallback manual calculation if top10HolderPercent is missing in full report
          top10Pct = rug.topHolders.slice(0, 10).reduce((acc: number, h: any) => acc + (h.pct || 0), 0) * 100;
      }

      // 6. Format into the "Terminal" payload
      return {
        mint: mintAddress,
        market: {
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