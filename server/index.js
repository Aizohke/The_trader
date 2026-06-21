require('dotenv').config();
const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const mongoose   = require('mongoose');
const path       = require('path');

const PriceFeed  = require('./controllers/pricefeed');
const { runICTEngine, computeSessionLevels } = require('./controllers/ictEngine');
const Signal     = require('./models/Signal');
const Candle     = require('./models/Candle');
const signalRoutes = require('./routes/signals');
const candleRoutes = require('./routes/candles');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

// ── MongoDB ───────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-trader', {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => console.log('✅  MongoDB connected'))
  .catch((err) => console.error('❌  MongoDB error:', err.message));

// ── REST Routes ───────────────────────────────────────────────
app.use('/api/signals', signalRoutes);
app.use('/api/candles', candleRoutes);
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV })
);

// ── Serve React build (optional — if deploying together) ──────
if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT === 'true') {
  const clientBuild = path.join(__dirname, '../client/build');
  app.use(express.static(clientBuild));
  app.get('*', (_req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

// ── Broadcast to all WS clients ───────────────────────────────
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ── In-memory candle buffer (latest 150 closed bars) ─────────
let candleBuffer   = [];
let signalCooldown = 0;   // run ICT engine every N closed bars

// ── Persist a closed candle to MongoDB ───────────────────────
async function persistCandle(candle) {
  try {
    // upsert by time so restarts don't create duplicates
    await Candle.findOneAndUpdate(
      { time: candle.time },
      candle,
      { upsert: true, new: true }
    );
    // Trim to 500 most recent candles
    const total = await Candle.countDocuments();
    if (total > 500) {
      const oldest = await Candle.find().sort({ time: 1 }).limit(total - 500);
      await Candle.deleteMany({ _id: { $in: oldest.map((c) => c._id) } });
    }
  } catch (e) {
    console.error('Candle persist error:', e.message);
  }
}

// ── On WS client connect: send current state ─────────────────
wss.on('connection', async (ws) => {
  console.log('🔌  Client connected');

  // Send historical candle buffer immediately
  ws.send(JSON.stringify({ type: 'INIT_CANDLES', payload: candleBuffer }));

  // Send last 10 signals from DB
  try {
    const recent = await Signal.find().sort({ createdAt: -1 }).limit(10);
    ws.send(JSON.stringify({ type: 'INIT_SIGNALS', payload: recent.reverse() }));
  } catch (_) {}

  ws.on('close', () => console.log('🔌  Client disconnected'));
});

// ── Boot ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀  Server running on port ${PORT}`);

  // Pre-load any previously saved candles from DB so buffer isn't empty
  // while waiting for Twelve Data history response
  try {
    const saved = await Candle.find().sort({ time: -1 }).limit(150);
    if (saved.length) {
      candleBuffer = saved.reverse().map((c) => c.toObject());
      console.log(`📊  Pre-loaded ${candleBuffer.length} candles from DB`);
    }
  } catch (e) {
    console.error('DB pre-load error:', e.message);
  }

  // ── Start Twelve Data price feed ────────────────────────────
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.error('❌  TWELVE_DATA_API_KEY not set — price feed disabled');
    return;
  }

  const feed = new PriceFeed(apiKey);

  // 1. Historical bars from REST — replace DB pre-load with real data
  feed.on('history', async (bars) => {
    if (!bars.length) return;
    candleBuffer = bars;
    // Persist to DB
    for (const bar of bars) {
      await persistCandle(bar);
    }
    // Broadcast updated history to any already-connected clients
    broadcast('INIT_CANDLES', candleBuffer);
    console.log(`✅  History loaded: ${bars.length} real EUR/USD 5M bars`);
  });

  // 2. Live in-progress bar update on every tick (sent to clients for smooth chart)
  feed.on('candle', (liveBar) => {
    broadcast('LIVE_TICK', liveBar);
  });

  // 3. Bar closed — add to buffer, persist, run ICT engine
  feed.on('closed', async (closedBar) => {
    console.log(`📊  Bar closed: ${new Date(closedBar.time * 1000).toISOString()} C=${closedBar.close}`);

    // Update buffer
    candleBuffer.push(closedBar);
    if (candleBuffer.length > 150) candleBuffer.shift();

    // Broadcast closed bar to all clients
    broadcast('CANDLE', closedBar);

    // Persist to MongoDB
    await persistCandle(closedBar);

    // Run ICT engine every bar (no artificial cooldown — real data is slower)
    signalCooldown++;
    if (signalCooldown >= 3) {
      signalCooldown = 0;
      const signal = runICTEngine(candleBuffer);
      if (signal) {
        try {
          const saved = await Signal.create(signal);
          broadcast('SIGNAL', saved.toObject());
          console.log(`🔔  ICT Signal: ${signal.direction} @ ${signal.entry} | RR 1:${signal.rr}`);
        } catch (e) {
          console.error('Signal save error:', e.message);
        }
      }
    }
  });

  feed.on('error', (err) => {
    console.error('❌  Feed error:', err.message);
  });

  feed.start().catch((e) => console.error('Feed start error:', e.message));
});
