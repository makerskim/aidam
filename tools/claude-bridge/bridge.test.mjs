// 연결 프로그램 테스트: node --test tools/claude-bridge/bridge.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP, createHandler, runClaude } from '../../apps/web/public/aidam-claude-bridge.mjs';

const SITE = 'https://site.example/aidam';

/** 가짜 아이담 사이트 */
function fakeSite(calls) {
  return async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? init.body.toString() : null });
    if (url === `${SITE}/`) return new Response('<html>아이담</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url === `${SITE}/assets/app.js`) return new Response('js', { headers: { 'content-type': 'text/javascript', 'cache-control': 'max-age=600' } });
    if (url === `${SITE}/api/me`) return new Response('{"admin":true}', { headers: { 'content-type': 'application/json' } });
    if (url === `${SITE}/api/auth/handoff/redeem`) {
      const good = init.body.toString().includes('good-code');
      return new Response(good ? '{"ok":true}' : '{"error":"BAD_CODE"}', { status: good ? 200 : 400, headers: good ? { 'content-type': 'application/json', 'set-cookie': 'aidam_s=newtoken; Path=/; Max-Age=100; HttpOnly; SameSite=Lax; Secure' } : { 'content-type': 'application/json' } });
    }
    return new Response('없음', { status: 404, headers: { 'content-type': 'text/plain' } });
  };
}

async function withBridge(opts, fn) {
  const calls = [];
  const server = createServer(createHandler({ site: SITE, fetchImpl: fakeSite(calls), ...opts }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  try {
    await fn({ base: `http://127.0.0.1:${port}`, port, calls });
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const explain = (base, body, headers = {}) =>
  fetch(`${base}/__bridge/explain`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

/** Host 머리말을 바꿔 보낸다(fetch로는 못 바꾼다) */
const rawGet = (port, host, path = '/__bridge/health') =>
  new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, headers: { Host: host } }, (res) => resolve(res.statusCode)).on('error', reject).end();
  });

test('아이담 사이트를 같은 주소에서 그대로 보여 준다', async () => {
  await withBridge({}, async ({ base, calls }) => {
    const page = await fetch(`${base}/`);
    assert.equal(await page.text(), '<html>아이담</html>');
    assert.equal(page.headers.get('cache-control'), 'no-store');
    const js = await fetch(`${base}/assets/app.js`);
    assert.equal(js.headers.get('content-type'), 'text/javascript');
    assert.equal(js.headers.get('cache-control'), 'max-age=600');
    assert.equal((await fetch(`${base}/nope.png`)).status, 404);
    // 사이트 파일은 GET만
    assert.equal((await fetch(`${base}/assets/app.js`, { method: 'POST', body: 'x', headers: { Origin: base } })).status, 405);
    assert.deepEqual(calls.map((c) => c.url), [`${SITE}/`, `${SITE}/assets/app.js`, `${SITE}/nope.png`]);
  });
});

test('서버(/api) 요청은 로그인 쿠키와 함께 사이트로 넘기고, 다른 사이트에서 온 바꾸는 요청은 넘기지 않는다', async () => {
  await withBridge({}, async ({ base, calls }) => {
    const r = await fetch(`${base}/api/me`, { headers: { Cookie: 'aidam_s=tok' } });
    assert.deepEqual(await r.json(), { admin: true });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    await fetch(`${base}/api/pay/order`, { method: 'POST', headers: { Cookie: 'aidam_s=tok', 'Content-Type': 'application/json', Origin: base }, body: '{}' });
    assert.equal(calls[0].headers.cookie, 'aidam_s=tok');
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].body, '{}');
    assert.equal(calls[1].headers.origin, 'https://site.example', '사이트 주소를 출처로 보내지 않음');
    const evil = await fetch(`${base}/api/pay/order`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
    assert.equal(evil.status, 403);
    assert.equal(calls.length, 2, '다른 사이트의 요청이 사이트로 넘어감');
  });
});

test('사이트에서 넘겨받은 일회용 값으로 로그인 상태를 받아 이 화면에 둔다', async () => {
  await withBridge({}, async ({ base, calls }) => {
    const ok = await fetch(`${base}/__bridge/login?code=good-code`, { redirect: 'manual' });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), '/');
    assert.equal(ok.headers.get('set-cookie'), 'aidam_s=newtoken; Path=/; Max-Age=100; HttpOnly; SameSite=Lax', 'Secure를 떼지 않음');
    assert.equal(calls[0].url, `${SITE}/api/auth/handoff/redeem`);
    assert.equal(calls[0].body, '{"code":"good-code"}');
    assert.equal(calls[0].headers.origin, 'https://site.example');
    const bad = await fetch(`${base}/__bridge/login?code=bad`, { redirect: 'manual' });
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get('set-cookie'), null);
  });
});

test('연결 확인에 답하고, 다른 이름(Host)으로 닿는 요청은 받지 않는다', async () => {
  await withBridge({}, async ({ base, port }) => {
    const h = await (await fetch(`${base}/__bridge/health`)).json();
    assert.equal(h.app, APP);
    assert.equal(await rawGet(port, `localhost:${port}`), 200);
    assert.equal(await rawGet(port, `evil.example:${port}`), 403);
    assert.equal(await rawGet(port, 'evil.example'), 403);
  });
});

test('다른 사이트에서 온 풀이 요청은 거절하고 Claude를 부르지 않는다', async () => {
  let n = 0;
  await withBridge({ run: async () => (n++, 'x') }, async ({ base }) => {
    assert.equal((await explain(base, { prompt: 'hi' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await explain(base, { prompt: 'hi' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await fetch(`${base}/__bridge/explain`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'text/plain' }, body: '{"prompt":"hi"}' })).status, 403);
    assert.equal((await fetch(`${base}/__bridge/explain`)).status, 403);
    assert.equal((await explain(base, { prompt: '' })).status, 400);
    assert.equal((await explain(base, { prompt: 'ㄱ'.repeat(20_001) })).status, 400);
  });
  assert.equal(n, 0);
});

test('풀이를 돌려주고, 쓰는 동안 온 요청은 기다리라고 답한다', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  await withBridge({ run: async (p) => (await gate, `풀이: ${p}`) }, async ({ base }) => {
    const first = explain(base, { prompt: '김서윤' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await explain(base, { prompt: '둘째' })).status, 429);
    release();
    const r = await first;
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: '풀이: 김서윤' });
  });
});

test('Claude가 실패하면 이유를 알려 준다', async () => {
  await withBridge({ run: async () => { throw Object.assign(new Error('로그인이 필요해요'), { code: 'CLAUDE_ERROR' }); } }, async ({ base }) => {
    const r = await explain(base, { prompt: 'x' });
    assert.equal(r.status, 502);
    assert.equal((await r.json()).message, '로그인이 필요해요');
  });
});

test('Claude Code를 도구 없이 실행하고 결과 글만 꺼낸다', { skip: process.platform === 'win32' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-'));
  const fake = join(dir, 'claude');
  writeFileSync(fake, `#!/usr/bin/env node
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const a=process.argv.slice(2);
  if(s.includes('FAIL')){console.log(JSON.stringify({is_error:true,result:'로그인이 필요해요'}));return;}
  console.log(JSON.stringify({is_error:false,result:' '+JSON.stringify({args:a,prompt:s})+' '}));
});`);
  chmodSync(fake, 0o755);
  const out = JSON.parse(await runClaude('이름 풀이', { bin: fake, cwd: dir }));
  assert.equal(out.prompt, '이름 풀이');
  assert.ok(out.args.includes('-p') && out.args.includes('--tools='), '도구를 끄지 않음');
  await assert.rejects(runClaude('FAIL', { bin: fake, cwd: dir }), /로그인이 필요해요/);
  await assert.rejects(runClaude('x', { bin: join(dir, 'nope'), cwd: dir }), /설치되어 있지 않아요/);
});
