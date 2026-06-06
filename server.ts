import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { ScannerService, isValidMintAddress } from './src/ScannerService';
import { BotService } from './src/BotService';

dotenv.config();

const app    = express();
const PORT   = process.env.PORT || 3001;
const IS_DEV = process.env.NODE_ENV !== 'production';



// Using a function avoids all TS type narrowing issues with the origin option.
// In dev: allow all origins. In prod: only allow ALLOWED_ORIGIN from .env.
app.use(cors({
  origin: (origin, callback) => {
    if (IS_DEV) return callback(null, true);

    const allowed = process.env.ALLOWED_ORIGIN;
    if (!allowed) return callback(null, false);

    // origin is undefined for same-origin requests (e.g. server-to-server) — allow those too
    if (!origin || origin === allowed) return callback(null, true);

    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET'],
}));

app.use(express.json());



app.get('/api/scan/:mint', async (req: Request<{ mint: string }>, res: Response) => {
  const { mint } = req.params;

  if (!isValidMintAddress(mint)) {
    res.status(400).json({ error: 'Invalid mint address' });
    return;
  }

  try {
    const report = await ScannerService.scanToken(mint);
    res.json(report);
  } catch (error) {
    console.error(`[API] Scan failed for ${mint}:`, error);
    res.status(500).json({ error: 'Scan failed — data provider may be temporarily unavailable' });
  }
});

// 404 catch-all for unknown routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Centralised error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});



// Start Express + Bot independently from MongoDB.
const server = app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);

  const bot = new BotService();
  bot.start();
});

// Connect to MongoDB separately — skip if MONGO_URI isn't set.
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log('🗄️  MongoDB connected'))
    .catch((err: Error) => console.error('🚨 MongoDB connection failed:', err.message));
} else {
  console.warn('⚠️  MONGO_URI not set — skipping database connection');
}



// Graceful shutdown: drain in-flight requests before exiting
function shutdown(signal: string) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('✅ HTTP server closed');
    mongoose.disconnect().finally(() => process.exit(0));
  });

  // Force-exit if shutdown hangs beyond 10s
  setTimeout(() => {
    console.error('⚠️  Forced exit after timeout');
    process.exit(1);
  }, 10_000);
}

process.once('SIGINT',  () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));