# 🤖 Solana Alpha Terminal

Production-grade Telegram bot for real-time Solana token intelligence and risk analysis.

Solana Alpha Terminal transforms raw blockchain data into actionable insights by aggregating token metadata, security signals, and wallet behavior into a fast, interactive Telegram experience.

---

## ✨ Features

### 🔍 Real-Time Token Auditing
Analyze Solana tokens instantly using aggregated intelligence from multiple data providers.

- Security and risk scoring
- Liquidity and token metadata analysis
- Rapid audit response for newly launched tokens

### 🧠 Alpha Intelligence Engine

#### Bundle Detection
Detect coordinated wallet accumulation and potential insider activity.

#### Developer Wallet Tracking
Monitor creator wallet holdings and identify sell-off behavior.

#### Fake Volume Detection
Flag suspicious trading activity and possible wash-trading patterns.

---

## ⚡ Production Features

### In-Memory TTL Caching
Optimized caching layer to:

- Reduce API latency
- Prevent unnecessary API calls
- Minimize rate-limit issues

### Interactive Telegram UI

- Inline keyboards
- One-tap rescans
- Fast navigation between audit views

### Smart URL Normalization

Automatically cleans and repairs malformed social links returned by external APIs.

---

## 🏗️ System Architecture

### `ScannerService`
Responsible for:

- Parallel API execution
- Risk evaluation
- Token heuristics
- Cache lifecycle management

### `BotService`
Responsible for:

- Telegram interaction handling
- UI rendering
- Callback listeners
- User experience workflows

---

## 🛠 Tech Stack

| Layer | Technology |
|--------|-----------|
| Language | TypeScript |
| Bot Framework | Telegraf.js |
| Blockchain Data | Birdeye API |
| Security Analysis | RugCheck API |
| Cache Layer | In-Memory Map (TTL) |

---

## 📦 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/solana-alpha-terminal.git
cd solana-alpha-terminal
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file:

```env
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_TOKEN
BIRDEYE_API_KEY=YOUR_BIRDEYE_KEY
RUGCHECK_API_KEY=YOUR_RUGCHECK_KEY
```

(Optional) Add `.env.example`:

```env
TELEGRAM_BOT_TOKEN=PLACEHOLDER
BIRDEYE_API_KEY=PLACEHOLDER
RUGCHECK_API_KEY=PLACEHOLDER
```

### 4. Start the Bot

```bash
npm run start
```

---

## 📁 Project Structure

```plaintext
src/
├── services/
│   ├── ScannerService.ts
│   └── BotService.ts
├── utils/
├── types/
├── config/
└── index.ts
```

---

## 📈 Roadmap

- [ ] Redis-based distributed caching
- [ ] WebSocket market streams
- [ ] Subscription alerts
- [ ] Historical token analytics
- [ ] Wallet watchlists
- [ ] Multi-chain expansion

---

## 🔒 Disclaimer

This tool provides analytical signals and should not be considered financial advice.

Always perform independent research before trading or interacting with blockchain assets.

---

## 📄 License

MIT License

---

Built for speed, intelligence, and actionable Solana insights ⚡