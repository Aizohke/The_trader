const mongoose = require('mongoose');

const conditionsSchema = new mongoose.Schema({
  sweep: String,
  mss:   String,
  fvg:   String,
}, { _id: false });

const signalSchema = new mongoose.Schema(
  {
    direction:  { type: String, enum: ['BUY', 'SELL'], required: true },
    pair:       { type: String, default: 'EUR/USD' },
    entry:      { type: Number, required: true },
    sl:         { type: Number, required: true },
    tp:         { type: Number, required: true },
    rr:         { type: Number },
    slPips:     { type: Number },
    tpPips:     { type: Number },
    fvgTop:     { type: Number },
    fvgBottom:  { type: Number },
    fvgMid:     { type: Number },
    session:    { type: String, enum: ['asia', 'london', 'newyork', 'off'] },
    conditions: conditionsSchema,
    outcome:    { type: String, enum: ['WIN', 'LOSS', 'PENDING'], default: 'PENDING' },
    closedAt:   { type: Date },
    pips:       { type: Number },
    notes:      { type: String },
  },
  { timestamps: true }
);

// Index for fast recent-signal queries
signalSchema.index({ createdAt: -1 });
signalSchema.index({ direction: 1, createdAt: -1 });
signalSchema.index({ outcome: 1 });

module.exports = mongoose.model('Signal', signalSchema);
