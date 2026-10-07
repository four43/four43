// test/handshake-contract.test.mjs: the vendored library has what session.js uses, and importing it touches no browser global
import test from 'node:test';
import assert from 'node:assert/strict';
test('handshake.js exports Handshake and HandshakeError with the methods the game uses', async () => {
  const m = await import('../src/net/handshake.js');
  assert.equal(typeof m.Handshake, 'function'); assert.equal(typeof m.HandshakeError, 'function');
  for (const k of ['peek', 'createRoom', 'joinRoom', 'close']) assert.equal(typeof m.Handshake.prototype[k], 'function', k);
  assert.ok(new m.HandshakeError('x') instanceof Error);
});
