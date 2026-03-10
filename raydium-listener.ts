import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';
import { parseRaydiumSwap } from './transaction-parser';

dotenv.config();

const rpcUrl = process.env.SOLANA_RPC_URL;
const wssUrl = process.env.SOLANA_WSS_URL;

if (!rpcUrl || !wssUrl) {
  console.error("Missing SOLANA_RPC_URL or SOLANA_WSS_URL in .env file");
  process.exit(1);
}

const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');

let isProcessing = false;

async function startRaydiumListener() {
  console.log('Connecting to Solana WebSocket...');
  
  const connection = new Connection(rpcUrl!, {
    commitment: 'confirmed',
    wsEndpoint: wssUrl
  });

  console.log(`Listening for Raydium transactions (Program: ${RAYDIUM_PROGRAM_ID.toBase58()})...`);
  console.log(`Throttle active: Processing max 1 transaction per second to avoid 429 errors.`);

  try {
    const subscriptionId = connection.onLogs(
      RAYDIUM_PROGRAM_ID,
      async (logs, context) => {
        if (logs.err) return;

        if (isProcessing) return;
        
        isProcessing = true; 
        
        console.log(`\n[Raydium Tx Detected] Signature: ${logs.signature}`);
        
        try {
          const parsedData = await parseRaydiumSwap(connection, logs.signature);
          if (parsedData && parsedData.swapDetails.tokenIn && parsedData.swapDetails.tokenOut) {
            console.log(JSON.stringify(parsedData, null, 2));
          } else {
             console.log(`Transaction did not contain standard swap data. Moving on...`);
          }
        } finally {
          setTimeout(() => {
            isProcessing = false;
          }, 1000); 
        }
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