/** Worker 설정. 값은 wrangler.toml [vars]와 비밀값(wrangler secret)에서 온다. */
export interface Env {
  /** 계정·열쇠·주문·저장한 이름 */
  DB: D1Database;
  /** 사이트 파일(apps/web/dist) */
  ASSETS: Fetcher;
  /** closed: 출시 전(관리자만 들어온다) / open: 모두에게 열림 */
  SITE_MODE: string;
  /** 분석 1회 가격(원) */
  PRICE_KRW: string;
  /** 결제창에 보이는 상품 이름 */
  ORDER_NAME: string;
  /** 관리자 번호를 한 번 넣으면 결제 없이 쓸 수 있는 시간 */
  ADMIN_PASS_HOURS: string;
  /** 비밀값: 관리자 Google 계정 이메일(쉼표로 여러 개) */
  ADMIN_EMAILS?: string;
  /** 비밀값: Google 로그인 */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** 비밀값: 카카오 로그인(REST API 키, 보안 코드는 선택) */
  KAKAO_REST_KEY?: string;
  KAKAO_CLIENT_SECRET?: string;
  /** 비밀값: 토스페이먼츠 시크릿 키. test_로 시작하면 시험 결제, live_면 실제 결제, 없으면 결제 준비 중 */
  TOSS_SECRET_KEY?: string;
  /** 비밀값: 관리자 번호를 휴대폰 알림으로 받을 ntfy 주제 이름 */
  NTFY_TOPIC?: string;
  /** 비밀값: 관리자 번호를 문자로 받을 때(솔라피) */
  SOLAPI_API_KEY?: string;
  SOLAPI_API_SECRET?: string;
  SMS_FROM?: string;
  ADMIN_PHONE?: string;
  /** 내 컴퓨터에서 시험할 때만: 시험용 로그인과 가짜 토스·알림 주소. localhost에서만 듣는다 */
  DEV_LOGIN?: string;
  TOSS_API_BASE?: string;
  NTFY_BASE?: string;
}

export const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const plan = (env: Env) => ({
  amount: Math.round(num(env.PRICE_KRW, 990)),
  orderName: env.ORDER_NAME || '아이담 이름 분석 1회',
});

/** 결제 상태: off(준비 중, 사업자 등록 전) / test(시험 결제) / live(실제 결제) */
export function payMode(env: Env): 'off' | 'test' | 'live' {
  const k = env.TOSS_SECRET_KEY ?? '';
  return k.startsWith('live_') ? 'live' : k.startsWith('test_') ? 'test' : 'off';
}

export const siteOpen = (env: Env) => env.SITE_MODE === 'open';

/** 내 컴퓨터(localhost)에서 돌리는 중인지. 시험용 기능은 여기서만 켜진다 */
export const isLocal = (req: Request) => ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname);

export function isAdminEmail(env: Env, email: string | null, verified: boolean): boolean {
  if (!email || !verified) return false;
  return (env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
