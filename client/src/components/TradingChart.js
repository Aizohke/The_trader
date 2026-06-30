import React, { useEffect, useRef } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useWs } from '../context/WsContext';

export default function TradingChart({ signals }) {
  const { candles, liveBar } = useWs();
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);
  const lineRefs     = useRef([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0a0c0f' }, textColor: '#8b95a8', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
      grid:   { vertLines: { color: '#161b24' }, horzLines: { color: '#161b24' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#232a38' },
      timeScale:       { borderColor: '#232a38', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale:  true,
    });
    chartRef.current = chart;

    const series = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current)
        chart.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  // Load historical candles
  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    const seen    = new Set();
    const deduped = candles
      .filter((c) => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
    seriesRef.current.setData(deduped);
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // Update live forming bar
  useEffect(() => {
    if (!seriesRef.current || !liveBar) return;
    try { seriesRef.current.update(liveBar); } catch (_) {}
  }, [liveBar]);

  // Draw signal annotations
  useEffect(() => {
    if (!seriesRef.current || !signals?.length) return;
    const sig = signals[0];
    lineRefs.current.forEach((l) => { try { seriesRef.current.removePriceLine(l); } catch (_) {} });
    lineRefs.current = [];

    const mkLine = (price, color, title, dashed = false) => {
      if (!price) return;
      const line = seriesRef.current.createPriceLine({
        price: parseFloat(price), color, lineWidth: 1,
        lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true, title,
      });
      lineRefs.current.push(line);
    };

    const isBull = sig.direction === 'BUY';
    mkLine(sig.entry,     '#3b82f6',                       '● ENTRY', false);
    mkLine(sig.sl,        '#ef4444',                       '✕ SL',    true);
    mkLine(sig.tp,        '#10b981',                       '✓ TP',    true);
    mkLine(sig.fvgTop,    isBull ? '#f59e0b' : '#8b5cf6', 'FVG ↑',   true);
    mkLine(sig.fvgBottom, isBull ? '#f59e0b' : '#8b5cf6', 'FVG ↓',   true);
  }, [signals]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
