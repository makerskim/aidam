// 연결 프로그램 테스트: node --test tools/claude-bridge
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBridge, originAllowed, runClaude } from '../../apps/web/public/aidam-claude-bridge.mjs';

const SITE = 'https://makerskim.github.io';
const TOKEN = 'test-token-1234567890';

async function withBridge(run, fn) {
  const server = createBridge({ token: TOKEN, run });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, body, headers = {}) =>
  fetch(`${base}/explain`, { method: 'POST', headers: { Origin: SITE, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('아이담 주소만 받는다', () => {
  assert.ok(originAllowed(SITE));
  assert.ok(originAllowed('https://aidam.makerskim.workers.dev'));
  assert.ok(!originAllowed('https://evil.example'));
  assert.ok(!originAllowed('https://aidam.evil.example'));
  assert.ok(!originAllowed(''));
});

test('다른 사이트·틀린 연결 번호는 거절하고 Claude를 부르지 않는다', async () => {
  let calls = 0;
  await withBridge(async () => (calls++, 'x'), async (base) => {
    assert.equal((await post(base, { prompt: 'hi' }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await post(base, { prompt: 'hi' }, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post(base, { prompt: 'hi' }, { Authorization: '' })).status, 401);
    assert.equal((await post(base, { prompt: '' })).status, 400);
    assert.equal((await post(base, { prompt: 'ㄱ'.repeat(20_001) })).status, 400);
  });
  assert.equal(calls, 0);
});

test('사전 요청(preflight)에 사설 네트워크 허용을 답한다', async () => {
  await withBridge(async () => 'x', async (base) => {
    const r = await fetch(`${base}/explain`, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), SITE);
    assert.equal(r.headers.get('access-control-allow-private-network'), 'true');
  });
});

test('풀이를 돌려주고, 쓰는 동안 온 요청은 기다리라고 답한다', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  await withBridge(async (p) => (await gate, `풀이: ${p}`), async (base) => {
    const first = post(base, { prompt: '김서윤' });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await post(base, { prompt: '둘째' })).status, 429);
    release();
    const r = await first;
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { text: '풀이: 김서윤' });
    const h = await fetch(`${base}/health`, { headers: { Origin: SITE, Authorization: `Bearer ${TOKEN}` } });
    assert.equal((await h.json()).ok, true);
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
