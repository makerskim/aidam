import { Link } from 'react-router-dom';

const PRINCIPLES = [
  { title: '사주와 용신', text: '태어난 순간의 절기를 천문 계산으로 찾아 사주팔자를 세우고, 오행의 세기를 따져 부족한 기운(용신·희신)을 찾아요.' },
  { title: '자원오행', text: '한자의 부수와 뜻에 담긴 오행이 그 부족한 기운을 채우는지 봐요.' },
  { title: '소리오행', text: '이름 첫소리의 오행이 성에서 이름으로 서로 살려 주는지 봐요. 해례본·운해본 두 학설을 함께 봐요.' },
  { title: '81수리', text: '성과 이름 획수로 초년·청년·장년·말년 네 운이 모두 좋은 수인지 확인해요.' },
];

const SCORE = [
  ['사주 보완(자원오행)', '30'],
  ['획수(81수리)', '25'],
  ['소리오행', '20'],
  ['음양 조화', '10'],
  ['뜻·발음', '15'],
];

export function Guide() {
  return (
    <main className="stack-lg">
      <div className="stack" style={{ gap: 6 }}>
        <h1>작명 원리와 출처</h1>
        <p className="muted">아이담은 makerskim이 만들었어요.</p>
      </div>
      <section className="stack">
        <h2>이렇게 지어요</h2>
        <ol className="stack" style={{ margin: 0, paddingLeft: 20, gap: 14 }}>
          {PRINCIPLES.map((p) => (
            <li key={p.title}>
              <b>{p.title}</b>
              <p style={{ color: 'var(--text-2)', fontSize: 15 }}>{p.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="stack">
        <h2>점수 배점</h2>
        <table className="compare">
          <tbody>
            {SCORE.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td style={{ textAlign: 'right' }}>{v}점</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">90점 이상 S, 80점 A, 70점 B, 60점 C 등급이에요.</p>
      </section>
      <section className="stack">
        <h2>출처</h2>
        <ul className="stack small" style={{ margin: 0, paddingLeft: 18, gap: 6, color: 'var(--text-2)' }}>
          <li>인명용 한자·음·획수: Unicode Unihan Database</li>
          <li>한자 훈음: libhangul 한자 사전</li>
          <li>절기 계산: astronomy-engine · 음력: 한국천문연구원 데이터</li>
          <li>표준시 이력: IANA 시간대 데이터베이스</li>
          <li>글꼴: Pretendard (SIL OFL)</li>
        </ul>
      </section>
      <section className="stack">
        <h2>알아 두세요</h2>
        <ul className="stack small" style={{ margin: 0, paddingLeft: 18, gap: 6, color: 'var(--text-2)' }}>
          <li>모든 계산은 이 기기 안에서 하고, 어디에도 보내지 않아요.</li>
          <li>같은 정보를 넣으면 언제나 같은 결과가 나와요.</li>
          <li>2024년에 추가된 인명용 한자는 아직 반영되지 않았어요.</li>
          <li>전통 성명학에 따른 참고 정보예요. 출생신고 전 대법원 인명용 한자를 확인하세요.</li>
        </ul>
      </section>
      <Link className="btn btn-primary btn-block" to="/name">
        이름 짓기 시작
      </Link>
    </main>
  );
}
