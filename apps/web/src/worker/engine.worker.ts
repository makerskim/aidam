/// <reference lib="webworker" />
import { api, type Api } from '../lib/api';

interface Req {
  id: number;
  method: keyof Api;
  args: unknown[];
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, method, args } = e.data;
  try {
    const fn = api[method] as (...a: unknown[]) => unknown;
    const result = fn(...args);
    (self as unknown as Worker).postMessage({ id, ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id, ok: false, error: message });
  }
};
