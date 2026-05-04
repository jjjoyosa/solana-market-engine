import axios from 'axios';

export class ScannerService {
  static async scanToken(mintAddress: string) {
    try {
      console.log(`[Scanner] Fetching intelligence for: ${mintAddress}`);

      // 1. Fetch Market Data via DexScreener
      const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`;
      const dexResponse = await axios.get(dexUrl).catch(() => null);
      
      // DexScreener returns an array of pairs. We want the most active Raydium/Pump pair.
      const pairs = dexResponse?.data?.pairs || [];
      const primaryPair = pairs.length > 0 ? pairs[0] : null;

      // 2. Fetch Security Data via RugCheck
      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report/summary`;
      const rugResponse = await axios.get(rugCheckUrl).catch(() => null);

      // 3. Compile the Mega-Report
      return {
        mint: mintAddress,
        market: {
          priceUsd: primaryPair ? parseFloat(primaryPair.priceUsd) : null,
          marketCap: primaryPair ? primaryPair.fdv : null,
          liquidityUsd: primaryPair?.liquidity?.usd || null,
          volume24h: primaryPair?.volume?.h24 || null,
          transactions24h: {
            buys: primaryPair?.txns?.h24?.buys || 0,
            sells: primaryPair?.txns?.h24?.sells || 0
          }
        },
        security: {
          isRug: rugResponse?.data?.isScam || false,
          score: rugResponse?.data?.score || 0,
          risks: rugResponse?.data?.risks || []
        }
      };

    } catch (error) {
      console.error(`[Scanner Error] Failed to scan ${mintAddress}:`, error);
      throw new Error('Failed to generate token report');
    }
  }
}