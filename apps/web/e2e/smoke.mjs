/* global document, window, getComputedStyle */
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
assert.ok(await page.locator('.hero >> text=이름 풀이').count(), '이름 풀이 버튼 없음');
assert.equal(await page.locator('.story-step').count(), 3, '세 단계 소개 없음');
assert.ok(await page.locator('h2:has-text("이름을 담기 위해")').count(), '소개 제목');
assert.equal(await page.locator('.hero-brand').evaluate((el) => getComputedStyle(el).animationName), 'none', '브랜드가 움직임');
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
assert.equal(await page.locator('.opt-row').count(), 2, '정씨 흔한 한자 후보(鄭·丁)');
assert.ok(await page.locator('text=드물게 쓰는 한자 1개 더 보기').count(), '드문 성 한자 펼치기 없음');
assert.equal(await page.locator('text=본관').count(), 0, '본관이 남아 있음');
await page.click('.opt-row:has-text("鄭")');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("새 이름 추천받기")');
await page.click('.wizard-actions button:has-text("다음")');
await page.click('button.tile:has-text("한 명")');
await page.click('.wizard-actions button:has-text("다음")');
await page.click('button.tile:has-text("여자아이")');
await page.click('.wizard-actions button:has-text("다음")');
await birth(page, 'baby', '20260314', '0930');
assert.equal(await page.inputValue('#baby-date'), '2026.03.14', '날짜 자동 서식');
assert.equal(await page.inputValue('#baby-time'), '09:30', '시각 자동 서식');
assert.ok(await page.locator('.df-hint:has-text("토요일")').count(), '요일 표시 없음');
await page.click('button[aria-label="달력에서 고르기"]');
await page.click('[aria-label="2026년 3월 15일"]');
assert.equal(await page.inputValue('#baby-date'), '2026.03.15', '달력에서 고르기');
// 달력: 제목 → 연도 → 월 → 날짜
await page.click('button[aria-label="달력에서 고르기"]');
await page.click('.cal-title');
await page.click('.cal-cell:has-text("2025")');
await page.click('.cal-cell:has-text("7월")');
await page.click('[aria-label="2025년 7월 7일"]');
assert.equal(await page.inputValue('#baby-date'), '2025.07.07', '연도·월 격자로 고르기');
// 시각: 오후 3시 15분 → +1분
await page.click('button[aria-label="시각 고르기"]');
await page.click('.tp2-ampm button:has-text("오후")');
await page.locator('.tp2-grid').first().locator('button', { hasText: /^3$/ }).click();
await page.locator('.tp2-grid').nth(1).locator('button', { hasText: /^15$/ }).click();
await page.click('button[aria-label="1분 늦게"]');
await page.click('.tp2-done');
assert.equal(await page.inputValue('#baby-time'), '15:16', '시각 고르기');
await page.fill('#baby-time', '0930');
await page.fill('#baby-date', '2026.3.14');
await page.click('#baby-place');
await page.locator('.pk-pop .pk-opt', { hasText: '부산' }).click();
await page.click('button:has-text("다음")');
await page.click('button:has-text("이름 추천받기")');
await page.waitForSelector('.name-card', { timeout: 40000 });
assert.ok(await page.locator('.saju-panel').count(), '만세력이 먼저 보이지 않음');
assert.equal(await page.locator('.name-card .chip').count(), 0, '목록 카드에 태그가 남아 있음');
// 결과에는 이름 느낌·등급 버튼 없이 30개를 보여 준다
assert.equal(await page.locator('.res-opt').count(), 0, '결과에 이름 느낌·등급 버튼이 남아 있음');
assert.ok((await page.locator('.name-card').count()) >= 20, '추천이 20개보다 적음');
{
  // 점수순(기본): 점수가 높은 이름부터
  const scores = (await page.locator('.name-card .nc-score b').allTextContents()).map(Number);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores, `점수순이 아님: ${scores.slice(0, 8)}`);
  assert.equal(await page.locator('.seg button:has-text("추천순")').count(), 0, '추천순이 남아 있음');
}
assert.ok(/^\d+$/.test((await page.locator('.name-card .nc-score b').first().textContent()) ?? ''), '점수에 소수점');
assert.equal((await page.locator('.name-card .rank').first().textContent())?.trim(), '1', '순위 표시');
const listScore = (await page.locator('.name-card .nc-score b').first().textContent())?.trim();
console.log(`✓ 사주 요약 + 추천 ${await page.locator('.name-card').count()}개 점수순 (1위 ${listScore}점)`);

// 4) 리포트: 총평 → 항목 5개(눌러서 자세히) → 목록으로 돌아가기
await page.evaluate(() => window.scrollTo(0, 400));
await page.locator('.name-card .nc-link').first().click();
await page.waitForSelector('.crit-row:not(.sub)', { timeout: 40000 });
assert.equal(await page.locator('.crit-row:not(.sub)').count(), 5, '항목 수');
assert.ok(await page.locator('.report .saju-panel').count(), '리포트에 만세력 없음');
assert.ok(await page.locator('.topbar >> text=한자 바꿔 보기').count(), '맨 위 한자 바꿔 보기 없음');
assert.ok(await page.locator('.summary .hl-col').count(), '총평 없음');
assert.equal(await page.locator('.basis-compare .bc-item').count(), 2, '두 기준 점수 비교 없음');
assert.ok(await page.locator('.basis-head:has-text("정통 성명학")').count(), '계산 기준 표시 없음');
{
  const body = (await page.locator('.summary-body').first().textContent()) ?? '';
  assert.ok(/바라는|바람/.test(body), `총평에 이름의 바람이 없음: ${body.slice(0, 60)}`);
  assert.ok(!/undefined|null|NaN/.test(body), `총평에 빈 값: ${body}`);
}
assert.equal(await page.locator('text=분석 코드').count(), 0);
await page
  .waitForFunction((v) => document.querySelector('.big-score')?.textContent?.trim() === `${v}점`, listScore, { timeout: 5000 })
  .catch(() => assert.fail(`목록 점수(${listScore})와 리포트 점수가 다름`));
assert.ok(await page.locator('text=추천 1위').count(), '순위 표시 없음');
await page.locator('.crit-row:not(.sub) .crit-sum').first().click();
assert.ok(await page.locator('.crit-detail').count(), '자세히 펼쳐지지 않음');
await page.click('.crit-sum:has-text("부를 때 소리가 어울리나요")');
assert.ok(await page.locator('.mini-table dt:has-text("해례본")').count() && (await page.locator('.mini-table dt:has-text("운해본")').count()), '두 학설 표 없음');
const name1 = await page.locator('.syls').first().getAttribute('aria-label');
const reportUrl = page.url();
await page.click('.topbar button[aria-label="돌아가기"]');
await page.waitForSelector('.name-card');
assert.equal(await page.locator('.loader').count(), 0, '돌아왔는데 다시 계산함');
await page.waitForFunction(() => window.scrollY > 200, null, { timeout: 3000 }).catch(() => assert.fail('스크롤 위치가 돌아오지 않음'));
console.log('✓ 리포트(총평·항목 펼치기) · 목록으로 돌아오기');

// 5) 만세력 평가 펼쳐 보기
assert.ok((await page.locator('.saju-panel .crit-row').count()) >= 3, '만세력 평가 줄 부족');
await page.locator('.saju-panel .crit-sum').nth(1).click();
assert.ok(await page.locator('.saju-panel .crit-detail').count(), '만세력 자세히 펼쳐지지 않음');
console.log('✓ 만세력 평가·펼쳐 보기');

// 6) 같은 링크 → 같은 결과
const p2 = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await p2.goto(reportUrl);
await p2.waitForSelector('.crit-row:not(.sub)', { timeout: 40000 });
assert.equal(await p2.locator('.syls').first().getAttribute('aria-label'), name1);
await p2.close();
console.log('✓ 링크 재현');

// 7) 저장 → 계정 메뉴 → 저장한 이름 / 검색 기록
await page.goto(reportUrl);
await page.waitForSelector('.crit-row:not(.sub)', { timeout: 40000 });
await page.click('.topbar button[aria-label="저장"]');
await page.click('.avatar');
await page.click('.menu >> text=저장한 이름');
await page.waitForSelector('h1:has-text("저장한 이름")');
assert.equal(await page.locator('.name-row').count(), 1, '저장한 이름 수');
await page.click('.seg button:has-text("검색 기록")');
await page.waitForSelector('h1:has-text("검색 기록")');
assert.ok((await page.locator('.name-row').count()) >= 1, '검색 기록 없음');
console.log('✓ 계정 메뉴 · 저장한 이름 / 검색 기록');

// 8) 쌍둥이: 세트로 / 아이마다 따로
async function twins(mode) {
  await page.goto(`${BASE}/#/name`);
  await page.waitForSelector('#surname');
  await page.fill('#surname', '이');
  await page.click('button:has-text("다음")');
  await page.click('button.tile:has-text("새 이름 추천받기")');
  await page.click('.wizard-actions button:has-text("다음")');
  // 네 명 이상은 직접 정한다(10명까지)
  await page.click('button.tile:has-text("네 명 이상")');
  await page.click('button[aria-label="한 명 늘리기"]');
  assert.equal((await page.locator('.stepper b').textContent())?.trim(), '5명', '아기 수 늘리기');
  await page.click('button.tile:text-is("쌍둥이")');
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
assert.ok(await page.locator('.note-soft').count(), '같은 사주 안내 없음');
assert.equal(await page.locator('.saju-panel').count(), 1, '만세력 하나씩 보기');
assert.ok(await page.locator('.set-card .harmony-pair').count(), '세트 궁합 없음');
await twins('아이마다 따로');
await page.waitForSelector('.name-card', { timeout: 40000 });
// 사주가 같으면 두 아이 목록이 같고, 아이마다 하나씩 고른다
const list0 = await page.locator('.name-card .nc-name b:not(.hj)').allTextContents();
await page.locator('.name-card .nc-pick').first().click();
await page.waitForSelector('text=둘째 만세력');
const list1 = await page.locator('.name-card .nc-name b:not(.hj)').allTextContents();
assert.deepEqual(list1.slice(0, 10), list0.slice(0, 10), '같은 사주인데 목록이 다름');
assert.ok(await page.locator('.name-card .nc-pick').first().isDisabled(), '첫째가 고른 이름을 둘째도 고를 수 있음');
await page.locator('.name-card .nc-pick:not([disabled])').first().click();
await page.waitForSelector('.pick-card .harmony-pair', { timeout: 20000 });
assert.ok(await page.locator('.pick-card .harmony-score').count(), '다둥이 궁합 점수 없음');
console.log('✓ 쌍둥이(세트 / 아이마다 따로)');

// 8a) 계산 기준 바꾸기: 정통 성명학 → 일반 작명앱 (다시 계산하고 기준이 바뀐다)
const classicCards = (await page.locator('.name-card').allInnerTexts()).slice(0, 10).join('|');
await page.click('.basis-head');
assert.equal(await page.locator('.basis-row').count(), 4, '계산 기준 항목 4개(용신·발음오행·배점·한자오행)');
await page.click('.basis-body .choice:has-text("일반 작명앱")');
await page.waitForSelector('.basis-head:has-text("일반 작명앱")', { timeout: 10000 });
await page.waitForSelector('.name-card', { timeout: 40000 });
await page.waitForFunction((prev) => [...document.querySelectorAll('.name-card')].slice(0, 10).map((e) => e.innerText).join('|') !== prev, classicCards, { timeout: 40000 }).catch(() => assert.fail('정통·일반 작명앱 기준 결과가 같음'));
if (!(await page.locator('.basis.open').count())) await page.click('.basis-head');
await page.click('.basis-row:has-text("발음오행") .seg button:has-text("해례본")');
await page.waitForSelector('.basis-head:has-text("부족한 오행 · 해례본")', { timeout: 10000 });
await page.waitForSelector('.name-card', { timeout: 40000 });
console.log('✓ 계산 기준 고르기(묶음·항목별)');

// 8b) 이름 느낌마다 다른 이름 · 돌림자를 걸어도 추천이 비지 않음
async function single(style, fixed) {
  await page.goto(`${BASE}/#/name`);
  await page.waitForSelector('#surname');
  await page.fill('#surname', '김');
  await page.click('button:has-text("다음")');
  await page.click('button.tile:has-text("새 이름 추천받기")');
  await page.click('.wizard-actions button:has-text("다음")');
  await page.click('button.tile:has-text("한 명")');
  await page.click('.wizard-actions button:has-text("다음")');
  await page.click('button.tile:has-text("여자아이")');
  await page.click('.wizard-actions button:has-text("다음")');
  await birth(page, 'baby', '20260314', '0930');
  await page.click('button:has-text("다음")');
  await page.click(`.seg button:has-text("${style}")`);
  await page.fill('#fixed', fixed ? fixed[0] : '');
  if (fixed) await page.click(`[aria-label="${fixed[0]} 한자"] .hanja-opt:has-text("${fixed[1]}")`);
  await page.click('button:has-text("이름 추천받기")');
  await page.waitForSelector('.name-card', { timeout: 40000 });
  return page.locator('.name-card .nc-name b:not(.hj)').allTextContents();
}
const popularNames = await single('요즘 많이 쓰는');
// 조건 바꾸기 → '무엇을 해 드릴까요?'부터 다시
await page.click('.res-head a:has-text("조건 바꾸기")');
await page.waitForSelector('text=무엇을 해 드릴까요?');
await page.goto(`${BASE}/`);
const uniqueNames = await single('흔하지 않은');
{
  const a = new Set(popularNames.slice(0, 20));
  const overlap = uniqueNames.slice(0, 20).filter((n) => a.has(n)).length;
  assert.ok(overlap <= 2, `요즘 많이 쓰는·흔하지 않은 상위 20개가 ${overlap}개 겹침`);
}
const balancedNames = await single('무난한');
assert.notEqual(popularNames[0], uniqueNames[0], '이름 느낌을 바꿔도 첫 이름이 같음');
assert.notEqual(popularNames[0], balancedNames[0], '요즘 많이 쓰는·무난한 첫 이름이 같음');
assert.ok(balancedNames.slice(0, 20).filter((n) => popularNames.slice(0, 20).includes(n)).length <= 2, '요즘 많이 쓰는·무난한이 많이 겹침');
const fixedNames = await single('무난한', ['희', '熙']);
// 남자아이 이름에 여자 이름처럼 들리는 끝소리가 없어야 한다(성별 확인은 엔진 시뮬레이션 테스트에서 폭넓게)
assert.ok(fixedNames.length > 0, '돌림자를 걸면 추천이 비어 있음');
assert.ok(fixedNames.every((n) => n.trim().endsWith('희')), `돌림자 위치: ${fixedNames.slice(0, 3)}`);
await page.fill('#fixed', '').catch(() => {});
console.log(`✓ 이름 느낌별 다른 이름(${popularNames[0]} / ${balancedNames[0]} / ${uniqueNames[0]}) · 돌림자 '희' ${fixedNames.length}개`);

// 9) 정한 이름 풀어보기(작명 흐름 안) → 아쉬운 항목 → 고치기 옵션
await page.goto(`${BASE}/#/name?check=1`);
await page.reload();
await page.waitForSelector('#given');
await page.fill('#given', '하윤');
await page.waitForSelector('[aria-label="하 한자"] .hanja-opt >> nth=2');
assert.equal(await page.locator('text=한글만').count(), 0, '한글만 칸이 남아 있음');
await page.click('[aria-label="하 한자"] .hanja-opt:has-text("河")');
await page.click('button:has-text("다음")');
await page.click('button.tile:has-text("여자아이")');
await page.click('.wizard-actions button:has-text("다음")');
await birth(page, 'baby', '20260314', '0930');
await page.click('button:has-text("풀이 보기")');
await page.waitForSelector('.crit-row:not(.sub)', { timeout: 40000 });
await page.click('.crit-sum:has-text("획수로 본 평생 운")');
assert.ok((await page.locator('.fix-opt').count()) >= 2, '고치기 옵션 없음');
await page.click('.fix-opt:has-text("이 문제가 없는 새 이름 추천받기")');
await page.waitForSelector('.fix-chip', { timeout: 40000 });
await page.waitForSelector('.name-card', { timeout: 40000 });
console.log('✓ 정한 이름 풀어보기 · 고치기 옵션 → 다시 추천');

// 10) 풀어보기 화면: 이름 바로 아래에서 한자 고르기
await page.goto(`${BASE}/#/self`);
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
await page.waitForSelector('.crit-row:not(.sub)', { timeout: 40000 });
console.log('✓ 정한 이름 풀어보기(한자 바꿔 보기 화면)');

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
await m.click('.wizard-actions button:has-text("다음")');
await m.click('button.tile:has-text("한 명")');
await m.click('.wizard-actions button:has-text("다음")');
await m.click('button.tile:has-text("남자아이")');
// 모바일에서도 '다음' 버튼은 화면 맨 아래가 아니라 고르는 칸 바로 아래에 있다
assert.notEqual(await m.locator('.wizard-actions').evaluate((el) => getComputedStyle(el).position), 'fixed', '다음 버튼이 화면 아래에 고정됨');
{
  const tile = await m.locator('button.tile').last().boundingBox();
  const btn = await m.locator('.wizard-actions button').boundingBox();
  assert.ok(tile && btn && btn.y - (tile.y + tile.height) < 90, `다음 버튼이 칸에서 멀리 떨어짐 (${btn && tile ? Math.round(btn.y - tile.y - tile.height) : '?'}px)`);
}
await m.click('.wizard-actions button:has-text("다음")');
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
