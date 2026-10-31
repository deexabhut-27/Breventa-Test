import { useEffect, useRef } from 'react';
import { beaconUrl } from '../lib/api.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Browser-side monitoring. Browser signals are best-effort: the server's heartbeat
 * monitor and timer are the authority when the browser is closed or loses power.
 *
 *  - Hidden page (tab switch, minimise, app switch): reported immediately via sendBeacon,
 *    then confirmed by XHR when the page is visible again (same eventId, deduplicated server-side).
 *  - Refresh / close: beforeunload shows a warning; pagehide sends an "unload" beacon that is
 *    logged but not counted (the heartbeat monitor covers closed browsers).
 *    If an unload is cancelled and the page stays hidden, it is reported as a violation.
 *  - Back button is trapped; copy/paste/context menu are blocked and logged.
 */
export function useProctoring({ enabled, slug, token, sessionId, getPending, report, log, onBlockedNavigation }) {
  const handlers = useRef({ report, log, getPending, onBlockedNavigation });
  handlers.current = { report, log, getPending, onBlockedNavigation };

  useEffect(() => {
    if (!enabled) return undefined;
    let unloading = false;
    let unloadTimer = null;
    let hiddenEvent = null;
    let hiddenDuringUnload = false;
    const lastLogged = {};

    const beacon = (payload) => {
      try {
        const body = JSON.stringify({ token, sessionId, pendingResponses: handlers.current.getPending(), ...payload });
        navigator.sendBeacon?.(beaconUrl, new Blob([body], { type: 'text/plain' }));
      } catch {
        /* best effort */
      }
    };
    const throttledLog = (type, reason, every = 30000) => {
      if (Date.now() - (lastLogged[type] || 0) < every) return;
      lastLogged[type] = Date.now();
      handlers.current.log(type, reason);
    };

    const onBeforeUnload = (e) => {
      unloading = true;
      clearTimeout(unloadTimer);
      // If the user cancels the dialog the page lives on; stop treating hides as unloads.
      unloadTimer = setTimeout(() => {
        unloading = false;
      }, 1500);
      e.preventDefault();
      e.returnValue = '';
    };
    const onPageHide = () => beacon({ kind: 'unload', eventId: uid(), reason: 'Page closed, reloaded or navigated away' });

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (unloading) {
          hiddenDuringUnload = true;
          return;
        }
        if (hiddenEvent) return;
        hiddenEvent = { id: uid(), at: new Date().toISOString() };
        beacon({ kind: 'violation', type: 'TAB_SWITCH', eventId: hiddenEvent.id, reason: 'Examination page hidden (tab switch, minimise or another app)' });
      } else if (hiddenEvent) {
        const ev = hiddenEvent;
        hiddenEvent = null;
        handlers.current.report({ type: 'TAB_SWITCH', eventId: ev.id, clientAt: ev.at, reason: 'Examination page hidden (tab switch, minimise or another app)' });
      } else if (hiddenDuringUnload) {
        hiddenDuringUnload = false;
        handlers.current.report({ type: 'WINDOW_HIDDEN', eventId: uid(), reason: 'Examination page hidden after a cancelled reload/close' });
      }
    };

    const onBlur = () => {
      if (document.visibilityState === 'visible') throttledLog('WINDOW_BLUR', 'Examination window lost focus');
    };
    const block = (type, reason) => (e) => {
      e.preventDefault();
      throttledLog(type, reason, 10000);
    };
    const onCopy = block('COPY_ATTEMPT', 'Copy, cut or paste blocked');
    const onContext = block('CONTEXT_MENU', 'Context menu blocked');

    window.history.pushState({ exam: true }, '', window.location.href);
    const onPopState = () => {
      window.history.pushState({ exam: true }, '', window.location.href);
      throttledLog('NAVIGATION_BLOCKED', 'Back navigation blocked during the examination', 5000);
      handlers.current.onBlockedNavigation?.();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onCopy);
    document.addEventListener('contextmenu', onContext);
    return () => {
      clearTimeout(unloadTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onCopy);
      document.removeEventListener('contextmenu', onContext);
    };
  }, [enabled, slug, token, sessionId]);
}

export { uid };
