import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SwapEvent } from './database/SwapModel';
import { ScannerService } from './services/ScannerService';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/swaps', async (req, res) => {
  try {
    const recentSwaps = await SwapEvent.find()
      .sort({ 'transaction.timestamp': -1 })
      .limit(50);
    res.json(recentSwaps);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch swaps' });
  }
});

app.get('/api/scan/:mint', async (req, res) => {
  try {
    const { mint } = req.params;
    
    if (mint.length < 32 || mint.length > 44) {
       res.status(400).json({ error: 'Invalid mint address format' });
       return;
    }

    const report = await ScannerService.scanToken(mint);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during scan' });
  }
});

const PORT = 3001;
mongoose.connect(process.env.MONGO_URI!).then(() => {
  app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`);
  });
});