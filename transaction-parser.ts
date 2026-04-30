import { Connection, ParsedTransactionWithMeta } from '@solana/web3.js';

export interface TokenData {
  mint: string;
  amount: number;
  decimals: number;
}

export interface ParsedSwapPayload {
  transaction: {
    signature: string;
    timestamp: number | null | undefined;
    slot: number;
    dexProgram: string;
  };
  swapDetails: {
    tokenIn?: TokenData;
    tokenOut?: TokenData;
  };
  status: string;
}
// ------------------------------------------------

export async function parseRaydiumSwap(
  connection: Connection,
  signature: string
): Promise<ParsedSwapPayload | null> {
  try {
    const tx: ParsedTransactionWithMeta | null = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta || !tx.meta.preTokenBalances || !tx.meta.postTokenBalances) {
      return null;
    }

    const preBalances = tx.meta.preTokenBalances;
    const postBalances = tx.meta.postTokenBalances;

    let tokenIn: TokenData | undefined;
    let tokenOut: TokenData | undefined;

    for (const post of postBalances) {
      const pre = preBalances.find(
        (p) => p.accountIndex === post.accountIndex && p.mint === post.mint
      );

      const preAmount = pre ? Number(pre.uiTokenAmount.uiAmount) : 0;
      const postAmount = Number(post.uiTokenAmount.uiAmount);
      const difference = postAmount - preAmount;

      if (difference < 0) {
        tokenIn = {
          mint: post.mint,
          amount: Math.abs(difference),
          decimals: post.uiTokenAmount.decimals,
        };
      } 
      else if (difference > 0) {
        tokenOut = {
          mint: post.mint,
          amount: Math.abs(difference),
          decimals: post.uiTokenAmount.decimals,
        };
      }
    }

    return {
      transaction: {
        signature,
        timestamp: tx.blockTime,
        slot: tx.slot,
        dexProgram: "Raydium V4",
      },
      swapDetails: {
        tokenIn,
        tokenOut,
      },
      status: tx.meta.err ? "failed" : "success",
    };

  } catch (error) {
    console.error(`Failed to parse signature ${signature}:`, error);
    return null;
  }
}