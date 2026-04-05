import mongoose, { Schema, Document } from 'mongoose';

export interface ISwapEvent extends Document {
  transaction: {
    signature: string;
    timestamp: number;
    slot: number;
    dexProgram: string;
  };
  swapDetails: {
    tokenIn: {
      mint: string;
      amount: number;
      decimals: number;
    };
    tokenOut: {
      mint: string;
      amount: number;
      decimals: number;
    };
  };
  status: string;
  createdAt: Date;
}

const SwapSchema: Schema = new Schema({
  transaction: {
    signature: { type: String, required: true, unique: true }, 
    timestamp: { type: Number, required: true, index: true }, 
    slot: { type: Number, required: true },
    dexProgram: { type: String, required: true },
  },
  swapDetails: {
    tokenIn: {
      mint: { type: String, required: true, index: true },     
      amount: { type: Number, required: true },
      decimals: { type: Number, required: true },
    },
    tokenOut: {
      mint: { type: String, required: true, index: true },
      amount: { type: Number, required: true },
      decimals: { type: Number, required: true },
    }
  },
  status: { type: String, required: true, default: 'success' },
  createdAt: { type: Date, default: Date.now, expires: '30d' }
});

export const SwapEvent = mongoose.model<ISwapEvent>('SwapEvent', SwapSchema);