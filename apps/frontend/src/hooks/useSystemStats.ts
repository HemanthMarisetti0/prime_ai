import { useEffect, useState } from 'react';
import type { SystemSnapshot } from '@prime/shared';
import { fetchSystemSnapshot } from '../api/system';

const POLL_INTERVAL_MS = 5000;

/**
 * Polls /api/system while `enabled` and the page is visible.
 * `undefined` = not loaded yet, `null` = unavailable.
 */
export function useSystemStats(enabled: boolean): SystemSnapshot | null | undefined {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    const poll = async () => {
      if (document.hidden) return;
      const next = await fetchSystemSnapshot(controller.signal);
      if (!controller.signal.aborted) setSnapshot(next);
    };

    void poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [enabled]);

  return snapshot;
}
