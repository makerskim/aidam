/* global document */
// 빌드본 스모크 테스트. 사용법: pnpm -C apps/web build && pnpm -C apps/web preview & node apps/web/e2e/smoke.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function pick(id, option) {
  await page.click(`#${id}`);
  await page.locator('.pk-pop .pk-opt', { hasText: new RegExp(`^${option}$`) }).first().click();
}
async function birth(prefix, y, m, d, hh, mm) {
  await pick(`${prefix}-year`, String(y));
  await pick(`${prefix}-month`, `${m}월`);
  await pick(`${prefix}-day`, String(d));
  if (hh !== undefined) {
    await pick(`${prefix}-hour`, `${hh}시`);
    await pick(`${prefix}-minute`, `${String(mm).padStart(2, '0')}분`);
  }
}

// 1) 랜딩: 큰 브랜드와 설명, 맨 아래 원리·출처 한 줄과 Made by
await page.goto(`${BASE}/`);
assert.equal(await page.locator('.hero-brand').textContent(), '아이담');
assert.ok(await page.locator('text=AIDAM').count());
assert.ok(await page.locator('text=Made by makerskim').count(), '만든 사람 표기 없음');
await page.click('text=작명 원리와 출처 보기');
assert.ok(await page.locator('#about').count(), '원리·출처 패널이 열리지 않음');
console.log('✓ 랜딩(브랜드·원리/출처·Made by)');

// 2) 이름 짓기 시작 → 로그인 안내 → 미리보기 계정 로그인
await page.click('.hero .btn-primary');
await page.waitForSelector('.modal');
assert.ok(await page.locator('text=로그인 없이 하기').count());
await page.click('.modal .google-btn');
await page.waitForSelector('#surname');
console.log('✓ 로그인 안내 창');

// 3) 한 명 작명: 성 → 아기 수 → 성별 → 출생(피커) → 조건
await page.fill('#surname', '김');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("한 명")');
await page.click('button.tile:has-text("여자아이")');
await birth('baby', 2026, 3, 14, 9, 30);
await page.click('#baby-place');
await page.locator('.pk-pop .pk-opt', { hasText: '부산' }).click();
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('.name-row', { timeout: 40000 });
assert.ok(await page.locator('text=작명가의 풀이').count(), '사주 풀이가 먼저 보이지 않음');
console.log(`✓ 사주 분석 + 추천 ${await page.locator('.name-row').count()}개`);

// 4) 리포트: 기준 카드 5개(좋은 점·아쉬운 점), 점수표, 분석 코드 없음
await page.locator('.name-row .who').first().click();
await page.waitForSelector('.crit', { timeout: 40000 });
assert.equal(await page.locator('.crit').count(), 5, '기준 카드 수');
assert.ok(await page.locator('.pc.pros li').count() >= 3, '좋은 점 설명 부족');
assert.ok(await page.locator('table[aria-label="점수표"]').count(), '점수표 없음');
assert.equal(await page.locator('text=분석 코드').count(), 0);
const name1 = await page.locator('.syls').first().getAttribute('aria-label');
console.log('✓ 리포트(기준별 쉬운 풀이·점수표)');

// 5) 같은 링크 → 같은 결과
const p2 = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await p2.goto(page.url());
await p2.waitForSelector('.crit', { timeout: 40000 });
assert.equal(await p2.locator('.syls').first().getAttribute('aria-label'), name1);
await p2.close();
console.log('✓ 링크 재현');

// 6) 북마크 → 계정 메뉴 → 내 이름함
await page.click('button[aria-label="북마크"]');
await page.click('.avatar');
await page.click('.menu >> text=내 이름함');
await page.waitForSelector('text=내 이름함');
assert.ok((await page.locator('.name-row').count()) >= 1, '기록 없음');
await page.click('button:has-text("북마크 1")');
assert.equal(await page.locator('.name-row').count(), 1);
console.log('✓ 계정 메뉴 · 이름함 기록/북마크');

// 7) 쌍둥이
await page.goto(`${BASE}/#/name`);
await page.waitForSelector('#surname');
await page.fill('#surname', '이');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("쌍둥이")');
await page.click('button:has-text("다음")');
await birth('baby', 2026, 4, 2);
await pick('kid0-hour', '10시');
await pick('kid0-minute', '05분');
await pick('kid1-hour', '10시');
await pick('kid1-minute', '09분');
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 세트 추천받기")');
await page.waitForSelector('text=어울리는 이름 세트', { timeout: 40000 });
assert.ok(await page.locator('button:has-text("둘째")').count());
console.log('✓ 쌍둥이 이름 세트');

// 8) 셀프 분석(로그인 사용자)
await page.click('.avatar');
await page.click('.menu >> text=지은 이름 풀어보기');
await page.fill('#surname', '김');
await page.fill('#given', '하윤');
await page.click('label.switch:has-text("사주까지")');
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.waitForSelector('[aria-label="윤 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="윤 한자"] .hanja-opt:has-text("潤")');
await page.click('button:has-text("풀이 보기")');
await page.waitForSelector('.crit', { timeout: 40000 });
console.log('✓ 셀프 분석');

// 9) 로그아웃 → 로그인 없이 하기: 저장되지 않음 안내, 풀이·이름함은 로그인 필요
await page.click('.avatar');
await page.click('.menu >> text=로그아웃');
await page.goto(`${BASE}/#/me`);
await page.waitForSelector('text=로그인이 필요해요');
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
m.on('pageerror', (e) => errors.push(e.message));
await m.goto(`${BASE}/`);
await m.click('.hero .btn-primary');
await m.click('text=로그인 없이 하기');
await m.fill('#surname', '박');
await m.click('button:has-text("다음")');
await m.click('button.tile:has-text("한 명")');
await m.click('button.tile:has-text("남자아이")');
await m.click('#baby-year');
await m.locator('.pk-pop .pk-opt', { hasText: /^2023$/ }).click();
await m.click('#baby-month');
await m.locator('.pk-pop .pk-opt', { hasText: /^2월$/ }).click();
await m.click('#baby-day');
await m.locator('.pk-pop .pk-opt', { hasText: /^30$/ }).click();
await m.click('button:has-text("시간 모름")');
await m.click('button:has-text("다음")');
await m.click('button:has-text("이름 추천받기")');
await m.waitForSelector('[role="alert"]', { timeout: 15000 });
const w = await m.evaluate(() => document.documentElement.scrollWidth);
assert.ok(w <= 390, `모바일 가로 스크롤 ${w}`);
console.log('✓ 로그인 없이 하기 · 없는 날짜 안내 · 모바일 폭');
await m.goto(`${BASE}/#/report?s=broken!!`);
await m.waitForSelector('text=풀이할 이름 정보가 없어요');
console.log('✓ 깨진 링크 안내');

await browser.close();
const real = errors.filter((e) => !e.includes('React Router Future Flag'));
assert.deepEqual(real, [], `콘솔 오류: ${real.join(' | ')}`);
console.log('✓ 콘솔 오류 없음');
