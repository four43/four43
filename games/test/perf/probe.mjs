// games/test/perf/probe.mjs: programs, draw calls, frame time and time to settled() for one built game, plus its size
// (overview §8 R1, R3). Real Chromium under SwiftShader: run it behind the browser lock (gate.mjs does).
//   node test/perf/probe.mjs --game <rally|pig-pens|tractor-pickup> --dir <built site dir> [--runs 3] [--frames 120] [--out <json>]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { probeScript } from './counters.mjs';
import { summarise } from './stats.mjs';
import { sizeReport } from './sizes.mjs';

// Each game's desktop e2e opening (its test/e2e.browser.mjs at e03ed71). A game plan that changes it asks the integrator (kind G).
export const GAMES = Object.freeze({
  rally: { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'e2e1' } }, scene: 'stage' },
  'pig-pens': { preset: 'desktop', seed: 3, args: { pigs: 24 }, scene: 'farm' },
  'tractor-pickup': { preset: 'desktop', args: { seed: 14, started: true }, scene: 'farm' },
});
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm' };

export function serveDir(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const f = path.resolve(root, `.${rel}`);
    if (!f.startsWith(root + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(c => server.close(c)) })));
}

async function once(pw, browser, url, cfg, frames) {
  const t0 = performance.now();
  const game = await pw.openGame(browser, url, { preset: cfg.preset, seed: cfg.seed, args: cfg.args, settings: cfg.settings, initScript: { content: probeScript() } });
  const settledMs = performance.now() - t0;
  try {
    await pw.expectScene(game, cfg.scene);
    await game.step(60);
    await game.page.evaluate(() => globalThis.__lhProbe.reset());
    await game.page.evaluate(n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), frames);
    return { settledMs, counters: await game.page.evaluate(() => globalThis.__lhProbe.read()), errors: await game.errors() };
  } finally { await game.close(); }
}

export async function main(argv) {
  const { values: o } = parseArgs({ args: argv, options: { game: { type: 'string' }, dir: { type: 'string' },
    runs: { type: 'string', default: '3' }, frames: { type: 'string', default: '120' }, out: { type: 'string' } } });
  const cfg = GAMES[o.game];
  if (!cfg || !o.dir) throw new Error(`probe: --game (${Object.keys(GAMES).join('|')}) and --dir are required`);
  const pw = await import('lion-hawk/playwright');
  const site = await serveDir(o.dir), chrome = await pw.launch(), runs = [];
  try { for (let i = 0; i < Number(o.runs); i++) runs.push(await once(pw, chrome.browser, site.url, cfg, Number(o.frames))); }
  finally { await chrome.close(); await site.close(); }
  const settled = runs.map(r => r.settledMs).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const last = runs.at(-1);
  const result = { game: o.game, dir: path.resolve(o.dir), settledMs: Math.round(settled), ...summarise(last.counters), size: sizeReport(o.dir).total, errors: last.errors };
  const text = JSON.stringify(result, null, 1);
  if (o.out) fs.writeFileSync(o.out, `${text}\n`);
  console.log(text);
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
