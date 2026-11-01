import { useEffect, useRef } from 'react';

/**
 * Runs `fn` now and then every `ms` while the browser tab is visible, so every admin sees
 * other admins' changes within a few seconds. Pauses in background tabs and re-syncs
 * immediately when the tab becomes visible again. Overlapping runs are skipped.
 */
export function useLivePoll(fn, ms, deps = []) {
  const busy = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let stopped = false;
    const run = async () => {
      if (stopped || busy.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        await fnRef.current();
      } finally {
        busy.current = false;
      }
    };
    run();
    const timer = setInterval(run, ms);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
