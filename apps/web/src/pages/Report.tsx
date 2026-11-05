import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { NameReport, Recommendation, SajuResult, SchoolOptions } from '@aidam/engine';
import { call, errorMessage } from '../lib/engine';
import { fromSearch, toQuery, type AnalyzeState } from '../lib/state';
import { ReportView, type BasisScore } from '../components/report';
import { BasisPicker } from '../components/basis';
import { Disclaimer, ErrorText, Staged } from '../components/ui';

export function Report() {
  const { search } = useLocation();
  const state = useMemo(() => fromSearch<AnalyzeState>(search), [search]);
  const [data, setData] = useState<{ saju: SajuResult | null; report: NameReport; better: Recommendation[]; compare: BasisScore[] } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
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

  // 계산 기준을 바꾸면 같은 이름을 그 기준으로 다시 풀이한다(뒤로 가기에 쌓지 않음)
  const setSchool = (school: SchoolOptions) => {
    if (!state) return;
    navigate(`/report?${toQuery({ ...state, school })}`, { replace: true, state: location.state });
  };

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
          {data ? (
            <>
              <BasisPicker school={state.school} onChange={setSchool} />
              <ReportView report={data.report} saju={data.saju} better={data.better} query={toQuery(state)} compare={data.compare} onSchool={setSchool} />
            </>
          ) : null}
        </Staged>
      ) : null}
      <Disclaimer />
      </div>
    </main>
  );
}
