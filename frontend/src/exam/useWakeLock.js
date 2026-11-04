import { useEffect } from 'react';

/**
 * Keeps the screen (and the computer) awake for the whole exam, even when the
 * student is just reading and not touching the mouse or keyboard, and whatever
 * the OS sleep / screen-saver settings are. Without this the display could turn
 * off or lock mid-exam, which hides the page and would end the attempt.
 *
 * Uses the Screen Wake Lock API (Chrome, Edge, Safari 16.4+, Firefox 126+).
 * The browser releases the lock whenever the page is hidden, so it is
 * re-acquired on return and on every interaction. Older browsers fall back to
 * a tiny muted looping video, which also stops the display from sleeping.
 */
export function useWakeLock(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let lock = null;
    let video = null;
    let stopped = false;

    const startVideoFallback = () => {
      if (video) {
        video.play().catch(() => {});
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 2;
        const ctx = canvas.getContext('2d');
        let flip = false;
        const paint = () => {
          flip = !flip;
          ctx.fillStyle = flip ? '#000001' : '#000000';
          ctx.fillRect(0, 0, 2, 2);
        };
        paint();
        const timer = setInterval(paint, 1000);
        const stream = canvas.captureStream?.(1);
        if (!stream) return clearInterval(timer);
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('aria-hidden', 'true');
        video.loop = true;
        video.srcObject = stream;
        video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0.01;pointer-events:none;bottom:0;right:0;';
        video._timer = timer;
        document.body.appendChild(video);
        video.play().catch(() => {});
      } catch {
        /* nothing more we can do on this browser */
      }
    };

    const acquire = async () => {
      if (stopped || document.visibilityState !== 'visible') return;
      if (!('wakeLock' in navigator)) {
        startVideoFallback();
        return;
      }
      if (lock && !lock.released) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (stopped) lock.release().catch(() => {});
      } catch {
        // Denied (e.g. battery saver) or needs a user gesture: try the fallback too.
        startVideoFallback();
      }
    };

    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    // Some browsers only grant the lock after a user gesture; retry on interaction.
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', acquire);
    document.addEventListener('pointerdown', acquire, true);
    document.addEventListener('keydown', acquire, true);
    // Re-check periodically in case the lock was silently dropped.
    const keepAlive = setInterval(acquire, 30_000);

    return () => {
      stopped = true;
      clearInterval(keepAlive);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', acquire);
      document.removeEventListener('pointerdown', acquire, true);
      document.removeEventListener('keydown', acquire, true);
      lock?.release().catch(() => {});
      if (video) {
        clearInterval(video._timer);
        video.srcObject?.getTracks().forEach((t) => t.stop());
        video.remove();
      }
    };
  }, [enabled]);
}
