// Tractor's synth on the engine audio service (3l Task 19, #67): attach() builds on the service's context and master; the
// service owns unlock, hide and resume, so the game has no gesture listeners of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Sound } from '../src/audio/sound.js';
const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {} }, frequency: { value: 0, setTargetAtTime() {}, setValueAtTime() {} }, start() {}, stop() {}, buffer: null, loop: false, type: '', Q: { value: 0 } });
const fakeCtx = () => ({ state: 'running', currentTime: 0, sampleRate: 8000, createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node, createDynamicsCompressor: node,
  createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), decodeAudioData: async () => ({}) });
test('attach builds on the service context; the game\'s own bus goes into the service master', () => {
  const ctx = fakeCtx(), master = node(); const into = []; const bus = node(); ctx.createGain = () => bus; bus.connect = d => { into.push(d); };
  const s = new Sound(); s.attach({ ctx, master, unlocked: true, onUnlock() {} });
  assert.equal(s.ctx, ctx); assert.equal(into[0], master, 'the game bus goes into the service master first'); assert.equal(typeof s.unlock, 'undefined');
});
test('the entry no longer listens for gestures, page hide or pageshow to drive audio', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /sound\.(unlock|suspend)|onstatechange|GEST\b/);
});
