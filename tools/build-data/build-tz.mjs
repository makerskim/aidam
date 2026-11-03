// IANA tzdata(Asia/Seoul, Node ICU) → 표준시 전환표. 런타임은 이 표만 쓰므로 브라우저와 무관하게 결정적이다.
// 형식: [[UTC ms(이 시각부터), 오프셋(초)], ...]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Seoul', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function offsetSec(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((local - Math.floor(ms / 1000) * 1000) / 1000);
}
const start = Date.UTC(1890, 0, 1);
const end = Date.UTC(2101, 0, 1);
const step = 15 * 60 * 1000;
const table = [];
let prev = null;
for (let t = start; t < end; t += step) {
  const o = offsetSec(t);
  if (o !== prev) {
    // 전환 시각을 1초 단위로 좁힌다
    let lo = t - step, hi = t;
    if (prev !== null) {
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2000) * 1000;
        if (offsetSec(mid) === o) hi = mid; else lo = mid;
      }
    } else hi = start;
    table.push([hi, o]);
    prev = o;
  }
}
writeFileSync(join(root, 'packages/engine/src/data/seoul-tz.json'), JSON.stringify(table) + '\n');
console.log(table.map(([t, o]) => `${new Date(t).toISOString()} ${o / 3600}`).join('\n'));
