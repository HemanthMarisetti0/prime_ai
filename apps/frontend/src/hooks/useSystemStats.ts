import { useEffect, useState } from 'react';
import type { SystemSnapshot } from '@prime/shared';
import { fetchSystemSnapshot } from '../api/system';

const POLL_INTERVAL_MS = 5000;

/** Polls /api/system while the page is visible. `undefined` = loading, `null` = unavailable. */
export function useSystemStats(): SystemSnapshot | null | undefined {
  const [snapshot, setSnapshot] = useState<SystemSnapshot | null | undefined>(undefined);

  useEffect(() => {
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
  }, []);

  return snapshot;
}
