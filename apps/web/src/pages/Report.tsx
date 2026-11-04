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
      <main className="container narrow page stack">
        <h1>풀이할 이름 정보가 없어요</h1>
        <Link className="btn btn-primary" to="/">
          처음으로
        </Link>
      </main>
    );
  }
  return (
    <main className="container page">
      <div className="read stack-lg">
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!error ? (
        <Staged steps={['사주 세우는 중', '한자의 뜻과 기운 보는 중', '획수와 소리 따져 보는 중']} done={Boolean(data)}>
          {data ? <ReportView report={data.report} saju={data.saju} better={data.better} query={toQuery(state)} /> : null}
        </Staged>
      ) : null}
      <Disclaimer />
      </div>
    </main>
  );
}
