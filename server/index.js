require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const mongoose = require('mongoose');

const signalRoutes = require('./routes/signals');
const candleRoutes = require('./routes/candles');
const { runICTEngine, generateCandle } = require('./controllers/ictEngine');
const Signal = require('./models/Signal');
const Candle = require('./models/Candle');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000' }));
app.use(express.json());

// ── MongoDB ─────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-trader')
  .then(() => console.log('✅  MongoDB connected'))
  .catch((err) => console.error('❌  MongoDB error:', err.message));

// ── REST Routes ──────────────────────────────────────────────
app.use('/api/signals', signalRoutes);
app.use('/api/candles', candleRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── WebSocket broadcast helper ───────────────────────────────
function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

// ── Price feed state ─────────────────────────────────────────
let candleBuffer = [];   // rolling 150 candles in memory
let lastPrice   = 1.085 + (Math.random() - 0.5) * 0.005;
let signalCooldown = 0;

// Seed 120 historical candles on startup
async function seedInitialCandles() {
  try {
    const count = await Candle.countDocuments();
    if (count > 0) {
      const stored = await Candle.find().sort({ time: 1 }).limit(150);
      candleBuffer = stored.map((c) => c.toObject());
      lastPrice = candleBuffer[candleBuffer.length - 1].close;
      console.log(`📊  Loaded ${candleBuffer.length} candles from DB`);
      return;
    }
    console.log('📊  Seeding initial candles…');
    const now = Date.now();
    const interval = 5 * 60 * 1000;
    for (let i = 120; i >= 0; i--) {
      const c = generateCandle(lastPrice, now - i * interval);
      candleBuffer.push(c);
      lastPrice = c.close;
    }
    await Candle.insertMany(candleBuffer);
    console.log('✅  Seeded 120 candles');
  } catch (e) {
    console.error('Seed error:', e.message);
  }
}

// ── Live price engine (ticks every 2 s) ─────────────────────
async function tick() {
  const now = Date.now();
  const newCandle = generateCandle(lastPrice, now);
  lastPrice = newCandle.close;

  // Persist candle
  try {
    await Candle.create(newCandle);
    // Trim DB to last 500 candles
    const total = await Candle.countDocuments();
    if (total > 500) {
      const oldest = await Candle.find().sort({ time: 1 }).limit(total - 500);
      await Candle.deleteMany({ _id: { $in: oldest.map((c) => c._id) } });
    }
  } catch (e) { /* non-fatal */ }

  // Update in-memory buffer
  candleBuffer.push(newCandle);
  if (candleBuffer.length > 150) candleBuffer.shift();

  // Broadcast live candle to all WS clients
  broadcast('CANDLE', newCandle);

  // ICT engine — run every ~5 ticks with some randomness
  signalCooldown++;
  if (signalCooldown >= 5 && Math.random() < 0.18) {
    signalCooldown = 0;
    const signal = runICTEngine(candleBuffer);
    if (signal) {
      try {
        const saved = await Signal.create(signal);
        broadcast('SIGNAL', saved.toObject());
        console.log(`🔔  Signal: ${signal.direction} @ ${signal.entry}`);
      } catch (e) { console.error('Signal save error:', e.message); }
    }
  }
}

// ── WebSocket connection handler ─────────────────────────────
wss.on('connection', async (ws) => {
  console.log('🔌  Client connected');

  // Send current buffer on connect
  ws.send(JSON.stringify({ type: 'INIT_CANDLES', payload: candleBuffer }));

  // Send last 10 signals
  try {
    const recent = await Signal.find().sort({ createdAt: -1 }).limit(10);
    ws.send(JSON.stringify({ type: 'INIT_SIGNALS', payload: recent.reverse() }));
  } catch (e) { /* ignore */ }

  ws.on('close', () => console.log('🔌  Client disconnected'));
});

// ── Boot ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀  Server running on http://localhost:${PORT}`);
  await seedInitialCandles();
  setInterval(tick, 2000);
});
