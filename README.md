# The Trader — ICT Trading Dashboard (MERN Stack)

A real-time EUR/USD trading advisory dashboard powered by the ICT (Inner Circle Trader) methodology. The system monitors every candle for three sequential conditions — **Liquidity Sweep → Market Structure Shift → Fair Value Gap** — and broadcasts BUY/SELL signals with calculated entry, stop loss, and take profit levels.

---

## 🗂️ Project Structure

```
the-trader/
├── package.json              ← Root: concurrently runs server + client
│
├── server/                   ← Express + WebSocket + MongoDB
│   ├── index.js              ← Main server, WS engine, price ticker loop
│   ├── .env.example          ← Copy to .env and configure
│   ├── controllers/
│   │   └── ictEngine.js      ← ICT logic: sweep / MSS / FVG detection
│   ├── models/
│   │   ├── Signal.js         ← Mongoose signal schema
│   │   └── Candle.js         ← Mongoose candle schema
│   └── routes/
│       ├── signals.js        ← REST: GET/PATCH/DELETE signals, stats
│       └── candles.js        ← REST: GET candles, GET /context
│
└── client/                   ← React 18 frontend
    ├── public/index.html
    └── src/
        ├── index.js          ← ReactDOM entry
        ├── index.css         ← Design tokens + global styles
        ├── App.js            ← Layout: Header + ChartPanel + SidePanel
        ├── App.css           ← App-level grid layout
        ├── context/
        │   └── WsContext.js  ← WebSocket provider (candles, signals, ticker)
        └── components/
            ├── Header.js/css         ← Live ticker, session chip, WS status
            ├── ChartPanel.js/css     ← Stat bar, timeframe toggle
            ├── TradingChart.js       ← TradingView Lightweight Charts + annotations
            ├── SidePanel.js/css      ← Tab container (Signals / Log / ICT)
            ├── SignalFeed.js/css     ← Live WebSocket signal cards
            ├── SignalLog.js/css      ← REST-fetched log table, WIN/LOSS updater
            ├── IctStatus.js/css      ← Pipeline monitor, session guide, glossary
            └── Toast.js/css         ← New-signal toast notification
```

---

## ⚙️ Prerequisites

| Tool       | Version  | Install                          |
|------------|----------|----------------------------------|
| Node.js    | ≥ 18     | https://nodejs.org               |
| npm        | ≥ 9      | Bundled with Node.js             |
| MongoDB    | ≥ 6      | https://www.mongodb.com/try/download/community |

> **Free MongoDB alternative:** Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) free tier — no local install needed. Just replace `MONGO_URI` in `.env` with your Atlas connection string.

---

## 🚀 Quick Start

### 1. Clone / unzip the project
```bash
cd the-trader
```

### 2. Install all dependencies
```bash
# Install root dev tools
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### 3. Configure the server environment
```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
```env
MONGO_URI=mongodb://localhost:27017/the-trader
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
```

### 4. Start MongoDB (if running locally)
```bash
# macOS (Homebrew)
brew services start mongodb-community

# Ubuntu / Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

### 5. Run the full stack
```bash
# From the root the-trader/ directory
npm run dev
```

This runs **both** the Express server (port 5000) and the React dev server (port 3000) concurrently.

Open **http://localhost:3000** in your browser.

---

## 🌐 API Reference

### REST Endpoints (Express — port 5000)

| Method | Endpoint                    | Description                              |
|--------|-----------------------------|------------------------------------------|
| GET    | `/api/health`               | Server health check                      |
| GET    | `/api/candles?limit=150`    | Recent OHLCV candles (chronological)     |
| GET    | `/api/candles/context`      | ICT session levels computed server-side  |
| GET    | `/api/signals`              | Paginated signal history + stats         |
| GET    | `/api/signals?direction=BUY&outcome=PENDING` | Filtered signals     |
| GET    | `/api/signals/:id`          | Single signal detail                     |
| PATCH  | `/api/signals/:id`          | Update outcome (WIN/LOSS) and pips       |
| DELETE | `/api/signals/:id`          | Delete a signal                          |
| GET    | `/api/signals/stats/summary`| Aggregate stats by direction             |

### WebSocket Messages (ws://localhost:5000)

#### Server → Client
| Type            | Payload                        | When                        |
|-----------------|--------------------------------|-----------------------------|
| `INIT_CANDLES`  | `Candle[]` (last 150)          | On client connect           |
| `INIT_SIGNALS`  | `Signal[]` (last 10)           | On client connect           |
| `CANDLE`        | `Candle` (single new candle)   | Every 2 seconds             |
| `SIGNAL`        | `Signal` (full signal object)  | When ICT conditions trigger |

---

## 🧠 ICT Engine Logic

The engine runs on every new candle inside `server/controllers/ictEngine.js`:

```
Step 1 — Liquidity Sweep
  └── Did price wick above/below the 20-candle swing high/low and close back inside?
      → YES: record sweep type (bullish/bearish)
      → NO:  exit, no signal

Step 2 — Market Structure Shift (MSS)
  └── After the sweep, did a candle close beyond the recent fractal low/high?
      → YES: MSS confirmed
      → NO:  exit, no signal

Step 3 — Fair Value Gap (FVG)
  └── Scan last N candles for a 3-candle price imbalance matching sweep direction
      → FOUND: compute trade parameters
      → NOT FOUND: exit, no signal

Signal Output
  ├── direction: BUY | SELL
  ├── entry:     FVG edge price
  ├── sl:        Beyond FVG opposite edge + 10 pip buffer
  ├── tp:        Entry ± (risk × 2.5)  →  1:2.5 R:R minimum
  └── conditions: { sweep, mss, fvg }  (stored in MongoDB)
```

---

## 🔧 Configuration & Customisation

### Change R:R ratio
In `server/controllers/ictEngine.js`, line ~68:
```js
const tp = isBull
  ? parseFloat((entry + risk * 2.5).toFixed(5))   // ← change 2.5 to your target
  : parseFloat((entry - risk * 2.5).toFixed(5));
```

### Change price feed interval
In `server/index.js`, bottom of file:
```js
setInterval(tick, 2000);  // ← 2000ms = 2 seconds per candle
```

### Connect a real data feed
Replace the `generateCandle()` call in `tick()` inside `server/index.js` with a real OHLCV data source (e.g. Alpha Vantage free tier, Twelve Data free plan, or Oanda practice API). The WebSocket broadcast format stays identical — just substitute the candle object.

### Use MongoDB Atlas (cloud)
1. Create a free cluster at https://cloud.mongodb.com
2. Copy the connection string
3. Paste into `server/.env` as `MONGO_URI=mongodb+srv://...`

---

## 📦 Dependencies (all free / open-source)

### Server
| Package    | Purpose                         | License |
|------------|---------------------------------|---------|
| express    | HTTP REST API                   | MIT     |
| ws         | WebSocket server                | MIT     |
| mongoose   | MongoDB ODM                     | MIT     |
| dotenv     | Environment variable loading    | MIT     |
| cors       | Cross-origin request headers    | MIT     |
| nodemon    | Dev auto-restart                | MIT     |

### Client
| Package             | Purpose                        | License |
|---------------------|--------------------------------|---------|
| react / react-dom   | UI framework                   | MIT     |
| lightweight-charts  | TradingView candlestick chart  | Apache 2|
| axios               | HTTP REST client               | MIT     |
| recharts            | (available for stats charts)   | MIT     |
| react-scripts       | CRA build tooling              | MIT     |

---

## 🛠️ Production Build

```bash
# Build the React frontend
npm run build

# Serve the build from Express (add to server/index.js):
# const path = require('path');
# app.use(express.static(path.join(__dirname, '../client/build')));
# app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../client/build/index.html')));

# Then run:
cd server && npm start
```

---

## ⚠️ Disclaimer

This dashboard is for **educational and research purposes only**. It does not execute real trades. Always conduct your own analysis before trading financial instruments. Past signal performance does not guarantee future results.
