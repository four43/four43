// games/test/perf/sizes.mjs: bytes and gzip (level 9) per file and in total for a built site dir (overview §8 R3).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
export function sizeReport(dir) {
  const files = [];
  const walk = d => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else { const b = readFileSync(p); files.push({ path: relative(dir, p), bytes: b.length, gzip: gzipSync(b, { level: 9 }).length }); }
    }
  };
  walk(dir);
  return { files, total: files.reduce((t, f) => ({ bytes: t.bytes + f.bytes, gzip: t.gzip + f.gzip }), { bytes: 0, gzip: 0 }) };
}
