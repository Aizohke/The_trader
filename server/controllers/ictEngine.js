/**
 * ictEngine.js
 *
 * Pure ICT analysis functions — no price generation.
 * All functions operate on arrays of OHLCV candle objects:
 *   { time, open, high, low, close, volume }
 */

// ── Step 1: Liquidity Sweep ───────────────────────────────────────────────────
// Price hunts the previous 20-candle swing high/low then reverses inside range.
function detectLiquiditySweep(candles) {
  if (candles.length < 22) return null;
  const lookback = candles.slice(-22, -2);
  const c1       = candles[candles.length - 2]; // previous closed candle
  // const c0    = candles[candles.length - 1]; // latest (live) candle

  const prevHigh = Math.max(...lookback.map((c) => c.high));
  const prevLow  = Math.min(...lookback.map((c) => c.low));

  // Bearish sweep: wick above previous high, body closes back inside
  if (c1.high > prevHigh && c1.close < prevHigh) {
    return {
      type:  'bearish',
      level: prevHigh,
      desc:  `Swept swing high @ ${prevHigh.toFixed(5)}`,
    };
  }
  // Bullish sweep: wick below previous low, body closes back inside
  if (c1.low < prevLow && c1.close > prevLow) {
    return {
      type:  'bullish',
      level: prevLow,
      desc:  `Swept swing low @ ${prevLow.toFixed(5)}`,
    };
  }
  return null;
}

// ── Step 2: Market Structure Shift (MSS) ─────────────────────────────────────
// After the sweep, a candle must close beyond a fractal swing point.
function detectMSS(candles, sweepType) {
  if (candles.length < 6) return null;
  const window = candles.slice(-6, -1);
  const last   = candles[candles.length - 1];

  if (sweepType === 'bearish') {
    const fractalLow = Math.min(...window.map((c) => c.low));
    if (last.close < fractalLow) {
      return {
        type:  'bearish',
        level: fractalLow,
        desc:  `Bearish MSS — broke fractal low @ ${fractalLow.toFixed(5)}`,
      };
    }
  } else {
    const fractalHigh = Math.max(...window.map((c) => c.high));
    if (last.close > fractalHigh) {
      return {
        type:  'bullish',
        level: fractalHigh,
        desc:  `Bullish MSS — broke fractal high @ ${fractalHigh.toFixed(5)}`,
      };
    }
  }
  return null;
}

// ── Step 3: Fair Value Gap (FVG) ─────────────────────────────────────────────
// 3-candle imbalance where price gap exists between candle[i-2] and candle[i].
function detectFVG(candles, direction) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1]; // aggressive impulse candle
    const c2 = candles[i];

    if (direction === 'bullish' && c2.low > c0.high && c1.close > c1.open) {
      fvgs.push({
        type:   'bullish',
        top:    parseFloat(c2.low.toFixed(5)),
        bottom: parseFloat(c0.high.toFixed(5)),
        mid:    parseFloat(((c2.low + c0.high) / 2).toFixed(5)),
        time:   c1.time,
        idx:    i,
      });
    }
    if (direction === 'bearish' && c2.high < c0.low && c1.close < c1.open) {
      fvgs.push({
        type:   'bearish',
        top:    parseFloat(c0.low.toFixed(5)),
        bottom: parseFloat(c2.high.toFixed(5)),
        mid:    parseFloat(((c0.low + c2.high) / 2).toFixed(5)),
        time:   c1.time,
        idx:    i,
      });
    }
  }
  return fvgs; // chronological; most recent last
}

// ── Session helper ────────────────────────────────────────────────────────────
function getActiveSession() {
  const h = new Date().getUTCHours();
  if (h >= 0  && h < 3)  return 'asia';
  if (h >= 7  && h < 12) return 'london';
  if (h >= 12 && h < 21) return 'newyork';
  return 'off';
}

// ── Master ICT Pipeline ───────────────────────────────────────────────────────
// All three steps must fire sequentially. Returns a full signal object or null.
function runICTEngine(candles) {
  if (candles.length < 30) return null;

  const sweep = detectLiquiditySweep(candles);
  if (!sweep) return null;

  const mss = detectMSS(candles, sweep.type);
  if (!mss) return null;

  const direction = sweep.type;
  const fvgs      = detectFVG(candles, direction);
  if (!fvgs.length) return null;
  const fvg = fvgs[fvgs.length - 1];

  const isBull = direction === 'bullish';
  const entry  = isBull ? fvg.top    : fvg.bottom;
  const sl     = isBull
    ? parseFloat((fvg.bottom - 0.00100).toFixed(5))
    : parseFloat((fvg.top    + 0.00100).toFixed(5));
  const risk   = Math.abs(entry - sl);
  const tp     = isBull
    ? parseFloat((entry + risk * 2.5).toFixed(5))
    : parseFloat((entry - risk * 2.5).toFixed(5));
  const rr     = parseFloat((Math.abs(tp - entry) / risk).toFixed(1));
  const pipSize = 0.0001;
  const slPips  = parseFloat((risk / pipSize).toFixed(1));
  const tpPips  = parseFloat((Math.abs(tp - entry) / pipSize).toFixed(1));

  return {
    direction:  isBull ? 'BUY' : 'SELL',
    pair:       'EUR/USD',
    entry:      parseFloat(entry.toFixed(5)),
    sl,
    tp,
    rr,
    slPips,
    tpPips,
    fvgTop:     fvg.top,
    fvgBottom:  fvg.bottom,
    fvgMid:     fvg.mid,
    session:    getActiveSession(),
    conditions: {
      sweep: sweep.desc,
      mss:   mss.desc,
      fvg:   `${isBull ? 'Bullish' : 'Bearish'} FVG @ ${fvg.bottom.toFixed(5)}–${fvg.top.toFixed(5)}`,
    },
    createdAt: new Date(),
  };
}

// ── Session context utility ───────────────────────────────────────────────────
function computeSessionLevels(candles) {
  if (candles.length < 5) return {};
  const high20 = Math.max(...candles.slice(-20).map((c) => c.high));
  const low20  = Math.min(...candles.slice(-20).map((c) => c.low));
  const sweep  = detectLiquiditySweep(candles);
  const fvgs   = [
    ...detectFVG(candles, 'bullish'),
    ...detectFVG(candles, 'bearish'),
  ].slice(-6);
  return { high20, low20, activeSweep: sweep, activeFVGs: fvgs, session: getActiveSession() };
}

module.exports = {
  runICTEngine,
  detectFVG,
  detectLiquiditySweep,
  detectMSS,
  computeSessionLevels,
};
