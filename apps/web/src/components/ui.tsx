import type { ReactNode } from 'react';
import { useStagedSteps } from '../lib/motion';
import { ELEMENT_HANJA, ELEMENT_KO, type Element } from '@aidam/engine/src/core/elements';

export const Icon = {
  chevron: (
    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  ),
  heart: (filled: boolean) => (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  ),
  bookmark: (filled: boolean) => (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 38.6 44 33 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" />
    </svg>
  ),
};

export function Field({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="label">{label}</span>
      )}
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, title }: { checked: boolean; onChange: (v: boolean) => void; title: string }) {
  return (
    <label className="switch">
      <span>{title}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function ElementChip({ element, withName = false }: { element: Element | string; withName?: boolean }) {
  const e = element as Element;
  return (
    <span className={`el el-${e}`} title={`${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`}>
      {ELEMENT_HANJA[e]}
      {withName ? ELEMENT_KO[e] : null}
    </span>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function Notice({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <div className={`notice ${warn ? 'notice-warn' : ''}`}>{children}</div>;
}

export function Disclaimer() {
  return <p className="tiny muted">전통 성명학에 따른 참고 정보예요. 출생신고 전 대법원 인명용 한자를 확인하세요.</p>;
}

export function Cta({ children }: { children: ReactNode }) {
  return (
    <div className="cta">
      <div className="cta-inner">{children}</div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="error" role="alert">
      {children}
    </p>
  ) : null;
}

export function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`${total}단계 중 ${step}단계`}>
      <i style={{ width: `${(step / total) * 100}%` }} />
    </div>
  );
}

/** 전문가가 차근차근 살피는 듯한 단계별 분석 화면. done이 되고 단계를 다 보여 주면 children을 그린다 */
export function Staged({ steps, done, children }: { steps: string[]; done: boolean; children: ReactNode }) {
  const { index, finished } = useStagedSteps(steps, done);
  if (finished) return <>{children}</>;
  return (
    <div className="staged" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <ol>
        {steps.map((s, i) => (
          <li key={s} className={i < index ? 'done' : i === index ? 'now' : ''}>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
