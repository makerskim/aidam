// 초기 로딩 JS 예산 검사: index.html이 바로 불러오는 JS(gzip)의 합이 250KB 이하인지 확인한다.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist');
const LIMIT = 250 * 1024;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<(?:script[^>]+src|link[^>]+rel="modulepreload"[^>]+href)="\.?\/?([^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const s of srcs) {
  const size = gzipSync(readFileSync(join(dist, s))).length;
  total += size;
  console.log(`${s}: ${(size / 1024).toFixed(1)} KB gzip`);
}
console.log(`초기 JS 합계: ${(total / 1024).toFixed(1)} KB gzip (예산 ${LIMIT / 1024} KB)`);
if (srcs.length === 0) {
  console.error('index.html에서 스크립트를 찾지 못했습니다.');
  process.exit(1);
}
if (total > LIMIT) {
  console.error('예산 초과');
  process.exit(1);
}
