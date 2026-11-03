# 아이담 (Aidam) — 아이의 이름에 의미를 담다

태어난 순간으로 **만세력(사주팔자)을 먼저 세우고**, 무엇이 부족하고 무엇이 넘치는지 풀어 준 다음, 그 기운을 채우는 **아기 이름을 지어 주는** 웹사이트입니다. 쌍둥이·세쌍둥이는 아이별 사주에 맞춰 이름 세트로 추천합니다.

- 정통 성명학 4대 요소: 사주·용희신, 자원오행, 소리(음령)오행, 81수리 (+ 음양, 뜻·발음)
- 이름마다 **작명가의 한마디**, **사주에서 채워 주는 것 / 좋은 점 / 아쉬운 점**, **점수표**
- 지은 이름 풀어보기(같은 소리의 더 좋은 한자 제안)
- **내 이름함**: 풀어 본 이름은 자동 기록, 북마크로 따로 모아 비교. Google 로그인하면 계정에 저장
- 같은 입력이면 언제나 같은 결과(무작위 없음)

만든 사람: makerskim

> 전통 성명학 이론에 따른 참고 정보이며 과학적으로 검증된 예측이 아닙니다. 출생신고 전 대법원 인명용 한자를 확인하세요.

---

## 사이트 공개하기 (Netlify, 무료)

코딩을 몰라도 아래 순서대로 누르기만 하면 됩니다. 처음 한 번만 하면 이후에는 GitHub에 수정이 올라올 때마다 사이트가 자동으로 바뀝니다.

1. **https://app.netlify.com/signup** 에 들어가 **GitHub** 버튼으로 가입합니다(GitHub 계정으로 로그인).
2. 로그인 후 첫 화면에서 **Add new site**(또는 **Add new project**) → **Import an existing project**를 누릅니다.
3. **Deploy with GitHub**를 누르고, 권한을 묻는 창이 뜨면 **Authorize**를 누릅니다.
4. 저장소 목록에서 **aidam**을 고릅니다. (안 보이면 아래쪽 *Configure the Netlify app on GitHub*를 눌러 aidam 저장소를 허용해 주세요.)
5. 설정 화면이 나오면 **아무것도 바꾸지 말고** 맨 아래 **Deploy aidam**(또는 **Deploy site**)를 누릅니다. 빌드 설정은 저장소의 `netlify.toml` 파일에 이미 들어 있습니다.
6. 2~3분 기다리면 `https://무작위이름.netlify.app` 주소가 생깁니다. 이 주소가 사이트입니다.
7. 주소를 바꾸고 싶으면 **Site configuration → Change site name**에서 `aidam` 등으로 바꿀 수 있습니다(이미 쓰는 사람이 없을 때).

빌드가 실패하면 Netlify의 **Deploys** 화면에서 빨간 항목을 눌러 로그를 복사해 Claude에게 보여 주세요.

---

---

## Google 로그인 켜기 (Firebase, 무료)

로그인 없이도 이 기기에 기록·북마크가 저장됩니다. 계정에 저장하려면 아래를 한 번만 하면 됩니다.

1. **https://console.firebase.google.com** 에 Google 계정으로 들어가 **프로젝트 추가** → 이름 `aidam` → (Google 애널리틱스는 꺼도 됨) → 만들기.
2. 왼쪽 **빌드 → Authentication → 시작하기 → Google** 을 눌러 **사용 설정**하고 저장합니다.
3. 같은 Authentication 화면의 **설정 → 승인된 도메인**에 Netlify 주소(예: `aidam.netlify.app`)를 **도메인 추가**합니다.
4. 왼쪽 **빌드 → Firestore Database → 데이터베이스 만들기** → 위치 `asia-northeast3 (서울)` → **프로덕션 모드**로 만듭니다.
5. Firestore의 **규칙** 탭에 저장소의 `firestore.rules` 내용을 그대로 붙여 넣고 **게시**합니다. (각자 자기 기록만 읽고 쓸 수 있게 막는 규칙)
6. 톱니바퀴 **프로젝트 설정 → 일반 → 내 앱 → 웹(</>)** 으로 앱을 등록하면 `firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ..., appId: ... }` 가 나옵니다. 이 네 값을 Claude에게 보내 주면 `apps/web/src/firebase-config.ts`에 넣어 드립니다. (이 값들은 공개돼도 되는 값이고, 데이터는 5번 규칙으로 보호됩니다)

---

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
packages/engine/   순수 TypeScript 성명학 엔진 (DOM 의존 없음, Vitest 테스트 150여 개)
  src/calendar/    율리우스일, 서울 표준시·서머타임 이력, 절기(astronomy-engine), 음력, 출생지 경도
  src/saju/        사주팔자, 지장간, 오행 세력, 신강약, 용희신(억부+조후), 합충, 12시진 다수결
  src/hangul/      자모 분해, 두음법칙, 발음 변화 추정
  src/name/        원획, 자원오행, 4격·81수리, 수리오행·음양, 음령오행, 소리음양, 성씨, 안전 검사
  src/score/       100점 채점(자원30·수리25·음령20·음양10·실용15)
  src/recommend/   결정적 이름 추천, 같은 음 더 좋은 한자 제안
  src/siblings/    다둥이 궁합과 세트 추천
apps/web/          React 18 + Vite 웹앱 (엔진은 Web Worker, 로그인은 Firebase 지연 로드)
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
