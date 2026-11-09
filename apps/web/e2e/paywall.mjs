/* global document */
// 이용권 잠금 테스트. 서버(/api)는 가짜로 대신한다.
// 사용법: VITE_DISABLE_CLOUD=1 VITE_API_BASE=/api vite build --outDir dist-pay && vite preview --outDir dist-pay --port 4174 & node e2e/paywall.mjs
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

let me = null; // null이면 로그인 안 함(401)
const aiBodies = [];
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url());
  const auth = route.request().headers().authorization;
  const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/api/config') return json(200, { plan: { amount: 9900, days: 30, orderName: '아이담 30일 이용권' }, payReady: true, aiReady: true });
  if (!auth || !me) return json(401, { error: 'UNAUTHORIZED', message: '로그인이 필요해요.' });
  if (url.pathname === '/api/me') return json(200, me);
  if (url.pathname === '/api/ai/explain') {
    aiBodies.push(JSON.parse(route.request().postData() ?? '{}'));
    return json(200, { text: '## 이름에 담긴 뜻\n**상서로운** 뜻을 담았어요.\n- 첫째 줄', cached: false, left: 99 });
  }
  return json(404, { error: 'NOT_FOUND' });
});

// 1) 로그인 없이 이름 추천 → 3개 + 잠금 안내
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
await page.waitForSelector('.paywall');
assert.equal(await page.locator('section[aria-label="추천 이름"] .name-card').count(), 3, '맛보기는 3개');
assert.ok(await page.locator('.paywall:has-text("9,900원")').count(), '가격 표시');
assert.equal(await page.locator('button:has-text("이름 더 보기")').count(), 0, '더 보기가 보임');
console.log('✓ 로그인 전: 추천 3개 + 이용권 안내');

// 2) 풀이: 총평은 보이고 항목별 풀이는 잠김
const resultsUrl = page.url();
await page.locator('section[aria-label="추천 이름"] .name-card').first().click();
await page.waitForSelector('.summary');
assert.ok(await page.locator('.paywall').count(), '풀이 잠금 안내 없음');
assert.equal(await page.locator('section[aria-label="항목별 풀이"]').count(), 0, '항목별 풀이가 보임');
assert.ok(await page.locator('.ai-card').count(), 'AI 풀이 칸 없음');
console.log('✓ 로그인 전: 총평만, 자세한 풀이 잠김');

// 3) 결제 화면
await page.click('.paywall .btn-primary');
await page.waitForSelector('.plan-card');
assert.ok(await page.locator('text=환불 안내').count(), '환불 안내 없음');
assert.ok(await page.locator('button:has-text("로그인하고 결제하기")').count() + (await page.locator('text=결제 준비 중').count()), '결제 버튼');
console.log('✓ 결제 화면(가격·환불 안내)');

// 4) 관리자로 로그인하면 전부 열림
me = { admin: true, paid: false, until: null, unlocked: true, ai: { left: 100, limit: 100 }, plan: { amount: 9900, days: 30, orderName: '아이담 30일 이용권' } };
await page.goto(resultsUrl);
await page.click('.site-header button:has-text("로그인")');
await page.click('.modal .google-btn');
await page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length > 3, null, { timeout: 20000 });
assert.equal(await page.locator('.paywall').count(), 0, '관리자에게 잠금이 보임');
assert.ok((await page.locator('section[aria-label="추천 이름"] .name-card').count()) >= 20, '관리자는 전체 목록');
await page.click('.avatar');
assert.ok(await page.locator('.admin-chip').count(), '관리자 표시 없음');
assert.ok(await page.locator('.menu >> text=관리자 무료').count(), '이용권 메뉴');
await page.keyboard.press('Escape');
console.log('✓ 관리자: 결제 없이 전체 목록, 관리자 표시');

// 5) 관리자 풀이: 항목별 풀이 + AI 풀이
await page.locator('section[aria-label="추천 이름"] .name-card').first().click();
await page.waitForSelector('section[aria-label="항목별 풀이"]');
assert.equal(await page.locator('.paywall').count(), 0);
await page.click('.ai-card button:has-text("AI 풀이 받기")');
await page.waitForSelector('.ai-text h3');
assert.equal(await page.locator('.ai-text h3').first().textContent(), '이름에 담긴 뜻');
assert.equal(await page.locator('.ai-text b').first().textContent(), '상서로운');
const sent = aiBodies[0]?.summary;
assert.ok(sent?.이름?.한글?.startsWith('김'), 'AI에 이름 정보');
assert.ok(!JSON.stringify(sent).includes('2026'), 'AI 요청에 생년월일이 들어감');
await page.fill('.ai-ask input', '부르기 쉬운가요?');
await page.click('.ai-ask button');
await page.waitForFunction(() => document.querySelectorAll('.ai-answer').length === 2);
assert.equal(aiBodies[1]?.question, '부르기 쉬운가요?');
console.log('✓ 관리자 풀이: 항목별 풀이 + AI 풀이·질문 (생년월일 안 보냄)');

// 6) 내 Claude 계정으로(무료): 요청 글 복사 + claude.ai 열기
{
  const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('.ai-card button:has-text("내 Claude 계정으로")')]);
  assert.ok(popup.url().startsWith('https://claude.ai/new'), `claude.ai가 열리지 않음: ${popup.url()}`);
  await popup.close();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes('성명학') && clip.includes('"한글"'), '요청 글이 복사되지 않음');
  assert.ok(!clip.includes('2026'), '복사한 글에 생년월일이 들어감');
  assert.ok(await page.locator('text=복사했어요').count(), '복사 안내 없음');
}
console.log('✓ 내 Claude 계정으로 풀이(글 복사 + claude.ai 열기)');

assert.deepEqual(errors, [], `페이지 오류: ${errors.join('\n')}`);
await browser.close();
console.log('이용권 테스트 통과');
