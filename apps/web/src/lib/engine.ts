import type { Api } from './api';

type Method = keyof Api;
type Result<M extends Method> = ReturnType<Api[M]>;

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; method: Method; args: unknown[] }>();

function fallback(method: Method, args: unknown[]): Promise<unknown> {
  return import('./api').then(({ api }) => (api[method] as (...a: unknown[]) => unknown)(...args));
}

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      // Worker를 쓸 수 없는 환경: 대기 중인 호출을 메인 스레드에서 다시 실행
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        fallback(p.method, p.args).then(p.resolve, p.reject);
      }
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** 엔진 호출. 계산은 Web Worker에서 하고, 안 되면 메인 스레드에서 한다. */
export function call<M extends Method>(method: M, ...args: Parameters<Api[M]>): Promise<Result<M>> {
  const w = getWorker();
  if (!w) return fallback(method, args) as Promise<Result<M>>;
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method, args });
    w.postMessage({ id, method, args });
  });
}

const ERRORS: Record<string, string> = {
  INVALID_DATE: '존재하지 않는 날짜예요. 날짜를 다시 확인해 주세요.',
  DATE_OUT_OF_RANGE: '1900년부터 2100년 사이의 날짜만 계산할 수 있어요.',
  INVALID_LUNAR_DATE: '음력 날짜나 윤달 여부를 다시 확인해 주세요. 음력은 1900~2050년을 지원해요.',
  INVALID_TIME: '시간을 다시 확인해 주세요.',
  INVALID_PLACE: '출생지를 다시 골라 주세요.',
  INVALID_NAME: '이름은 한글 1~4글자, 성은 1~2글자로 입력해 주세요.',
  UNKNOWN_SURNAME_HANJA: '성씨 한자를 목록에서 골라 주세요.',
  SIBLINGS_2_TO_4: '아이는 2명에서 4명까지 함께 지을 수 있어요.',
};

export function errorMessage(e: unknown): string {
  const code = e instanceof Error ? e.message : String(e);
  return ERRORS[code] ?? '계산 중 문제가 생겼어요. 입력값을 확인하고 다시 시도해 주세요.';
}
