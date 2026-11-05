import { useState } from 'react';
import type { SchoolOptions } from '@aidam/engine';
import { BASIS_ITEMS, basisSummary, basisValue, PRESET_DESC, PRESET_LABEL, PRESETS, presetOf, withPreset } from '../lib/basis';
import { Icon, Segmented } from './ui';

/** 계산 기준 고르기: 평소엔 한 줄, 누르면 묶음(정통·실용)과 항목별 두 가지 선택 */
export function BasisPicker({ school, onChange }: { school: SchoolOptions; onChange: (s: SchoolOptions) => void }) {
  const [open, setOpen] = useState(false);
  const preset = presetOf(school);
  return (
    <section className={`basis ${open ? 'open' : ''}`} aria-label="계산 기준">
      <button type="button" className="basis-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="basis-label">계산 기준</span>
        <b>{basisSummary(school)}</b>
        <span className="basis-change">
          바꾸기 <span className="cr-chev">{Icon.down}</span>
        </span>
      </button>
      {open ? (
        <div className="basis-body">
          <div className="basis-presets">
            {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
              <button key={k} type="button" className="bp-item" aria-pressed={preset === k} onClick={() => onChange(withPreset(school, k))}>
                <b>{PRESET_LABEL[k]}</b>
                <span>{PRESET_DESC[k]}</span>
              </button>
            ))}
          </div>
          {BASIS_ITEMS.map((it) => (
            <div key={it.key} className="basis-row">
              <div>
                <b>{it.label}</b>
                <p>{it.desc}</p>
              </div>
              <Segmented label={it.label} value={basisValue(school, it.key)} options={it.options} onChange={(v) => onChange({ ...school, [it.key]: v })} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
