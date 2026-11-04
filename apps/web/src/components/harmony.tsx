import type { PairHarmony } from '@aidam/engine';
import { KID_LABELS } from '../lib/state';

type Tone = 'good' | 'ok' | 'bad';
interface Row {
  label: string;
  text: string;
  tone: Tone;
}

/** 다둥이 궁합을 쉬운 말로 */
export function harmonyRows(p: PairHarmony): Row[] {
  const rows: Row[] = [];
  if (p.name) {
    const rel = p.name.initialRelation;
    if (rel.includes('상생')) rows.push({ label: '첫소리', text: '두 이름의 첫소리 기운이 서로 살려 줘요', tone: 'good' });
    else if (rel.includes('상극')) rows.push({ label: '첫소리', text: '두 이름의 첫소리 기운이 부딪혀요', tone: 'bad' });
    else rows.push({ label: '첫소리', text: '두 이름의 첫소리 기운이 같아 무난해요', tone: 'ok' });
    rows.push(
      p.name.distinctness >= 0.5
        ? { label: '부르기', text: '두 이름이 또렷이 구별돼 부르기 좋아요', tone: 'good' }
        : { label: '부르기', text: '소리가 비슷해 부를 때 헷갈릴 수 있어요', tone: 'bad' },
    );
    rows.push(
      p.name.rhyme >= 15
        ? { label: '어울림', text: '같은 글자가 있어 형제자매 느낌이 살아요', tone: 'good' }
        : p.name.rhyme >= 8
          ? { label: '어울림', text: '끝소리가 닮아 한 세트처럼 어울려요', tone: 'good' }
          : { label: '어울림', text: '끝소리가 달라 저마다 개성이 있어요', tone: 'ok' },
    );
  }
  if (p.saju) {
    const st = p.saju.stem;
    rows.push(
      st.includes('비화')
        ? { label: '사주', text: '타고난 기운이 같아 서로 많이 닮았어요', tone: 'ok' }
        : st.includes('상생') || st.includes('천간합')
          ? { label: '사주', text: '타고난 기운이 서로 도와요', tone: 'good' }
          : { label: '사주', text: '타고난 기운이 서로 달라 맞춰 가며 자라요', tone: 'ok' },
    );
  }
  return rows;
}

const TONE_MARK: Record<Tone, string> = { good: '✓', ok: '·', bad: '!' };

/** 다둥이 궁합 카드 내용 (쌍둥이는 한 쌍, 세쌍둥이는 세 쌍) */
export function HarmonyView({ pairs, names }: { pairs: PairHarmony[]; names: string[] }) {
  return (
    <div className="harmony">
      {pairs.map((p) => (
        <div key={`${p.a}-${p.b}`} className="harmony-pair">
          <div className="harmony-head">
            <span>
              {pairs.length > 1 ? `${KID_LABELS[p.a]}·${KID_LABELS[p.b]} ` : ''}
              <b>
                {names[p.a]} · {names[p.b]}
              </b>
            </span>
            <span className="harmony-score">
              궁합 <b className="num">{Math.round(p.score)}</b>점
            </span>
          </div>
          <ul className="harmony-rows">
            {harmonyRows(p).map((r) => (
              <li key={r.label} className={r.tone}>
                <span className="hm-mark" aria-hidden="true">
                  {TONE_MARK[r.tone]}
                </span>
                <span className="hm-label">{r.label}</span>
                {r.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
