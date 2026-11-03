// 원천 데이터 추출 (1회성). 사용법:
//   npm pack @mandel59/mojidata@1.9.3 && tar xzf mandel59-mojidata-1.9.3.tgz package/dist/moji.db
//   curl -O https://raw.githubusercontent.com/libhangul/libhangul/main/data/hanja/hanja.txt
//   node tools/build-data/extract-sources.mjs package/dist/moji.db hanja.txt
// 결과: data-sources/unihan-ko.tsv, data-sources/libhangul-hanja-1char.txt
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [dbPath, hanjaTxt] = process.argv.slice(2);
if (!dbPath || !hanjaTxt) {
  console.error('usage: extract-sources.mjs <moji.db> <libhangul hanja.txt>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = new DatabaseSync(dbPath, { readOnly: true });
const map = (table) => new Map(db.prepare(`select UCS, value from ${table}`).all().map((r) => [r.UCS, r.value]));
const hangul = map('unihan_kHangul');
const koreanName = map('unihan_kKoreanName');
const edu = map('unihan_kKoreanEducationHanja');
const rs = map('unihan_kRSUnicode');
const total = map('unihan_kTotalStrokes');

const chars = [...new Set([...hangul.keys(), ...koreanName.keys(), ...edu.keys()])].sort(
  (a, b) => a.codePointAt(0) - b.codePointAt(0),
);
const rows = ['# ch\tkRSUnicode\tkTotalStrokes\tkHangul\tkKoreanName\tkKoreanEducationHanja'];
for (const ch of chars) {
  if (!rs.has(ch) || !total.has(ch)) continue;
  rows.push([ch, rs.get(ch), total.get(ch), hangul.get(ch) ?? '', koreanName.get(ch) ?? '', edu.get(ch) ?? ''].join('\t'));
}
writeFileSync(join(root, 'data-sources/unihan-ko.tsv'), rows.join('\n') + '\n');

const set = new Set(chars);
const out = ['# libhangul data/hanja/hanja.txt 의 한 글자 항목만 발췌 (BSD-3-Clause, Copyright (c) 2005,2006 Choe Hwanjin)'];
for (const line of readFileSync(hanjaTxt, 'utf8').split('\n')) {
  const m = /^([가-힣]):(.):(.*)$/u.exec(line);
  if (m && set.has(m[2])) out.push(line);
}
writeFileSync(join(root, 'data-sources/libhangul-hanja-1char.txt'), out.join('\n') + '\n');
console.log(`unihan rows: ${rows.length - 1}, libhangul lines: ${out.length - 1}`);
