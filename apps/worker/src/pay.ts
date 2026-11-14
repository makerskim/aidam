/**
 * 토스페이먼츠 결제(뼈대).
 * - 토스 시크릿 키가 없으면 '준비 중'(off): 주문을 받지 않는다. 사업자 등록 전 상태.
 * - test_ 키를 넣으면 시험 결제(실제 돈이 나가지 않음), live_ 키를 넣으면 실제 결제. 코드는 같다.
 * 1) /api/pay/order: 서버가 주문번호와 금액을 정해 열쇠와 함께 저장한다(금액을 브라우저가 정하지 못하게).
 * 2) 브라우저가 토스 결제창을 띄운다. 카드와 카카오페이 등 간편결제를 결제창에서 고른다.
 * 3) /api/pay/confirm: 저장한 주문과 금액·주문자가 맞는지 보고, 토스에 승인을 요청한 뒤 열쇠를 넣는다.
 */
import { isLocal, payMode, plan, type Env } from './env';
import { HttpError, hex, limit, randomToken } from './http';
import { checkKey, hasKey } from './tickets';

interface Order {
  id: string;
  user_id: string;
  key: string;
  amount: number;
  status: string;
}

/** 토스에 넘길 고객 키: 계정 번호를 그대로 보내지 않고 해시한다 */
async function customerKey(userId: string): Promise<string> {
  return 'c_' + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`aidam:${userId}`))).slice(0, 32);
}

export async function createOrder(env: Env, userId: string, rawKey: unknown) {
  if (payMode(env) === 'off') throw new HttpError('PAY_NOT_READY', '결제는 준비 중이에요.', 503);
  const key = checkKey(rawKey);
  await limit(env.DB, `order:${userId}`, 30, 3600);
  if (await hasKey(env.DB, userId, key)) throw new HttpError('ALREADY_OWNED', '이미 볼 수 있는 분석이에요.', 409);
  const p = plan(env);
  const id = `aidam_${Date.now().toString(36)}_${randomToken(9).replace(/[^0-9A-Za-z]/g, '0')}`;
  await env.DB.prepare("INSERT INTO orders (id, user_id, key, amount, status, created_at) VALUES (?, ?, ?, ?, 'ready', ?)").bind(id, userId, key, p.amount, Date.now()).run();
  return { orderId: id, amount: p.amount, orderName: p.orderName, customerKey: await customerKey(userId) };
}

export async function confirmPayment(req: Request, env: Env, userId: string, body: Record<string, unknown>): Promise<string> {
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId : '';
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isFinite(amount)) throw new HttpError('BAD_REQUEST', '결제 정보가 빠졌어요.');
  if (payMode(env) === 'off') throw new HttpError('PAY_NOT_READY', '결제는 준비 중이에요.', 503);

  const order = await env.DB.prepare('SELECT id, user_id, key, amount, status FROM orders WHERE id = ?').bind(orderId).first<Order>();
  if (!order) throw new HttpError('NO_ORDER', '주문을 찾지 못했어요. 다시 결제해 주세요.', 404);
  if (order.user_id !== userId) throw new HttpError('NOT_YOUR_ORDER', '다른 계정의 주문이에요.', 403);
  if (order.amount !== amount) throw new HttpError('AMOUNT_MISMATCH', '결제 금액이 주문과 달라요.');
  // 같은 주문을 두 번 승인하지 않는다(새로고침 등)
  if (order.status === 'done') return order.key;

  // 시험할 때만 가짜 토스 주소를 쓸 수 있다(localhost에서만)
  const base = env.TOSS_API_BASE && isLocal(req) ? env.TOSS_API_BASE : 'https://api.tosspayments.com';
  const res = await fetch(`${base}/v1/payments/confirm`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${env.TOSS_SECRET_KEY}:`), 'Content-Type': 'application/json', 'Idempotency-Key': orderId },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; totalAmount?: number; orderId?: string; method?: string; approvedAt?: string; code?: string; message?: string };
  if (!res.ok) throw new HttpError(data.code ?? 'TOSS_ERROR', data.message ?? '결제 승인에 실패했어요.', 402);
  if (data.status !== 'DONE' || data.totalAmount !== order.amount || data.orderId !== orderId) throw new HttpError('NOT_DONE', '결제가 끝나지 않았어요.', 402);

  // 주문 완료 표시와 열쇠 넣기를 한꺼번에 한다(둘 다 되거나 둘 다 안 되거나)
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'done', payment_key = ?, method = ?, approved_at = ? WHERE id = ?").bind(paymentKey, data.method ?? null, data.approvedAt ?? null, orderId),
    env.DB.prepare("INSERT OR IGNORE INTO tickets (user_id, key, source, order_id, created_at) VALUES (?, ?, 'paid', ?, ?)").bind(userId, order.key, orderId, Date.now()),
  ]);
  return order.key;
}
