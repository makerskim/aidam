import type React from 'react';
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

/** 화면에 들어오면 .reveal 요소에 .in을 붙인다 (움직임 줄이기 설정이면 바로 표시) */
export function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('.reveal');
    if (reduced() || typeof IntersectionObserver === 'undefined') {
      items.forEach((i) => i.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, [root]);
}

/** 스크롤 이야기: 화면 가운데에 온 단계의 번호 */
export function useActiveStep(root: React.RefObject<HTMLElement | null>, selector: string): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const steps = [...el.querySelectorAll<HTMLElement>(selector)];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(steps.indexOf(e.target as HTMLElement));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    steps.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [root, selector]);
  return active;
}
