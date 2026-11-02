import { useEffect, useState } from 'react';
import { checkHealth } from '../api/health';

export type ServerStatus = 'checking' | 'online' | 'offline';

const POLL_INTERVAL_MS = 30_000;

/** Polls /api/health. Pass a changing `recheckKey` (e.g. the latest error) to trigger an immediate check. */
export function useServerStatus(recheckKey?: unknown): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>('checking');

  useEffect(() => {
    let controller = new AbortController();

    const run = async () => {
      controller.abort();
      controller = new AbortController();
      const ok = await checkHealth(controller.signal);
      if (!controller.signal.aborted) setStatus(ok ? 'online' : 'offline');
    };

    void run();
    const timer = window.setInterval(run, POLL_INTERVAL_MS);
    window.addEventListener('focus', run);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
    };
  }, [recheckKey]);

  return status;
}
