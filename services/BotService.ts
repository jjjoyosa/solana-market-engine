import { Telegraf, Markup } from 'telegraf';
import { ScannerService } from './ScannerService';
import dotenv from 'dotenv';

dotenv.config();

export class BotService {
  private bot: Telegraf;

  constructor() {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
    this.initializeMonitor();
    this.initializeActions();
  }

  private formatUSD(val: number) {
    if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
  }

  private generateReport(data: any) {
    const price = data.market.price ? `${data.market.price}` : 'N/A';
    const mc = data.market.marketCap ? `${this.formatUSD(data.market.marketCap)}` : 'N/A';
    const liq = data.market.liquidity ? `${this.formatUSD(data.market.liquidity)}` : 'Bonding Curve';
    const vol = data.market.volume24h ? `${this.formatUSD(data.market.volume24h)}` : 'N/A';
    
    const top10 = data.security.top10Holders ? data.security.top10Holders.toFixed(1) : 'N/A';
    const top20 = data.security.top20Holders ? data.security.top20Holders.toFixed(1) : 'N/A';
    const risks = (data.security.risks && data.security.risks.length > 0) ? data.security.risks[0] : 'Clean';
    
    const isFakeVol = data.market.volume24h > (data.market.marketCap * 0.5);
    const mintStatus = data.security.mintRevoked ? "✅ Revoked" : "❌ Active";
    const freezeStatus = data.security.freezeRevoked ? "✅ Revoked" : "❌ Active";

    return `
💎 **${data.market.symbol}** | \`${data.mint}\`

💰 **MC:** ${mc} | 💵 **Price:** ${price}
💧 **Liq:** ${liq} ${data.security.lpLocked > 90 ? '🔒' : '⚠️'}
📊 **Vol:** ${vol} ${isFakeVol ? '⚠️ Fake Vol' : ''}
🔄 **Txns:** 🟢 ${data.market.buys} | 🔴 ${data.market.sells}
👥 **Hodls:** ${data.market.holders}

*DISTRIBUTION & SNIPERS*
📦 **Bundles:** ${data.security.distribution.bundleCount} • ${data.security.distribution.bundlePct.toFixed(1)}% 
🔫 **Snipers:** ${data.security.distribution.sniperCount}
🎯 **First 20:** ${top20}%

*DEV & SECURITY*
${data.security.isScam ? '🚨 *RUG PULL DETECTED*' : '✅ *SAFE*'}
🛡️ **Score:** ${data.security.score}
🚩 **Flag:** ${risks}
⛓️ **Mint Auth:** ${mintStatus}
❄️ **Freeze Auth:** ${freezeStatus}
👥 **Top 10% Owns:** ${top10}%
🛠 **Dev:** \`${data.security.creator.address}\`
💰 **Dev Balance:** ${data.security.creator.balance} SOL
 ├ **Held:** ${data.security.creator.heldPct.toFixed(1)}% 🤍
 └ **Sold:** ${data.security.creator.soldPct.toFixed(1)}% 🔴
`;
  }

  private generateKeyboard(data: any) {
    const mint = data.mint;
    const socials = data.market.socials;

    const keyboard = [
      [
        Markup.button.url('📈 DexScreener', `https://dexscreener.com/solana/${mint}`),
        Markup.button.url('⚡ Photon', `https://photon-sol.tinyastro.io/en/lp/${mint}`)
      ],
      [
        Markup.button.url('🦅 GMGN', `https://gmgn.ai/sol/token/${mint}`),
        Markup.button.callback('🔄 Refresh Data', `refresh_${mint}`)
      ]
    ];

    const formatUrl = (url: string | null | undefined, platform: 'tg' | 'x' | 'web'): string | null => {
      if (!url || typeof url !== 'string' || url.trim() === '' || url === 'https://') return null;
      let clean = url.trim();
      
      if (clean.startsWith('@')) {
        const handle = clean.substring(1);
        if (platform === 'tg') return `https://t.me/${handle}`;
        if (platform === 'x') return `https://x.com/${handle}`;
        return null;
      }
      
      if (!clean.startsWith('http')) clean = `https://${clean}`;
      
      return clean;
    };

    const tgUrl = formatUrl(socials?.telegram, 'tg');
    const xUrl = formatUrl(socials?.twitter, 'x');
    const webUrl = formatUrl(socials?.website, 'web');

    const socialRow = [];
    if (tgUrl) socialRow.push(Markup.button.url('✈️ TG', tgUrl));
    if (xUrl) socialRow.push(Markup.button.url('🐦 X', xUrl));
    if (webUrl) socialRow.push(Markup.button.url('🌐 Web', webUrl));

    if (socialRow.length > 0) {
      keyboard.push(socialRow);
    }

    return Markup.inlineKeyboard(keyboard);
  }
  
  private initializeMonitor() {
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text.trim();
      const solanaMintRegex = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
      const match = text.match(solanaMintRegex);

      if (match) {
        const mint = match[0];
        try {
          const data = await ScannerService.scanToken(mint, false);
          
          await ctx.reply(this.generateReport(data), { 
              parse_mode: 'Markdown', 
              link_preview_options: { is_disabled: true },
              reply_parameters: { message_id: ctx.message.message_id },
              ...this.generateKeyboard(data) 
          });
        } catch (error) {
          console.error(`Failed to auto-scan ${mint}`);
        }
      }
    });
  }

  private initializeActions() {
    this.bot.action(/refresh_(.+)/, async (ctx) => {
      const mint = ctx.match[1];
      try {
        const data = await ScannerService.scanToken(mint, true);
        
        await ctx.editMessageText(this.generateReport(data), {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...this.generateKeyboard(data)
        }).catch((err) => {
          if (!err.description?.includes('message is not modified')) {
             console.error("Message edit failed:", err);
          }
        });
      } catch (error) {
         console.error("Refresh action failed.");
      }
    });
  }

  public start() {
    this.bot.launch();
    console.log('🤖 Telegram Bot Gateway listening for addresses...');
  }
}