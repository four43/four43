// Dev server: rebuilds on every save under src/ or the template, serves build/dev/, and
// reloads the page. Run: npm run dev [-- port]   (default 8740, listens on all interfaces
// so a phone on the LAN can connect).
import * as esbuild from 'esbuild';
import fs from 'fs';
import { createHash } from 'crypto';

const port = Number(process.argv[2]) || 8740;
const OUT = 'build/dev';
// esbuild's live-reload stream; only injected into the dev page.
const RELOAD = `<script>new EventSource('/esbuild').addEventListener('change', () => location.reload());</script>`;

const page = {
  name: 'page',
  setup(build) {
    build.onEnd((res) => {
      if (res.errors.length) return;
      const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text;
      const html = fs.readFileSync('index.template.html', 'utf8')
        .replace('<script>/*BUNDLE*/</script>', () => `<script>${js.replace(/<\/script/g, '<\\/script')}</script>${RELOAD}`);
      fs.writeFileSync(`${OUT}/index.html`, html);
      console.log(new Date().toLocaleTimeString(), 'rebuilt');
    });
  },
};
// Template edits aren't part of the bundle graph: watch it, and stamp its hash into the bundle
// so the output changes and esbuild sends the reload event.
const template = {
  name: 'template',
  setup(build) {
    build.onLoad({ filter: /src\/main\.js$/ }, (a) => {
      const tpl = createHash('sha1').update(fs.readFileSync('index.template.html')).digest('hex');
      return { contents: `${fs.readFileSync(a.path, 'utf8')}\nglobalThis.__template = '${tpl}';\n`, watchFiles: ['index.template.html'], loader: 'js' };
    });
  },
};

fs.mkdirSync(OUT, { recursive: true });
const ctx = await esbuild.context({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', sourcemap: 'inline',
  loader: { '.json': 'json' }, outfile: `${OUT}/bundle.js`, write: false, logLevel: 'warning',
  plugins: [template, page],
});
await ctx.watch();
const { port: p } = await ctx.serve({ servedir: OUT, port, host: '0.0.0.0' });
console.log(`rally dev server: http://localhost:${p}/`);
