// exp/test/gate.mjs: the phase 3 integrator's cross-game gate (lion-hawk 3m, Procedure G). Runs every suite one after
// another under the overview §7.5 caps: unit suites capped at 2G, browser suites one at a time behind the shared flock,
// then optional builds into a scratch dir and the frame-rate probe. Not a test file (node --test runs *.test.mjs only).
//   node test/gate.mjs [--engine <dir>] [--only engine,workspace,browser,perf] [--perf <scratch dir>]
//                      [--baseline <json>] [--enforce rally,pig-pens] [--out <json>] [--log <file>] [--dry]
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const LOCK = '/tmp/claude-1000/lion-hawk-browser.lock';
const CAP = { unit: ['MemoryMax=2G', 'RuntimeMaxSec=600', 512], browser: ['MemoryMax=3G', 'RuntimeMaxSec=900', 2048] };
const envArgs = e => Object.entries(e).flatMap(([k, v]) => ['-E', `${k}=${v}`]);
function wrap(kind, dir, argv, env = {}) {
  const [mem, runtime, heap] = CAP[kind];
  const run = ['systemd-run', '--user', '--wait', '-P', '-p', mem, '-p', 'MemorySwapMax=0', '-p', runtime,
    `--working-directory=${dir}`, '-E', `NODE_OPTIONS=--max-old-space-size=${heap}`, ...envArgs(env), ...argv];
  return { kind, dir, cmd: kind === 'browser' ? ['flock', LOCK, ...run] : run };
}
export const unit = (dir, argv, env) => wrap('unit', dir, argv, env);
export const browser = (dir, argv, env) => wrap('browser', dir, argv, env);

export function engineFiles(engine) {
  const files = readdirSync(join(engine, 'test'), { recursive: true }).filter(f => f.endsWith('.test.mjs')).sort().map(f => `test/${f}`);
  const isBrowser = f => /\blaunch\s*\(/.test(readFileSync(join(engine, f), 'utf8'));
  return { unit: files.filter(f => !isBrowser(f)), browser: files.filter(isBrowser) };
}

export function members(games) {
  const root = JSON.parse(readFileSync(join(games, 'package.json'), 'utf8'));
  return root.workspaces.map(name => {
    const dir = join(games, name), pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    // 2g: Tractor's engine-driven mp harness, with its one named exception (the M-50 frozen-frame test). Gone once 3l deletes it.
    const extras = existsSync(join(dir, 'test/mp.engine.harness.mjs'))
      ? [{ name: 'TP_MP=engine', env: { TP_MP: 'engine' }, argv: ['npm', 'test'], allow: [/with the game frozen \(rAF paused\)/] }] : [];
    return { name, dir, scripts: pkg.scripts ?? {}, extras, buildable: existsSync(join(dir, 'game.config.js')) };
  });
}

export function gatePlan({ engine, games, members, engineUnit, engineBrowser, perf = null, only = null }) {
  if (perf && /(^|\/)site(\/|$)/.test(resolve(perf))) throw new Error(`gate: --perf ${perf} is under a site/ dir (global constraint 8)`);
  const want = k => !only || only.includes(k), steps = [];
  if (want('engine')) {
    steps.push({ name: 'engine unit', ...unit(engine, ['node', '--test', '--test-concurrency=4', ...engineUnit]) });
    for (const f of engineBrowser) steps.push({ name: `engine ${f}`, ...browser(engine, ['node', '--test', '--test-concurrency=4', f]) });
  }
  if (want('workspace')) {
    steps.push({ name: 'workspace', ...unit(games, ['npm', 'test'], { CI: '1' }) });
    for (const m of members) for (const x of m.extras) steps.push({ name: `${m.name} ${x.name}`, allow: x.allow, ...unit(m.dir, x.argv, { CI: '1', ...x.env }) });
  }
  if (want('browser')) {
    for (const m of members) for (const s of Object.keys(m.scripts).filter(k => /^test:(e2e|mobile|peers)/.test(k)).sort()) {
      steps.push({ name: `${m.name} ${s}`, ...browser(m.dir, ['npm', 'run', s], { CI: '1' }) });
    }
  }
  if (want('perf') && perf) {
    for (const m of members.filter(m => m.buildable)) {
      const out = join(perf, m.name), probe = join(perf, `${m.name}.probe.json`);
      steps.push({ name: `${m.name} build`, out, ...unit(m.dir, ['npx', 'lion-hawk', 'build', '--out', out]) });
      steps.push({ name: `${m.name} probe`, probe, game: m.name, ...browser(games, ['node', 'test/perf/probe.mjs', '--game', m.name, '--dir', out, '--out', probe]) });
    }
  }
  return steps;
}

export function parseCounts(text) {
  const sum = re => [...text.matchAll(re)].reduce((t, m) => t + Number(m[1]), 0);
  const failed = [...new Set([...text.matchAll(/^\s*✖ (.+?) \(\d[\d.]*m?s\)\s*$/gm)].map(m => m[1]))];
  return { pass: sum(/^ℹ pass (\d+)$/gm), fail: sum(/^ℹ fail (\d+)$/gm), failed };
}

export function verdict(step, row) {
  if (row.status === 0) return 'pass';
  if (step.allow && row.fail > 0 && row.failed.length > 0 && row.failed.every(n => step.allow.some(re => re.test(n)))) return 'pass (allowed)';
  return 'FAIL';
}

export const dirtyGuarded = porcelain => porcelain.split('\n').filter(l => /^(site\/|exp\/[^/]+\/test\/goldens\/)/.test(l.slice(3)));

async function main() {
  const { values: o } = parseArgs({ options: {
    engine: { type: 'string' }, only: { type: 'string' }, perf: { type: 'string' }, baseline: { type: 'string' },
    enforce: { type: 'string' }, out: { type: 'string' }, log: { type: 'string' }, dry: { type: 'boolean' } } });
  const games = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
  const engine = realpathSync(o.engine ?? join(games, '../../lion-hawk-engine'));
  const { unit: engineUnit, browser: engineBrowser } = engineFiles(engine);
  const steps = gatePlan({ engine, games, members: members(games), engineUnit, engineBrowser, perf: o.perf && resolve(o.perf), only: o.only?.split(',') });
  if (o.dry) { for (const s of steps) console.log(`${s.name}\n  ${s.cmd.join(' ')}`); return; }
  const log = o.log ?? '/tmp/claude-1000/lion-hawk-phase3/3m/gates/gate.log';
  mkdirSync(dirname(log), { recursive: true });
  const rows = [];
  for (const s of steps) {
    if (s.out) rmSync(s.out, { recursive: true, force: true });
    const t0 = Date.now(), r = spawnSync(s.cmd[0], s.cmd.slice(1), { encoding: 'utf8', maxBuffer: 1 << 28 });
    const text = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`;
    appendFileSync(log, `\n### ${s.name}\n$ ${s.cmd.join(' ')}\n${text}`);
    const row = { name: s.name, kind: s.kind, status: r.status, ...parseCounts(text), s: Math.round((Date.now() - t0) / 1000) };
    row.verdict = verdict(s, row);
    rows.push(row);
    console.log(`${row.verdict.padEnd(15)} ${s.name}  pass ${row.pass} fail ${row.fail}  ${row.s}s`);
  }
  const dirty = dirtyGuarded(spawnSync('git', ['-C', dirname(games), 'status', '--porcelain'], { encoding: 'utf8' }).stdout ?? '');
  for (const l of dirty) console.log(`FAIL            guarded path changed: ${l}`);
  const budget = [];
  if (o.baseline && o.perf) {
    const { judge } = await import('./perf/stats.mjs');
    const base = JSON.parse(readFileSync(o.baseline, 'utf8')), enforce = new Set(o.enforce?.split(',') ?? []);
    for (const s of steps.filter(s => s.probe && existsSync(s.probe))) {
      const now = JSON.parse(readFileSync(s.probe, 'utf8'));
      for (const msg of judge(base[s.game], now)) budget.push({ game: s.game, msg, enforced: enforce.has(s.game) });
    }
    for (const b of budget) console.log(`${b.enforced ? 'FAIL' : 'note'}            ${b.game}: ${b.msg}`);
  }
  const ok = rows.every(r => r.verdict !== 'FAIL') && dirty.length === 0 && !budget.some(b => b.enforced);
  if (o.out) { mkdirSync(dirname(o.out), { recursive: true }); writeFileSync(o.out, JSON.stringify({ ok, engine, rows, dirty, budget }, null, 1) + '\n'); }
  console.log(ok ? 'GATE PASS' : 'GATE FAIL');
  process.exitCode = ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
