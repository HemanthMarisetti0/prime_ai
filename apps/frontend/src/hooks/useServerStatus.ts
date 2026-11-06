import { useEffect, useState } from 'react';
import { checkHealth } from '../api/health';

/** `waking`: the server is taking a while to answer, typically a free host starting up after a rest. */
export type ServerStatus = 'checking' | 'waking' | 'online' | 'offline';

const POLL_INTERVAL_MS = 30_000;
// A first answer slower than this means the server is (most likely) cold-starting.
const WAKING_AFTER_MS = 3000;

/** Polls /api/health. Pass a changing `recheckKey` (e.g. the latest error) to trigger an immediate check. */
export function useServerStatus(recheckKey?: unknown): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    let controller = new AbortController();
    let wakingTimer = 0;

    const run = async () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;
      window.clearTimeout(wakingTimer);
      wakingTimer = window.setTimeout(() => {
        if (!signal.aborted) setStatus((current) => (current === 'online' ? current : 'waking'));
      }, WAKING_AFTER_MS);
      const ok = await checkHealth(signal);
      window.clearTimeout(wakingTimer);
      if (!signal.aborted) setStatus(ok ? 'online' : 'offline');
    };

    void run();
    const timer = window.setInterval(run, POLL_INTERVAL_MS);
    window.addEventListener('focus', run);
    return () => {
      controller.abort();
      window.clearTimeout(wakingTimer);
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
    };
  }, [recheckKey]);

  return status;
}
