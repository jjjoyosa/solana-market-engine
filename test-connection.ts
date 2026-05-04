import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const rpcUrl = process.env.SOLANA_RPC_URL;
const wssUrl = process.env.SOLANA_WSS_URL;

if (!rpcUrl || !wssUrl) {
  console.error("Missing SOLANA_RPC_URL or SOLANA_WSS_URL in .env file");
  process.exit(1);
}

async function testSocketConnection() {
  console.log('Connecting to Solana WebSocket endpoint...');
  
  const connection = new Connection(rpcUrl!, {
    commitment: 'confirmed',
    wsEndpoint: wssUrl,
  });

  try {
    const subscriptionId = connection.onSlotChange((slotInfo) => {
      console.log(`[Live Stream] New Slot Detected: ${slotInfo.slot} | Parent: ${slotInfo.parent}`);
    });

    console.log(`Subscription active. ID: ${subscriptionId}`);
    console.log('Listening for live network slots... Press Ctrl+C to exit.\n');

    setTimeout(async () => {
      console.log('\nClosing test subscription...');
      await connection.removeSlotChangeListener(subscriptionId);
      console.log('Connection closed safely. Test successful!');
      process.exit(0);
    }, 15000);

  } catch (error) {
    console.error('Failed to establish WebSocket connection:', error);
    process.exit(1);
  }
}

testSocketConnection();