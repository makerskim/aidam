import { useState } from 'react';
import type { SchoolOptions } from '@aidam/engine';
import { BASIS_ITEMS, basisSummary, basisValue, PRESET_DESC, PRESET_LABEL, presetOf, withBasisItem, withPreset, type PresetKey } from '../lib/basis';
import { Icon, Segmented } from './ui';

/** 계산 기준 고르기: 평소엔 한 줄, 누르면 묶음(정통·실용)과 항목별 두 가지 선택 */
export function BasisPicker({ school, onChange }: { school: SchoolOptions; onChange: (s: SchoolOptions) => void }) {
  const [open, setOpen] = useState(false);
  const preset = presetOf(school);
  return (
    <section className="basis" aria-label="계산 기준">
      <div className="basis-top">
        <span className="basis-label">계산 기준</span>
        <Segmented
          label="계산 기준"
          value={preset ?? ''}
          options={(Object.keys(PRESET_LABEL) as PresetKey[]).map((k) => ({ value: k, label: PRESET_LABEL[k] }))}
          onChange={(k) => onChange(withPreset(school, k as PresetKey))}
        />
        <p className="basis-desc">{preset ? PRESET_DESC[preset] : `직접 고른 기준: ${basisSummary(school)}`}</p>
      </div>
      <button type="button" className="basis-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>세부 항목 바꾸기</span>
        <span className="cr-chev">{Icon.down}</span>
      </button>
      {open ? (
        <div className="basis-body">
          {BASIS_ITEMS.map((it) => (
            <div key={it.key} className="basis-row">
              <div>
                <b>{it.label}</b>
                <p>{it.desc}</p>
              </div>
              <Segmented label={it.label} value={basisValue(school, it.key)} options={it.options} onChange={(v) => onChange(withBasisItem(school, it.key, v))} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
