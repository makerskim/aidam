# 결제·관리자 설정 안내

코드는 다 들어가 있어요. 아래는 계정을 만들고 키를 넣는 일이라 직접 해 주셔야 해요. 순서대로 하면 30분 정도 걸려요.

## 어떻게 동작하나요

| 누가 | 볼 수 있는 것 | 비용 |
|---|---|---|
| 로그인 안 함 / 이용권 없음 | 추천 이름 **3개**, 총평, 만세력 | 무료 |
| 일반 사용자(결제) | 추천 이름 전체, 항목별 자세한 풀이·고쳐 보기, 더 좋은 한자, AI 풀이 요청 글 | **1회 990원** |
| 관리자 | 결제 없이 전부 + 내 Claude Code(구독)로 AI 풀이 | 0원 |

- **1회 = 결제 후 24시간**이에요. 그 시간 동안 이름을 몇 번이든 다시 뽑고 풀이를 볼 수 있어요. 자동으로 다시 결제되지 않아요.
- 가격과 시간은 `apps/worker/wrangler.toml`의 `PRICE_KRW`, `PASS_HOURS`에서 바꿔요.
- 결제는 **토스페이먼츠** 결제창을 써요. 카드와 함께 **카카오페이·네이버페이·토스페이** 같은 간편결제를 결제창 안에서 고를 수 있어요(토스 계약에 포함된 수단만 보여요). 카카오페이를 따로 붙일 필요가 없어요.
- 서버는 **Cloudflare Workers(무료)** 하나로, 사이트와 서버를 같은 주소에서 함께 내보내요.

### AI 풀이는 API 없이 돌아가요
- 일반 사용자: 풀이 화면의 **'내 Claude 계정으로 풀이 받기'** — 풀이 요청 글이 복사되고 claude.ai가 열려요. 각자 자기 Claude에 붙여 넣어 받아요. 사이트 비용 0원.
- 관리자: 내 컴퓨터에 로그인된 Claude Code(구독)로 화면에서 바로 받아요. 방법은 `docs/claude-bridge.md`.
- Claude 구독 로그인을 서버에 넣어 다른 사용자들의 요청을 대신 처리하는 것은 Anthropic 약관상 금지라 넣지 않았어요.

## 무료로 쓰지 못하게 막은 것

| 막은 것 | 방법 |
|---|---|
| 결제 금액을 바꿔 결제 | 금액은 서버가 정하고, 승인할 때 주문자·금액을 다시 대조해요 |
| 서버 답을 가짜로 바꿔 잠금 풀기 | 서버가 비밀 키로 **서명**한 이용권만 사이트가 인정해요. 비밀 키는 서버에만 있어요 |
| 관리자인 척하기 | 관리자 이메일은 저장소가 아니라 **비밀값**에 있고, Google이 인증한 이메일만 인정해요 |
| 소스 코드를 보고 고치기 | 저장소를 **비공개**로 바꾸고(아래 1번), 배포본은 압축된 코드만 나가요 |
| 결제 없는 옛 주소 쓰기 | 예전 GitHub Pages 주소를 내려요(아래 1번) |

**남는 한계**: 이름 계산은 빠르게 보여 주려고 이용자 브라우저 안에서 돌아가요. 그래서 개발 지식이 있는 사람이 압축된 코드를 직접 뜯어고치면 잠금 화면을 건너뛸 수 있어요. 이것까지 막으려면 계산을 서버로 옮겨야 하고, Cloudflare Workers 유료 요금제(월 약 $5)가 필요해요. 원하면 그렇게 바꿀 수 있어요.

## 1. 저장소를 비공개로 바꾸고 옛 주소 내리기
1. GitHub → aidam 저장소 → **Settings → Pages → Unpublish site** (결제 없이 열린 옛 주소 makerskim.github.io/aidam 를 내려요)
2. **Settings → General → 맨 아래 Danger Zone → Change visibility → Make private**

- 순서가 중요해요. 2~6번(Cloudflare 배포)을 먼저 끝내고 새 주소가 열리는 것을 확인한 뒤에 하세요. 먼저 내리면 그동안 사이트가 없어요.
- 비공개가 되면 GitHub Pages 배포(`pages.yml`)는 자동으로 건너뛰어요.
- 지금까지 공개됐던 코드 기록에는 관리자 이메일이 남아 있어요. 비공개로 바꾸면 더 보이지 않아요.

## 2. Cloudflare 계정과 키
1. https://dash.cloudflare.com 가입(무료).
2. 오른쪽 위 계정 메뉴 → **Account home**에서 **Account ID**를 복사해요.
3. **My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" 템플릿**으로 토큰을 만들어 복사해요.
4. Workers 처음 쓰면 **Workers & Pages** 화면에서 `*.workers.dev` 하위 도메인 이름을 정해요(예: 이름이 abc면 사이트 주소는 `https://aidam.abc.workers.dev`).

## 3. 토스페이먼츠
1. https://developers.tosspayments.com 가입 → **API 키** 메뉴.
2. 처음에는 **테스트 키**(`test_ck_…`, `test_sk_…`)로 실제 돈이 나가지 않게 시험해요.
3. 실제 결제(라이브 키)는 **사업자등록 + 토스 가맹 심사**가 필요해요. 카카오페이 등 간편결제는 심사 때 함께 신청해요.
4. 심사 때 사이트에 사업자 정보와 환불 정책이 보여야 하니 `apps/web/src/business.ts`에 상호·대표자·사업자등록번호·통신판매업 신고번호·연락처를 채워 주세요(채우면 사이트 아래에 보여요).
5. 결제 화면의 **환불 안내 문구**(`apps/web/src/pages/Pay.tsx`)는 초안이에요. 실제 정책에 맞게 고쳐 주세요.

## 4. GitHub에 키 넣기
GitHub → aidam 저장소 → **Settings → Secrets and variables → Actions**

| 종류 | 이름 | 값 |
|---|---|---|
| Variables | `CLOUDFLARE_ACCOUNT_ID` | 2-2에서 복사한 Account ID |
| Variables | `TOSS_CLIENT_KEY` | 토스 **클라이언트 키**(`test_ck_…`) |
| Secrets | `CLOUDFLARE_API_TOKEN` | 2-3에서 만든 토큰 |
| Secrets | `ADMIN_EMAILS` | 관리자로 쓸 Google 계정 이메일(여러 명이면 쉼표로) |
| Secrets | `TOSS_SECRET_KEY` | 토스 **시크릿 키**(`test_sk_…`) |

키는 채팅이나 코드에 붙여 넣지 말고 여기에만 넣어 주세요. (Claude API 키 `ANTHROPIC_API_KEY`는 넣지 않아요. 넣으면 서버가 API로 AI 풀이를 하고 쓴 만큼 비용이 나와요.)

## 5. 배포
**Actions → Cloudflare → Run workflow**(또는 main에 올리면 자동). 처음 실행할 때 저장소(KV)와 이용권 서명 키를 알아서 만들고, 사이트와 서버를 배포하고, 키를 서버에 올려요.

## 6. Google 로그인 허용 주소 추가
Firebase 콘솔 → aidam-9aba3 → **Authentication → Settings → Authorized domains → Add domain** → `aidam.<하위도메인>.workers.dev`

## 7. 확인
1. 로그아웃 상태로 이름 추천 → 3개만 보이고 '1회 이용권 990원' 안내가 나오는지.
2. 관리자 계정으로 로그인 → 계정 메뉴에 **관리자** 표시, 전체 목록이 열리는지.
3. 다른 Google 계정으로 로그인 → 결제(테스트 카드) → 전체가 열리고 24시간 뒤 다시 잠기는지.
4. 다 되면 1번(옛 주소 내리기 + 비공개)을 해요.

## 알아 둘 점
- 환불은 토스페이먼츠 상점관리자에서 결제를 취소하면 돼요. 이용권 시간은 자동으로 줄지 않으니, 필요하면 Cloudflare 대시보드 → Workers KV → `ent:<사용자 uid>` 값을 지워 주세요.
- 이 배포 설정은 Cloudflare 계정이 없어 실제로 돌려 보지는 못했어요. 처음 실행에서 막히면 Actions 화면의 오류 글을 그대로 알려 주세요.
