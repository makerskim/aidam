import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { SajuResult } from '@aidam/engine';
import { BirthFields, birthFromDraft, draftFromBirth, EMPTY_BIRTH, SchoolOptionsPanel, type BirthDraft } from '../components/forms';
import { SajuView } from '../components/report';
import { Disclaimer, ErrorText, Loading } from '../components/ui';
import { call, errorMessage } from '../lib/engine';
import { DEFAULT_SAJU, DEFAULT_SCHOOL, fromSearch, type NameState } from '../lib/state';

export function Manse() {
  const { search } = useLocation();
  const fromUrl = useMemo(() => fromSearch<Pick<NameState, 'v' | 'birth' | 'sajuOpts'>>(search), [search]);
  const [draft, setDraft] = useState<BirthDraft>(() => (fromUrl?.birth ? draftFromBirth(fromUrl.birth) : EMPTY_BIRTH));
  const [opts, setOpts] = useState(fromUrl?.sajuOpts ?? DEFAULT_SAJU);
  const [saju, setSaju] = useState<SajuResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (d: BirthDraft, o = opts) => {
    const { birth, error: e } = birthFromDraft(d);
    if (e || !birth) return setError(e ?? '생년월일을 입력해 주세요.');
    setBusy(true);
    setError(null);
    call('saju', birth, o)
      .then(setSaju)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (fromUrl?.birth) run(draftFromBirth(fromUrl.birth), fromUrl.sajuOpts);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="stack-lg">
      <div className="stack">
        <h1>만세력</h1>
        <p className="muted">절기(절입 시각)로 연·월주를, 출생지 시간으로 일·시주를 세워 오행 세력과 용신을 보여 드려요.</p>
      </div>
      <BirthFields idPrefix="manse" value={draft} onChange={setDraft} allowUnknown={false} />
      <details className="panel-quiet">
        <summary>계산 옵션</summary>
        <SchoolOptionsPanel school={DEFAULT_SCHOOL} saju={opts} onSchool={() => undefined} onSaju={setOpts} />
      </details>
      <button type="button" className="btn btn-primary btn-block" onClick={() => run(draft)}>
        사주 보기
      </button>
      <ErrorText>{error}</ErrorText>
      {busy ? <Loading text="절기를 계산하고 있어요" /> : null}
      {saju && !busy ? (
        <section className="panel">
          <SajuView saju={saju} />
        </section>
      ) : null}
      <Disclaimer />
    </main>
  );
}
