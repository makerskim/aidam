#!/usr/bin/env node
/**
 * 아이담 ↔ 내 Claude Code 연결 프로그램 (개인용)
 *
 * 이 프로그램을 켜면 내 컴퓨터에서 아이담이 열리고(http://localhost:8765),
 * 그 화면의 AI 풀이를 내 컴퓨터에 로그인된 공식 Claude Code(구독 로그인)가 써 준다.
 * - 내 컴퓨터 안에서만 듣는다(localhost). 바깥에서는 닿지 않는다.
 * - Claude 계정 정보나 토큰을 읽거나 내보내지 않는다. 설치된 `claude` 명령을 그대로 실행할 뿐이다.
 * - 이 프로그램이 연 화면에서 온 요청만 받는다(다른 사이트는 거절).
 * - Claude Code의 도구(파일 읽기·명령 실행 등)는 모두 끈 채로 글만 쓰게 한다.
 *
 * 준비: Node.js 20 이상, Claude Code 설치 후 한 번 로그인(터미널에서 `claude` 실행)
 * 실행: node aidam-claude-bridge.mjs
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '2';
export const APP = 'aidam-claude-bridge';
const DEFAULT_PORT = 8765;
const MAX_PROMPT = 20_000;
const TIMEOUT_MS = 180_000;
/** 내려받을 때 사이트 주소로 바뀐다. 그대로면 기본 주소를 쓴다. SITE 환경 변수로 바꿀 수 있다 */
const BAKED_SITE = '__AIDAM_SITE__';
const DEFAULT_SITE = 'https://makerskim.github.io/aidam';

/** 설치된 Claude Code를 도구 없이 한 번 실행해 글을 받는다 */
export function runClaude(prompt, { bin = 'claude', cwd, timeoutMs = TIMEOUT_MS, model } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--tools=', '--output-format', 'json', '--no-session-persistence'];
    if (model) args.push('--model', model);
    const child = spawn(bin, args, { cwd, shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Object.assign(new Error('Claude Code가 제때 답하지 않았어요. 잠시 뒤 다시 해 주세요.'), { code: 'TIMEOUT' }));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(e.code === 'ENOENT' ? 'Claude Code가 설치되어 있지 않아요. 설치 후 터미널에서 claude 를 한 번 실행해 로그인해 주세요.' : e.message), { code: 'NO_CLAUDE' }));
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(out.slice(out.indexOf('{')));
        if (data.is_error || typeof data.result !== 'string' || !data.result.trim()) {
          return reject(Object.assign(new Error(typeof data.result === 'string' && data.result ? data.result : 'Claude Code가 답을 주지 않았어요. 터미널에서 claude 를 실행해 로그인 상태를 확인해 주세요.'), { code: 'CLAUDE_ERROR' }));
        }
        resolve(data.result.trim());
      } catch {
        const msg = (err || out).trim().slice(0, 300);
        const missing = /not recognized|not found|찾을 수 없|아닙니다/.test(msg);
        reject(Object.assign(new Error(missing ? 'Claude Code가 설치되어 있지 않아요. 설치 후 터미널에서 claude 를 한 번 실행해 로그인해 주세요.' : msg || 'Claude Code 실행에 실패했어요.'), { code: missing ? 'NO_CLAUDE' : 'CLAUDE_ERROR' }));
      }
    });
    child.stdin.end(prompt);
  });
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('요청이 너무 길어요.'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

/**
 * 요청 처리기. site: 아이담 사이트 주소(끝에 / 없이), run: 풀이를 쓰는 함수
 * - /__bridge/health, /__bridge/explain 은 여기서 처리
 * - 나머지는 아이담 사이트에서 가져와 그대로 보여 준다(같은 주소에서 열리므로 브라우저가 막지 않는다)
 */
export function createHandler({ site, run = runClaude, fetchImpl = fetch }) {
  let busy = false;
  const siteOrigin = new URL(site).origin;
  return async (req, res) => {
    const port = req.socket.localPort;
    const host = req.headers.host ?? '';
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    // 다른 이름으로 이 포트에 닿는 요청(DNS 속임)은 받지 않는다
    if (![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host)) {
      return send(403, { error: 'BAD_HOST', message: '이 주소로는 쓸 수 없어요.' });
    }
    const path = (req.url ?? '/').split('?')[0];
    try {
      if (path === '/__bridge/health' && req.method === 'GET') return send(200, { ok: true, app: APP, version: VERSION });

      if (path === '/__bridge/explain') {
        // 이 프로그램이 연 화면에서 보낸 요청만 받는다
        const sameOrigin = req.headers.origin === `http://${host}` && req.headers['sec-fetch-site'] !== 'cross-site';
        if (req.method !== 'POST' || !sameOrigin || !/^application\/json/i.test(req.headers['content-type'] ?? '')) {
          return send(403, { error: 'BAD_ORIGIN', message: '이 화면에서만 쓸 수 있어요.' });
        }
        let prompt = '';
        try {
          prompt = String(JSON.parse((await readBody(req, MAX_PROMPT * 4)).toString('utf8')).prompt ?? '');
        } catch (e) {
          return send(e.status ?? 400, { error: 'BAD_JSON', message: e.status ? e.message : '요청 형식이 잘못됐어요.' });
        }
        if (!prompt.trim() || prompt.length > MAX_PROMPT) return send(400, { error: 'BAD_PROMPT', message: '풀이할 내용이 없거나 너무 길어요.' });
        if (busy) return send(429, { error: 'BUSY', message: '앞선 풀이를 쓰는 중이에요. 잠시 뒤 다시 해 주세요.' });
        busy = true;
        try {
          return send(200, { text: await run(prompt) });
        } catch (e) {
          return send(502, { error: e.code ?? 'CLAUDE_ERROR', message: e.message });
        } finally {
          busy = false;
        }
      }
      if (path.startsWith('/__bridge/')) return send(404, { error: 'NOT_FOUND', message: '없는 주소예요.' });

      // 아이담 사이트를 그대로 가져온다. 사이트 파일은 GET만, 서버(/api)는 로그인 토큰과 함께 그대로 넘긴다
      const isApi = path.startsWith('/api/');
      if (!isApi && req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'METHOD', message: '지원하지 않는 요청이에요.' });
      const headers = {};
      for (const h of ['authorization', 'content-type', 'accept']) if (req.headers[h]) headers[h] = req.headers[h];
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      if (hasBody) headers.origin = siteOrigin;
      const up = await fetchImpl(site + (req.url ?? '/'), {
        method: req.method,
        headers,
        body: hasBody ? await readBody(req, 100_000) : undefined,
        redirect: 'follow',
      });
      const out = { 'Content-Type': up.headers.get('content-type') ?? 'application/octet-stream' };
      // 사이트 파일은 이름에 버전이 들어 있어 오래 두어도 되지만, 첫 화면과 서버 응답은 늘 새로 받는다
      out['Cache-Control'] = isApi || path === '/' || path.endsWith('.html') || path.endsWith('sw.js') ? 'no-store' : (up.headers.get('cache-control') ?? 'no-cache');
      res.writeHead(up.status, out);
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await up.arrayBuffer()));
    } catch (e) {
      if (!res.headersSent) send(e.status ?? 502, { error: 'SITE_UNREACHABLE', message: `아이담 사이트(${site})에 닿지 않아요. 인터넷 연결을 확인해 주세요.` });
      else res.end();
    }
  };
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
  } catch {
    /* 브라우저를 못 열어도 주소는 화면에 적어 둔다 */
  }
}

// 직접 실행했을 때만 서버를 띄운다(테스트에서는 불러오기만 한다)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const site = (process.env.SITE || (BAKED_SITE.startsWith('__') ? DEFAULT_SITE : BAKED_SITE)).replace(/\/+$/, '');
  const cwd = join(tmpdir(), 'aidam-claude-bridge');
  mkdirSync(cwd, { recursive: true });
  const run = (prompt) => runClaude(prompt, { cwd, bin: process.env.CLAUDE_BIN || 'claude', model: process.env.CLAUDE_MODEL || undefined });
  const handler = createHandler({ site, run });
  const url = `http://localhost:${port}/`;
  const main = createServer(handler);
  main.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `이미 켜져 있어요. 브라우저에서 ${url} 를 여세요. (다시 켜려면 먼저 켜 둔 창을 닫아 주세요)` : `켜지 못했어요: ${e.message}`);
    process.exit(1);
  });
  main.listen(port, '127.0.0.1', () => {
    // localhost가 IPv6(::1)로 풀리는 컴퓨터에서도 열리게 한다(안 되면 무시)
    createServer(handler).on('error', () => undefined).listen(port, '::1');
    console.log('아이담 ↔ 내 Claude Code 연결이 켜졌어요.');
    console.log(`  여기서 쓰세요: ${url}  (브라우저가 자동으로 열려요)`);
    console.log(`  아이담 사이트: ${site}`);
    console.log('이 창을 켜 둔 동안만 동작해요. 끄려면 Ctrl+C 를 누르세요.');
    if (!process.env.NO_OPEN) openBrowser(url);
  });
}
