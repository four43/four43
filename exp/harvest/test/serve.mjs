// Builds Harvest with lion-hawk build (--e2e: unminified) into build/e2e/ and
// serves that directory on a random local port (after Tractor Pickup's test/serve.mjs). serveHarvest() → { url, close }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'lion-hawk/build';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
export async function serveHarvest() {
  const out = path.join(root, 'build/e2e');
  await build({ game: root, out, e2e: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = path.join(out, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(out) || path.basename(f) === 'sw.js' || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
