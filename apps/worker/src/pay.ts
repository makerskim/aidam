/**
 * 토스페이먼츠 결제. 1회 = 분석 1건.
 * 사이트가 분석 입력(성·아이 정보·조건·계산 기준)으로 만든 '열쇠'를 보내면, 결제 뒤 그 열쇠를 계정에 넣는다.
 * 같은 분석은 언제든 다시 볼 수 있고, 입력을 바꾸면 열쇠가 달라져 새로 결제한다.
 * 1) /api/pay/order: 서버가 주문번호와 금액을 정해 열쇠와 함께 저장한다(금액을 브라우저가 정하지 못하게).
 * 2) 브라우저가 토스 결제창을 띄우고, 성공하면 paymentKey·orderId·amount를 받는다.
 * 3) /api/pay/confirm: 저장한 주문과 금액이 맞는지 보고, 토스에 승인 요청을 보낸 뒤 열쇠를 넣는다.
 * 카카오페이·네이버페이 같은 간편결제는 토스 결제창 안에서 고른다(토스 계약에 포함된 경우).
 */
import type { AuthUser } from './auth';
import { plan, type Env } from './env';

interface Order {
  uid: string;
  amount: number;
  key: string;
  orderName: string;
  createdAt: number;
  status: 'ready' | 'done';
}

const TOSS_CONFIRM = 'https://api.tosspayments.com/v1/payments/confirm';
/** 열쇠 모양: r.(아이)-(아이).(조건).(기준) 또는 a.(아이).(이름).(기준) */
const KEY_RE = /^[ra]\.[0-9a-z-]{4,140}\.[0-9a-z]{4,16}\.[0-9a-z]{4,16}$/;
const MAX_KEYS = 500;

/** 계정이 산 열쇠 목록(최근 것이 앞) */
export async function getKeys(env: Env, uid: string): Promise<string[]> {
  return (await env.KV.get<string[]>(`keys:${uid}`, 'json')) ?? [];
}

async function addKey(env: Env, uid: string, key: string): Promise<string[]> {
  const prev = await getKeys(env, uid);
  const keys = [key, ...prev.filter((k) => k !== key)].slice(0, MAX_KEYS);
  await env.KV.put(`keys:${uid}`, JSON.stringify(keys));
  return keys;
}

function randomId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 토스에 넘길 고객 키: uid를 그대로 보내지 않고 해시한다 */
export async function customerKey(uid: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`aidam:${uid}`));
  return 'c_' + [...new Uint8Array(d)].slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class PayError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createOrder(env: Env, user: AuthUser, body: { key?: unknown }) {
  const key = typeof body.key === 'string' ? body.key : '';
  if (!KEY_RE.test(key)) throw new PayError('BAD_KEY', '결제할 분석 정보가 없어요. 결과 화면에서 다시 눌러 주세요.');
  if ((await getKeys(env, user.uid)).includes(key)) throw new PayError('ALREADY_OWNED', '이미 결제한 분석이에요.', 409);
  const p = plan(env);
  const orderId = `aidam_${Date.now().toString(36)}_${randomId()}`;
  const order: Order = { uid: user.uid, amount: p.amount, key, orderName: p.orderName, createdAt: Date.now(), status: 'ready' };
  await env.KV.put(`order:${orderId}`, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 });
  return { orderId, amount: p.amount, orderName: p.orderName, customerKey: await customerKey(user.uid) };
}

/** 결제를 승인하고, 열쇠가 들어간 뒤의 목록을 돌려준다 */
export async function confirmPayment(
  env: Env,
  user: AuthUser,
  body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown },
): Promise<{ keys: string[]; key: string }> {
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) throw new PayError('BAD_REQUEST', '결제 정보가 빠졌어요.');
  if (!env.TOSS_SECRET_KEY) throw new PayError('PAY_NOT_READY', '결제 설정이 아직 끝나지 않았어요.', 503);

  const okey = `order:${orderId}`;
  const order = await env.KV.get<Order>(okey, 'json');
  if (!order) throw new PayError('NO_ORDER', '주문을 찾지 못했어요. 다시 결제해 주세요.', 404);
  if (order.uid !== user.uid) throw new PayError('NOT_YOUR_ORDER', '다른 계정의 주문이에요.', 403);
  if (order.amount !== amount) throw new PayError('AMOUNT_MISMATCH', '결제 금액이 주문과 달라요.');
  // 같은 주문을 두 번 승인하지 않는다(새로고침 등)
  if (order.status === 'done') return { keys: await addKey(env, user.uid, order.key), key: order.key };

  const res = await fetch(TOSS_CONFIRM, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.TOSS_SECRET_KEY}:`),
      'Content-Type': 'application/json',
      'Idempotency-Key': orderId,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    totalAmount?: number;
    orderId?: string;
    method?: string;
    approvedAt?: string;
    code?: string;
    message?: string;
  };
  if (!res.ok) throw new PayError(data.code ?? 'TOSS_ERROR', data.message ?? '결제 승인에 실패했어요.', 402);
  if (data.status !== 'DONE' || data.totalAmount !== order.amount || data.orderId !== orderId) {
    throw new PayError('NOT_DONE', '결제가 끝나지 않았어요.', 402);
  }

  const keys = await addKey(env, user.uid, order.key);
  await env.KV.put(okey, JSON.stringify({ ...order, status: 'done' }), { expirationTtl: 60 * 60 * 24 * 7 });
  // 정산·환불 확인용 기록
  await env.KV.put(
    `pay:${orderId}`,
    JSON.stringify({ uid: user.uid, amount: order.amount, key: order.key, paymentKey, method: data.method ?? null, approvedAt: data.approvedAt ?? null }),
  );
  return { keys, key: order.key };
}
