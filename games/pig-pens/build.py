import subprocess, pathlib, shutil, hashlib
here = pathlib.Path(__file__).resolve().parent
out_dir = here.parents[1] / 'site/exp/piggie-game'
subprocess.run(['npx','esbuild','src/main.js','--bundle','--format=iife','--minify','--loader:.json=json','--outfile=build/app.js','--log-level=warning'], check=True, cwd=here)
app = (here / 'build/app.js').read_text().replace('</script', '<\\/script')
html = (here / 'template.html').read_text().replace('<!--APP-->', app)
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / 'index.html').write_text(html)
# PWA files; the service worker cache name is stamped with a hash of the build so installs pick up new versions.
for f in (here / 'pwa').iterdir():
    if f.name != 'sw.js': shutil.copy(f, out_dir / f.name)
version = hashlib.sha256((html + ''.join(f.read_text() for f in (here / 'pwa').glob('*.webmanifest'))).encode()).hexdigest()[:12]
(out_dir / 'sw.js').write_text((here / 'pwa/sw.js').read_text().replace('__VERSION__', version))
print('wrote', out_dir, round(len(html)/1e6, 2), 'MB, sw version', version)
