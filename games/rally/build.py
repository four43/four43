import subprocess, pathlib, shutil, hashlib, json
here = pathlib.Path(__file__).resolve().parent
out_dir = here.parents[1] / 'site/exp/rally'
subprocess.run(['npx','esbuild','src/main.js','--bundle','--format=iife','--minify','--loader:.json=json','--outfile=build/bundle.js','--log-level=warning'], check=True, cwd=here)
b = (here / 'build/bundle.js').read_text()
t = (here / 'index.template.html').read_text()
html = t.replace('<script>/*BUNDLE*/</script>', '<script>' + b.replace('</script', '<\\/script') + '</script>')
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / 'index.html').write_text(html)
# PWA files; the service worker cache name is stamped with a hash of the build so installs pick up new versions.
for f in (here / 'pwa').iterdir():
    if f.name != 'sw.js': shutil.copy(f, out_dir / f.name)
version = json.loads((here / 'package.json').read_text())['version'] + '-' + hashlib.sha256((html + (here / 'pwa/manifest.webmanifest').read_text()).encode()).hexdigest()[:12]
(out_dir / 'sw.js').write_text((here / 'pwa/sw.js').read_text().replace('__VERSION__', version))
print('wrote', out_dir, len(html) // 1024, 'KB, sw version', version)
