#!/usr/bin/env node
/**
 * 아이담 ↔ 내 Claude Code 연결 프로그램 (개인용)
 *
 * 내 컴퓨터에 로그인되어 있는 공식 Claude Code(구독 로그인)를 불러, 아이담 사이트의 이름 풀이를 쓰게 한다.
 * - 이 프로그램은 내 컴퓨터(127.0.0.1)에서만 듣는다. 바깥에서는 닿지 않는다.
 * - Claude 계정 정보나 토큰을 읽거나 내보내지 않는다. 설치된 `claude` 명령을 그대로 실행할 뿐이다.
 * - 아이담 사이트 주소에서 온 요청 + 아래에 나오는 연결 번호가 맞을 때만 받는다.
 * - Claude Code의 도구(파일 읽기·명령 실행 등)는 모두 끈 채로 글만 쓰게 한다.
 *
 * 준비: Node.js 20 이상, Claude Code 설치 후 한 번 로그인(터미널에서 `claude` 실행)
 * 실행: node aidam-claude-bridge.mjs
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VERSION = '1';
const DEFAULT_PORT = 8765;
const MAX_PROMPT = 20_000;
const TIMEOUT_MS = 180_000;

/** 요청을 받을 사이트 주소. ALLOW_ORIGINS(쉼표로 구분)로 더할 수 있다 */
const BASE_ORIGINS = ['https://makerskim.github.io', 'http://localhost:4173', 'http://localhost:4174', 'http://localhost:5173'];
const WORKERS_DEV = /^https:\/\/aidam\.[a-z0-9-]+\.workers\.dev$/;

export function originAllowed(origin, extra = []) {
  if (!origin) return false;
  return BASE_ORIGINS.includes(origin) || extra.includes(origin) || WORKERS_DEV.test(origin);
}

function loadToken(file) {
  if (existsSync(file)) {
    const t = readFileSync(file, 'utf8').trim();
    if (t.length >= 16) return t;
  }
  const t = randomBytes(18).toString('base64url');
  writeFileSync(file, t + '\n', { mode: 0o600 });
  return t;
}

const same = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

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
      reject(Object.assign(new Error('Claude Code가 제때 답하지 않았어요.'), { code: 'TIMEOUT' }));
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
        reject(Object.assign(new Error((err || out).trim().slice(0, 300) || 'Claude Code 실행에 실패했어요.'), { code: 'CLAUDE_ERROR' }));
      }
    });
    child.stdin.end(prompt);
  });
}

export function createBridge({ token, run = runClaude, extraOrigins = [] }) {
  let busy = false;
  return createServer(async (req, res) => {
    const origin = req.headers.origin ?? '';
    const ok = originAllowed(origin, extraOrigins);
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(ok ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      });
      res.end(JSON.stringify(body));
    };
    if (!ok) return send(403, { error: 'BAD_ORIGIN', message: '아이담 사이트에서만 쓸 수 있어요.' });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        // 사이트(https)에서 내 컴퓨터로 보내는 요청을 브라우저가 허락하도록
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      });
      return res.end();
    }

    const auth = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '')?.[1] ?? '';
    if (!auth || !same(auth, token)) return send(401, { error: 'BAD_TOKEN', message: '연결 번호가 맞지 않아요.' });

    const path = (req.url ?? '').split('?')[0];
    if (req.method === 'GET' && path === '/health') return send(200, { ok: true, version: VERSION });

    if (req.method === 'POST' && path === '/explain') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_PROMPT * 4) return send(413, { error: 'TOO_LARGE', message: '요청이 너무 길어요.' });
      }
      let prompt = '';
      try {
        prompt = String(JSON.parse(raw).prompt ?? '');
      } catch {
        return send(400, { error: 'BAD_JSON', message: '요청 형식이 잘못됐어요.' });
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
    return send(404, { error: 'NOT_FOUND', message: '없는 주소예요.' });
  });
}

// 직접 실행했을 때만 서버를 띄운다(테스트에서는 불러오기만 한다)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const token = loadToken(join(homedir(), '.aidam-bridge-token'));
  const cwd = join(tmpdir(), 'aidam-claude-bridge');
  mkdirSync(cwd, { recursive: true });
  const extraOrigins = (process.env.ALLOW_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const run = (prompt) => runClaude(prompt, { cwd, bin: process.env.CLAUDE_BIN || 'claude', model: process.env.CLAUDE_MODEL || undefined });
  createBridge({ token, run, extraOrigins }).listen(port, '127.0.0.1', () => {
    console.log('아이담 ↔ 내 Claude Code 연결이 켜졌어요.');
    console.log(`  주소: http://127.0.0.1:${port} (내 컴퓨터에서만 열려요)`);
    console.log(`  연결 번호: ${token}`);
    console.log('아이담 풀이 화면 → AI 풀이 → "내 컴퓨터의 Claude Code 연결"에 이 번호를 넣어 주세요.');
    console.log('끄려면 이 창에서 Ctrl+C 를 누르세요.');
  });
}
