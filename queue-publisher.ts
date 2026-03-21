import Redis from 'ioredis';
import { ParsedSwapPayload } from './transaction-parser';

const redis = new Redis({
  retryStrategy: (times) => {
    console.warn(`Redis connection lost. Retrying in ${Math.min(times * 50, 2000)}ms...`);
    return Math.min(times * 50, 2000);
  }
});

const QUEUE_NAME = 'solana:raydium:swaps';

export async function publishToQueue(payload: ParsedSwapPayload) {
  try {
    const message = JSON.stringify(payload);
    
    await redis.rpush(QUEUE_NAME, message);
    
    console.log(`[Queue] Successfully pushed tx ${payload.transaction.signature.slice(0, 8)}... to Redis`);
  } catch (error) {
    console.error(`[Queue Error] Failed to push to Redis:`, error);
  }
}