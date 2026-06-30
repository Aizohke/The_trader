require('dotenv').config();
const express      = require('express');
const http         = require('http');
const WebSocket    = require('ws');
const cors         = require('cors');
const mongoose     = require('mongoose');
const path         = require('path');

const PriceFeed    = require('./controllers/pricefeed');
const { runICTEngine } = require('./controllers/ictEngine');
const Signal       = require('./models/Signal');
const Candle       = require('./models/Candle');
const signalRoutes = require('./routes/signals');
const candleRoutes = require('./routes/candles');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

// ── CORS ───────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// ── Broadcast to all connected WS clients ──────────────────────
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ── Inject broadcast into signal routes (for delete/update events)
signalRoutes.setBroadcast(broadcast);

// ── REST routes ────────────────────────────────────────────────
app.use('/api/signals', signalRoutes);
app.use('/api/candles', candleRoutes);
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString(), env: process.env.NODE_ENV })
);

// ── Serve React build in production (optional) ─────────────────
if (process.env.NODE_ENV === 'production' && process.env.SERVE_CLIENT === 'true') {
  const build = path.join(__dirname, '../client/build');
  app.use(express.static(build));
  app.get('*', (_req, res) => res.sendFile(path.join(build, 'index.html')));
}

// ── MongoDB ────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-trader', {
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => console.log('✅  MongoDB connected'))
  .catch((err) => console.error('❌  MongoDB:', err.message));

// ── Candle buffer ──────────────────────────────────────────────
let candleBuffer = [];

async function persistCandle(candle) {
  try {
    await Candle.findOneAndUpdate({ time: candle.time }, candle, { upsert: true, new: true });
    const total = await Candle.countDocuments();
    if (total > 500) {
      const oldest = await Candle.find().sort({ time: 1 }).limit(total - 500);
      await Candle.deleteMany({ _id: { $in: oldest.map((c) => c._id) } });
    }
  } catch (e) {
    console.error('Candle persist error:', e.message);
  }
}

// ── WebSocket: send state on connect ──────────────────────────
wss.on('connection', async (ws) => {
  console.log('🔌  Client connected');

  ws.send(JSON.stringify({ type: 'INIT_CANDLES', payload: candleBuffer }));

  try {
    const recent = await Signal.find().sort({ createdAt: -1 }).limit(20);
    ws.send(JSON.stringify({ type: 'INIT_SIGNALS', payload: recent.reverse() }));
  } catch (_) {}

  ws.on('close', () => console.log('🔌  Client disconnected'));
});

// ── Boot ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀  Server running on port ${PORT}`);

  // Pre-load candles from DB while waiting for Twelve Data history
  try {
    const saved = await Candle.find().sort({ time: -1 }).limit(150);
    if (saved.length) {
      candleBuffer = saved.reverse().map((c) => c.toObject());
      console.log(`📊  Pre-loaded ${candleBuffer.length} candles from DB`);
    }
  } catch (e) {
    console.error('DB pre-load error:', e.message);
  }

  // ── Price feed ─────────────────────────────────────────────
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.error('❌  TWELVE_DATA_API_KEY not set — price feed disabled');
    return;
  }

  const feed = new PriceFeed(apiKey);

  feed.on('history', async (bars) => {
    if (!bars.length) return;
    candleBuffer = bars;
    for (const bar of bars) await persistCandle(bar);
    broadcast('INIT_CANDLES', candleBuffer);
    console.log(`✅  Loaded ${bars.length} real EUR/USD 5M bars`);
  });

  feed.on('candle', (liveBar) => {
    broadcast('LIVE_TICK', liveBar);
  });

  feed.on('closed', async (closedBar) => {
    console.log(`📊  Bar closed: ${new Date(closedBar.time * 1000).toISOString()} close=${closedBar.close}`);
    candleBuffer.push(closedBar);
    if (candleBuffer.length > 150) candleBuffer.shift();
    broadcast('CANDLE', closedBar);
    await persistCandle(closedBar);

    // Run ICT engine on every closed bar
    const signal = runICTEngine(candleBuffer);
    if (signal) {
      try {
        const saved = await Signal.create(signal);
        broadcast('SIGNAL', saved.toObject());
        console.log(`🔔  Signal: ${signal.direction} @ ${signal.entry} RR 1:${signal.rr} [${signal.killzone}]`);
      } catch (e) {
        console.error('Signal save error:', e.message);
      }
    }
  });

  feed.on('error', (err) => console.error('❌  Feed error:', err.message));

  feed.start().catch((e) => console.error('Feed start error:', e.message));
});
