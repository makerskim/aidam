/**
 * AI 풀이: 사이트가 계산한 이름 결과(JSON)를 Claude에게 보내 자연스러운 글로 풀어 받는다.
 * - 같은 입력은 KV에 30일 저장해 다시 쓰고(비용 0), 한도에 세지 않는다.
 * - 한 사람 하루 한도와 사이트 전체 하루 한도로 비용을 막는다.
 * - 생년월일·성별 같은 개인정보 원문은 받지 않는다. 사이트가 계산한 사주 요약만 받는다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { num, type Env } from './env';

export const PROMPT_VERSION = 'v1';
const MAX_INPUT = 8000;
const MAX_QUESTION = 300;

export const SYSTEM_PROMPT = `너는 한국 성명학(작명)에 밝은 상담가다. 아기 이름을 고민하는 부모에게, 사이트 '아이담'이 계산한 결과(JSON)를 바탕으로 이 이름을 풀어 준다.

- 점수·등급·오행·용신·획수 같은 계산 결과는 주어진 값만 쓴다. 새로 계산하거나 고치지 않고, 데이터에 없는 사실은 지어내지 않는다.
- 한자 뜻은 주어진 뜻을 기준으로, 이름 전체가 어떤 바람을 담는지 자연스러운 문장으로 풀어 준다. 정해진 틀처럼 들리지 않게, 이 이름에만 맞는 말을 한다.
- 좋은 점과 아쉬운 점을 솔직하게 말한다. 아쉬운 점에는 부모가 할 수 있는 선택(다른 한자, 다른 계산 기준 등)을 덧붙인다.
- 성명학은 전통적인 해석이고 아이의 앞날을 정하지 않는다는 점은 끝에 한 번만 짧게 말한다.
- 쉬운 우리말, 해요체로 쓴다. 전문 용어는 처음 나올 때 짧게 풀어 준다.
- 형식: '## 소제목' 3~4개(예: 이름에 담긴 뜻 / 사주와 어울림 / 소리와 획수 / 한마디로), 소제목마다 2~4문장. 목록은 꼭 필요할 때만 '- '로 쓴다. 전체 700~1100자.
- 부모의 질문이 있으면 먼저 그 질문에 답하는 소제목을 하나 두고, 이름 풀이와 상관없는 요청에는 정중히 이름 이야기로 돌아온다.`;

export class AiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Client = Pick<Anthropic, 'beta'>;
let factory: (env: Env) => Client = (env) => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 90_000 });
/** 테스트에서 가짜 Claude를 끼울 때 쓴다 */
export function setClientFactory(f: (env: Env) => Client) {
  factory = f;
}

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 한국 시간 기준 날짜 */
export const today = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

async function count(env: Env, key: string): Promise<number> {
  return Number((await env.KV.get(key)) ?? 0) || 0;
}

export async function aiUsage(env: Env, uid: string, admin: boolean) {
  const limit = admin ? num(env.AI_ADMIN_DAILY_LIMIT, 100) : num(env.AI_DAILY_LIMIT, 20);
  const used = await count(env, `aiq:${uid}:${today()}`);
  return { limit, used, left: Math.max(0, limit - used) };
}

export async function explain(
  env: Env,
  uid: string,
  admin: boolean,
  body: { summary?: unknown; question?: unknown },
): Promise<{ text: string; cached: boolean; left: number }> {
  if (!env.ANTHROPIC_API_KEY) throw new AiError('AI_NOT_READY', 'AI 설정이 아직 끝나지 않았어요.', 503);
  if (!body.summary || typeof body.summary !== 'object') throw new AiError('BAD_REQUEST', '풀이할 이름 정보가 없어요.');
  const data = JSON.stringify(body.summary);
  if (data.length > MAX_INPUT) throw new AiError('TOO_LARGE', '이름 정보가 너무 길어요.');
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';

  const model = env.AI_MODEL || 'claude-opus-5-5';
  const cacheKey = `ai:${await sha256(`${PROMPT_VERSION}|${model}|${data}|${question}`)}`;
  const usage = await aiUsage(env, uid, admin);
  const hit = await env.KV.get(cacheKey);
  if (hit) return { text: hit, cached: true, left: usage.left };

  if (usage.left <= 0) throw new AiError('DAILY_LIMIT', `AI 풀이는 하루 ${usage.limit}번까지예요. 내일 다시 해 주세요.`, 429);
  const gKey = `aig:${today()}`;
  const globalUsed = await count(env, gKey);
  if (globalUsed >= num(env.AI_GLOBAL_DAILY_LIMIT, 200)) {
    throw new AiError('GLOBAL_LIMIT', '오늘은 AI 풀이 요청이 많아 잠시 쉬어요. 내일 다시 해 주세요.', 429);
  }
  // 요청 전에 먼저 센다(동시에 여러 번 눌러도 한도를 넘기 어렵게)
  const qKey = `aiq:${uid}:${today()}`;
  await env.KV.put(qKey, String(usage.used + 1), { expirationTtl: 60 * 60 * 48 });
  await env.KV.put(gKey, String(globalUsed + 1), { expirationTtl: 60 * 60 * 48 });

  const user =
    `아래는 사이트가 계산한 결과예요.\n\n\`\`\`json\n${data}\n\`\`\`\n\n` +
    (question ? `부모님 질문: ${question}\n\n` : '') +
    '이 이름을 풀어 주세요.';

  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await factory(env).beta.messages.create({
      model,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    // 실패한 요청은 한도에서 돌려준다
    await env.KV.put(qKey, String(usage.used), { expirationTtl: 60 * 60 * 48 });
    await env.KV.put(gKey, String(globalUsed), { expirationTtl: 60 * 60 * 48 });
    if (e instanceof Anthropic.RateLimitError) throw new AiError('AI_BUSY', 'AI가 잠시 바빠요. 조금 뒤에 다시 해 주세요.', 503);
    if (e instanceof Anthropic.APIError) throw new AiError('AI_ERROR', 'AI 풀이를 받지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
    throw new AiError('AI_ERROR', 'AI 풀이를 받지 못했어요. 잠시 뒤 다시 해 주세요.', 502);
  }
  if (msg.stop_reason === 'refusal') throw new AiError('AI_REFUSED', '이 내용은 AI가 풀이하지 못했어요.', 422);
  const text = msg.content
    .flatMap((b) => (b.type === 'text' ? [b.text] : []))
    .join('\n')
    .trim();
  if (!text) throw new AiError('AI_EMPTY', 'AI 풀이가 비어 있어요. 다시 해 주세요.', 502);
  await env.KV.put(cacheKey, text, { expirationTtl: 60 * 60 * 24 * 30 });
  return { text, cached: false, left: Math.max(0, usage.left - 1) };
}
