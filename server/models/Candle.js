const mongoose = require('mongoose');

const candleSchema = new mongoose.Schema(
  {
    time:   { type: Number, required: true, unique: true }, // unix seconds
    open:   { type: Number, required: true },
    high:   { type: Number, required: true },
    low:    { type: Number, required: true },
    close:  { type: Number, required: true },
    volume: { type: Number, default: 0 },
  },
  { timestamps: false }
);

candleSchema.index({ time: -1 });

module.exports = mongoose.model('Candle', candleSchema);
