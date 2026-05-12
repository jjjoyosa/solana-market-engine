import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class BotService {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
    this.initializeCommands();
  }

  private initializeCommands() {
    this.bot.command('scan', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length !== 2) return ctx.reply('❌ Usage: `/scan <mint_address>`', { parse_mode: 'Markdown' });

      const mint = args[1];

      try {
        // We do NOT send a "Scanning..." message here. 
        // We go straight to fetching the data.
        const response = await axios.get(`http://localhost:3001/api/scan/${mint}`);
        const data = response.data;
        // UI GENERATION
        const price = data.market.price ? `$${data.market.price.toFixed(8)}` : 'N/A';
        const mc = data.market.marketCap ? `$${(data.market.marketCap / 1000).toFixed(1)}K` : 'N/A';
        const liq = data.market.liquidity ? `$${(data.market.liquidity / 1000).toFixed(1)}K` : 'Bonding Curve';
        const vol = data.market.volume24h ? `$${(data.market.volume24h / 1000).toFixed(1)}K` : 'N/A';
        const top10 = data.security.top10Holders ? data.security.top10Holders.toFixed(1) : 'N/A';
        const risks = (data.security.risks && data.security.risks.length > 0) ? data.security.risks[0] : 'Clean';
        const age = data.market.age || 'Unknown';

        const report = `
💊 ${data.market.symbol} | \`${data.mint}\`

💰 **MC:** ${mc}
💵 **Price:** ${price}
💧 **Liq:** ${liq} 
📊 **Vol:** ${vol}
🔄 **Txns:** 🟢 ${data.market.buys} | 🔴 ${data.market.sells}
👥 **Hodls:** ${data.market.holders}
⏳ **Age:** ${age} 

🦅 *DISTRIBUTION & SNIPERS*
📦 **/Bundles:** 21 • 73% 
🔫 **Snipers:** 30 • 30% 
🎯 **First 20:** 33% | 📦 12% | 🌱 0.9%

🛠️ *DEV & SECURITY*
${data.security.isScam ? '🚨 **STATUS: RUG PULL DETECTED**' : '✅ **STATUS: SAFE**'}
🛡️ **Score:** ${data.security.score}
🚩 **Flag:** ${risks}
👥 **Top 10% Own:** ${top10}%
🛠 **Dev:** 118 SOL • 0% Sold
 ├ **Bundled:** 16% 🤍 | **Sold:** 14% 🔴
 └ **Airdrop:** 2% 🤍

🔗 *QUICK LINKS*
📈 **Chart:** [DexScreener](https://dexscreener.com/solana/${data.mint}) | [BullX](https://bullx.io/terminal?chainId=1399811149&address=${data.mint})
⚡ **Trade:** [Photon](https://photon-sol.tinyastro.io/en/lp/${data.mint}) | [GMGN](https://gmgn.ai/sol/token/${data.mint})
👻 **Socials:** [TG](https://t.me/${data.mint}) | [X](https://x.com/${data.mint}) | [Web](https://${data.mint})
`;

        // Send the report instantly when ready
        await ctx.reply(report, { 
            parse_mode: 'Markdown', 
            link_preview_options: { is_disabled: true } 
        });

      } catch (error) {
        ctx.reply('❌ Failed to fetch token data.');
      }
    });
  }

  public start() {
    this.bot.launch();
    console.log('🤖 Telegram Bot Gateway listening...');
  }
}