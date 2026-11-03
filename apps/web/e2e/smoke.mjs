/* global document */
// 빌드본 스모크 테스트. 사용법: pnpm -C apps/web build && pnpm -C apps/web preview & node apps/web/e2e/smoke.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:4173';

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function noHorizontalScroll(label) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(w <= 360, `${label}: 가로 스크롤 발생 (${w}px)`);
}

// 1) 홈 → 한 명 작명: 성 → 아기 수 → 성별 → 출생 → 조건
await page.goto(`${BASE}/`);
await page.click('text=이름 짓기 시작');
await page.waitForSelector('#surname');
await page.fill('#surname', '김');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("한 명")');
await page.click('button.tile:has-text("여자아이")');
await page.fill('#baby-year', '2026');
await page.selectOption('select[aria-label="월"]', '3');
await page.selectOption('select[aria-label="일"]', '14');
await page.fill('#baby-time', '09:30');
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('text=사주 분석', { timeout: 30000 });
await page.waitForSelector('.name-row', { timeout: 30000 });
assert.ok(await page.locator('text=작명가의 풀이').count(), '사주 풀이가 먼저 보이지 않음');
const count = await page.locator('.name-row').count();
assert.ok(count >= 1, '추천 결과가 없음');
await noHorizontalScroll('결과');
console.log(`✓ 사주 분석 + 추천 결과 ${count}개`);

// 2) 리포트: 추천 이유·점수표, 분석 코드 문구 없음, 기록 자동 저장
await page.locator('.name-row .who').first().click();
await page.waitForSelector('.hero-name', { timeout: 30000 });
assert.ok(await page.locator('text=이 이름을 이렇게 봤어요').count(), '추천 이유 없음');
assert.ok(await page.locator('table[aria-label="점수표"]').count(), '점수표 없음');
assert.equal(await page.locator('text=분석 코드').count(), 0, '분석 코드 문구가 남아 있음');
const name1 = await page.locator('.syls').first().getAttribute('aria-label');
await noHorizontalScroll('리포트');
console.log('✓ 리포트(추천 이유·점수표)');

// 3) 같은 링크를 새 창에서 열면 같은 결과
const url = page.url();
const page2 = await browser.newPage({ viewport: { width: 360, height: 780 } });
await page2.goto(url);
await page2.waitForSelector('.hero-name', { timeout: 30000 });
assert.equal(await page2.locator('.syls').first().getAttribute('aria-label'), name1, '공유 링크 재현 실패');
await page2.close();
console.log('✓ 공유 링크 재현');

// 4) 북마크 → 이름함
await page.click('button[aria-label="북마크"]');
await page.goto(`${BASE}/#/me`);
await page.waitForSelector('text=내 이름함');
assert.ok((await page.locator('.name-row').count()) >= 1, '기록이 저장되지 않음');
await page.click('button:has-text("북마크 1")');
assert.equal(await page.locator('.name-row').count(), 1, '북마크 탭에 이름이 없음');
console.log('✓ 이름함 기록·북마크');

// 5) 쌍둥이: 아이별 사주 + 이름 세트
await page.goto(`${BASE}/#/name`);
await page.waitForSelector('#surname');
await page.fill('#surname', '이');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("쌍둥이")');
await page.click('button:has-text("다음")');
await page.fill('#baby-year', '2026');
await page.selectOption('select[aria-label="월"]', '4');
await page.selectOption('select[aria-label="일"]', '2');
await page.fill('#kid0-time', '10:05');
await page.fill('#kid1-time', '10:09');
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 세트 추천받기")');
await page.waitForSelector('text=추천 이름 세트', { timeout: 40000 });
assert.ok(await page.locator('button:has-text("둘째")').count(), '아이별 사주 탭 없음');
await noHorizontalScroll('다둥이');
console.log('✓ 쌍둥이 사주 + 이름 세트');

// 6) 셀프 분석 "김하윤" (사주 없이)
await page.goto(`${BASE}/#/self`);
await page.fill('#surname', '김');
await page.fill('#given', '하윤');
await page.click('label.switch:has-text("사주까지")');
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.waitForSelector('[aria-label="윤 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="윤 한자"] .hanja-opt:has-text("潤")');
await page.click('button:has-text("풀이 보기")');
await page.waitForSelector('.hero-name', { timeout: 30000 });
const label = await page.locator('.syls').first().getAttribute('aria-label');
assert.ok(label?.includes('河') && label.includes('潤'), '셀프 분석 한자 없음');
console.log('✓ 셀프 분석');

// 7) 없는 날짜 안내 · 깨진 링크
await page.goto(`${BASE}/#/name`);
await page.waitForSelector('#surname');
await page.fill('#surname', '박');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("한 명")');
await page.click('button.tile:has-text("남자아이")');
await page.fill('#baby-year', '2023');
await page.selectOption('select[aria-label="월"]', '2');
await page.selectOption('select[aria-label="일"]', '30');
await page.click('button:has-text("시간 모름")');
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('[role="alert"]', { timeout: 15000 });
console.log('✓ 없는 날짜 안내:', (await page.locator('[role="alert"]').textContent())?.trim());
await page.goto(`${BASE}/#/report?s=broken!!`);
await page.waitForSelector('text=풀이할 이름 정보가 없어요');
console.log('✓ 깨진 링크 안내');

await browser.close();
const real = errors.filter((e) => !e.includes('React Router Future Flag'));
assert.deepEqual(real, [], `콘솔 오류: ${real.join(' | ')}`);
console.log('✓ 콘솔 오류 없음');
