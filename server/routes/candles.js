const express = require('express');
const router  = express.Router();
const Candle  = require('../models/Candle');
const { computeSessionLevels } = require('../controllers/ictEngine');

// GET /api/candles?limit=150
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 150, 500);
    const candles = await Candle.find().sort({ time: -1 }).limit(limit);
    res.json(candles.reverse()); // chronological order
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/candles/context — ICT session levels computed server-side
router.get('/context', async (req, res) => {
  try {
    const candles = await Candle.find().sort({ time: -1 }).limit(150);
    const data    = candles.reverse().map((c) => c.toObject());
    const context = computeSessionLevels(data);
    res.json(context);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
