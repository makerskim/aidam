import type { ReactNode } from 'react';
import { ELEMENT_HANJA, ELEMENT_KO, type Element } from '@aidam/engine/src/core/elements';

export function Saekdong({ className = '' }: { className?: string }) {
  return (
    <div className={`saekdong ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
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
      {hint ? <span className="hint">{hint}</span> : null}
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

export function Toggle({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <b>{title}</b>
        {desc ? <span className="small muted">{desc}</span> : null}
      </span>
    </label>
  );
}

export function ElementChip({ element, withName = false }: { element: Element | string; withName?: boolean }) {
  const e = element as Element;
  return (
    <span className={`el el-${e}`} title={`${ELEMENT_KO[e]}(${ELEMENT_HANJA[e]})`}>
      {ELEMENT_HANJA[e]}
      {withName ? <span className="tiny" style={{ marginLeft: 3, fontFamily: 'var(--font-body)' }}>{ELEMENT_KO[e]}</span> : null}
    </span>
  );
}

export function Loading({ text = '이름을 살펴보고 있어요' }: { text?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <Saekdong />
      <span>{text}</span>
    </div>
  );
}

export function Notice({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <div className={`notice ${warn ? 'notice-warn' : ''}`}>{children}</div>;
}

export function Disclaimer() {
  return (
    <p className="tiny muted">
      전통 성명학 이론에 따른 참고 정보이며 과학적으로 검증된 예측이 아닙니다. 출생신고 전 대법원 인명용 한자를 확인하세요.
    </p>
  );
}

export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="bottom-bar">
      <div className="bottom-bar-inner">{children}</div>
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
