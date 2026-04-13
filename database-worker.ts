import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import { SwapEvent } from './database/SwapModel';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;
const QUEUE_NAME = 'solana:raydium:swaps';

if (!MONGO_URI) {
  console.error("Missing MONGO_URI in .env file");
  process.exit(1);
}

const redis = new Redis({
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

async function startWorker() {
  console.log('Connecting to MongoDB...');
  
  try {
    await mongoose.connect(MONGO_URI!);
    console.log('Connected to MongoDB Successfully.');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }

  console.log(`Worker actively listening for new swaps in Redis queue: [${QUEUE_NAME}]...`);

  while (true) {
    try {
      const result = await redis.blpop(QUEUE_NAME, 0); 
      
      if (result) {
        const [queue, message] = result;
        const payload = JSON.parse(message);

        const newSwap = new SwapEvent(payload);
        await newSwap.save();

        console.log(`[Database] Saved swap ${payload.transaction.signature.slice(0, 8)}... to MongoDB`);
      }
    } catch (error) {
      console.error('[Worker Error] Failed to process queue item:', error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

startWorker();