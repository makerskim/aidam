# 결제·관리자·AI 풀이 설정 안내

코드는 다 들어가 있어요. 아래는 계정을 만들고 키를 넣는 일이라 직접 해 주셔야 해요. 순서대로 하면 30분 정도 걸려요.

## 어떻게 동작하나요

| 누가 | 볼 수 있는 것 |
|---|---|
| 로그인 안 함 / 이용권 없음 | 추천 이름 **3개**, 총평, 만세력 |
| 이용권 있음(결제) | 추천 이름 전체, 항목별 자세한 풀이·고쳐 보기, 더 좋은 한자, **AI 풀이**(하루 20번) |
| 관리자(makerskim@gmail.com) | 결제 없이 전부, AI 풀이 하루 100번 |

- 서버는 **Cloudflare Workers(무료)** 하나로, 사이트와 서버를 같은 주소에서 함께 내보내요.
- 결제는 **토스페이먼츠**, AI 풀이는 **Claude API**(서버에만 키를 둠)를 써요.
- 가격·기간·하루 한도는 `apps/worker/wrangler.toml`의 `[vars]`에서 바꿔요(기본 9,900원 / 30일).

### Claude 구독(Pro·Max) 로그인으로 AI를 돌릴 수는 없어요
Anthropic 약관상 다른 사람이 쓰는 사이트에 Claude.ai 로그인(구독 OAuth)을 붙이거나, 구독 계정으로 사용자 요청을 대신 처리하는 것은 금지예요. 그래서 **API 키를 서버에만** 두는 방식으로 만들었어요. 로그인 자체는 지금처럼 Google 로그인(OAuth)이에요.

## 1. 저장소를 비공개로 바꾸기
GitHub → aidam 저장소 → **Settings → General → 맨 아래 Danger Zone → Change visibility → Make private**

- 비공개가 되면 GitHub Pages 배포(`pages.yml`)는 자동으로 건너뛰어요.
- 예전 GitHub Pages 주소(makerskim.github.io/aidam)는 결제 없이 열린 판이 남아 있으니 **Settings → Pages → Unpublish site** 로 내려 주세요.

## 2. Cloudflare 계정과 키
1. https://dash.cloudflare.com 가입(무료).
2. 오른쪽 위 계정 메뉴 → **Account home**에서 **Account ID**를 복사해요.
3. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" 템플릿**으로 토큰을 만들어 복사해요.
4. Workers 처음 쓰면 **Workers & Pages** 화면에서 `*.workers.dev` 하위 도메인 이름을 정해요(예: makerskim → 사이트 주소 `https://aidam.makerskim.workers.dev`).

## 3. 토스페이먼츠
1. https://developers.tosspayments.com 가입 → **API 키** 메뉴.
2. 처음에는 **테스트 키**(`test_ck_…`, `test_sk_…`)로 실제 돈이 나가지 않게 시험해요.
3. 실제 결제(라이브 키)는 **사업자등록 + 토스 가맹 심사**가 필요해요. 심사 때 사이트에 사업자 정보와 환불 정책이 보여야 하니 `apps/web/src/business.ts`에 상호·대표자·사업자등록번호·통신판매업 신고번호·연락처를 채워 주세요(채우면 사이트 아래에 보여요).
4. 결제 화면의 **환불 안내 문구**(`apps/web/src/pages/Pay.tsx`)는 초안이에요. 실제 정책에 맞게 고쳐 주세요.

## 4. Claude API 키
1. https://console.anthropic.com 가입 → **Billing**에 결제 수단 등록(선불 크레딧).
2. **Settings → Limits**에서 월 사용 한도를 꼭 걸어 두세요(예: $30).
3. **API Keys → Create Key**로 키를 만들어 복사해요.
4. 비용 감각: AI 풀이 1번에 약 50~100원. 같은 이름·같은 질문은 30일 동안 저장해 다시 쓰고(비용 0), 사이트 전체 하루 200번까지만 받아요.

## 5. GitHub에 키 넣기
GitHub → aidam 저장소 → **Settings → Secrets and variables → Actions**

| 종류 | 이름 | 값 |
|---|---|---|
| Variables | `CLOUDFLARE_ACCOUNT_ID` | 2-2에서 복사한 Account ID |
| Variables | `TOSS_CLIENT_KEY` | 토스 **클라이언트 키**(`test_ck_…`) |
| Secrets | `CLOUDFLARE_API_TOKEN` | 2-3에서 만든 토큰 |
| Secrets | `TOSS_SECRET_KEY` | 토스 **시크릿 키**(`test_sk_…`) |
| Secrets | `ANTHROPIC_API_KEY` | Claude API 키 |

키는 채팅이나 코드에 붙여 넣지 말고 여기에만 넣어 주세요.

## 6. 배포
**Actions → Cloudflare → Run workflow**(또는 main에 올리면 자동). 처음 실행할 때 저장소(KV)를 알아서 만들고, 사이트와 서버를 배포하고, 키를 서버에 올려요.

## 7. Google 로그인 허용 주소 추가
Firebase 콘솔 → aidam-9aba3 → **Authentication → Settings → Authorized domains → Add domain** → `aidam.<하위도메인>.workers.dev`

## 8. 확인
1. 로그아웃 상태로 이름 추천 → 3개만 보이고 이용권 안내가 나오는지.
2. makerskim@gmail.com으로 로그인 → 계정 메뉴에 **관리자** 표시, 전체 목록, AI 풀이가 되는지.
3. 다른 Google 계정으로 로그인 → 이용권 결제(테스트 카드) → 전체가 열리는지.

## 알아 둘 점
- 작명 계산은 빠르게 보여 주려고 **이용자 브라우저 안에서** 돌아가요. 그래서 잠금은 화면에서 막는 방식이고, 개발 지식이 있는 사람이 코드를 뜯어보면 우회할 수 있어요. 저장소를 비공개로 하고 코드를 압축해 배포해서 어렵게는 만들었어요. AI 풀이와 결제 확인은 서버에서 하므로 우회할 수 없어요.
- 완전히 막으려면 계산을 서버로 옮겨야 하고, Workers 유료 요금제(월 약 $5)가 필요해요.
- 환불은 토스페이먼츠 상점관리자에서 결제를 취소하면 돼요. 이용권 기간은 자동으로 줄지 않으니, 필요하면 Cloudflare 대시보드 → Workers KV → `ent:<사용자 uid>` 값을 지워 주세요.
