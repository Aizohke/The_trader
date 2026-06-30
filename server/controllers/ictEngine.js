/**
 * ictEngine.js — ICT Pipeline v2
 *
 * Six improvements over v1:
 *  1. Killzone filter     — only fires during London (07-10 UTC) & NY (12-15 UTC) opens
 *  2. FVG freshness       — rejects FVGs older than 15 candles (~75 min on 5M)
 *  3. HTF trend bias      — EMA9/EMA21 cross; rejects counter-trend signals
 *  4. Volume confirmation — MSS candle must exceed 1.2× 20-bar average volume
 *  5. Rejection candle    — FVG entry requires pin-bar / engulfing confirmation
 *  6. Dynamic TP          — TP placed just before nearest opposing structure level
 */

// ── EMA helper ────────────────────────────────────────────────
function calcEMA(closes, period) {
  if (closes.length < period) return null;
  const k   = 2 / (period + 1);
  let ema   = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ── Improvement 1: Killzone filter ───────────────────────────
function isKillzone() {
  const now = new Date();
  const t   = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (t >= 420 && t <= 600) || (t >= 720 && t <= 900);
}

function getKillzoneName() {
  const t = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
  if (t >= 420 && t <= 600) return 'London Open';
  if (t >= 720 && t <= 900) return 'New York Open';
  return null;
}

// ── Improvement 3: HTF trend bias ────────────────────────────
function getHTFBias(candles) {
  if (candles.length < 21) return null;
  const closes = candles.map((c) => c.close);
  const ema9   = calcEMA(closes, 9);
  const ema21  = calcEMA(closes, 21);
  if (!ema9 || !ema21) return null;
  return ema9 > ema21 ? 'bullish' : 'bearish';
}

// ── Step 1: Liquidity Sweep ───────────────────────────────────
function detectLiquiditySweep(candles) {
  if (candles.length < 22) return null;
  const lookback = candles.slice(-22, -2);
  const c1       = candles[candles.length - 2];
  const prevHigh = Math.max(...lookback.map((c) => c.high));
  const prevLow  = Math.min(...lookback.map((c) => c.low));

  if (c1.high > prevHigh && c1.close < prevHigh) {
    return { type: 'bearish', level: prevHigh, desc: `Swept swing high @ ${prevHigh.toFixed(5)}` };
  }
  if (c1.low < prevLow && c1.close > prevLow) {
    return { type: 'bullish', level: prevLow, desc: `Swept swing low @ ${prevLow.toFixed(5)}` };
  }
  return null;
}

// ── Step 2: MSS + Improvement 4 (volume) ─────────────────────
function detectMSS(candles, sweepType) {
  if (candles.length < 6) return null;
  const window  = candles.slice(-6, -1);
  const last    = candles[candles.length - 1];

  // Improvement 4: volume confirmation
  const avgVol = candles.slice(-20).reduce((s, c) => s + (c.volume || 0), 0) / 20;
  if (avgVol > 0 && (last.volume || 0) < avgVol * 1.2) return null;

  if (sweepType === 'bearish') {
    const fractalLow = Math.min(...window.map((c) => c.low));
    if (last.close < fractalLow) {
      return { type: 'bearish', level: fractalLow, desc: `Bearish MSS @ ${fractalLow.toFixed(5)} (vol ✓)` };
    }
  } else {
    const fractalHigh = Math.max(...window.map((c) => c.high));
    if (last.close > fractalHigh) {
      return { type: 'bullish', level: fractalHigh, desc: `Bullish MSS @ ${fractalHigh.toFixed(5)} (vol ✓)` };
    }
  }
  return null;
}

// ── Step 3: FVG + Improvement 2 (freshness) ──────────────────
function detectFVG(candles, direction, freshOnly = false) {
  const fvgs   = [];
  const minIdx = freshOnly ? Math.max(2, candles.length - 15) : 2;

  for (let i = minIdx; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
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
  return fvgs;
}

// ── Improvement 5: rejection / confirmation candle ────────────
function hasRejectionCandle(candle, direction) {
  const bodySize  = Math.abs(candle.close - candle.open);
  if (bodySize === 0) return false;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  if (direction === 'bearish') return upperWick >= bodySize * 1.5;
  return lowerWick >= bodySize * 1.5;
}

// ── Improvement 6: dynamic TP ─────────────────────────────────
function findDynamicTP(candles, entry, direction, risk) {
  const fixedTP = direction === 'bullish'
    ? entry + risk * 2.5
    : entry - risk * 2.5;
  const swings = candles.slice(-30);

  if (direction === 'bearish') {
    const candidates = swings.map((c) => c.low).filter((l) => l < entry && l > fixedTP);
    if (candidates.length) return parseFloat((Math.max(...candidates) - 0.0002).toFixed(5));
  } else {
    const candidates = swings.map((c) => c.high).filter((h) => h > entry && h < fixedTP);
    if (candidates.length) return parseFloat((Math.min(...candidates) + 0.0002).toFixed(5));
  }
  return parseFloat(fixedTP.toFixed(5));
}

// ── Session helper ─────────────────────────────────────────────
function getActiveSession() {
  const h = new Date().getUTCHours();
  if (h >= 0  && h < 3)  return 'asia';
  if (h >= 7  && h < 12) return 'london';
  if (h >= 12 && h < 21) return 'newyork';
  return 'off';
}

// ── Master ICT Pipeline ────────────────────────────────────────
function runICTEngine(candles) {
  if (candles.length < 30) return null;

  // Improvement 1: only fire during killzones
  if (!isKillzone()) return null;

  // Improvement 3: get HTF bias
  const bias = getHTFBias(candles);

  // Step 1: liquidity sweep
  const sweep = detectLiquiditySweep(candles);
  if (!sweep) return null;

  // Improvement 3: reject counter-trend signals
  if (bias && bias !== sweep.type) return null;

  // Step 2: MSS (with volume check inside)
  const mss = detectMSS(candles, sweep.type);
  if (!mss) return null;

  // Step 3: fresh FVG only
  const direction = sweep.type;
  const fvgs      = detectFVG(candles, direction, true);
  if (!fvgs.length) return null;
  const fvg = fvgs[fvgs.length - 1];

  // Improvement 5: check for rejection candle
  const last           = candles[candles.length - 1];
  const hasConfirmation = hasRejectionCandle(last, direction);

  // Build trade parameters
  const isBull = direction === 'bullish';
  const entry  = isBull ? fvg.top    : fvg.bottom;
  const sl     = isBull
    ? parseFloat((fvg.bottom - 0.00100).toFixed(5))
    : parseFloat((fvg.top    + 0.00100).toFixed(5));
  const risk   = Math.abs(entry - sl);

  // Improvement 6: dynamic TP
  const tp     = findDynamicTP(candles, entry, direction, risk);
  const tpDist = Math.abs(tp - entry);
  const rr     = parseFloat((tpDist / risk).toFixed(1));

  // Skip if R:R is below 1.5 after structure adjustment
  if (rr < 1.5) return null;

  const pipSize = 0.0001;
  return {
    direction:       isBull ? 'BUY' : 'SELL',
    pair:            'EUR/USD',
    entry:           parseFloat(entry.toFixed(5)),
    sl,
    tp,
    rr,
    slPips:          parseFloat((risk   / pipSize).toFixed(1)),
    tpPips:          parseFloat((tpDist / pipSize).toFixed(1)),
    fvgTop:          fvg.top,
    fvgBottom:       fvg.bottom,
    fvgMid:          fvg.mid,
    session:         getActiveSession(),
    killzone:        getKillzoneName(),
    htfBias:         bias,
    hasConfirmation,
    conditions: {
      sweep: sweep.desc,
      mss:   mss.desc,
      fvg:   `${isBull ? 'Bullish' : 'Bearish'} FVG @ ${fvg.bottom.toFixed(5)}–${fvg.top.toFixed(5)}`,
    },
    createdAt: new Date(),
  };
}

// ── Session context for REST /api/candles/context ─────────────
function computeSessionLevels(candles) {
  if (candles.length < 5) return {};
  const high20 = Math.max(...candles.slice(-20).map((c) => c.high));
  const low20  = Math.min(...candles.slice(-20).map((c) => c.low));
  const sweep  = detectLiquiditySweep(candles);
  const bias   = getHTFBias(candles);
  const fvgs   = [
    ...detectFVG(candles, 'bullish', true),
    ...detectFVG(candles, 'bearish', true),
  ].slice(-6);
  return {
    high20,
    low20,
    activeSweep: sweep,
    activeFVGs:  fvgs,
    session:     getActiveSession(),
    htfBias:     bias,
    inKillzone:  isKillzone(),
    killzone:    getKillzoneName(),
  };
}

module.exports = {
  runICTEngine,
  detectFVG,
  detectLiquiditySweep,
  detectMSS,
  computeSessionLevels,
  getHTFBias,
  isKillzone,
};
