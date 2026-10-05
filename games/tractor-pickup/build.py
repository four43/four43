import subprocess, pathlib, shutil, hashlib, json
here = pathlib.Path(__file__).resolve().parent
out_dir = here.parents[1] / 'site/exp/tractor-pickup'
subprocess.run(['npx', 'esbuild', 'src/main.js', '--bundle', '--format=iife', '--minify', '--loader:.json=json',
                '--outfile=build/app.js', '--log-level=warning'], check=True, cwd=here)
app = (here / 'build/app.js').read_text().replace('</script', '<\\/script')
html = (here / 'template.html').read_text().replace('<!--APP-->', app)
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / 'index.html').write_text(html)
for f in (here / 'pwa').iterdir():
    if f.name != 'sw.js': shutil.copy(f, out_dir / f.name)
version = json.loads((here / 'package.json').read_text())['version'] + '-' + hashlib.sha256(html.encode()).hexdigest()[:12]
(out_dir / 'sw.js').write_text((here / 'pwa/sw.js').read_text().replace('__VERSION__', version))
print('wrote', out_dir, round(len(html) / 1e6, 2), 'MB, sw version', version)
