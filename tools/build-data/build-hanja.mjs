// data-sources → packages/engine/src/data/hanja-raw.json, data-version.json
// 행 형식: [글자, 읽기('|' 구분), 훈음, kRSUnicode, 총획, 플래그(1=인명용 2=교육용)]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'packages/engine/src/data');
mkdirSync(outDir, { recursive: true });

const meanings = new Map();
const libReadings = new Map();
for (const line of readFileSync(join(root, 'data-sources/libhangul-hanja-1char.txt'), 'utf8').split('\n')) {
  const m = /^([가-힣]):(.):(.*)$/u.exec(line);
  if (!m) continue;
  const [, reading, ch, meaning] = m;
  if (!libReadings.has(ch)) libReadings.set(ch, []);
  libReadings.get(ch).push(reading);
  if (meaning.trim()) {
    const prev = meanings.get(ch);
    meanings.set(ch, prev ? `${prev}, ${meaning.trim()}` : meaning.trim());
  }
}

const rows = [];
for (const line of readFileSync(join(root, 'data-sources/unihan-ko.tsv'), 'utf8').split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [ch, rs, total, hangul, koreanName, edu] = line.split('\t');
  const readings = [];
  for (const tok of hangul.split(' ').filter(Boolean)) {
    const r = tok.split(':')[0];
    if (!readings.includes(r)) readings.push(r);
  }
  for (const r of libReadings.get(ch) ?? []) if (!readings.includes(r)) readings.push(r);
  const flags = (koreanName ? 1 : 0) | (edu ? 2 : 0);
  rows.push([ch, readings.join('|'), meanings.get(ch) ?? '', rs, Number(total), flags]);
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(str)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const json = JSON.stringify(rows);
writeFileSync(join(outDir, 'hanja-raw.json'), json);
writeFileSync(join(outDir, 'data-version.json'), JSON.stringify({ hanja: fnv1a(json), source: 'Unihan(mojidata 1.9.3) + libhangul' }) + '\n');
console.log(`hanja rows: ${rows.length}, version: ${fnv1a(json)}`);
