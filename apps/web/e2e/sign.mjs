/* global document, sessionStorage, localStorage */
// 서명 확인 테스트: 서버 답을 가짜로 바꿔도 잠금이 풀리지 않는지 본다.
// 사용법: node e2e/sign.mjs  (스스로 빌드하고 4175번에서 띄운다)
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4175;

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const sign = async (key, m) => Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(m))).toString('base64url');
const plan = { amount: 990, orderName: '아이담 이름 분석 1회' };
/** 서버 답을 만든다. key가 있으면 그 키로 서명한다. tamper는 서명한 뒤에 바꿔치기할 값 */
async function me(key, { uid = 'preview', admin = false, adminUntil = 0, keys = [] } = {}, tamper = {}) {
  const iat = Date.now();
  const sig = key ? await sign(key, `aidam-access-2|${uid}|${admin ? 1 : 0}|${adminUntil}|${iat}|${keys.join(',')}`) : null;
  return { uid, iat, sig, admin, adminUntil, keys, ai: { left: 0, limit: 20 }, plan, codeChannel: null, ...tamper };
}

execFileSync('npx', ['vite', 'build', '--outDir', 'dist-sign'], { cwd: web, stdio: 'ignore', env: { ...process.env, VITE_DISABLE_CLOUD: '1', VITE_API_BASE: '/api', VITE_ENTITLE_PUB: JSON.stringify(pub) } });
const server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-sign', '--port', String(PORT), '--strictPort'], { cwd: web, stdio: 'ignore', detached: true });
const BASE = `http://localhost:${PORT}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  for (let i = 0; i < 40; i++) {
    try {
      await page.goto(`${BASE}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  let answer = null;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/config') return json(200, { plan, payReady: true, aiReady: false });
    if (url.pathname === '/api/me' && answer) return json(200, answer);
    return json(401, { error: 'UNAUTHORIZED', message: '로그인이 필요해요.' });
  });
  await page.goto(`${BASE}/`);
  await page.click('.hero .btn-primary');
  await page.click('.modal .google-btn'); // 미리보기 계정으로 로그인
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
  const cards = () => page.locator('section[aria-label="추천 이름"] .name-card').count();
  // 이 분석의 열쇠를 알아낸다(결제 화면으로 갈 때 기억해 두는 값)
  await page.waitForSelector('.paywall');
  await page.click('.paywall .btn-primary');
  await page.waitForSelector('.plan-card');
  const ticket = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aidam:pay')).ticket);
  await page.goBack();
  const check = async (label, a, open, keepCache = false) => {
    answer = a;
    if (!keepCache) await page.evaluate(() => localStorage.removeItem('aidam:me:preview'));
    await page.reload();
    await page.waitForSelector('.name-card', { timeout: 40000 });
    if (open) await page.waitForFunction(() => document.querySelectorAll('section[aria-label="추천 이름"] .name-card').length > 3, null, { timeout: 15000 });
    else await page.waitForSelector('.paywall', { timeout: 15000 });
    const n = await cards();
    assert.equal(open ? n > 3 : n === 3, true, `${label}: 이름 ${n}개`);
    console.log(`✓ ${label} → ${open ? '열림' : '잠김'}`);
  };
  const later = Date.now() + 3_600_000;
  await check('서명 없이 열쇠가 있다고 답함', await me(null, { keys: [ticket] }), false);
  await check('서명 없이 관리자 모드라고 답함', await me(null, { admin: true, adminUntil: later }), false);
  await check('다른 키로 서명', await me(other.privateKey, { keys: [ticket] }), false);
  await check('다른 사람(uid)의 서명을 가져옴', await me(kp.privateKey, { uid: 'someone-else', keys: [ticket] }), false);
  await check('서명한 뒤 열쇠를 끼워 넣음', await me(kp.privateKey, { keys: [] }, { keys: [ticket] }), false);
  await check('서명한 뒤 관리자 모드를 켬', await me(kp.privateKey, { admin: true }, { adminUntil: later }), false);
  await check('다른 분석의 열쇠만 있음', await me(kp.privateKey, { keys: ['r.zzzzzzzz.zzzzzzzz.zzzzzzzz'] }), false);
  await check('관리자 계정이지만 번호를 넣지 않음', await me(kp.privateKey, { admin: true }), false);
  await check('올바른 서명 + 이 분석의 열쇠', await me(kp.privateKey, { keys: [ticket] }), true);
  await check('그 뒤 서버가 잠깐 옛 답(열쇠 없음)을 줌', await me(kp.privateKey, { keys: [] }), true, true);
  await check('올바른 서명의 관리자 모드', await me(kp.privateKey, { admin: true, adminUntil: later }), true);
  console.log('서명 확인 테스트 통과');
} finally {
  await browser.close();
  try {
    process.kill(-server.pid);
  } catch {
    /* 이미 꺼짐 */
  }
}
