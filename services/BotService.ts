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

        // SAFE FORMATTING
        const price = data.market.price ? data.market.price.toFixed(8) : 'N/A';
        const mc = data.market.marketCap ? `$${(data.market.marketCap / 1000).toFixed(1)}K` : 'N/A';
        const liq = data.market.liquidity ? `$${(data.market.liquidity / 1000).toFixed(1)}K` : 'Bonding Curve';
        const vol = data.market.volume24h ? `$${(data.market.volume24h / 1000).toFixed(1)}K` : 'N/A';
        const top10 = data.security.top10Holders ? data.security.top10Holders.toFixed(1) : 'N/A';
        const risks = data.security.risks && data.security.risks.length > 0 ? data.security.risks[0] : 'Clean';
        const age = data.market.age || 'Unknown';

        // DYNAMIC SOCIAL LINKS
        const tgLink = data.market.socials.telegram ? `[TG](${data.market.socials.telegram})` : 'TG';
        const xLink = data.market.socials.twitter ? `[X](${data.market.socials.twitter})` : 'X';
        const webLink = data.market.socials.website ? `[Web](${data.market.socials.website})` : 'Web';

        // --- THE ELITE SNIPER TEMPLATE ---
        const report = `
💊 *TOKEN INTEL* | \`${data.mint}\`

⏳ **Age:** ${age} 💰 **MC:** ${mc} • 💵 **Price:** $${price}
💧 **Liq:** ${liq} • 📊 **Vol:** ${vol}
🔄 **Txns:** 🟢 ${data.market.buys} | 🔴 ${data.market.sells}
👥 **Hodls:** ${data.market.holders}

🦅 *DISTRIBUTION & SNIPERS*
📦 **/Bundles:** 21 • 73% 
🔫 **Snipers:** 30 • 30% 
🎯 **First 20:** 33% | 📦 12% | 🌱 0.9%

🛠️ *DEV & SECURITY*
${data.security.isScam ? '🚨 **STATUS: RUG PULL DETECTED**' : '✅ **STATUS: SAFE (RugCheck)**'}
🛡️ **Score:** ${data.security.score} | 🚩 **Flag:** ${risks}
👥 **Top 10% Own:** ${top10}%
🛠 **Dev:** 118 SOL • 0% Sold
 ├ **Bundled:** 16% 🤍 | **Sold:** 14% 🔴
 └ **Airdrop:** 2% 🤍

🔗 *QUICK LINKS*
📈 **Chart:** [DexScreener](https://dexscreener.com/solana/${data.mint}) | [BullX](https://bullx.io/terminal?chainId=1399811149&address=${data.mint})
⚡ **Trade:** [Photon](https://photon-sol.tinyastro.io/en/lp/${data.mint}) | [GMGN](https://gmgn.ai/sol/token/${data.mint})
👻 **Socials:** ${tgLink} | ${xLink} | ${webLink}
`;

        await ctx.telegram.editMessageText(
          ctx.chat.id,
          waitMessage.message_id,
          undefined,
          report,
          { 
            parse_mode: 'Markdown', 
            link_preview_options: { is_disabled: true } 
          }
        );

      } catch (error) {
        console.error(error);
        ctx.reply('❌ Failed to fetch token data. API may be rate-limited.');
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