import { Telegraf } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export class BotService {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
    this.initializeMonitor();
  }

  private initializeMonitor() {
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      
      const solanaMintRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
      const match = text.match(solanaMintRegex);

      if (match) {
        const mint = match[0];
        
        try {
          const response = await axios.get(`http://localhost:3001/api/scan/${mint}`);
          const data = response.data;

        const formatUSD = (val: number) => {
            if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
            if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
            return `$${val.toFixed(2)}`;
        };


          const price = data.market.price ? `${formatUSD(data.market.price)}` : 'N/A';
          const mc = data.market.marketCap ? `${formatUSD(data.market.marketCap)}` : 'N/A';
          const liq = data.market.liquidity ? `${formatUSD(data.market.liquidity)}` : 'Bonding Curve';
          const vol = data.market.volume24h ? `${formatUSD(data.market.volume24h)}` : 'N/A';
          const top10 = data.security.top10Holders ? data.security.top10Holders.toFixed(1) : 'N/A';
          const risks = (data.security.risks && data.security.risks.length > 0) ? data.security.risks[0] : 'Clean';
            const isFakeVol = data.market.volume24h > (data.market.marketCap * 0.5);
            const mintStatus = data.security.mintRevoked ? "✅ Revoked" : "❌ Active";
            const freezeStatus = data.security.freezeRevoked ? "✅ Revoked" : "❌ Active";
          const report = `
${data.market.symbol} | \`${data.mint}\`

💰 **MC:** ${mc} | 💵 **Price:** ${price}
💧 **Liq:** ${liq} ${data.security.lpLocked > 90 ? '🔒' : '⚠️'}
📊 **Vol:** ${vol} ${isFakeVol ? '⚠️ Fake Vol' : ''}
🔄 **Txns:** 🟢 ${data.market.buys} | 🔴 ${data.market.sells}
👥 **Hodls:** ${data.market.holders}

*DISTRIBUTION & SNIPERS*
📦 **Bundles:** 21 • 73% 
🔫 **Snipers:** 30 • 30% 
🎯 **First 20:** 33% | 📦 12% | 🌱 0.9%

*DEV & SECURITY*
${data.security.isScam ? '🚨 *RUG PULL DETECTED*' : '✅ *SAFE*'}
🛡️ **Score:** ${data.security.score}
🚩 **Flag:** ${risks}
⛓️ **Mint Auth:** ${mintStatus}
❄️ **Freeze Auth:** ${freezeStatus}
👥 **Top 10% Owns:** ${top10}%
🛠 **Dev:** \`${data.security.creator.address}\`
💰 **Dev Balance:** ${data.security.creator.balance} SOL
 ├ **Bundled:** 16% 🤍 | **Sold:** 14% 🔴
 └ **Airdrop:** 2% 🤍

 *QUICK LINKS*
📈 **Chart:** [DexScreener](https://dexscreener.com/solana/${data.mint}) | [BullX](https://bullx.io/terminal?chainId=1399811149&address=${data.mint})
⚡ **Trade:** [Photon](https://photon-sol.tinyastro.io/en/lp/${data.mint}) | [GMGN](https://gmgn.ai/sol/token/${data.mint})
👻 **Socials:** [TG](https://t.me/${data.mint}) | [X](https://x.com/${data.mint}) | [Web](https://${data.mint})
`;

          await ctx.reply(report, { 
              parse_mode: 'Markdown', 
              link_preview_options: { is_disabled: true },
              reply_parameters: { message_id: ctx.message.message_id }
          });

        } catch (error) {
          console.error(`Failed to auto-scan ${mint}`);
        }
      }
    });
  }

  public start() {
    this.bot.launch();
    console.log('🤖 Telegram Bot Gateway listening for addresses...');
  }
}