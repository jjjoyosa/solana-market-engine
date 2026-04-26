import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SwapEvent } from './database/SwapModel';

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

const PORT = 3001;
mongoose.connect(process.env.MONGO_URI!).then(() => {
  app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`);
  });
});