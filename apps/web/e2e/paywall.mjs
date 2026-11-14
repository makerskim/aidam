/* global document, sessionStorage, localStorage */
// 결제 테스트(1회 = 분석 1건, 관리자 번호). 서버(/api)는 가짜로 대신한다.
// 사용법: pnpm build:paywall && vite preview --outDir dist-pay --port 4174 & node e2e/paywall.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:4174';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await ctx.newPage();
await ctx.route('https://claude.ai/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'claude' }));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// 가짜 서버 상태
const plan = { amount: 990, orderName: '아이담 이름 분석 1회' };
const srv = { loggedIn: false, admin: false, adminUntil: 0, keys: [], code: null, orders: [] };
const me = () => ({ uid: 'preview', iat: Date.now(), sig: null, admin: srv.admin, adminUntil: srv.admin ? srv.adminUntil : 0, keys: srv.keys, ai: { left: 20, limit: 20 }, plan, codeChannel: srv.admin ? 'push' : null });
await page.route('**/api/**', async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  const body = req.postData() ? JSON.parse(req.postData()) : {};
  const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (path === '/api/config') return json(200, { plan, payReady: true, aiReady: false });
  if (!req.headers().authorization || !srv.loggedIn) return json(401, { error: 'UNAUTHORIZED', message: '로그인이 필요해요.' });
  if (path === '/api/me') return json(200, me());
  if (path === '/api/pay/confirm') {
    srv.keys = [body.orderId.replace(/^order-/, ''), ...srv.keys];
    srv.orders.push(body);
    return json(200, { key: srv.keys[0], me: me() });
  }
  if (path === '/api/admin/code' && srv.admin) {
    srv.code = '481516';
    return json(200, { channel: 'push', ttl: 300 });
  }
  if (path === '/api/admin/verify' && srv.admin) {
    if (body.code !== srv.code) return json(400, { error: 'WRONG_CODE', message: '번호가 맞지 않아요.' });
    srv.code = null;
    srv.adminUntil = Date.now() + 12 * 3_600_000;
    return json(200, { me: me() });
  }
  if (path === '/api/admin/off' && srv.admin) {
    srv.adminUntil = 0;
    return json(200, { me: me() });
  }
  return json(404, { error: 'NOT_FOUND', message: '없는 주소예요.' });
});

const cards = () => page.locator('section[aria-label="추천 이름"] .name-card');
const waitOpen = () => page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length > 3, null, { timeout: 30000 });
const waitLocked = async () => {
  await page.waitForSelector('.paywall', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length === 3, null, { timeout: 30000 });
};
const pendingTicket = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('aidam:pay')).ticket);
/** 토스 결제창에서 결제하고 돌아온 것처럼 한다 */
async function payFor(ticket) {
  await page.goto(`${BASE}/?pay=success&paymentKey=pk&orderId=order-${ticket}&amount=990`);
  await page.waitForSelector('h1:has-text("결제가 끝났어요")');
  await page.click('button:has-text("결과 보기")');
}

// 1) 로그인 없이 이름 추천 → 3개 + 결제 안내
await page.goto(`${BASE}/`);
await page.click('.hero .btn-primary');
await page.waitForSelector('.modal');
await page.click('text=로그인 없이 하기');
await page.fill('#surname', '김');
await page.waitForSelector('.opt-row');
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
await waitLocked();
assert.ok(await page.locator('.paywall:has-text("이 분석 전체 보기 990원")').count(), '가격 표시');
assert.equal(await page.locator('button:has-text("이름 더 보기")').count(), 0, '더 보기가 보임');
const resultsUrl = page.url();
console.log('✓ 결제 전: 추천 3개 + "이 분석 전체 보기 990원"');

// 2) 풀이: 총평은 보이고 항목별 풀이는 잠김
await cards().first().click();
await page.waitForSelector('.summary');
assert.ok(await page.locator('.paywall').count(), '풀이 잠금 안내 없음');
assert.equal(await page.locator('section[aria-label="항목별 풀이"]').count(), 0, '항목별 풀이가 보임');
console.log('✓ 결제 전: 총평만, 자세한 풀이 잠김');

// 3) 일반 사용자 결제 화면: 관리자 번호 칸은 보이지 않는다
srv.loggedIn = true;
await page.goto(resultsUrl);
await page.click('.site-header button:has-text("로그인")');
await page.click('.modal .google-btn');
await waitLocked();
await page.click('.paywall .btn-primary');
await page.waitForSelector('.plan-card');
assert.ok(await page.locator('.plan-price:has-text("990원")').count(), '가격');
assert.ok(await page.locator('text=바꾸면 새 분석이라 따로 결제해요').count(), '재결제 안내 없음');
assert.ok(await page.locator('text=환불 안내').count(), '환불 안내 없음');
assert.equal(await page.locator('.admin-code').count(), 0, '일반 사용자에게 관리자 번호 칸이 보임');
const ticketA = await pendingTicket();
assert.match(ticketA, /^r\.[0-9a-z]+\.[0-9a-z]+\.[0-9a-z]+$/, `열쇠 모양: ${ticketA}`);
console.log('✓ 결제 화면(990원·재결제 안내·환불 안내, 관리자 번호 칸 없음)');

// 4) 결제하면 그 분석이 열리고, 그 결과의 이름 풀이도 열린다. 다시 들어와도 열려 있다
await payFor(ticketA);
await waitOpen();
assert.equal(await page.locator('.paywall').count(), 0);
assert.ok((await cards().count()) >= 20, '결제 후 전체 목록');
await cards().first().click();
await page.waitForSelector('section[aria-label="항목별 풀이"]');
assert.equal(await page.locator('.paywall').count(), 0, '결제한 결과의 풀이가 잠김');
await page.goto(resultsUrl);
await page.reload();
await waitOpen();
console.log('✓ 결제 후: 그 분석 전체 + 이름 풀이 열림, 다시 들어와도 열림');

// 5) 조건을 바꾸면 새 분석이라 다시 잠긴다. 원래 조건으로 돌아오면 열려 있다
await page.click('.basis .seg button:has-text("실용 작명법")');
await waitLocked();
await page.click('.paywall .btn-primary');
await page.waitForSelector('.plan-card');
const ticketB = await pendingTicket();
assert.notEqual(ticketB, ticketA, '조건을 바꿨는데 열쇠가 같음');
await page.goBack();
await page.click('.basis .seg button:has-text("정통 성명학")');
await waitOpen();
console.log('✓ 조건(계산 기준)을 바꾸면 다시 결제, 원래 조건은 계속 열림');

// 6) 관리자 계정도 처음에는 똑같이 잠겨 있고 결제 화면을 본다
srv.admin = true;
srv.keys = [];
await page.evaluate(() => localStorage.removeItem('aidam:me:preview')); // 이 기기에 둔 결제 내역만 지운다
await page.goto(resultsUrl);
await page.reload();
await waitLocked();
await page.click('.paywall .btn-primary');
await page.waitForSelector('.plan-card');
assert.ok(await page.locator('.admin-code').count(), '관리자 번호 칸 없음');
assert.ok(await page.locator('.plan-price:has-text("990원")').count(), '관리자에게 결제 화면이 안 보임');
console.log('✓ 관리자 계정: 결제 화면 그대로 + 관리자 번호 칸');

// 7) 관리자 번호: 틀리면 거절, 맞으면 결제 없이 열린다. 끄면 다시 잠긴다
await page.click('button:has-text("관리자 번호 받기")');
await page.fill('input[aria-label="관리자 번호"]', '000000');
await page.click('.admin-code button:has-text("확인")');
await page.waitForSelector('text=번호가 맞지 않아요');
await page.fill('input[aria-label="관리자 번호"]', '481516');
await page.click('.admin-code button:has-text("확인")');
await waitOpen();
assert.equal(await page.locator('.paywall').count(), 0, '관리자 모드인데 잠김');
await page.click('.avatar');
assert.ok(await page.locator('.menu >> text=관리자 모드 켜짐').count(), '메뉴 표시');
await page.click('.menu >> text=관리자 모드 켜짐');
await page.click('button:has-text("관리자 모드 끄기")');
await page.waitForSelector('button:has-text("관리자 번호 받기")');
await page.goto(resultsUrl);
await waitLocked();
console.log('✓ 관리자 번호: 틀리면 거절 · 맞으면 결제 없이 열림 · 끄면 다시 잠김');

// 8) AI 풀이는 API 없이: 결제한 분석에서 요청 글 복사 + claude.ai 열기
srv.keys = [ticketA];
await page.reload();
await waitOpen();
await cards().first().click();
await page.waitForSelector('.ai-card');
{
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('.ai-card button:has-text("내 Claude 계정으로")')]);
  assert.ok(popup.url().startsWith('https://claude.ai/new'), `claude.ai가 열리지 않음: ${popup.url()}`);
  await popup.close();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes('성명학') && clip.includes('"한글"'), '요청 글이 복사되지 않음');
  assert.ok(!clip.includes('2026'), '복사한 글에 생년월일이 들어감');
}
console.log('✓ AI 풀이: 내 Claude 계정으로(글 복사 + claude.ai 열기)');

assert.deepEqual(errors, [], `페이지 오류: ${errors.join('\n')}`);
await browser.close();
console.log('결제 테스트 통과');
