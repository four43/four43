import test from 'node:test';
import assert from 'node:assert/strict';
import { planUtterances } from '../src/audio/voice.js';
import { WORDS } from '../src/sim/words.js';

test('word list matches spec section 12.1', () => {
  for (const w of ['zero', 'one', 'twelve', 'pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden', 'lets-find', 'animals', 'great-job', 'go-to-barn', 'lets-count', 'hooray', 'you-did-it', 'new-sticker', 'pigs', 'cows', 'chickens', 'ducks', 'bunnies', 'dogs', 'chicks', 'plus', 'makes']) assert.ok(WORDS.includes(w), w);
  assert.equal(new Set(WORDS).size, WORDS.length, 'a word listed twice (sheep is its own plural)');
});
test('recorded clips play; missing words fall back to speech, merged', () => {
  const plan = planUtterances(['three', 'pig', 'golden'], new Set(['pig']));
  assert.deepEqual(plan, [{ tts: 'Three' }, { clip: 'pig' }, { tts: 'Golden' }]);
  assert.deepEqual(planUtterances(['great-job', 'go-to-barn'], new Set()), [{ tts: 'Great job! Go to the barn!' }]);
});

test('stop() ends the line that is playing at once and say never rejects', async () => {
  const spoken = []; let cancelled = 0;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = { speak: u => spoken.push(u.text), cancel: () => { cancelled++; } }; // never calls onend: only stop() can finish it
  const { createVoice } = await import('../src/audio/voice.js');
  const v = createVoice({ ctx: null });
  let done = false; const p = v.say(['lets-find', 'animals']).then(() => { done = true; });
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(spoken, ["Let's find animals!"]); assert.equal(done, false);
  v.stop(); await p;
  assert.equal(done, true); assert.equal(cancelled, 1);
  delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});

test('name-line backlog: with 2 land lines waiting a third is dropped, trip lines never are', async () => {
  const spoken = [], ends = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = { speak: u => { spoken.push(u.text); ends.push(u.onend); }, cancel: () => {} };
  const { createVoice } = await import('../src/audio/voice.js');
  const v = createVoice({ ctx: null });
  v.say(['pig'], { low: true }); v.say(['cow'], { low: true }); v.say(['duck'], { low: true }); // pig plays, cow waits, duck waits: all 3 counted until each starts
  v.say(['sheep'], { low: true });
  v.say(['great-job', 'go-to-barn']);
  for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 120)); ends.shift()?.(); }
  assert.ok(!spoken.includes('Sheep'), 'fourth name line is dropped'); assert.ok(spoken.includes('Great job! Go to the barn!'));
  v.stop(); delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});

test('stop() with low lines queued never raises the cap above 2 afterwards', async () => {
  const spoken = [], ends = [];
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = { speak: u => { spoken.push(u.text); ends.push(u.onend); }, cancel: () => {} };
  const { createVoice } = await import('../src/audio/voice.js');
  const v = createVoice({ ctx: null });
  v.say(['pig'], { low: true }); v.say(['cow'], { low: true }); v.say(['duck'], { low: true });
  await new Promise(r => setTimeout(r, 20));
  v.stop(); await new Promise(r => setTimeout(r, 50)); // the older queued lines end quietly
  const before = spoken.length;
  for (const n of ['sheep', 'dog', 'chick', 'bunny']) v.say([n], { low: true });
  await new Promise(r => setTimeout(r, 60));
  for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 120)); ends.shift()?.(); }
  assert.ok(!spoken.slice(before).includes('Bunny'), 'the cap is still 2 waiting lines');
  v.stop(); delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});

test('speech: an utterance is held until it ends, and a paused engine is resumed', async () => {
  let resumed = 0, u0;
  globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  globalThis.speechSynthesis = { paused: true, resume() { resumed++; }, speak: u => { u0 = u; }, cancel: () => {} };
  const { createVoice } = await import('../src/audio/voice.js');
  const v = createVoice({ ctx: null });
  const p = v.say(['pig']); await new Promise(r => setTimeout(r, 20));
  assert.equal(resumed, 1); u0.onend(); await p;
  v.stop(); delete globalThis.speechSynthesis; delete globalThis.SpeechSynthesisUtterance;
});
