import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ELEMENT_HANJA, type Element } from '@aidam/engine/src/core/elements';
import { useStagedSteps } from '../lib/motion';
import { PLAIN } from '../lib/insights';

export const Icon = {
  chevron: (
    <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  ),
  down: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  ),
  bookmark: (filled: boolean) => (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 4h12v16l-6-4-6 4z" />
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
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

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
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

export function Switch({ checked, onChange, title, desc }: { checked: boolean; onChange: (v: boolean) => void; title: string; desc?: string }) {
  return (
    <label className="switch">
      <span>
        {title}
        {desc ? <small>{desc}</small> : null}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/** 오행 표시: 한자 + 쉬운 말(나무·불·흙·쇠·물) */
export function ElementChip({ element, withName = false }: { element: Element | string; withName?: boolean }) {
  const e = element as Element;
  return (
    <span className={`el el-${e}`} title={PLAIN[e]}>
      {ELEMENT_HANJA[e]}
      {withName ? ` ${PLAIN[e]}` : null}
    </span>
  );
}

export function Notice({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return <div className={`notice ${warn ? 'notice-warn' : ''}`}>{children}</div>;
}

export function Disclaimer() {
  return <p className="tiny muted">전통 성명학에 따른 참고 정보예요. 출생신고 전 대법원 인명용 한자를 확인하세요.</p>;
}

/** 아래 버튼 묶음: 데스크톱은 오른쪽 정렬, 모바일은 화면 아래 고정 */
export function Cta({ children }: { children: ReactNode }) {
  return <div className="wizard-actions">{children}</div>;
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
    <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={`${total}단계 중 ${step}단계`} style={{ flex: 1 }}>
      <i style={{ width: `${(step / total) * 100}%` }} />
    </div>
  );
}

/** 전문가가 차근차근 살피는 듯한 단계별 분석 화면 */
export function Staged({ steps, done, children }: { steps: string[]; done: boolean; children: ReactNode }) {
  // 이미 계산해 둔 결과(뒤로 가기 등)면 진행 화면 없이 바로 보여 준다
  const [instant] = useState(done);
  const { index, finished } = useStagedSteps(steps, done, 420);
  if (instant || finished) return <>{children}</>;
  const now = Math.min(index, steps.length - 1);
  const pct = Math.max(8, Math.round((Math.min(index + (done ? 1 : 0.5), steps.length) / steps.length) * 100));
  return (
    <div className="loader" role="status" aria-live="polite">
      <div className="loader-card">
        <p className="loader-now">{steps[now]}</p>
        <div className="loader-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </div>
        <ol className="loader-steps">
          {steps.map((s, i) => (
            <li key={s} className={i < index ? 'done' : i === index ? 'now' : ''}>
              <span className="dot">{i < index ? Icon.check : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── 모달 ───────────────────────────────────────────────
export function Modal({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {children}
      </div>
    </div>
  );
}

// ── 피커: 모든 선택 항목을 같은 모양으로 ───────────────────
export interface PickerOption {
  value: string;
  label: string;
  sub?: string;
}
export interface PickerGroup {
  title?: string;
  cols?: number;
  options: PickerOption[];
}

export function Picker({
  id,
  label,
  placeholder,
  value,
  groups,
  onChange,
  disabled = false,
  align = 'left',
  display,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  groups: PickerGroup[];
  onChange: (v: string) => void;
  disabled?: boolean;
  align?: 'left' | 'right';
  display?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const all = groups.flatMap((g) => g.options);
  const current = all.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const sel = wrap.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? wrap.current?.querySelector<HTMLElement>('[data-anchor="true"]') ?? wrap.current?.querySelector<HTMLElement>('.pk-opt');
    sel?.scrollIntoView({ block: 'center' });
    sel?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="pk" ref={wrap}>
      <button
        id={id}
        type="button"
        className="pk-field"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}${current ? ` ${current.label}` : ''}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {current ? <span>{display ? display(value) : current.label}</span> : <span className="ph">{placeholder}</span>}
        {Icon.down}
      </button>
      {open ? (
        <>
          <div className="pk-backdrop" onMouseDown={() => setOpen(false)} />
          <div className={`pk-pop ${align === 'right' ? 'right' : ''}`} role="listbox" aria-label={label}>
            <div className="pk-head">{label}</div>
            {groups.map((g, gi) => (
              <div key={gi} className="pk-group">
                {g.title ? <div className="pk-head" style={{ fontWeight: 700, color: 'var(--text-3)' }}>{g.title}</div> : null}
                <div className="pk-grid" style={{ ['--cols' as string]: String(g.cols ?? 4) }}>
                  {g.options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      className="pk-opt"
                      aria-selected={o.value === value}
                      data-anchor={o.value === '2026' ? 'true' : undefined}
                      onClick={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                      {o.sub ? <small>{o.sub}</small> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
