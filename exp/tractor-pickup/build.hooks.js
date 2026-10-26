// lion-hawk build hooks for Tractor Pickup (3l, B-2; build.py's audio half, moved): spec 12.2 trims silence and evens out loudness of
// each audio/voice/<id>.mp3 and audio/animals/<type>[-n].mp3 (with ffmpeg; without it the clips go in as they are, with a warning, D-8),
// and the page carries them as data URLs: window.__VOICE__ { id: url } and window.__ANIMALS__ { type: [url, ...] } (E-2). Node only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILTER = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.05,areverse,loudnorm=I=-16:TP=-1.5';
export const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const url = buf => 'data:audio/mpeg;base64,' + buf.toString('base64');

function clip(src, dst, ffmpeg, log) {
  if (ffmpeg) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-af', FILTER, '-ac', '1', '-b:a', '64k', dst]);
    if (r.status !== 0) throw new Error(`build.hooks: ffmpeg failed on ${src}: ${r.stderr}`);
  } else { log(`WARNING: ffmpeg not found: ${path.basename(src)} is not trimmed or levelled (D-8)`); fs.copyFileSync(src, dst); }
  return fs.readFileSync(dst);
}
const mp3s = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.mp3')).sort((a, b) => (a.slice(0, -4) < b.slice(0, -4) ? -1 : 1)) : []; // by stem: pig, pig-2 (not pig-2.mp3 before pig.mp3)
export function collectAudio({ root = HERE, ffmpeg = hasFfmpeg(), log = console.log } = {}) {
  const voice = {}, animals = {};
  for (const [kind, put] of [['voice', (f, b) => { voice[f.slice(0, -4)] = url(b); }], ['animals', (f, b) => { (animals[f.split('-')[0].replace(/\.mp3$/, '')] ??= []).push(url(b)); }]]) {
    const src = path.join(root, 'audio', kind), out = path.join(root, 'build', kind); fs.mkdirSync(out, { recursive: true });
    for (const f of mp3s(src)) put(f, clip(path.join(src, f), path.join(out, f), ffmpeg, log));
  }
  log(`voice clips ${Object.keys(voice).length}; animal clips ${JSON.stringify(Object.fromEntries(Object.entries(animals).map(([k, v]) => [k, v.length])))}`);
  return { voice, animals };
}
export const audioScript = ({ voice, animals }) => 'window.__VOICE__=' + JSON.stringify(voice) + ';window.__ANIMALS__=' + JSON.stringify(animals) + ';';
let audio = null;
export function beforePage(ctx = {}) { audio = ctx.e2e ? null : collectAudio({ log: ctx.log ?? console.log }); } // 3d: --e2e sets ctx.e2e (no clips, no ffmpeg)
export function page(html) {
  if (!html.includes('<!--VOICE-->')) throw new Error('build.hooks: the template has no <!--VOICE--> marker');
  return html.replace('<!--VOICE-->', () => audioScript(audio ?? { voice: {}, animals: {} }));
}
export default { beforePage, page }; // the engine reads the module's default export
