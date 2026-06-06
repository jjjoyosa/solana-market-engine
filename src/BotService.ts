import { Telegraf, Markup } from 'telegraf';
import { ScannerService, TokenReport, isValidMintAddress } from './ScannerService';
import dotenv from 'dotenv';
import redis from './Redis';

dotenv.config();



export class BotService {
  private bot: Telegraf;
  private readonly COOLDOWN_SECONDS = 3;

  // Matches a bare mint address OR extracts one from a Dexscreener/GMGN/Photon URL
  private readonly MINT_PATTERNS = [
    /\/solana\/([1-9A-HJ-NP-Za-km-z]{32,44})/,  // dexscreener, gmgn, photon URLs
    /[?&]address=([1-9A-HJ-NP-Za-km-z]{32,44})/, // query-param style URLs
    /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/,         // bare address
  ];

  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    this.initializeCommands();
    this.initializeMonitor();
    this.initializeActions();
  }



  private async isRateLimited(userId: number | undefined): Promise<boolean> {
    if (!userId) return false;
    const key = `ratelimit:${userId}`;
    try {
      const result = await redis.set(key, '1', 'EX', this.COOLDOWN_SECONDS, 'NX');
      return result === null;
    } catch {
      return false;
    }
  }

  /**
   * Tries each pattern in order and returns the first valid mint address found.
   * Handles bare addresses, Dexscreener URLs, GMGN URLs, Photon URLs, etc.
   */
  private extractMint(text: string): string | null {
    for (const pattern of this.MINT_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1] && isValidMintAddress(match[1])) {
        return match[1];
      }
    }
    return null;
  }



  private formatUSD(val: number): string {
    if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
    if (val >= 1_000_000)     return `$${(val / 1_000_000).toFixed(2)}M`;
    if (val >= 1_000)         return `$${(val / 1_000).toFixed(1)}K`;
    return `$${val.toFixed(4)}`;
  }

  private escapeMd(text: string | number | null | undefined): string {
    if (text === null || text === undefined) return 'N/A';
    return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
  }

  private formatPrice(price: number): string {
    if (price === 0)          return 'N/A';
    if (price < 0.000001)     return price.toExponential(4);
    if (price < 0.01)         return price.toFixed(8);
    return price.toFixed(6);
  }



  private generateReport(data: TokenReport): string {
    const { market, security } = data;

    const price = this.escapeMd(this.formatPrice(market.price));
    const mc    = (market.marketCap != null && market.marketCap > 1)
      ? this.escapeMd(this.formatUSD(market.marketCap))
      : 'Bonding Curve';
    const liq   = market.liquidity
      ? this.escapeMd(this.formatUSD(market.liquidity))
      : 'Bonding Curve';
    const vol   = market.volume24h
      ? this.escapeMd(this.formatUSD(market.volume24h))
      : 'N/A';

    const isFakeVol    = market.liquidity > 0 && market.volume24h > market.liquidity * 30;
    const lpIcon       = security.lpLocked > 90 ? '🔒' : '⚠️';
    const fakeVolWarn  = isFakeVol ? ' ⚠️ _Suspicious vol_' : '';

    const mintStatus   = security.mintRevoked   ? '✅ Revoked' : '❌ Active';
    const freezeStatus = security.freezeRevoked ? '✅ Revoked' : '❌ Active';

    const top10     = this.escapeMd(security.top10Holders.toFixed(1));
    const top20     = this.escapeMd(security.top20Holders.toFixed(1));
    const heldPct   = this.escapeMd(security.creator.heldPct.toFixed(1));
    const bundlePct = this.escapeMd(security.distribution.bundlePct.toFixed(1));

    const soldPct = security.creator.soldPct !== null
      ? this.escapeMd(security.creator.soldPct.toFixed(1)) + '%'
      : '?';

    const safeSymbol      = this.escapeMd(market.symbol);
    const safeMint        = this.escapeMd(data.mint);
    const safeCreator     = this.escapeMd(security.creator.address);
    const safeBalance     = this.escapeMd(security.creator.balance);
    const firstRisk       = security.risks.length > 0 ? security.risks[0].name : 'Clean';
    const safeRisk        = this.escapeMd(firstRisk);
    const safeBuys        = this.escapeMd(market.buys);
    const safeSells       = this.escapeMd(market.sells);
    const safeHolders     = this.escapeMd(market.holders);
    const safeScore       = this.escapeMd(security.score);
    const safeBundleCnt   = this.escapeMd(security.distribution.bundleCount);
    const safeSniperCnt   = this.escapeMd(security.distribution.sniperCount);

    return (
`💎 *${safeSymbol}* \\| \`${safeMint}\`

💰 *MC:* ${mc} \\| 💵 *Price:* ${price}
💧 *Liq:* ${liq} ${lpIcon}
📊 *Vol:* ${vol}${fakeVolWarn}
🔄 *Txns:* 🟢 ${safeBuys} \\| 🔴 ${safeSells}
👥 *Hodls:* ${safeHolders}

*DISTRIBUTION & SNIPERS*
📦 *Bundles:* ${safeBundleCnt} • ${bundlePct}%
🔫 *Snipers:* ${safeSniperCnt}
🎯 *First 20:* ${top20}%

*DEV & SECURITY*
${security.isScam ? '🚨 *RUG PULL DETECTED*' : '✅ *SAFE*'}
🛡️ *Score:* ${safeScore}
🚩 *Flag:* ${safeRisk}
⛓️ *Mint Auth:* ${mintStatus}
❄️ *Freeze Auth:* ${freezeStatus}
👥 *Top 10%:* ${top10}%

🛠 *Dev:* \`${safeCreator}\`
💰 *Dev Balance:* ${safeBalance} SOL
 ├ *Held:* ${heldPct}% 🤍
 └ *Sold:* ${soldPct} 🔴`
    );
  }

  private generateKeyboard(data: TokenReport) {
    const { mint } = data;
    const { socials } = data.market;

    const keyboard = [
      [
        Markup.button.url('📈 DexScreener', `https://dexscreener.com/solana/${mint}`),
        Markup.button.url('⚡ Photon', `https://photon-sol.tinyastro.io/en/lp/${mint}`),
      ],
      [
        Markup.button.url('🦅 GMGN', `https://gmgn.ai/sol/token/${mint}`),
        Markup.button.callback('🔄 Refresh', `refresh_${mint}`),
      ],
    ];

    const socialRow: ReturnType<typeof Markup.button.url>[] = [];

    const buildUrl = (
      raw: string | null | undefined,
      platform: 'tg' | 'x' | 'web'
    ): string | null => {
      if (!raw || typeof raw !== 'string') return null;
      const s = raw.trim();
      if (!s || s === 'https://') return null;

      if (s.startsWith('@')) {
        const handle = s.slice(1);
        if (platform === 'tg') return `https://t.me/${handle}`;
        if (platform === 'x')  return `https://x.com/${handle}`;
        return null;
      }
      return s.startsWith('http') ? s : `https://${s}`;
    };

    const tg  = buildUrl(socials.telegram, 'tg');
    const x   = buildUrl(socials.twitter,  'x');
    const web = buildUrl(socials.website,  'web');

    if (tg)  socialRow.push(Markup.button.url('✈️ TG',  tg));
    if (x)   socialRow.push(Markup.button.url('🐦 X',   x));
    if (web) socialRow.push(Markup.button.url('🌐 Web', web));

    if (socialRow.length > 0) keyboard.push(socialRow);

    return Markup.inlineKeyboard(keyboard);
  }



  private initializeCommands() {
    this.bot.start((ctx) => {
      return ctx.reply(
        '👋 *Solana Token Scanner*\n\nPaste any Solana mint address or a link from DexScreener, GMGN, or Photon and I\'ll fetch a full security report\\.\n\nTry it now \\— just drop an address or link\\.',
        { parse_mode: 'MarkdownV2' }
      );
    });

    this.bot.help((ctx) => {
      return ctx.reply(
        '*Available commands*\n\n' +
        '/start — intro\n' +
        '/help — this message\n\n' +
        '*How to scan*\n' +
        'Paste a Solana mint address or any link from DexScreener, GMGN, or Photon\\. ' +
        'I\'ll return price, market cap, liquidity, holder distribution, dev info, and rug risk\\.\n\n' +
        '*Refresh*\nTap 🔄 Refresh on any report to pull live data\\.',
        { parse_mode: 'MarkdownV2' }
      );
    });
  }

  private initializeMonitor() {
    this.bot.on('text', async (ctx) => {
      if (ctx.message.text.startsWith('/')) return;
      if (await this.isRateLimited(ctx.from?.id)) return;

      const text = ctx.message.text.trim();
      const mint = this.extractMint(text);
      if (!mint) return;

      // Send a loading message, then edit it in-place with the result.
      // This avoids the visual flash of delete + new message.
      const loadingMsg = await ctx.reply('🔍 Scanning\\.\\.\\.', {
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: ctx.message.message_id },
      }).catch(() => null);

      try {
        const data   = await ScannerService.scanToken(mint, false);
        const report = this.generateReport(data);
        const kb     = this.generateKeyboard(data);

        if (loadingMsg) {
          // Edit in-place — snappier than delete + new message
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined,
            report,
            {
              parse_mode: 'MarkdownV2',
              link_preview_options: { is_disabled: true },
              ...kb,
            }
          ).catch(async () => {
            // Fallback: if edit fails, send a new reply
            await ctx.reply(report, {
              parse_mode: 'MarkdownV2',
              link_preview_options: { is_disabled: true },
              reply_parameters: { message_id: ctx.message.message_id },
              ...kb,
            });
          });
        } else {
          await ctx.reply(report, {
            parse_mode: 'MarkdownV2',
            link_preview_options: { is_disabled: true },
            reply_parameters: { message_id: ctx.message.message_id },
            ...kb,
          });
        }
      } catch (error) {
        console.error(`[Monitor] Scan failed for ${mint}:`, error);

        const errMsg = '❌ Could not fetch data for that address\\. The token may not exist yet or our data provider is temporarily down\\.';

        if (loadingMsg) {
          await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined, errMsg,
            { parse_mode: 'MarkdownV2' }
          ).catch(() => {});
        } else {
          await ctx.reply(errMsg, {
            parse_mode: 'MarkdownV2',
            reply_parameters: { message_id: ctx.message.message_id },
          }).catch(() => {});
        }
      }
    });
  }

  private initializeActions() {
    this.bot.action(/^refresh_([1-9A-HJ-NP-Za-km-z]{32,44})$/, async (ctx) => {
      if (await this.isRateLimited(ctx.from?.id)) {
        await ctx.answerCbQuery('⏳ Slow down — wait 3 seconds.', { show_alert: false }).catch(() => {});
        return;
      }

      await ctx.answerCbQuery('🔄 Refreshing...').catch(() => {});

      const mint = ctx.match[1];

      try {
        const data = await ScannerService.scanToken(mint, true);

        await ctx.editMessageText(this.generateReport(data), {
          parse_mode: 'MarkdownV2',
          link_preview_options: { is_disabled: true },
          ...this.generateKeyboard(data),
        }).catch((err: { description?: string }) => {
          if (!err.description?.includes('message is not modified')) {
            console.error('[Refresh] Edit failed:', err);
          }
        });
      } catch (error) {
        console.error('[Refresh] Scan failed:', error);
        await ctx.answerCbQuery('❌ Refresh failed. Try again in a moment.', { show_alert: true }).catch(() => {});
      }
    });
  }



  public start() {
    process.once('SIGINT',  () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));

    // Use webhooks in production for ~200ms faster response + lower CPU.
    // Set WEBHOOK_DOMAIN in your .env when deploying to a server.
    if (process.env.WEBHOOK_DOMAIN) {
      this.bot.launch({
        webhook: {
          domain: process.env.WEBHOOK_DOMAIN,
          port:   parseInt(process.env.WEBHOOK_PORT ?? '8443', 10),
        },
      });
      console.log(`🤖 Bot live via webhook on ${process.env.WEBHOOK_DOMAIN}`);
    } else {
      // Falls back to long-polling for local dev — no setup needed
      this.bot.launch();
      console.log('🤖 Bot live via long-polling (local dev mode)');
    }

    console.log('👂 Listening for Solana mint addresses and token URLs...');

    // Trending cache pre-warmer — runs every 60s
    // Warms the top 20 most-scanned tokens so popular queries return instantly
    setInterval(async () => {
      try {
        const top = await ScannerService.getTopScanned(20);
        if (top.length > 0) {
          console.log(`[Trending] Pre-warming ${top.length} tokens...`);
          await ScannerService.warmCache(top);
        }
      } catch (err) {
        console.warn('[Trending] Pre-warm failed:', err);
      }
    }, 60_000);
  }
}