const express = require('express');
const router  = express.Router();
const Signal  = require('../models/Signal');

// Injected by index.js so routes can broadcast WS events
let _broadcast = () => {};
router.setBroadcast = (fn) => { _broadcast = fn; };

// ── GET /api/signals — paginated + filtered ─────────────────
router.get('/', async (req, res) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page)  || 1);
    const limit     = Math.min(50, parseInt(req.query.limit) || 20);
    const skip      = (page - 1) * limit;
    const filter    = {};
    if (req.query.direction) filter.direction = req.query.direction.toUpperCase();
    if (req.query.outcome)   filter.outcome   = req.query.outcome.toUpperCase();
    if (req.query.session)   filter.session   = req.query.session.toLowerCase();

    const [signals, total, wins, losses, pending, pipsArr] = await Promise.all([
      Signal.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Signal.countDocuments(filter),
      Signal.countDocuments({ ...filter, outcome: 'WIN' }),
      Signal.countDocuments({ ...filter, outcome: 'LOSS' }),
      Signal.countDocuments({ ...filter, outcome: 'PENDING' }),
      Signal.find({ ...filter, outcome: { $in: ['WIN', 'LOSS'] } }).select('pips'),
    ]);

    const netPips = pipsArr.reduce((s, x) => s + (x.pips || 0), 0);
    const closed  = wins + losses;

    res.json({
      signals,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        total, wins, losses, pending,
        winRate: closed > 0 ? ((wins / closed) * 100).toFixed(1) : '0.0',
        netPips: netPips.toFixed(1),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/signals/stats/summary ─────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const result = await Signal.aggregate([
      {
        $group: {
          _id:     '$direction',
          count:   { $sum: 1 },
          wins:    { $sum: { $cond: [{ $eq: ['$outcome', 'WIN']  }, 1, 0] } },
          losses:  { $sum: { $cond: [{ $eq: ['$outcome', 'LOSS'] }, 1, 0] } },
          netPips: { $sum: { $ifNull: ['$pips', 0] } },
          avgRR:   { $avg: '$rr' },
        },
      },
    ]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/signals/:id ────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const signal = await Signal.findById(req.params.id);
    if (!signal) return res.status(404).json({ error: 'Signal not found' });
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/signals/:id — update outcome / pips / notes ─
router.patch('/:id', async (req, res) => {
  try {
    const { outcome, pips, notes } = req.body;
    const update = {};
    if (outcome !== undefined) update.outcome  = outcome.toUpperCase();
    if (pips    !== undefined) update.pips     = parseFloat(pips);
    if (notes   !== undefined) update.notes    = notes;
    if (outcome && outcome !== 'PENDING') update.closedAt = new Date();

    const signal = await Signal.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!signal) return res.status(404).json({ error: 'Signal not found' });

    // Broadcast update to all WS clients
    _broadcast('SIGNAL_UPDATED', signal.toObject());
    res.json(signal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/signals/:id ─────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const signal = await Signal.findByIdAndDelete(req.params.id);
    if (!signal) return res.status(404).json({ error: 'Signal not found' });

    // Broadcast deletion to all WS clients so UI updates in real-time
    _broadcast('SIGNAL_DELETED', { _id: req.params.id });
    res.json({ message: 'Signal deleted', _id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/signals — delete all signals ────────────────
router.delete('/', async (req, res) => {
  try {
    const result = await Signal.deleteMany({});
    _broadcast('SIGNALS_CLEARED', {});
    res.json({ message: `Deleted ${result.deletedCount} signals` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
