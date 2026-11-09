/**
 * 토스페이먼츠 결제.
 * 1) /api/pay/order: 서버가 주문번호와 금액을 정해 저장한다(금액을 브라우저가 정하지 못하게).
 * 2) 브라우저가 토스 결제창을 띄우고, 성공하면 paymentKey·orderId·amount를 받는다.
 * 3) /api/pay/confirm: 저장한 주문과 금액이 맞는지 보고, 토스에 승인 요청을 보낸 뒤 이용권을 늘린다.
 */
import type { AuthUser } from './auth';
import { plan, type Env } from './env';

export interface Entitlement {
  /** 이용권 끝나는 시각(ms) */
  until: number;
  orders: string[];
}

interface Order {
  uid: string;
  amount: number;
  days: number;
  orderName: string;
  createdAt: number;
  status: 'ready' | 'done';
}

const DAY = 86_400_000;
const TOSS_CONFIRM = 'https://api.tosspayments.com/v1/payments/confirm';

export async function getEntitlement(env: Env, uid: string): Promise<Entitlement | null> {
  return (await env.KV.get<Entitlement>(`ent:${uid}`, 'json')) ?? null;
}

export function isActive(ent: Entitlement | null, now = Date.now()): boolean {
  return !!ent && ent.until > now;
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

export async function createOrder(env: Env, user: AuthUser) {
  const p = plan(env);
  const orderId = `aidam_${Date.now().toString(36)}_${randomId()}`;
  const order: Order = { uid: user.uid, amount: p.amount, days: p.days, orderName: p.orderName, createdAt: Date.now(), status: 'ready' };
  await env.KV.put(`order:${orderId}`, JSON.stringify(order), { expirationTtl: 60 * 60 * 24 });
  return { orderId, amount: p.amount, orderName: p.orderName, days: p.days, customerKey: await customerKey(user.uid) };
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

export async function confirmPayment(
  env: Env,
  user: AuthUser,
  body: { paymentKey?: unknown; orderId?: unknown; amount?: unknown },
): Promise<Entitlement> {
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) throw new PayError('BAD_REQUEST', '결제 정보가 빠졌어요.');
  if (!env.TOSS_SECRET_KEY) throw new PayError('PAY_NOT_READY', '결제 설정이 아직 끝나지 않았어요.', 503);

  const key = `order:${orderId}`;
  const order = await env.KV.get<Order>(key, 'json');
  if (!order) throw new PayError('NO_ORDER', '주문을 찾지 못했어요. 다시 결제해 주세요.', 404);
  if (order.uid !== user.uid) throw new PayError('NOT_YOUR_ORDER', '다른 계정의 주문이에요.', 403);
  if (order.amount !== amount) throw new PayError('AMOUNT_MISMATCH', '결제 금액이 주문과 달라요.');
  // 같은 주문을 두 번 승인하지 않는다(새로고침 등)
  if (order.status === 'done') {
    const ent = await getEntitlement(env, user.uid);
    if (ent) return ent;
  }

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

  const now = Date.now();
  const prev = await getEntitlement(env, user.uid);
  const base = prev && prev.until > now ? prev.until : now;
  const ent: Entitlement = { until: base + order.days * DAY, orders: [...(prev?.orders ?? []), orderId].slice(-50) };
  await env.KV.put(`ent:${user.uid}`, JSON.stringify(ent));
  await env.KV.put(key, JSON.stringify({ ...order, status: 'done' }), { expirationTtl: 60 * 60 * 24 * 7 });
  // 정산·환불 확인용 기록
  await env.KV.put(
    `pay:${orderId}`,
    JSON.stringify({ uid: user.uid, amount: order.amount, paymentKey, method: data.method ?? null, approvedAt: data.approvedAt ?? null }),
  );
  return ent;
}
