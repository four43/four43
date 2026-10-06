import subprocess, pathlib, shutil, hashlib, json, base64
here = pathlib.Path(__file__).resolve().parent
out_dir = here.parents[1] / 'site/exp/tractor-pickup'
subprocess.run(['npx', 'esbuild', 'src/main.js', '--bundle', '--format=iife', '--minify', '--loader:.json=json',
                '--outfile=build/app.js', '--log-level=warning'], check=True, cwd=here)
app = (here / 'build/app.js').read_text().replace('</script', '<\\/script')
html = (here / 'template.html').read_text().replace('<!--APP-->', app)
# spec section 12.2: trim silence, even out loudness, embed each audio/voice/<id>.mp3 (zero clips is fine: speech fills in)
voice = {}
vdir, proc = here / 'audio/voice', here / 'build/voice'
proc.mkdir(parents=True, exist_ok=True)
for mp3 in sorted(vdir.glob('*.mp3')):
    out = proc / mp3.name
    if shutil.which('ffmpeg'):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(mp3), '-af',
            'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5',
            '-ac', '1', '-b:a', '64k', str(out)], check=True)
    else:
        shutil.copy(mp3, out)
    voice[mp3.stem] = 'data:audio/mpeg;base64,' + base64.b64encode(out.read_bytes()).decode()
html = html.replace('<!--VOICE-->', 'window.__VOICE__=' + json.dumps(voice) + ';')
print('voice clips', len(voice), sorted(voice))
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / 'index.html').write_text(html)
for f in (here / 'pwa').iterdir():
    if f.name != 'sw.js': shutil.copy(f, out_dir / f.name)
version = json.loads((here / 'package.json').read_text())['version'] + '-' + hashlib.sha256(html.encode()).hexdigest()[:12]
(out_dir / 'sw.js').write_text((here / 'pwa/sw.js').read_text().replace('__VERSION__', version))
print('wrote', out_dir, round(len(html) / 1e6, 2), 'MB, sw version', version)
