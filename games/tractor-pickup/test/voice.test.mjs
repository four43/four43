import test from 'node:test';
import assert from 'node:assert/strict';
import { planUtterances } from '../src/audio/voice.js';
import { WORDS } from '../src/sim/words.js';

test('word list matches spec section 12.1', () => {
  for (const w of ['one', 'twelve', 'pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick', 'golden', 'lets-find', 'animals', 'great-job', 'go-to-barn', 'lets-count', 'hooray', 'you-did-it']) assert.ok(WORDS.includes(w), w);
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
