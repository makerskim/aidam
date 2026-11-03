import { useEffect, useMemo, useState } from 'react';
import { meaningFor } from '../lib/format';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { ChildInput, Gender, NameChar, PairHarmony, SiblingReport, SiblingSet } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, HanjaPicker, SchoolOptionsPanel, SurnamePicker, type BirthDraft } from '../components/forms';
import { Disclaimer, ErrorText, Field, Loading, Notice, Segmented } from '../components/ui';
import { call, errorMessage } from '../lib/engine';
import { DEFAULT_PREFS, DEFAULT_SAJU, DEFAULT_SCHOOL, fromSearch, STATE_VERSION, toQuery, type AnalyzeState, type SiblingState, type SurnameSel } from '../lib/state';

const LABELS = ['첫째', '둘째', '셋째', '넷째'];

interface ChildDraft {
  gender: Gender;
  birth: BirthDraft;
  nameText: string;
  hanjaText: string;
}
const EMPTY_CHILD: ChildDraft = { gender: 'female', birth: EMPTY_BIRTH, nameText: '', hanjaText: '' };

function childFromInput(c: ChildInput): ChildDraft {
  return {
    gender: c.gender,
    birth: draftFromBirth(c.birth),
    nameText: (c.given ?? []).map((g) => g.hangul).join(''),
    hanjaText: (c.given ?? []).map((g) => g.hanja ?? '').join(''),
  };
}

function PairNotes({ p }: { p: PairHarmony }) {
  return (
    <div className="panel-quiet">
      <p>
        <b>
          {LABELS[p.a]} ↔ {LABELS[p.b]}
        </b>{' '}
        궁합 {p.score}점
      </p>
      <ul className="plain small muted" style={{ marginTop: 6 }}>
        {p.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export function Siblings() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const state = useMemo(() => fromSearch<SiblingState>(search), [search]);

  const [surname, setSurname] = useState<SurnameSel | null>(state?.surname ?? null);
  const [mode, setMode] = useState<SiblingState['mode']>(state?.mode ?? 'recommend');
  const [kids, setKids] = useState<ChildDraft[]>(state ? state.children.map(childFromInput) : [EMPTY_CHILD, EMPTY_CHILD]);
  const [fixedHangul, setFixedHangul] = useState(state?.prefs.fixed?.hangul ?? '');
  const [fixedHanja, setFixedHanja] = useState<string | null>(state?.prefs.fixed?.hanja ?? null);
  const [fixedPos, setFixedPos] = useState(state?.prefs.fixed?.position ?? 1);
  const [school, setSchool] = useState(state?.school ?? DEFAULT_SCHOOL);
  const [sajuOpts, setSajuOpts] = useState(state?.sajuOpts ?? DEFAULT_SAJU);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ kind: 'analyze'; result: SiblingReport } | { kind: 'recommend'; result: SiblingSet[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    let alive = true;
    setBusy(true);
    setResult(null);
    setError(null);
    call('siblings', state)
      .then((r) => alive && setResult(r))
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [state]);

  const setKid = (i: number, patch: Partial<ChildDraft>) => setKids((k) => k.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const fixedSyl = [...fixedHangul.replace(/[^가-힣]/g, '')][0];

  const submit = () => {
    if (!surname) return setError('성씨를 입력하고 한자를 골라 주세요.');
    const children: ChildInput[] = [];
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i] as ChildDraft;
      const b = birthFromDraft(k.birth);
      if (b.error) return setError(`${LABELS[i]}: ${b.error}`);
      const syl = [...k.nameText.replace(/[^가-힣]/g, '')];
      const hj = [...k.hanjaText.replace(/\s/g, '')];
      if (mode === 'analyze' && syl.length === 0) return setError(`${LABELS[i]}의 이름을 입력해 주세요.`);
      const given: NameChar[] | undefined = syl.length ? syl.map((h, j) => ({ hangul: h, hanja: hj[j] ?? null })) : undefined;
      children.push({ label: LABELS[i] as string, gender: k.gender, birth: b.birth, ...(given ? { given } : {}) });
    }
    if (mode === 'recommend' && children.every((c) => c.given)) return setError('추천받을 아이가 한 명 이상 있어야 해요. 이름 칸을 비워 두세요.');
    if (fixedSyl && !fixedHanja) return setError('돌림자의 한자를 골라 주세요.');
    const s: SiblingState = {
      v: STATE_VERSION,
      surname,
      children,
      mode,
      prefs: { ...DEFAULT_PREFS, ...(fixedSyl && fixedHanja ? { fixed: { position: fixedPos, hangul: fixedSyl, hanja: fixedHanja } } : {}) },
      school,
      sajuOpts,
    };
    navigate(`/siblings?${toQuery(s)}`);
  };

  const reportLink = (c: ChildInput, given: NameChar[]) => {
    if (!state) return '#';
    const a: AnalyzeState = { v: STATE_VERSION, surname: state.surname, gender: c.gender, birth: c.birth, given, school: state.school, sajuOpts: state.sajuOpts };
    return `/report?${toQuery(a)}`;
  };

  return (
    <main className="stack-lg">
      <div className="stack">
        <h1>쌍둥이·형제자매 이름</h1>
        <p className="muted">아이마다 사주를 따로 보고, 이름끼리 소리가 어울리면서도 또렷이 구별되는 세트를 찾아요.</p>
      </div>
      <Segmented
        label="방식"
        value={mode}
        options={[
          { value: 'recommend', label: '이름 세트 추천' },
          { value: 'analyze', label: '지은 이름 궁합' },
        ]}
        onChange={setMode}
      />
      <SurnamePicker value={surname} onChange={setSurname} />
      <Field label="아이 수">
        <Segmented
          label="아이 수"
          value={String(kids.length)}
          options={['2', '3', '4'].map((v) => ({ value: v, label: `${v}명` }))}
          onChange={(v) => {
            const n = Number(v);
            setKids((k) => (n > k.length ? [...k, ...Array.from({ length: n - k.length }, () => ({ ...EMPTY_CHILD, birth: k[0]?.birth ?? EMPTY_BIRTH }))] : k.slice(0, n)));
          }}
        />
      </Field>
      {kids.map((k, i) => (
        <section key={i} className="panel stack">
          <h2>{LABELS[i]}</h2>
          <Segmented
            label={`${LABELS[i]} 성별`}
            value={k.gender}
            options={[
              { value: 'female', label: '여아' },
              { value: 'male', label: '남아' },
              { value: 'unknown', label: '모름' },
            ]}
            onChange={(gender) => setKid(i, { gender })}
          />
          {i > 0 ? (
            <button type="button" className="btn btn-soft" onClick={() => setKid(i, { birth: { ...(kids[0] as ChildDraft).birth, time: k.birth.time } })}>
              첫째와 같은 날 태어났어요 (쌍둥이)
            </button>
          ) : null}
          <BirthFields idPrefix={`kid${i}`} value={k.birth} onChange={(birth) => setKid(i, { birth })} />
          <div className="grid-2">
            <Field label={mode === 'analyze' ? '이름' : '이미 정한 이름(선택)'} htmlFor={`kname${i}`}>
              <input id={`kname${i}`} className="input" placeholder="서윤" maxLength={4} value={k.nameText} onChange={(e) => setKid(i, { nameText: e.target.value })} />
            </Field>
            <Field label="한자" htmlFor={`khanja${i}`}>
              <input id={`khanja${i}`} className="input hanja" placeholder="瑞潤" maxLength={4} value={k.hanjaText} onChange={(e) => setKid(i, { hanjaText: e.target.value })} />
            </Field>
          </div>
        </section>
      ))}
      {mode === 'recommend' ? (
        <Field label="공통 돌림자 (선택)" htmlFor="sfixed">
          <div className="stack">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="sfixed" className="input" maxLength={1} placeholder="예: 윤" value={fixedHangul} onChange={(e) => { setFixedHangul(e.target.value); setFixedHanja(null); }} style={{ flex: 1 }} />
              <Segmented
                label="돌림자 위치"
                value={String(fixedPos)}
                options={[
                  { value: '0', label: '첫 자' },
                  { value: '1', label: '끝 자' },
                ]}
                onChange={(v) => setFixedPos(Number(v))}
              />
            </div>
            {fixedSyl ? <HanjaPicker syllable={fixedSyl} initial={fixedPos === 0} birth={null} sajuOpts={sajuOpts} value={fixedHanja} onChange={setFixedHanja} /> : null}
          </div>
        </Field>
      ) : null}
      <details className="panel-quiet">
        <summary>학설·계산 옵션</summary>
        <SchoolOptionsPanel school={school} saju={sajuOpts} onSchool={setSchool} onSaju={setSajuOpts} />
      </details>
      <ErrorText>{error}</ErrorText>
      <button type="button" className="btn btn-primary btn-block" onClick={submit}>
        {mode === 'recommend' ? '이름 세트 추천받기' : '궁합 보기'}
      </button>

      {busy ? <Loading text="아이들 사주와 이름을 맞춰 보고 있어요" /> : null}
      {result?.kind === 'recommend' ? (
        <section className="stack">
          <h2>어울리는 이름 세트</h2>
          {result.result.length === 0 ? <Notice>조건에 맞는 세트가 없어요. 돌림자나 엄격 모드를 바꿔 보세요.</Notice> : null}
          {result.result.map((set, si) => (
            <div key={si} className="panel stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>세트 {si + 1}</b>
                <span className="chip chip-good">세트 점수 {set.score}</span>
              </div>
              {set.names.map((n, i) => (
                <Link key={i} className="name-row" style={{ background: 'var(--surface-2)' }} to={state ? reportLink(state.children[i] as ChildInput, n.report.input.given) : '#'}>
                  <span className="tiny muted" style={{ width: 34 }}>{LABELS[i]}</span>
                  <span className="who">
                    <span className="ko">{n.hangul}</span>
                    <span className="hj">{n.hanja}</span>
                    <span className="meaning" style={{ display: 'block' }}>{n.report.chars.map((h, i) => (h ? meaningFor(h.meaning, n.report.input.given[i]?.hangul ?? '') : '')).join(' · ')}</span>
                  </span>
                  <span className="score">
                    <b>{n.report.score.total}</b>
                    <small>{n.report.score.grade}</small>
                  </span>
                </Link>
              ))}
              {set.pairs.map((p, i) => (
                <PairNotes key={i} p={p} />
              ))}
            </div>
          ))}
        </section>
      ) : null}
      {result?.kind === 'analyze' ? (
        <section className="stack">
          <h2>형제자매 궁합 {result.result.total}점</h2>
          {result.result.children.map((c, i) =>
            c.report ? (
              <Link key={i} className="name-row" to={state ? reportLink(state.children[i] as ChildInput, c.report.input.given) : '#'}>
                <span className="tiny muted" style={{ width: 34 }}>{LABELS[i]}</span>
                <span className="who">
                  <span className="ko">{c.report.fullHangul}</span>
                  <span className="hj">{c.report.fullHanja ?? ''}</span>
                </span>
                <span className="score">
                  <b>{c.report.score.total}</b>
                  <small>{c.report.score.grade}</small>
                </span>
              </Link>
            ) : null,
          )}
          {result.result.pairs.map((p, i) => (
            <PairNotes key={i} p={p} />
          ))}
        </section>
      ) : null}
      <Disclaimer />
    </main>
  );
}
