import axios from 'axios';

export interface TokenReport {
  mint: string;
  market: {
    priceUsd: number | null;
  };
  security: {
    isRug: boolean;
    risks: any[];
    score: number;
  };
}

export class ScannerService {

  static async scanToken(mintAddress: string): Promise<TokenReport> {
    try {
      console.log(`[Scanner] Fetching intelligence for: ${mintAddress}`);

      const jupUrl = `https://api.jup.ag/price/v2?ids=${mintAddress}`;
      const jupResponse = await axios.get(jupUrl).catch(() => null);
      const priceData = jupResponse?.data?.data?.[mintAddress]?.price || null;

      const rugCheckUrl = `https://api.rugcheck.xyz/v1/tokens/${mintAddress}/report/summary`;
      const rugResponse = await axios.get(rugCheckUrl).catch(() => null);
      
      const securityData = {
        isRug: rugResponse?.data?.isScam || false,
        risks: rugResponse?.data?.risks || [],
        score: rugResponse?.data?.score || 0
      };

      return {
        mint: mintAddress,
        market: {
          priceUsd: priceData ? parseFloat(priceData) : null,
        },
        security: securityData,
      };

    } catch (error) {
      console.error(`[Scanner Error] Failed to scan ${mintAddress}:`, error);
      throw new Error('Failed to generate token report');
    }
  }
}