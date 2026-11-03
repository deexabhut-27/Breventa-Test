import { useEffect, useRef } from 'react';
import { beaconUrl } from '../lib/api.js';

// Focus must be gone this long before it counts as leaving (filters out sub-second OS focus flickers).
const FOCUS_GRACE_MS = 1000;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * Browser-side monitoring. Browser signals are best-effort: the server's heartbeat
 * monitor and timer are the authority when the browser is closed or loses power.
 *
 *  - Leaving the examination window terminates the attempt immediately on the server:
 *      • page hidden (tab switch, minimise, screen lock): reported at once via sendBeacon;
 *      • window loses focus while still visible (switching to another browser or app, Alt/Cmd+Tab):
 *        reported once focus has been gone for FOCUS_GRACE_MS, so a momentary OS flicker is ignored.
 *    Moving the mouse outside the window without clicking elsewhere does not move focus and is ignored.
 *  - Refresh / close: beforeunload shows a warning; pagehide sends an "unload" beacon that is
 *    logged but not counted (the heartbeat monitor covers closed browsers).
 *    If an unload is cancelled and the page stays hidden, it is reported as a violation.
 *  - Back button is trapped; paste/context menu are blocked and logged.
 *  - Copy/cut is blocked and reported: the server warns once, then terminates on the next copy.
 *  - Screenshot shortcuts (PrintScreen, Cmd+Shift, Win+Shift) and printing are reported and the
 *    server terminates the attempt immediately. Questions are hidden while the window is unfocused
 *    or an OS key is held, so captures taken by external tools come out blank. Detection only works for keys the OS
 *    passes to the browser; OS-level tools or a phone camera cannot be detected by a web page.
 */
export function useProctoring({ enabled, slug, token, sessionId, getPending, report, log, onBlockedNavigation, onShield }) {
  const handlers = useRef({ report, log, getPending, onBlockedNavigation, onShield });
  handlers.current = { report, log, getPending, onBlockedNavigation, onShield };

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
        clearTimeout(focusTimer);
        beacon({ kind: 'violation', type: 'TAB_SWITCH', eventId: hiddenEvent.id, reason: 'Examination page hidden (tab switch, minimise or another app)' });
      } else if (hiddenEvent) {
        const ev = hiddenEvent;
        hiddenEvent = null;
        // Confirms the beacon by XHR (same eventId, so the server counts it once) and returns the terminated status.
        handlers.current.report({ type: 'TAB_SWITCH', eventId: ev.id, clientAt: ev.at, returned: true, reason: 'Examination page hidden (tab switch, minimise or another app)' });
      } else if (hiddenDuringUnload) {
        hiddenDuringUnload = false;
        handlers.current.report({ type: 'WINDOW_HIDDEN', eventId: uid(), reason: 'Examination page hidden after a cancelled reload/close' });
      }
    };

    // Page still visible but focus moved to another window (another browser, app, Alt/Cmd+Tab).
    let focusTimer = null;
    let focusReported = false;
    const onBlur = () => {
      if (unloading || focusReported || document.visibilityState !== 'visible') return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        if (unloading || focusReported || document.hasFocus() || document.visibilityState !== 'visible') return;
        focusReported = true;
        const id = uid();
        const reason = 'Switched to another window, browser or application';
        beacon({ kind: 'violation', type: 'WINDOW_HIDDEN', eventId: id, reason });
        handlers.current.report({ type: 'WINDOW_HIDDEN', eventId: id, clientAt: new Date().toISOString(), reason });
      }, FOCUS_GRACE_MS);
    };
    const onFocusBack = () => clearTimeout(focusTimer);
    const block = (type, reason) => (e) => {
      e.preventDefault();
      throttledLog(type, reason, 10000);
    };
    const onPaste = block('PASTE_ATTEMPT', 'Paste blocked');
    const onContext = block('CONTEXT_MENU', 'Context menu blocked');

    // One gesture can fire several events (keydown + copy, keydown + keyup); report it once.
    const lastReported = {};
    const reportOnce = (type, reason) => {
      if (Date.now() - (lastReported[type] || 0) < 2000) return;
      lastReported[type] = Date.now();
      handlers.current.report({ type, eventId: uid(), clientAt: new Date().toISOString(), reason });
    };
    const onCopy = (e) => {
      e.preventDefault();
      e.clipboardData?.setData('text/plain', '');
      reportOnce('COPY_ATTEMPT', `Question content ${e.type === 'cut' ? 'cut' : 'copied'}`);
    };
    const wipeClipboard = () => {
      navigator.clipboard?.writeText?.('').catch(() => {});
    };
    const screenshot = (reason) => {
      wipeClipboard();
      reportOnce('SCREENSHOT_ATTEMPT', reason);
    };
    // Privacy shield: questions are hidden whenever the window loses focus (snipping tools,
    // screen-capture apps, Alt+Tab, Start menu) or an OS key (Win / Cmd) is held, so a capture
    // taken at that moment shows a blank screen.
    let osKeyDown = false;
    let blurred = !document.hasFocus();
    const updateShield = () => handlers.current.onShield?.(osKeyDown || blurred || document.visibilityState === 'hidden');
    const isOsKey = (key) => key === 'Meta' || key === 'OS' || key === 'Super' || key === 'Win';

    const onKey = (e) => {
      const key = e.key || '';
      const code = e.code || '';
      const down = e.type === 'keydown';

      // Windows: PrintScreen / Alt+PrintScreen / Win+PrintScreen (usually only keyup reaches the page).
      if (key === 'PrintScreen' || code === 'PrintScreen' || key === 'Snapshot') {
        e.preventDefault();
        osKeyDown = true;
        updateShield();
        screenshot('PrintScreen key pressed');
        return;
      }
      if (isOsKey(key)) {
        osKeyDown = down;
        updateShield();
      }
      if (!down) return;

      // Win+Shift (Snipping Tool, Win+Shift+S) and Cmd+Shift (macOS Cmd+Shift+3/4/5/6):
      // the OS swallows the final key, so the modifier combination itself is the signal.
      if (e.metaKey && e.shiftKey) {
        e.preventDefault();
        screenshot(`Screenshot shortcut (${navigator.platform?.startsWith('Mac') ? 'Cmd' : 'Win'}+Shift) pressed`);
        return;
      }
      const lower = key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && lower === 'p') {
        e.preventDefault();
        screenshot('Print shortcut pressed');
        return;
      }
      // Copy shortcuts are reported here too: some browsers fire no copy event when nothing is selected.
      if ((mod && !e.shiftKey && (lower === 'c' || lower === 'x')) || (e.ctrlKey && key === 'Insert') || (e.shiftKey && key === 'Delete')) {
        e.preventDefault();
        reportOnce('COPY_ATTEMPT', 'Copy shortcut pressed on question content');
        return;
      }
      // Select-all, save page, view source, developer tools: blocked silently.
      if (mod && !e.shiftKey && ['a', 's', 'u'].includes(lower)) e.preventDefault();
      if (key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(lower)) || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(lower))) e.preventDefault();
    };
    const onWindowBlur = () => {
      blurred = true;
      updateShield();
    };
    const onWindowFocus = () => {
      blurred = false;
      osKeyDown = false; // keyup is lost when focus moved away while the key was held
      updateShield();
    };
    const onBeforePrint = () => screenshot('Print dialog opened');
    const onSelectStart = (e) => e.preventDefault();

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
    window.addEventListener('focus', onFocusBack);
    window.addEventListener('popstate', onPopState);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('dragstart', onSelectStart);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', updateShield);
    updateShield();
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', updateShield);
      handlers.current.onShield?.(false);
      clearTimeout(unloadTimer);
      clearTimeout(focusTimer);
      window.removeEventListener('focus', onFocusBack);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('dragstart', onSelectStart);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('beforeprint', onBeforePrint);
    };
  }, [enabled, slug, token, sessionId]);
}

export { uid };
