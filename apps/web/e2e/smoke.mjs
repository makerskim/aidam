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

// 1) 홈 → 작명 마법사
await page.goto(`${BASE}/`);
await page.locator('a.entry').first().click();
await page.waitForSelector('#surname');
await page.fill('#surname', '김');
await page.click('button:has-text("金")');
await page.fill('#baby-year', '2026');
await page.selectOption('select[aria-label="월"]', '3');
await page.selectOption('select[aria-label="일"]', '14');
await page.fill('#baby-time', '09:30');
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('.name-row', { timeout: 30000 });
const count = await page.locator('.name-row').count();
assert.ok(count >= 1, '추천 결과가 없음');
await noHorizontalScroll('결과');
console.log(`✓ 추천 결과 ${count}개`);

// 2) 리포트
await page.locator('.name-row .who').first().click();
await page.waitForSelector('.nametag', { timeout: 30000 });
const code1 = await page.locator('text=/분석 코드 [0-9A-F]{8}/').textContent();
await noHorizontalScroll('리포트');
console.log('✓ 리포트 열림');

// 3) 공유 링크 재접속 → 같은 분석 코드 (새 창)
const url = page.url();
const page2 = await browser.newPage({ viewport: { width: 360, height: 780 } });
await page2.goto(url);
await page2.waitForSelector('.nametag', { timeout: 30000 });
const code2 = await page2.locator('text=/분석 코드 [0-9A-F]{8}/').textContent();
assert.equal(code1?.match(/[0-9A-F]{8}/)?.[0], code2?.match(/[0-9A-F]{8}/)?.[0], '공유 링크 재현 실패');
console.log('✓ 공유 링크 재현(같은 분석 코드)');
await page2.close();

// 4) 셀프 분석 "김하윤"
await page.goto(`${BASE}/#/self`);
await page.fill('#surname', '김');
await page.click('button:has-text("金")');
await page.fill('#given', '하윤');
await page.click('button:has-text("사주 없이 볼래요")');
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.waitForSelector('[aria-label="윤 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="윤 한자"] .hanja-opt:has-text("潤")');
await page.click('button:has-text("이름 풀이 보기")');
await page.waitForSelector('.nametag', { timeout: 30000 });
const tag = await page.locator('.nametag').textContent();
assert.ok(tag?.includes('河') && tag.includes('潤'), '셀프 분석 이름패에 한자가 없음');
await noHorizontalScroll('셀프 분석');
console.log('✓ 셀프 분석 리포트');

// 5) 잘못된 입력 안내
await page.goto(`${BASE}/#/manse`);
await page.fill('#manse-year', '2023');
await page.selectOption('select[aria-label="월"]', '2');
await page.selectOption('select[aria-label="일"]', '30');
await page.click('button:has-text("시간 모름")');
await page.click('button:has-text("사주 보기")');
await page.waitForSelector('[role="alert"]', { timeout: 10000 });
console.log('✓ 없는 날짜 안내:', (await page.locator('[role="alert"]').textContent())?.trim());

// 6) 깨진 공유 링크 → 안내 화면
await page.goto(`${BASE}/#/report?s=broken!!`);
await page.waitForSelector('text=풀이할 이름 정보가 없어요');
console.log('✓ 깨진 링크 안내');

await browser.close();
const real = errors.filter((e) => !e.includes('React Router Future Flag'));
assert.deepEqual(real, [], `콘솔 오류: ${real.join(' | ')}`);
console.log('✓ 콘솔 오류 없음');
