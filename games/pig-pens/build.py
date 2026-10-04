import subprocess, pathlib
subprocess.run(['npx','esbuild','src/main.js','--bundle','--format=iife','--minify','--loader:.json=json','--outfile=build/app.js','--log-level=warning'], check=True)
app = pathlib.Path('build/app.js').read_text().replace('</script', '<\\/script')
html = pathlib.Path('template.html').read_text().replace('<!--APP-->', app)
out = pathlib.Path(__file__).resolve().parents[2] / 'site/exp/piggie-game/index.html'; out.parent.mkdir(parents=True, exist_ok=True); out.write_text(html)
print('wrote', out, round(len(html)/1e6, 2), 'MB')
