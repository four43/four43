// Builds a Rally entry and serves it for browser tests (lion-hawk 2c-rally R5): an esbuild bundle (iife, .json loader)
// into build/e2e/, the page from index.template.html with the bundle inlined as build.py does, and a static server
// on a random local port. serveRally({ entry }) → { url, close }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export async function serveRally({ entry = 'src/main.js' } = {}) {
  const out = path.join(root, 'build/e2e');
  fs.mkdirSync(out, { recursive: true });
  const name = path.basename(entry, '.js');
  const bundle = path.join(out, `${name}.bundle.js`);
  await build({ entryPoints: [path.join(root, entry)], bundle: true, format: 'iife', loader: { '.json': 'json' }, outfile: bundle, logLevel: 'warning' });
  const js = fs.readFileSync(bundle, 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8')
    .replace('<script>/*BUNDLE*/</script>', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>`);
  fs.writeFileSync(path.join(out, `${name}.html`), html);
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html' }).end(html); return; }
    const f = path.join(root, 'pwa', path.basename(p)); // manifest and icons, as the site serves them
    if (path.basename(p) !== 'sw.js' && fs.existsSync(f)) { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' }).end(fs.readFileSync(f)); return; }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }) };
}
