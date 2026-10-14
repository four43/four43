// games/test/owners.mjs: files a phase 3 branch changed outside its plan's "Owns" column (overview §5.2), widened by the
// controller's rulings (2026-10-13-phase-3-contract-issues.md). New files under test/ (tests, fixtures, helpers) and the
// plan's own notes are every engine plan's; integrator files are nobody's (lion-hawk 3m, Procedure M step 2).
//   node test/owners.mjs --repo <git dir> --base <ref> --branch <ref> --plan <3a…3l>
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const T = names => new RegExp(`^test/(${names})[^/]*$`);
export const OWNS = Object.freeze({
  '3a': [/^src\/core\/engine\.js$/, /^src\/view\/(boot|gesture|hook)\.js$/, /^testing\/(headless|playwright)\.js$/, T('domAsserts|gesture\\.test|uiDom\\.test')],
  '3b': [/^src\/defs\/(materials|materials\.base|sidecar)\.js$/, T('materials|sidecar')],
  '3c': [/^src\/core\/(engine|schedule)\.js$/, /^src\/sim\/(world|physics)\//, /^testing\/(headless|invariants|checks)\.js$/, /^test\/fixtures\/phys\//,
    T('world|physics|checks|engine\\.test')],
  '3d': [/^tools\//, /^bin\//, /^test\/fixtures\/models\//, T('bake|build|cli')],
  '3e': [/^src\/view\/boot\.js$/, /^src\/view\/render\//, /^src\/view\/(assets|sync|audio)\/index\.js$/, /^src\/view\/materials\/compiler\.js$/, T('render|e2e-render')],
  '3f': [/^src\/view\/(assets|materials)\//, T('assets|compiler')],
  '3g': [/^src\/view\/(sync|camera|instancing|audio)\//, T('sync|camera|audio|instancing|crowd')],
  '3h': [/^src\/kits\//, /^test\/kits\//],
  '3i': [/^src\/sim\/net\//, /^src\/defs\/fields\.js$/, /^src\/sim\/(replica|interp|forecast)\.js$/, /^testing\/mp\.js$/, T('net|mp')],
  '3j': [/^games\/rally\//],
  '3k': [/^games\/pig-pens\//],
  '3l': [/^games\/tractor-pickup\//],
});
const GAME = new Set(['3j', '3k', '3l']);

export function outside(plan, entries) {
  const rules = OWNS[plan];
  if (!rules) throw new Error(`owners: unknown plan '${plan}' (known: ${Object.keys(OWNS).join(', ')})`);
  const notes = new RegExp(`^docs/plans/2026-10-13-phase-${plan}-[^/]*\\.md$`);
  const ok = ({ status, path }) => rules.some(re => re.test(path))
    || (!GAME.has(plan) && (notes.test(path) || (status === 'A' && /^test\//.test(path))));
  return entries.filter(x => !ok(x));
}

export function parseNameStatus(text) {
  return text.split('\n').filter(Boolean).map(line => { const f = line.split('\t'); return { status: f[0][0], path: f.at(-1) }; });
}

function main() {
  const { values: o } = parseArgs({ options: { repo: { type: 'string' }, base: { type: 'string' }, branch: { type: 'string' }, plan: { type: 'string' } } });
  const r = spawnSync('git', ['-C', o.repo, 'diff', '--name-status', '-M', `${o.base}...${o.branch}`], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`owners: git diff failed: ${r.stderr}`);
  const bad = outside(o.plan, parseNameStatus(r.stdout));
  for (const x of bad) console.log(`outside ${o.plan}: ${x.status} ${x.path}`);
  console.log(bad.length ? `owners: ${bad.length} file(s) outside ${o.plan}` : `owners: ${o.plan} stays inside its files`);
  process.exitCode = bad.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
