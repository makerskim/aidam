import { Link } from 'react-router-dom';
import { Disclaimer } from '../components/ui';

const PILLARS = [
  { mark: '命', el: 'fire', title: '사주와 용희신', text: '태어난 연·월·일·시로 사주팔자를 세우고, 아기에게 가장 이롭고 부족한 기운(용신·희신)을 찾아요.' },
  { mark: '音', el: 'water', title: '음령오행', text: '이름 첫소리의 오행이 성 → 이름 순으로 서로 살려 주는지, 부르기 부드러운지 봐요.' },
  { mark: '字', el: 'wood', title: '자원오행', text: '한자 자체의 오행이 사주에 부족한 기운을 실제로 채워 주는지 따져요.' },
  { mark: '數', el: 'earth', title: '수리(81수)', text: '성과 이름 획수로 초년·청년·장년·말년 네 운이 모두 길한 수인지 확인해요.' },
];

export function Home() {
  return (
    <main className="stack-lg">
      <section className="hero">
        <h1>
          우리 아기 이름,
          <br />
          사주에 맞춰 함께 지어요
        </h1>
        <p className="lead">정통 성명학의 네 가지 기준으로 이름을 추천하고, 직접 지은 이름도 같은 기준으로 풀어 드려요.</p>
      </section>

      <section aria-label="시작하기">
        <Link className="entry" to="/name">
          <span className="mark el-fire">名</span>
          <span>
            <b>이름 추천받기</b>
            <span>생년월일시로 사주를 보고 어울리는 이름을 찾아요</span>
          </span>
        </Link>
        <Link className="entry" to="/self">
          <span className="mark el-wood">解</span>
          <span>
            <b>지은 이름 풀어보기</b>
            <span>마음에 둔 이름을 점수와 근거로 확인해요</span>
          </span>
        </Link>
        <Link className="entry" to="/siblings">
          <span className="mark el-water">雙</span>
          <span>
            <b>쌍둥이·형제자매 이름</b>
            <span>아이들 이름을 한 세트로 어울리게 지어요</span>
          </span>
        </Link>
      </section>

      <section className="stack">
        <h2>네 가지 기준으로 봐요</h2>
        <ul className="pillar-list plain">
          {PILLARS.map((p) => (
            <li key={p.title}>
              <span className={`entry-mark el el-${p.el}`} style={{ width: 44, height: 44, fontSize: 22, borderRadius: 12 }} aria-hidden="true">
                {p.mark}
              </span>
              <span>
                <b>{p.title}</b>
                <p className="small muted">{p.text}</p>
              </span>
            </li>
          ))}
        </ul>
        <p className="small muted">
          학설이 갈리는 부분(발음오행 해례본·운해본, 자시 처리, 출생지 시간 보정 등)은 직접 고를 수 있고, 다른 학설의 결과도 함께 보여 드려요.{' '}
          <Link to="/guide">자세히 보기</Link>
        </p>
      </section>

      <section className="panel-quiet stack">
        <h3>안심하고 쓰세요</h3>
        <ul className="plain stack small">
          <li>생년월일과 이름은 이 기기 안에서만 계산해요. 서버로 보내지 않아요.</li>
          <li>같은 입력이면 언제 열어도 같은 결과가 나와요. 결과마다 분석 코드가 붙어요.</li>
          <li>추천 한자는 대법원 인명용 한자 안에서만 고르고, 뜻이 좋지 않은 글자는 빼요.</li>
        </ul>
      </section>
      <Disclaimer />
    </main>
  );
}
