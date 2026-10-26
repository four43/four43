#!/usr/bin/env node
// exp/test/render-models.mjs: a contact sheet of every baked model of a Lion Hawk game, drawn through the engine's render path
// (renderer, light rig, material compiler with the game's shading tier and paint, createAssets) in headless Chromium (SwiftShader
// WebGL), on a neutral ground under an orthographic isometric camera, labelled with each model's name, real size and registry
// materials, plus one sphere per registry look. For checking looks (colour, roughness, metalness, lights), not a test.
//
//   node test/render-models.mjs --game tractor-pickup [--out <png>] [--size 1600x1200] [--preset day] [--compare]
//
// --game: tractor-pickup | rally | pig-pens (an adapter in test/render/games/<id>.js says how to get the game's render options).
// --preset: a light preset of the game's rig (day, dusk, night, or the game's own). --compare (tractor-pickup): also draw the
// models the way the released game did (git e03ed71: src/assets.json, Lambert; read with `git show`, never checked out) to
// <out>-e03ed71.png, and both side by side to <out>-compare.png.
// The page and bundle are served from memory on 127.0.0.1 (an ephemeral port); nothing is written but the PNGs.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { PNG } from 'pngjs';
import { loadConfig } from 'lion-hawk/bake';
import { dedupe } from 'lion-hawk/build';
import { launch } from 'lion-hawk/playwright';

const HERE = dirname(fileURLToPath(import.meta.url)), GAMES = resolve(HERE, '..'), RENDER = join(HERE, 'render');
const LEGACY_REF = 'e03ed71'; // the released Tractor Pickup (before lion-hawk phase 3)
const USAGE = 'usage: node test/render-models.mjs --game <tractor-pickup|rally|pig-pens> [--out <png>] [--size 1600x1200] [--preset day] [--compare]';

// esbuild: the page entry with `lh-render-game` bound to the game's adapter; `legacy:<path>` modules come from git (--compare)
async function bundle(entry, { adapter, root }) {
  const legacy = {
    name: 'lh-render', setup(b) {
      b.onResolve({ filter: /^lh-render-game$/ }, () => ({ path: adapter }));
      b.onResolve({ filter: /^legacy:/ }, a => ({ path: `src/${a.path.slice(7)}`, namespace: 'legacy' }));
      b.onResolve({ filter: /assets\.json$/, namespace: 'legacy' }, () => ({ path: 'src/assets.json', namespace: 'legacy' }));
      b.onLoad({ filter: /.*/, namespace: 'legacy' }, a => ({
        contents: execFileSync('git', ['show', `${LEGACY_REF}:./tractor-pickup/${a.path}`], { cwd: GAMES, maxBuffer: 64 << 20 }),
        loader: a.path.endsWith('.json') ? 'json' : 'js', resolveDir: join(GAMES, 'tractor-pickup', dirname(a.path)),
      }));
    },
  };
  const r = await build({ entryPoints: [entry], bundle: true, format: 'esm', write: false, logLevel: 'silent', loader: { '.json': 'json' }, plugins: [legacy, dedupe({ root })] });
  return r.outputFiles[0].text;
}

// One page and one bundle from memory; /baked/* from the game's bake output (inside it only)
function serve(js, baked) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>models</title><link rel="icon" href="data:,"></head><body><canvas></canvas><script type="module" src="/app.js"></script></body></html>';
  const types = { '.glb': 'model/gltf-binary', '.json': 'application/json' };
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
    const send = (code, body, type) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (p === '/' || p === '/index.html') return send(200, html, 'text/html');
    if (p === '/app.js') return send(200, js, 'text/javascript');
    if (p.startsWith('/baked/')) {
      const f = resolve(baked, '.' + p.slice(6));
      if (f.startsWith(baked + sep) && existsSync(f)) return send(200, readFileSync(f), types[f.slice(f.lastIndexOf('.'))] ?? 'application/octet-stream');
    }
    send(404, 'not found', 'text/plain');
  });
  return new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', () => ok(server)); });
}

async function shoot(browser, url, out, { width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage(), logs = [];
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
    await page.goto(url);
    await page.waitForFunction(() => window.__render, null, { timeout: 600_000, polling: 250 });
    const r = await page.evaluate(() => window.__render);
    if (logs.length) console.warn(logs.slice(0, 20).join('\n'));
    if (!r.ok) throw new Error(`render failed: ${r.error}`);
    await page.screenshot({ path: out });
    return r;
  } finally { await context.close(); }
}

function sideBySide(a, b, out) {
  const A = PNG.sync.read(readFileSync(a)), B = PNG.sync.read(readFileSync(b)), gap = 8;
  const o = new PNG({ width: A.width + gap + B.width, height: Math.max(A.height, B.height) });
  o.data.fill(255);
  PNG.bitblt(B, o, 0, 0, B.width, B.height, 0, 0);
  PNG.bitblt(A, o, 0, 0, A.width, A.height, B.width + gap, 0);
  writeFileSync(out, PNG.sync.write(o));
}

async function main() {
  const { values: o } = parseArgs({ options: { game: { type: 'string' }, out: { type: 'string' }, size: { type: 'string', default: '1600x1200' },
    preset: { type: 'string', default: 'day' }, compare: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' } } });
  if (o.help || !o.game) { console.log(USAGE); process.exitCode = o.help ? 0 : 2; return; }
  const adapter = join(RENDER, 'games', `${o.game}.js`), gameDir = join(GAMES, o.game);
  if (!existsSync(adapter) || !existsSync(gameDir)) throw new Error(`unknown game '${o.game}' (adapters: test/render/games/*.js)\n${USAGE}`);
  const m = /^(\d+)x(\d+)$/.exec(o.size); if (!m) throw new Error(`--size must be <w>x<h> (got '${o.size}')`);
  const size = { width: +m[1], height: +m[2] };
  if (o.compare && o.game !== 'tractor-pickup') throw new Error('--compare is only for tractor-pickup (the e03ed71 path)');
  const cfg = await loadConfig(gameDir), baked = resolve(cfg.dir, cfg.bake.out);
  const out = resolve(o.out ?? join(tmpdir(), 'lion-hawk-renders', `${o.game}-${o.preset}.png`));
  mkdirSync(dirname(out), { recursive: true });

  const pages = [{ entry: join(RENDER, 'page.js'), out, query: `?preset=${encodeURIComponent(o.preset)}` }];
  if (o.compare) {
    const keys = Object.keys(JSON.parse(readFileSync(join(baked, 'manifest.json'), 'utf8')).models);
    pages.push({ entry: join(RENDER, 'legacy-tractor.js'), out: out.replace(/\.png$/i, '') + `-${LEGACY_REF}.png`, query: `?keys=${encodeURIComponent(JSON.stringify(keys))}` });
  }
  const { browser, close } = await launch();
  try {
    for (const p of pages) {
      const t0 = Date.now(), server = await serve(await bundle(p.entry, { adapter, root: cfg.dir }), baked);
      try {
        const r = await shoot(browser, `http://127.0.0.1:${server.address().port}/${p.query}`, p.out, size);
        console.log(`${p.out}  (${r.models} models${r.swatches ? `, ${r.swatches} swatches` : ''}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
        if (r.fog && r.farthest > r.fog[0]) console.warn(`warning: the sheet reaches ${r.farthest.toFixed(0)} m, past the fog start (${r.fog[0]} m)`);
      } finally { server.close(); }
    }
  } finally { await close(); }
  if (o.compare) { const cmp = out.replace(/\.png$/i, '') + '-compare.png'; sideBySide(pages[0].out, pages[1].out, cmp); console.log(`${cmp}  (left: ${LEGACY_REF}, right: today)`); }
}
main().catch(err => { console.error(err?.stack ?? err); process.exitCode = 1; });
