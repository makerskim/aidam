/* global document, window */
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

/** 날짜·시각은 숫자로 바로 친다 */
async function birth(p, prefix, date, time) {
  await p.fill(`#${prefix}-date`, date);
  if (time) await p.fill(`#${prefix}-time`, time);
}

// 1) 랜딩: 큰 브랜드, 두 가지 시작, 예시 표시, 맨 아래 원리·출처와 Made by
await page.goto(`${BASE}/`);
assert.equal(await page.locator('.hero-brand').textContent(), '아이담');
assert.ok(await page.locator('text=AIDAM').count());
assert.ok(await page.locator('.hero >> text=정한 이름 풀어보기').count(), '정한 이름 풀어보기 버튼 없음');
assert.ok(await page.locator('.example-tag').count(), '예시 표시 없음');
assert.ok(await page.locator('text=Made by makerskim').count(), '만든 사람 표기 없음');
await page.click('text=작명 원리와 출처 보기');
assert.ok(await page.locator('#about').count(), '원리·출처 패널이 열리지 않음');
console.log('✓ 랜딩(브랜드·예시·원리/출처·Made by)');

// 2) 이름 짓기 시작 → 로그인 안내 → 미리보기 계정 로그인
await page.click('.hero .btn-primary');
await page.waitForSelector('.modal');
assert.ok(await page.locator('text=로그인 없이 하기').count());
await page.click('.modal .google-btn');
await page.waitForSelector('#surname');
console.log('✓ 로그인 안내 창');

// 3) 한 명 작명: 성(한자) → 새 이름 → 한 명 → 성별 → 날짜·시각 입력/달력 → 조건
await page.fill('#surname', '정');
await page.waitForSelector('.opt-row');
assert.equal(await page.locator('.opt-row').count(), 3, '정씨 한자 후보(鄭·丁·程)');
assert.equal(await page.locator('text=본관').count(), 0, '본관이 남아 있음');
await page.click('.opt-row:has-text("鄭")');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("새 이름 추천받기")');
await page.click('button.tile:has-text("한 명")');
await page.click('button.tile:has-text("여자아이")');
await birth(page, 'baby', '20260314', '0930');
assert.equal(await page.inputValue('#baby-date'), '2026.03.14', '날짜 자동 서식');
assert.equal(await page.inputValue('#baby-time'), '09:30', '시각 자동 서식');
assert.ok(await page.locator('.df-hint:has-text("토요일")').count(), '요일 표시 없음');
await page.click('button[aria-label="달력에서 고르기"]');
await page.click('[aria-label="2026년 3월 15일"]');
assert.equal(await page.inputValue('#baby-date'), '2026.03.15', '달력에서 고르기');
await page.fill('#baby-date', '2026.3.14');
await page.click('#baby-place');
await page.locator('.pk-pop .pk-opt', { hasText: '부산' }).click();
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('.name-card', { timeout: 40000 });
assert.ok(await page.locator('.brief').count(), '사주 요약이 먼저 보이지 않음');
assert.equal((await page.locator('.name-card .rank').first().textContent())?.trim(), '1', '순위 표시');
const listScore = (await page.locator('.name-card .nc-score b').first().textContent())?.trim();
console.log(`✓ 사주 요약 + 추천 ${await page.locator('.name-card').count()}개 (1위 ${listScore}점)`);

// 4) 리포트: 총평 → 항목 5개(눌러서 자세히) → 목록으로 돌아가기
await page.evaluate(() => window.scrollTo(0, 400));
await page.locator('.name-card .nc-link').first().click();
await page.waitForSelector('.crit-row', { timeout: 40000 });
assert.equal(await page.locator('.crit-row').count(), 5, '항목 수');
assert.ok(await page.locator('.summary .hl-col').count(), '총평 없음');
assert.equal(await page.locator('text=분석 코드').count(), 0);
await page
  .waitForFunction((v) => document.querySelector('.big-score')?.textContent?.trim() === `${v}점`, listScore, { timeout: 5000 })
  .catch(() => assert.fail(`목록 점수(${listScore})와 리포트 점수가 다름`));
assert.ok(await page.locator('text=추천 1위').count(), '순위 표시 없음');
await page.locator('.crit-sum').first().click();
assert.ok(await page.locator('.crit-detail').count(), '자세히 펼쳐지지 않음');
const name1 = await page.locator('.syls').first().getAttribute('aria-label');
const reportUrl = page.url();
await page.click('button:has-text("추천 목록으로")');
await page.waitForSelector('.name-card');
assert.equal(await page.locator('.loader').count(), 0, '돌아왔는데 다시 계산함');
await page.waitForFunction(() => window.scrollY > 200, null, { timeout: 3000 }).catch(() => assert.fail('스크롤 위치가 돌아오지 않음'));
console.log('✓ 리포트(총평·항목 펼치기) · 목록으로 돌아오기');

// 5) 사주 자세히 보기
await page.click('.brief .more-link');
await page.waitForSelector('text=이렇게 계산했어요', { timeout: 20000 });
assert.ok(await page.locator('.pillars:not(.pillars-sm)').count(), '사주 원국 없음');
await page.click('button:has-text("돌아가기")');
await page.waitForSelector('.name-card');
console.log('✓ 사주 자세히 보기');

// 6) 같은 링크 → 같은 결과
const p2 = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await p2.goto(reportUrl);
await p2.waitForSelector('.crit-row', { timeout: 40000 });
assert.equal(await p2.locator('.syls').first().getAttribute('aria-label'), name1);
await p2.close();
console.log('✓ 링크 재현');

// 7) 북마크 → 계정 메뉴 → 내 이름함
await page.goto(reportUrl);
await page.waitForSelector('.crit-row', { timeout: 40000 });
await page.click('button[aria-label="북마크"]');
await page.click('.avatar');
await page.click('.menu >> text=내 이름함');
await page.waitForSelector('text=내 이름함');
assert.ok((await page.locator('.name-row').count()) >= 1, '기록 없음');
await page.click('button:has-text("북마크 1")');
assert.equal(await page.locator('.name-row').count(), 1);
console.log('✓ 계정 메뉴 · 이름함 기록/북마크');

// 8) 쌍둥이: 세트로 / 아이마다 따로
async function twins(mode) {
  await page.goto(`${BASE}/#/name`);
  await page.waitForSelector('#surname');
  await page.fill('#surname', '이');
  await page.click('button:has-text("다음")');
  await page.click('button.tile:has-text("새 이름 추천받기")');
  await page.click('button.tile:has-text("쌍둥이")');
  await page.click(`button:has-text("${mode}")`);
  await page.click('button:has-text("다음")');
  await page.click('button:has-text("다음")');
  await page.fill('#baby-date', '20260402');
  await page.fill('#kid0-time', '1005');
  await page.fill('#kid1-time', '1009');
  await page.click('button:has-text("다음")');
  await page.click('button:has-text("이름 추천받기")');
}
await twins('서로 어울리는 세트로');
await page.waitForSelector('.set-card', { timeout: 40000 });
assert.equal(await page.locator('.brief').count(), 2, '아이별 사주 요약');
await twins('아이마다 따로');
await page.waitForSelector('.name-card', { timeout: 40000 });
await page.click('.seg button:has-text("둘째")');
await page.waitForSelector('text=둘째 사주');
console.log('✓ 쌍둥이(세트 / 아이마다 따로)');

// 9) 정한 이름 풀어보기(작명 흐름 안) → 아쉬운 항목 → 고치기 옵션
await page.goto(`${BASE}/#/name?check=1`);
await page.reload();
await page.waitForSelector('#given');
await page.fill('#given', '하윤');
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("여자아이")');
await birth(page, 'baby', '20260314', '0930');
await page.click('button:has-text("풀이 보기")');
await page.waitForSelector('.crit-row', { timeout: 40000 });
await page.click('.crit-sum:has-text("획수로 본 평생 운")');
assert.ok((await page.locator('.fix-opt').count()) >= 2, '고치기 옵션 없음');
await page.click('.fix-opt:has-text("이 문제가 없는 새 이름 추천받기")');
await page.waitForSelector('.fix-chip', { timeout: 40000 });
await page.waitForSelector('.name-card', { timeout: 40000 });
console.log('✓ 정한 이름 풀어보기 · 고치기 옵션 → 다시 추천');

// 10) 계정 메뉴의 풀어보기: 이름 바로 아래에서 한자 고르기
await page.click('.avatar');
await page.click('.menu >> text=정한 이름 풀어보기');
await page.fill('#surname', '김');
await page.fill('#given', '하윤');
const givenBox = await page.locator('#given').boundingBox();
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
const pickBox = await page.locator('[aria-label="하 한자"]').boundingBox();
assert.ok(pickBox.y - givenBox.y < 200, '한자 고르기가 이름칸 바로 아래에 없음');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.waitForSelector('[aria-label="윤 한자"] .hanja-opt >> nth=2');
await page.click('[aria-label="윤 한자"] .hanja-opt:has-text("潤")');
// 생일 넣기는 기본으로 켜져 있다
await birth(page, 'self', '20250101', '1200');
await page.click('button:has-text("풀이 보기")');
await page.waitForSelector('.crit-row', { timeout: 40000 });
console.log('✓ 정한 이름 풀어보기(계정 메뉴)');

// 11) 로그아웃 → 로그인 없이 하기: 없는 날짜 안내, 모바일 폭
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
await m.click('button.tile:has-text("새 이름 추천받기")');
await m.click('button.tile:has-text("한 명")');
await m.click('button.tile:has-text("남자아이")');
await m.fill('#baby-date', '20230230');
assert.ok(await m.locator('.df-hint:has-text("없는 날짜")').count(), '없는 날짜 표시');
await m.click('button:has-text("시간 모름")');
await m.click('button:has-text("다음")');
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
