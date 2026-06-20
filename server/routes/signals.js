const express  = require('express');
const router   = express.Router();
const Signal   = require('../models/Signal');
const { computeSessionLevels } = require('../controllers/ictEngine');

// GET /api/signals — paginated signal history
router.get('/', async (req, res) => {
  try {
    const page     = parseInt(req.query.page)  || 1;
    const limit    = parseInt(req.query.limit) || 20;
    const skip     = (page - 1) * limit;
    const direction = req.query.direction; // optional filter
    const outcome   = req.query.outcome;   // optional filter

    const filter = {};
    if (direction) filter.direction = direction.toUpperCase();
    if (outcome)   filter.outcome   = outcome.toUpperCase();

    const [signals, total] = await Promise.all([
      Signal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Signal.countDocuments(filter),
    ]);

    const wins   = await Signal.countDocuments({ ...filter, outcome: 'WIN' });
    const losses = await Signal.countDocuments({ ...filter, outcome: 'LOSS' });
    const pending = await Signal.countDocuments({ ...filter, outcome: 'PENDING' });
    const pipsArr = await Signal.find({ ...filter, outcome: { $in: ['WIN', 'LOSS'] } }).select('pips');
    const netPips = pipsArr.reduce((sum, s) => sum + (s.pips || 0), 0);

    res.json({
      signals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        total,
        wins,
        losses,
        pending,
        winRate: total > 0 ? ((wins / (wins + losses || 1)) * 100).toFixed(1) : '0.0',
        netPips: netPips.toFixed(1),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signals/:id
router.get('/:id', async (req, res) => {
  try {
    const signal = await Signal.findById(req.params.id);
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/signals/:id — update outcome (WIN/LOSS) and pips
router.patch('/:id', async (req, res) => {
  try {
    const { outcome, pips, notes } = req.body;
    const update = {};
    if (outcome) update.outcome  = outcome.toUpperCase();
    if (pips    !== undefined) update.pips = pips;
    if (notes)  update.notes    = notes;
    if (outcome && outcome !== 'PENDING') update.closedAt = new Date();

    const signal = await Signal.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/signals/:id
router.delete('/:id', async (req, res) => {
  try {
    await Signal.findByIdAndDelete(req.params.id);
    res.json({ message: 'Signal deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signals/stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    const pipeline = [
      {
        $group: {
          _id:      '$direction',
          count:    { $sum: 1 },
          wins:     { $sum: { $cond: [{ $eq: ['$outcome', 'WIN']  }, 1, 0] } },
          losses:   { $sum: { $cond: [{ $eq: ['$outcome', 'LOSS'] }, 1, 0] } },
          netPips:  { $sum: { $ifNull: ['$pips', 0] } },
          avgRR:    { $avg: '$rr' },
        },
      },
    ];
    const result = await Signal.aggregate(pipeline);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
