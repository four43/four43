// test/handshake-contract.test.mjs: the vendored library has what session.js uses, and importing it touches no browser global
import test from 'node:test';
import assert from 'node:assert/strict';
test('handshake.js exports Handshake and HandshakeError with the methods the game uses', async () => {
  const m = await import('../src/net/handshake.js');
  assert.equal(typeof m.Handshake, 'function'); assert.equal(typeof m.HandshakeError, 'function');
  for (const k of ['peek', 'createRoom', 'joinRoom', 'close']) assert.equal(typeof m.Handshake.prototype[k], 'function', k);
  assert.ok(new m.HandshakeError('x') instanceof Error);
});
test('the vendored handshake.js names the handshake commit it came from', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../src/net/handshake.js', import.meta.url), 'utf8');
  assert.match(text.split('\n')[0], /^\/\/ Vendored from https:\/\/github\.com\/four43\/handshake, client\/handshake\.js at [0-9a-f]{7}\./);
});
test('host controls return promises (session.js catches them) and a missing TURN relay is no_turn (C-2)', async () => {
  const { readFile } = await import('node:fs/promises'); // the Room class is not exported: check the module's text
  const text = await readFile(new URL('../src/net/handshake.js', import.meta.url), 'utf8');
  assert.match(text, /lock\(locked\) \{ return this\.#control\(/);
  assert.match(text, /kick\(peerId\) \{ return this\.#control\(/);
  assert.match(text, /'no_turn'/);
});
