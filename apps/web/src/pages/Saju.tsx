import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { BirthInput, SajuOptions, SajuResult } from '@aidam/engine';
import { call, errorMessage } from '../lib/engine';
import { fromSearch, kidBirth, type NameState } from '../lib/state';
import { SajuCard } from '../components/report';
import { Disclaimer, ErrorText, Icon, Staged } from '../components/ui';

/** 사주 자세히 보기: 결과·리포트의 요약에서 들어온다 */
export function SajuPage() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(search);
  const k = params.get('k');
  const state = useMemo(() => fromSearch<{ v: number; birth: BirthInput | null; sajuOpts: SajuOptions; kids?: NameState['kids'] }>(search), [search]);
  const birth = state ? (k !== null && state.kids ? kidBirth(state as NameState, Number(k)) : state.birth) : null;
  const [saju, setSaju] = useState<SajuResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!birth || !state) return;
    let alive = true;
    call('saju', birth, state.sajuOpts)
      .then((d) => alive && setSaju(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
  if (!state || !birth) {
    return (
      <main className="container page">
        <div className="read stack">
          <h1>사주를 볼 생일 정보가 없어요</h1>
          <Link className="btn btn-primary" to="/name">
            이름 짓기 시작
          </Link>
        </div>
      </main>
    );
  }
  const b = saju?.base;
  return (
    <main className="container page">
      <div className="read stack-lg">
        <button type="button" className="back-link" onClick={back}>
          {Icon.back} 돌아가기
        </button>
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Staged steps={['만세력 찾는 중', '다섯 기운 세는 중']} done={Boolean(saju)}>
          {saju ? (
            <>
              <SajuCard saju={saju} />
              <section className="card stack" style={{ gap: 10 }} aria-label="계산 기준">
                <h3>이렇게 계산했어요</h3>
                <ul className="plain-list small">
                  <li>해(연주)는 입춘, 달(월주)은 절기가 시작되는 시각을 기준으로 바뀌어요.</li>
                  {b?.corrected ? (
                    <li>
                      태어난 지역의 해 시간에 맞춰 {Math.abs(b.correctionMin)}분 {b.correctionMin < 0 ? '늦춰' : '당겨'} 계산했어요.
                    </li>
                  ) : (
                    <li>태어난 시각을 몰라 하루 열두 때를 모두 따져 보았어요.</li>
                  )}
                  <li>
                    밤 11시~자정 출생은 {state.sajuOpts.ziHour === 'nextDay' ? '다음 날' : '그날'}로 봐요. 설정에서 바꿀 수 있어요.
                  </li>
                </ul>
              </section>
            </>
          ) : null}
        </Staged>
        <Disclaimer />
      </div>
    </main>
  );
}
