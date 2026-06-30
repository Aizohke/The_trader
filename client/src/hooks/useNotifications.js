/**
 * useNotifications.js
 *
 * Manages browser Push Notification permission and firing.
 * Uses the Notifications API — works on desktop Chrome/Firefox/Edge.
 * On mobile, works on Android Chrome when the site is added to home screen (PWA).
 *
 * NOTE: Notifications API shows alerts on top of other apps when the
 * browser is in the background — exactly the behaviour requested.
 */

import { useState, useEffect, useCallback } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied';
    if (Notification.permission === 'granted') {
      setPermission('granted');
      return 'granted';
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const notify = useCallback((signal) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const isBull = signal.direction === 'BUY';
    const icon   = isBull ? '🟢' : '🔴';
    const title  = `${icon} ${signal.direction} Signal — EUR/USD`;
    const body   = [
      `Entry: ${signal.entry}`,
      `SL: ${signal.sl} (${signal.slPips}p)  TP: ${signal.tp} (${signal.tpPips}p)`,
      `R:R 1:${signal.rr}  |  ${(signal.killzone || signal.session || '').toUpperCase()}`,
      signal.hasConfirmation ? '✓ Confirmation candle present' : '',
    ].filter(Boolean).join('\n');

    try {
      const n = new Notification(title, {
        body,
        icon:    '/favicon.ico',
        badge:   '/favicon.ico',
        tag:     `signal-${signal._id || Date.now()}`, // replace previous signal notification
        requireInteraction: false,                       // auto-dismiss after system default
        silent: false,
      });

      // Auto-close after 8 seconds as a fallback
      setTimeout(() => n.close(), 8000);

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.warn('[Notifications] Could not show notification:', e.message);
    }
  }, []);

  return { permission, requestPermission, notify };
}
