# 아이담 (Aidam) — 아이의 이름에 의미를 담다

태어난 순간으로 **만세력(사주팔자)을 먼저 세우고**, 무엇이 부족하고 무엇이 넘치는지 풀어 준 다음, 그 기운을 채우는 **아기 이름을 지어 주는** 웹사이트입니다. 쌍둥이·세쌍둥이는 아이별 사주에 맞춰 이름 세트로 추천합니다.

- 정통 성명학 4대 요소: 사주·용희신, 자원오행, 소리(음령)오행, 81수리 (+ 음양, 뜻·발음)
- 성은 한글로 쓰면 같은 소리 한자를 **뜻·획수**와 함께 골라요 (예: 정 → 鄭 나라 정 / 丁 고무래 정)
- 생년월일·시각은 **숫자로 바로 입력**하거나 달력·목록에서 고르기
- **새 이름 추천** 또는 **정한 이름 풀어보기**, 쌍둥이는 **세트로 / 아이마다 따로**
- 결과는 **총평 → 항목별 한 줄 → 눌러서 자세히**, 아쉬운 항목은 **더 좋게 바꾸는 옵션** 제공
- 이름마다 **작명가의 한마디**, **사주에서 채워 주는 것 / 좋은 점 / 아쉬운 점**, **점수표**
- 기준마다 **무엇이 있어서/없어서 좋은지, 왜 아쉬운지** 일상어로 풀이
- Google·카카오로 로그인하면: **첫 분석 1회 무료**, **저장한 이름**·**검색 기록**, 설정(켜고 끄기)
- 로그인 없이도 이름 짓기 가능(결과는 저장되지 않음)
- 같은 입력이면 언제나 같은 결과(무작위 없음). 만세력 계산 규칙과 검증은 [docs/manse-algorithm.md](./docs/manse-algorithm.md)
- AI·유료 API를 쓰지 않아요. 계산은 모두 이용자 브라우저 안에서 해요

Made by makerskim

> 전통 성명학 이론에 따른 참고 정보이며 과학적으로 검증된 예측이 아닙니다. 출생신고 전 대법원 인명용 한자를 확인하세요.

---

## 사이트 올리기와 설정

사이트와 서버는 Cloudflare Workers + D1(무료)로 한 주소에서 나갑니다. 로그인(Google·카카오), 출시 전 잠금, 첫 1회 무료 뒤 1회 990원, 결제 뼈대, 관리자 번호가 들어 있습니다.

- **처음부터 순서대로 하는 설정 안내: [docs/setup.md](docs/setup.md)**
- 관리자용 내 컴퓨터 Claude Code 연결: [docs/claude-bridge.md](docs/claude-bridge.md)

## 개발자용

### 준비물

- Node.js 20 이상 (22 권장)
- pnpm 10 (`corepack enable`)

### 명령

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm check
```

`pnpm check`는 린트 → 타입 검사 → 엔진 테스트 → 빌드 → 초기 JS 용량 예산(gzip 250KB)을 순서대로 확인합니다.

### 구조

```
packages/engine/   순수 TypeScript 성명학 엔진 (DOM 의존 없음, Vitest 테스트 178개)
  src/calendar/    율리우스일, 서울 표준시·서머타임 이력, 절기(astronomy-engine), 음력, 출생지 경도
  src/saju/        사주팔자, 지장간, 오행 세력, 신강약, 용희신(억부+조후), 합충, 12시진 다수결
  src/hangul/      자모 분해, 두음법칙, 발음 변화 추정
  src/name/        원획, 자원오행, 4격·81수리, 수리오행·음양, 음령오행, 소리음양, 성씨, 안전 검사
  src/score/       100점 채점(자원30·수리25·음령20·음양10·실용15)
  src/recommend/   결정적 이름 추천, 같은 음 더 좋은 한자 제안
  src/siblings/    다둥이 궁합과 세트 추천
apps/web/          React 18 + Vite 웹앱 (엔진은 Web Worker)
apps/worker/       서버: Cloudflare Workers + D1 (로그인·잠금·분석 열쇠·결제·저장한 이름)
tools/build-data/  원천 데이터 → 엔진용 JSON 생성 스크립트
data-sources/      원천 데이터 사본 (출처·라이선스는 NOTICE.md)
docs/superpowers/  설계서(spec)와 구현 계획(plan)
```

### 데이터 다시 만들기

```bash
pnpm data:build
```

`data-sources/`의 사본으로 `packages/engine/src/data/*.json`을 다시 만듭니다. 원천에서 새로 뽑는 방법은 `tools/build-data/extract-sources.mjs` 맨 위 주석에 있습니다. 데이터가 바뀌면 `DATA_VERSION`(해시)이 바뀌어 결과에 표시됩니다.

### 알고리즘이 바뀔 때

`packages/engine/src/version.ts`의 `ENGINE_VERSION`을 올려 주세요. 결과 화면과 공유 링크에 버전이 표시되어, 예전 결과와 다른 이유를 알 수 있습니다.

## 라이선스와 출처

데이터 출처와 라이선스는 [NOTICE.md](./NOTICE.md)를 보세요. 글꼴: 고운바탕(SIL Open Font License 1.1).
