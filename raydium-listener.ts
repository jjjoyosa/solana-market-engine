import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const rpcUrl = process.env.SOLANA_RPC_URL;
const wssUrl = process.env.SOLANA_WSS_URL;

if (!rpcUrl || !wssUrl) {
  console.error("Missing SOLANA_RPC_URL or SOLANA_WSS_URL in .env file");
  process.exit(1);
}

const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

async function startRaydiumListener() {
  console.log('Connecting to Solana WebSocket...');
  
  const connection = new Connection(rpcUrl!, {
    commitment: 'confirmed',
    wsEndpoint: wssUrl
  });

  console.log(`Listening for Raydium transactions (Program: ${RAYDIUM_PROGRAM_ID.toBase58()})...`);

  try {
    const subscriptionId = connection.onLogs(
      RAYDIUM_PROGRAM_ID,
      (logs, context) => {
        if (logs.err) {
          return;
        }

        console.log(`\n[Raydium Tx Detected] Signature: ${logs.signature}`);
        console.log(`Slot: ${context.slot}`);
        
        console.log(`Logs array length: ${logs.logs.length} instructions`);
      },
      'confirmed'
    );

    console.log(`Subscription active. ID: ${subscriptionId}. Press Ctrl+C to stop.`);

  } catch (error) {
    console.error('Failed to start Raydium listener:', error);
    process.exit(1);
  }
}

startRaydiumListener();