// services/BotService.ts
import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class BotService {
  private bot: Telegraf;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.warn("[Warning] TELEGRAM_BOT_TOKEN missing in .env. Bot will not start.");
    }
    this.bot = new Telegraf(token || '');
    this.initializeCommands();
  }

  private initializeCommands() {
    this.bot.command('scan', async (ctx) => {
      const message = ctx.message.text;
      const args = message.split(' ');

      if (args.length !== 2) {
        return ctx.reply('❌ Usage: `/scan <mint_address>`', { parse_mode: 'Markdown' });
      }

      const mint = args[1];
      const waitMessage = await ctx.reply(`⏳ *Scanning Token...*\n\`${mint}\``, { parse_mode: 'Markdown' });

      try {
        const response = await axios.get(`http://localhost:3001/api/scan/${mint}`);
        const data = response.data;

        const isRug = data.security.isRug;
        const price = data.market.priceUsd ? data.market.priceUsd.toFixed(6) : 'N/A';
        const mc = data.market.marketCap ? `$${(data.market.marketCap / 1000000).toFixed(2)}M` : 'N/A';
        const liq = data.market.liquidityUsd ? `$${(data.market.liquidityUsd / 1000).toFixed(1)}K` : 'N/A';
        const vol = data.market.volume24h ? `$${(data.market.volume24h / 1000).toFixed(1)}K` : 'N/A';
        
        const buys = data.market.transactions24h?.buys || 0;
        const sells = data.market.transactions24h?.sells || 0;
        
        const report = `
💊 *TOKEN INTELLIGENCE REPORT* 💊
\`${data.mint}\`

📊 *Market Overview*
💵 **Price:** $${price}
💎 **Market Cap:** ${mc}
💧 **Liquidity:** ${liq}
📈 **24h Volume:** ${vol}
🔄 **Txns (24h):** 🟢 ${buys} Buys | 🔴 ${sells} Sells

🛡️ *Security & RugCheck*
${isRug ? '🚨 **STATUS: SCAM / RUG PULL DETECTED** 🚨' : '✅ **STATUS: PASSED INITIAL CHECKS**'}
🛡 **Safety Score:** ${data.security.score} / 10000
🚩 **Top Risk:** ${data.security.risks.length > 0 ? data.security.risks[0].name : 'None detected'}

⚡ *Powered by Custom Intelligence Terminal*
        `;

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          waitMessage.message_id,
          undefined,
          report,
          { parse_mode: 'Markdown' }
        );

      } catch (error) {
        console.error(error);
        ctx.reply('❌ Failed to fetch token data. Network may be busy or token invalid.');
      }
    });
  }

  public start() {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      this.bot.launch();
      console.log('🤖 Telegram Bot Gateway listening for commands...');
      
      process.once('SIGINT', () => this.bot.stop('SIGINT'));
      process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
  }
}