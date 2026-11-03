import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult } from '@aidam/engine';
import { call, errorMessage } from '../lib/engine';
import { fromSearch, toQuery, type AnalyzeState } from '../lib/state';
import { ReportView } from '../components/report';
import { Disclaimer, ErrorText, Staged } from '../components/ui';

export function Report() {
  const { search } = useLocation();
  const state = useMemo(() => fromSearch<AnalyzeState>(search), [search]);
  const [data, setData] = useState<{ saju: SajuResult | null; report: NameReport; better: Recommendation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    let alive = true;
    setData(null);
    setError(null);
    call('analyze', state)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [state]);

  if (!state) {
    return (
      <main className="stack">
        <h1>풀이할 이름 정보가 없어요</h1>
        <Link className="btn btn-primary" to="/self">
          이름 풀어보기
        </Link>
      </main>
    );
  }
  return (
    <main className="stack-lg">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error ? (
        <Staged steps={['사주를 세우고 있어요', '한자의 뜻과 기운을 살피고 있어요', '획수와 소리를 따져 보고 있어요']} done={Boolean(data)}>
          {data ? <ReportView report={data.report} saju={data.saju} better={data.better} query={toQuery(state)} /> : null}
        </Staged>
      ) : null}
      <Link className="btn btn-secondary btn-block" to={`/self?${toQuery(state)}`}>
        한자 바꿔 보기
      </Link>
      <Disclaimer />
    </main>
  );
}
