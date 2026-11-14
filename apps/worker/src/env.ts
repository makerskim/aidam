/** Worker 설정. 값은 wrangler.toml [vars]와 비밀값(wrangler secret)에서 온다. */
export interface Env {
  /** 결제·이용권·AI 캐시 저장소 */
  KV: KVNamespace;
  /** 사이트 파일(apps/web/dist) */
  ASSETS: Fetcher;
  /** Firebase 프로젝트 ID — 로그인 토큰 확인에 쓴다 */
  FIREBASE_PROJECT_ID: string;
  /** 비밀값: 결제 없이 쓰는 관리자 이메일(쉼표로 여러 개) */
  ADMIN_EMAILS?: string;
  /** 이용권 가격(원) */
  PRICE_KRW: string;
  /** 이용권 1회로 쓸 수 있는 시간 */
  PASS_HOURS: string;
  /** 결제창에 보이는 상품 이름 */
  ORDER_NAME: string;
  /** 한 사람이 하루에 받을 수 있는 AI 풀이 수 */
  AI_DAILY_LIMIT: string;
  /** 관리자 하루 AI 풀이 수 */
  AI_ADMIN_DAILY_LIMIT: string;
  /** 사이트 전체 하루 AI 풀이 수(비용 상한) */
  AI_GLOBAL_DAILY_LIMIT: string;
  /** 쓸 Claude 모델 */
  AI_MODEL: string;
  /** 비밀값: 토스페이먼츠 시크릿 키 */
  TOSS_SECRET_KEY?: string;
  /** 비밀값: Claude API 키 */
  ANTHROPIC_API_KEY?: string;
}

export const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function plan(env: Env) {
  return {
    amount: Math.round(num(env.PRICE_KRW, 990)),
    hours: Math.round(num(env.PASS_HOURS, 24)),
    orderName: env.ORDER_NAME || '아이담 1회 이용권',
  };
}

export function isAdminEmail(env: Env, email: string | null, verified: boolean): boolean {
  if (!email || !verified) return false;
  const list = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}
