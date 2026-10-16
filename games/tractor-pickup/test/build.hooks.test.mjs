// build.hooks.js (3l Task 4, B-2, overview §5.4 "Builds"): the voice and animal clips embedded as data URLs, as build.py did.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectAudio, audioScript, beforePage, page } from '../build.hooks.js';

const tree = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-hooks-'));
  for (const f of ['audio/voice/pig.mp3', 'audio/voice/one.mp3', 'audio/animals/pig.mp3', 'audio/animals/pig-2.mp3', 'audio/animals/cow.mp3']) {
    fs.mkdirSync(path.join(d, path.dirname(f)), { recursive: true }); fs.writeFileSync(path.join(d, f), Buffer.from(f));
  }
  return d;
};
test('voice clips by name, animal takes grouped by type in file order, as data URLs', () => {
  const a = collectAudio({ root: tree(), ffmpeg: false, log: () => {} });
  assert.deepEqual(Object.keys(a.voice).sort(), ['one', 'pig']);
  assert.equal(a.voice.pig, 'data:audio/mpeg;base64,' + Buffer.from('audio/voice/pig.mp3').toString('base64'));
  assert.deepEqual(Object.keys(a.animals).sort(), ['cow', 'pig']); assert.equal(a.animals.pig.length, 2);
  assert.equal(a.animals.pig[1], 'data:audio/mpeg;base64,' + Buffer.from('audio/animals/pig-2.mp3').toString('base64'));
});
test('page() puts window.__VOICE__ and window.__ANIMALS__ where <!--VOICE--> was, once', () => {
  const html = page('<script><!--VOICE--></script><!--APP-->', {});
  assert.match(html, /^<script>window\.__VOICE__=\{.*\};window\.__ANIMALS__=\{.*\};<\/script><!--APP-->$/s);
  assert.throws(() => page('<html></html>', {}), /no <!--VOICE-->/);
});
test('audioScript is JSON (a clip can never close the script tag)', () => {
  const s = audioScript({ voice: { a: 'data:x' }, animals: { pig: ['data:y'] } });
  assert.equal(s, 'window.__VOICE__={"a":"data:x"};window.__ANIMALS__={"pig":["data:y"]};');
});
test('sw.js takes the precache list and the version from the build', () => {
  const sw = fs.readFileSync(new URL('../pwa/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const PRECACHE = __PRECACHE__;/); assert.match(sw, /'tractor-pickup-__VERSION__'/);
});
test('the template has one bare <!--APP--> (3d writes the module script; a marker inside <script> fails the build)', () => {
  const html = fs.readFileSync(new URL('../template.html', import.meta.url), 'utf8');
  assert.equal(html.split('<!--APP-->').length, 2); assert.doesNotMatch(html, /<script\b[^>]*>\s*<!--APP-->/i);
});
test('an e2e build embeds no clips (ctx.e2e: speech and the synth fill in, no ffmpeg)', () => {
  beforePage({ e2e: true, log: () => {} });
  assert.equal(page('<script><!--VOICE--></script>', {}), '<script>window.__VOICE__={};window.__ANIMALS__={};</script>');
});
