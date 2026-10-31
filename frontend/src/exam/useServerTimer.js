import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Countdown driven by the server's remainingMs. Elapsed time is measured with
 * performance.now() (monotonic), so changing the computer clock has no effect.
 * Every heartbeat re-synchronises to the authoritative server value.
 */
export function useServerTimer() {
  const sync = useRef(null);
  const [remaining, setRemaining] = useState(null);

  const syncTo = useCallback((remainingMs) => {
    sync.current = { remainingMs, at: performance.now() };
    setRemaining(remainingMs);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!sync.current) return;
      setRemaining(Math.max(0, sync.current.remainingMs - (performance.now() - sync.current.at)));
    }, 250);
    return () => clearInterval(t);
  }, []);

  return { remaining, syncTo };
}
