/* global document, sessionStorage */
// 실제 서버(Cloudflare Workers를 이 컴퓨터에서 띄움) + 실제 저장소(D1)로 하는 전체 흐름 테스트.
// 바깥 서비스(토스·휴대폰 알림)만 가짜로 받는다. 로그인은 localhost에서만 켜지는 시험용 로그인을 쓴다.
// 사용법: node apps/web/e2e/server.mjs   (스스로 빌드하고, 서버를 띄우고, 끝나면 끈다)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const worker = join(web, '..', 'worker');
const PORT = 8787;
const FAKE = 8790;
const BASE = `http://localhost:${PORT}`;
const ADMIN = 'boss@example.com';
const state = mkdtempSync(join(tmpdir(), 'aidam-e2e-'));
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'pipe', ...opts }).toString();

// 1) 서명 키를 만들고, 공개 키를 넣어 사이트를 빌드한다(배포 때와 같은 방식)
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const signing = { private: await crypto.subtle.exportKey('jwk', kp.privateKey), public: await crypto.subtle.exportKey('jwk', kp.publicKey) };
sh('npx', ['vite', 'build'], { cwd: web, env: { ...process.env, VITE_API_BASE: '/api', VITE_TOSS_CLIENT_KEY: 'test_ck_dummy', VITE_ENTITLE_PUB: JSON.stringify(signing.public) } });

// 2) 저장소를 만들고 서명 키를 넣는다
sh('npx', ['wrangler', 'd1', 'migrations', 'apply', 'aidam', '--local', '--persist-to', state], { cwd: worker });
sh('npx', ['wrangler', 'd1', 'execute', 'aidam', '--local', '--persist-to', state, '--command', `INSERT INTO config (key, value) VALUES ('signing', '${JSON.stringify(signing)}')`], { cwd: worker });

// 3) 가짜 토스·휴대폰 알림
const got = { toss: [], push: [] };
const fake = createServer((req, res) => {
  let raw = '';
  req.on('data', (d) => (raw += d)).on('end', () => {
    const body = JSON.parse(raw || '{}');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/payments/confirm') {
      got.toss.push(body);
      return res.end(JSON.stringify({ status: 'DONE', totalAmount: body.amount, orderId: body.orderId, method: '카드', approvedAt: new Date().toISOString() }));
    }
    got.push.push(body);
    res.end('{}');
  });
}).listen(FAKE);

function startServer(mode) {
  const vars = { SITE_MODE: mode, DEV_LOGIN: '1', ADMIN_EMAILS: ADMIN, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', KAKAO_REST_KEY: 'kkey', TOSS_SECRET_KEY: 'test_sk_dummy', TOSS_API_BASE: `http://localhost:${FAKE}`, NTFY_TOPIC: 'aidam-e2e', NTFY_BASE: `http://localhost:${FAKE}` };
  const args = ['wrangler', 'dev', '--port', String(PORT), '--local', '--persist-to', state, ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const p = spawn('npx', args, { cwd: worker, stdio: 'ignore', detached: true });
  return { stop: () => { try { process.kill(-p.pid); } catch { /* 이미 꺼짐 */ } } };
}
async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/me`)).ok) return;
    } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('서버가 켜지지 않았어요');
}
const stopAndWait = async (srv) => {
  srv.stop();
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${BASE}/api/me`); } catch { return; }
    await new Promise((r) => setTimeout(r, 250));
  }
};

const browser = await chromium.launch();
const errors = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('https://claude.ai/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'claude' }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return page;
}
const devLogin = (page, email, extra = '') => page.goto(`${BASE}/api/auth/dev?email=${encodeURIComponent(email)}&name=${encodeURIComponent('시험')}${extra}`);
const cards = (page) => page.locator('section[aria-label="추천 이름"] .name-card');
const waitOpen = (page) => page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length > 3, null, { timeout: 40000 });
const waitLocked = async (page) => {
  await page.waitForSelector('.paywall', { timeout: 40000 });
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length === 3, null, { timeout: 40000 });
};
async function toResults(page) {
  await page.goto(`${BASE}/`);
  await page.click('.hero .btn-primary');
  if (await page.locator('.modal').count()) await page.click('text=로그인 없이 하기');
  await page.fill('#surname', '김');
  await page.click('.opt-row:has-text("金")');
  await page.click('button:has-text("다음")');
  await page.click('button.tile:has-text("새 이름 추천받기")');
  await page.click('.wizard-actions button:has-text("다음")');
  await page.click('button.tile:has-text("한 명")');
  await page.click('.wizard-actions button:has-text("다음")');
  await page.click('button.tile:has-text("여자아이")');
  await page.click('.wizard-actions button:has-text("다음")');
  await page.fill('#baby-date', '20260314');
  await page.fill('#baby-time', '0930');
  await page.click('button:has-text("다음")');
  await page.click('button:has-text("이름 추천받기")');
  await page.waitForSelector('.name-card', { timeout: 40000 });
  return page.url();
}

let srv;
try {
  // ── 출시 전(closed): 관리자만 들어온다 ─────────────────────────────
  srv = startServer('closed');
  await waitUp();
  {
    const page = await newPage();
    const res = await page.goto(`${BASE}/`);
    assert.ok(await page.locator('text=준비 중이에요').count(), '준비 중 화면이 아님');
    assert.equal(await page.locator('#root').count(), 0, '잠긴 상태에서 사이트가 나감');
    assert.ok((res.headers()['content-security-policy'] ?? '').includes("default-src 'none'"));
    const js = await page.request.get(`${BASE}/assets/does-not-matter.js`);
    assert.ok((await js.text()).includes('준비 중이에요'), '잠긴 상태에서 사이트 파일이 나감');
    assert.equal((await page.request.get(`${BASE}/api/library`)).status(), 403);
    await devLogin(page, 'someone@example.com');
    assert.ok(await page.locator('text=지금은 관리자만').count(), '관리자가 아닌데 들어옴');
    await page.click('button:has-text("로그아웃")');
    await page.waitForSelector('text=준비 중이에요');
    await devLogin(page, ADMIN);
    await page.waitForSelector('.hero-brand');
    console.log('✓ 출시 전 잠금: 손님·일반 계정은 준비 중 화면만, 관리자만 들어옴');
    await page.context().close();
  }
  await stopAndWait(srv);

  // ── 문을 연 뒤(open) ───────────────────────────────────────────────
  srv = startServer('open');
  await waitUp();
  const page = await newPage();

  // 1) 로그인 전: 3개 + "로그인하고 첫 1회 무료"
  const resultsUrl = await toResults(page);
  await waitLocked(page);
  assert.ok(await page.locator('.paywall button:has-text("로그인하고 첫 1회 무료로 보기")').count(), '로그인 안내 없음');
  await page.click('.paywall .btn-primary');
  await page.waitForSelector('.modal');
  assert.ok(await page.locator('.modal .google-btn:has-text("Google로 계속하기")').count(), 'Google 로그인 버튼 없음');
  assert.ok(await page.locator('.modal .kakao-btn:has-text("카카오로 계속하기")').count(), '카카오 로그인 버튼 없음');
  for (const [p, host] of [['google', 'https://accounts.google.com/'], ['kakao', 'https://kauth.kakao.com/']]) {
    const r = await page.request.get(`${BASE}/api/auth/${p}/start`, { maxRedirects: 0 });
    assert.equal(r.status(), 302);
    assert.ok(r.headers().location.startsWith(host), `${p} 로그인 화면으로 보내지 않음`);
    assert.ok(r.headers().location.includes(encodeURIComponent(`${BASE}/api/auth/${p}/callback`)));
  }
  console.log('✓ 로그인 전: 추천 3개 + 로그인하면 첫 1회 무료 안내, Google·카카오 로그인 버튼');

  // 2) 로그인 → 무료 1회로 이 분석 열기 → 다시 들어와도 열림, 이름 풀이도 열림
  await devLogin(page, 'user1@example.com');
  await page.goto(resultsUrl);
  await waitLocked(page);
  await page.click('.paywall button:has-text("무료 1회로 이 분석 전체 보기")');
  await waitOpen(page);
  assert.ok((await cards(page).count()) >= 20, '무료 1회로 전체 목록');
  await page.reload();
  await waitOpen(page);
  await cards(page).first().click();
  await page.waitForSelector('section[aria-label="항목별 풀이"]');
  assert.equal(await page.locator('.paywall').count(), 0, '연 분석의 풀이가 잠김');
  const reportUrl = page.url();
  console.log('✓ 첫 1회 무료: 전체 목록 + 이름 풀이, 다시 들어와도 열림');

  // 3) 조건을 바꾸면 새 분석: 무료는 끝났고 990원 안내
  await page.goto(resultsUrl);
  await waitOpen(page);
  await page.click('.basis .seg button:has-text("실용 작명법")');
  await waitLocked(page);
  assert.ok(await page.locator('.paywall button:has-text("이 분석 전체 보기 990원")').count(), '990원 안내 없음');
  await page.click('.paywall .btn-primary');
  await page.waitForSelector('.plan-card');
  assert.ok(await page.locator('.plan-price:has-text("990원")').count());
  assert.ok(await page.locator('text=시험 결제').count(), '시험 결제 표시 없음');
  assert.equal(await page.locator('.admin-code').count(), 0, '일반 사용자에게 관리자 번호 칸이 보임');
  console.log('✓ 조건을 바꾸면 새 분석: 무료 끝, 1회 990원 결제 화면');

  // 4) 결제(토스 결제창 대신, 결제창에서 돌아온 것처럼): 주문 → 승인 → 열림
  const ticketB = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aidam:pay')).ticket);
  const order = await page.evaluate(async (key) => (await fetch('/api/pay/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) })).json(), ticketB);
  assert.equal(order.amount, 990);
  // 금액을 바꿔 승인을 요청하면 거절된다
  const cheat = await page.evaluate(async (id) => (await fetch('/api/pay/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentKey: 'pk', orderId: id, amount: 10 }) })).status, order.orderId);
  assert.equal(cheat, 400);
  assert.equal(got.toss.length, 0);
  await page.goto(`${BASE}/?pay=success&paymentKey=pk&orderId=${order.orderId}&amount=990`);
  await page.waitForSelector('h1:has-text("결제가 끝났어요")');
  assert.deepEqual(got.toss[0], { paymentKey: 'pk', orderId: order.orderId, amount: 990 });
  await page.click('button:has-text("결과 보기")');
  await waitOpen(page);
  console.log('✓ 결제: 금액 조작 거절 · 승인 후 그 분석 열림');

  // 5) 서버 답을 가짜로 바꿔도(열쇠 끼워 넣기) 잠금이 풀리지 않는다
  await page.click('.basis .seg button:has-text("두 기준 모두")');
  await waitLocked(page);
  await page.click('.paywall .btn-primary');
  await page.waitForSelector('.plan-card');
  const ticketC = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aidam:pay')).ticket);
  await page.goBack();
  await page.route('**/api/me', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, keys: [ticketC, ...body.keys], admin: true, adminUntil: Date.now() + 9e6 } });
  });
  await page.reload();
  await waitLocked(page);
  await page.unroute('**/api/me');
  console.log('✓ 서버 답 위조(열쇠·관리자 끼워 넣기)로는 열리지 않음');

  // 6) 저장한 이름: 서버에 저장되어 새로 고쳐도 남는다
  await page.goto(reportUrl);
  await page.waitForSelector('.summary');
  await page.click('button[aria-label="저장"]');
  await page.waitForSelector('button[aria-label="저장 해제"]');
  await page.goto(`${BASE}/#/me?tab=saved`);
  await page.reload();
  await page.waitForSelector('.name-row', { timeout: 15000 });
  assert.ok(await page.locator('.name-row .hj:has-text("金")').count(), '저장한 이름이 남지 않음');
  console.log('✓ 저장한 이름: 계정에 저장되어 다시 들어와도 남음');

  // 7) AI 풀이는 API 없이: 요청 글 복사 + claude.ai 열기(생년월일 원문은 넣지 않음)
  await page.goto(reportUrl);
  await page.waitForSelector('.ai-card');
  {
    const [popup] = await Promise.all([page.context().waitForEvent('page'), page.click('.ai-card button:has-text("내 Claude 계정으로")')]);
    assert.ok(popup.url().startsWith('https://claude.ai/new'));
    await popup.close();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(clip.includes('성명학') && clip.includes('"한글"'), '요청 글이 복사되지 않음');
    assert.ok(!clip.includes('2026'), '복사한 글에 생년월일이 들어감');
  }
  console.log('✓ AI 풀이: 내 Claude 계정으로(글 복사 + claude.ai 열기)');

  // 8) 로그아웃하면 다시 잠기고, 다른 계정은 자기 무료 1회를 따로 가진다
  await page.goto(resultsUrl);
  await waitOpen(page);
  await page.click('.avatar');
  await page.click('.menu >> text=로그아웃');
  await page.goto(resultsUrl);
  await waitLocked(page);
  console.log('✓ 로그아웃하면 다시 잠김');

  // 9) 관리자: 처음엔 똑같이 잠김 → 결제 화면에 관리자 번호 칸 → 휴대폰으로 온 번호를 넣으면 결제 없이 열림
  const admin = await newPage();
  await devLogin(admin, ADMIN);
  await admin.goto(resultsUrl);
  await waitLocked(admin);
  await admin.goto(`${BASE}/#/pay`);
  await admin.waitForSelector('.admin-code');
  await admin.click('button:has-text("관리자 번호 받기")');
  await admin.waitForSelector('input[aria-label="관리자 번호"]');
  assert.equal(got.push.length, 1, '휴대폰 알림이 가지 않음');
  assert.equal(got.push[0].topic, 'aidam-e2e');
  const code = /관리자 번호 (\d{6})/.exec(got.push[0].message)[1];
  await admin.fill('input[aria-label="관리자 번호"]', code === '000000' ? '000001' : '000000');
  await admin.click('.admin-code button:has-text("확인")');
  await admin.waitForSelector('text=번호가 맞지 않아요');
  await admin.fill('input[aria-label="관리자 번호"]', code);
  await admin.click('.admin-code button:has-text("확인")');
  await admin.waitForSelector('text=관리자 모드가 켜져 있어요');
  await admin.goto(resultsUrl);
  await waitOpen(admin);
  assert.equal(await admin.locator('.paywall').count(), 0);
  await admin.click('.avatar');
  assert.ok(await admin.locator('.menu >> text=관리자 모드 켜짐').count());
  assert.ok(await admin.locator('.menu >> text=내 Claude Code 연결').count(), '관리자 메뉴에 연결 없음');
  await admin.click('.menu >> text=관리자 모드 켜짐');
  await admin.click('button:has-text("관리자 모드 끄기")');
  await admin.waitForSelector('button:has-text("관리자 번호 받기")');
  await admin.goto(resultsUrl);
  await waitLocked(admin);
  console.log('✓ 관리자: 처음엔 잠김 · 휴대폰으로 온 번호로 결제 없이 열림 · 끄면 다시 잠김');

  // 10) 카카오 계정은 관리자 이메일이어도 관리자가 아니다
  const kakao = await newPage();
  await devLogin(kakao, ADMIN, '&provider=kakao');
  await kakao.goto(`${BASE}/#/pay`);
  await kakao.waitForSelector('.plan-card');
  assert.equal(await kakao.locator('.admin-code').count(), 0, '카카오 계정이 관리자로 보임');
  console.log('✓ 관리자는 Google이 확인한 이메일만 인정');

  assert.deepEqual(errors, [], `페이지 오류: ${errors.join('\n')}`);
  console.log('서버 전체 흐름 테스트 통과');
} finally {
  await browser.close();
  srv?.stop();
  fake.close();
  rmSync(state, { recursive: true, force: true });
}
