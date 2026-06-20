// ── Price Generator ───────────────────────────────────────────────────────────
function generateCandle(prevClose, timeMs) {
  const volatility = 0.0008;
  const drift = (Math.random() - 0.49) * 0.0002;
  const open = prevClose + drift;
  const range = Math.abs(open) * volatility * (0.5 + Math.random() * 1.5);
  const isBull = Math.random() > 0.48;
  const close = isBull ? open + range * Math.random() : open - range * Math.random();
  const high = Math.max(open, close) + range * Math.random() * 0.4;
  const low  = Math.min(open, close) - range * Math.random() * 0.4;
  return {
    time:   Math.floor(timeMs / 1000),
    open:   parseFloat(open.toFixed(5)),
    high:   parseFloat(high.toFixed(5)),
    low:    parseFloat(low.toFixed(5)),
    close:  parseFloat(close.toFixed(5)),
    volume: Math.floor(200 + Math.random() * 800),
  };
}

// ── Step 1: Liquidity Sweep ───────────────────────────────────────────────────
// Price hunts the previous 20-candle swing high/low then reverses inside the range.
function detectLiquiditySweep(candles) {
  if (candles.length < 22) return null;
  const lookback = candles.slice(-22, -2);
  const c1       = candles[candles.length - 2]; // previous closed candle
  const c0       = candles[candles.length - 1]; // latest candle

  const prevHigh = Math.max(...lookback.map((c) => c.high));
  const prevLow  = Math.min(...lookback.map((c) => c.low));

  // Bearish sweep: wick above previous high, body closes back inside
  if (c1.high > prevHigh && c1.close < prevHigh) {
    return { type: 'bearish', level: prevHigh, desc: `Swept swing high @ ${prevHigh.toFixed(5)}` };
  }
  // Bullish sweep: wick below previous low, body closes back inside
  if (c1.low < prevLow && c1.close > prevLow) {
    return { type: 'bullish', level: prevLow, desc: `Swept swing low @ ${prevLow.toFixed(5)}` };
  }
  return null;
}

// ── Step 2: Market Structure Shift (MSS) ─────────────────────────────────────
// After the sweep, a candle must close beyond a fractal swing point — confirming
// that smart money has shifted the structure.
function detectMSS(candles, sweepType) {
  if (candles.length < 6) return null;
  const window = candles.slice(-6, -1);
  const last   = candles[candles.length - 1];

  if (sweepType === 'bearish') {
    // Need a candle to close below the most recent fractal low
    const fractalLow = Math.min(...window.map((c) => c.low));
    if (last.close < fractalLow) {
      return { type: 'bearish', level: fractalLow, desc: `Bearish MSS — broke fractal low @ ${fractalLow.toFixed(5)}` };
    }
  } else {
    // Need a candle to close above the most recent fractal high
    const fractalHigh = Math.max(...window.map((c) => c.high));
    if (last.close > fractalHigh) {
      return { type: 'bullish', level: fractalHigh, desc: `Bullish MSS — broke fractal high @ ${fractalHigh.toFixed(5)}` };
    }
  }
  return null;
}

// ── Step 3: Fair Value Gap (FVG) ─────────────────────────────────────────────
// A 3-candle imbalance: gap between candle[i-2].high and candle[i].low (bullish)
// or between candle[i-2].low and candle[i].high (bearish).
function detectFVG(candles, direction) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1]; // the aggressive impulse candle
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
  return fvgs; // returns all found FVGs, most recent last
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

  // ── Step 1 ────────────────────────────────────────────────
  const sweep = detectLiquiditySweep(candles);
  if (!sweep) return null;

  // ── Step 2 ────────────────────────────────────────────────
  const mss = detectMSS(candles, sweep.type);
  if (!mss) return null;

  // ── Step 3 ────────────────────────────────────────────────
  const direction = sweep.type; // 'bullish' or 'bearish'
  const fvgs = detectFVG(candles, direction);
  if (!fvgs.length) return null;
  const fvg = fvgs[fvgs.length - 1]; // most recent FVG

  // ── Build trade parameters ────────────────────────────────
  const isBull  = direction === 'bullish';
  const entry   = isBull ? fvg.top    : fvg.bottom;   // enter at FVG edge
  const sl      = isBull
    ? parseFloat((fvg.bottom - 0.00100).toFixed(5))   // below FVG + buffer
    : parseFloat((fvg.top    + 0.00100).toFixed(5));  // above FVG + buffer
  const risk    = Math.abs(entry - sl);
  const tp      = isBull
    ? parseFloat((entry + risk * 2.5).toFixed(5))
    : parseFloat((entry - risk * 2.5).toFixed(5));
  const rr      = parseFloat((Math.abs(tp - entry) / risk).toFixed(1));
  const pipSize = 0.0001;
  const slPips  = parseFloat((risk / pipSize).toFixed(1));
  const tpPips  = parseFloat((Math.abs(tp - entry) / pipSize).toFixed(1));

  return {
    direction:  isBull ? 'BUY' : 'SELL',
    pair:       'EUR/USD',
    entry:      parseFloat(entry.toFixed(5)),
    sl:         sl,
    tp:         tp,
    rr,
    slPips,
    tpPips,
    fvgTop:     fvg.top,
    fvgBottom:  fvg.bottom,
    fvgMid:     fvg.mid,
    session:    getActiveSession(),
    conditions: {
      sweep:  sweep.desc,
      mss:    mss.desc,
      fvg:    `${isBull ? 'Bullish' : 'Bearish'} FVG @ ${fvg.bottom.toFixed(5)}–${fvg.top.toFixed(5)}`,
    },
    createdAt: new Date(),
  };
}

// ── Utility exports ───────────────────────────────────────────────────────────
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

module.exports = { runICTEngine, generateCandle, detectFVG, detectLiquiditySweep, detectMSS, computeSessionLevels };
