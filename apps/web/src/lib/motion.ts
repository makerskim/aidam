import { useEffect, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 숫자가 0에서 목표값까지 부드럽게 올라간다 (움직임 줄이기 설정이면 바로 표시) */
export function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(() => (reduced() ? target : 0));
  useEffect(() => {
    if (reduced()) {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(target * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** 단계별 진행 문구: 계산이 빨리 끝나도 각 단계를 잠깐씩 보여 준다 */
export function useStagedSteps(steps: string[], done: boolean, stepMs = 450): { index: number; finished: boolean } {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced()) {
      setIndex(steps.length);
      return;
    }
    const id = window.setInterval(() => setIndex((i) => Math.min(i + 1, steps.length)), stepMs);
    return () => window.clearInterval(id);
  }, [steps.length, stepMs]);
  return { index, finished: done && index >= steps.length };
}
