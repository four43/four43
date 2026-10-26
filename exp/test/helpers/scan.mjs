// exp/test/helpers/scan.mjs: .js/.mjs files under a path and the module specifiers they import (static, re-export,
// side-effect and dynamic, comments stripped), for the workspace and phase 3 done-when tests (lion-hawk 3m).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from 'lion-hawk/test';

export function jsFiles(p) {
  if (!existsSync(p)) return [];
  if (!statSync(p).isDirectory()) return /\.m?js$/.test(p) ? [p] : [];
  return readdirSync(p).sort().flatMap(n => jsFiles(join(p, n)));
}
const SPEC = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
export function importsOf(files, match) {
  const out = [];
  for (const file of files) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(SPEC)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (match.test(spec)) out.push({ file, line: src.slice(0, m.index).split('\n').length, spec });
    }
  }
  return out;
}
