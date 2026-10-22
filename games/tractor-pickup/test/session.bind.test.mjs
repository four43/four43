// The Multiplayer session on the engine path (lion-hawk 2g G5): with `bind`, a joined room's link goes to the engine (a port)
// and the session never makes or steps a sync itself. session.test.mjs keeps the old path (no bind).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/net/session.js';
import { emitter } from '../src/net/link.js';
const flush = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

function fakeHandshake() {
  const room = isHost => Object.assign(emitter(), { code: 'K7MX2', isHost, you: isHost ? 'h' : 'g', hostId: 'h', locked: false, peers: new Map(), closed: false, left: 0,
    leave() { this.left++; if (this.closed) return; this.closed = true; this.emit('closed', 'left'); } });
  class Handshake {
    constructor() { this.closed = false; }
    createRoom() { return Promise.resolve(this.room = room(true)); }
    peek(code) { return Promise.resolve({ code, players: 1, locked: false, full: false }); }
    joinRoom() { return Promise.resolve(this.room = room(false)); }
    close() { this.closed = true; }
  }
  return Handshake;
}
// a bind that records its calls; its close waits for the test to run the step (then)
function fakeBind() {
  const calls = [];
  const bind = ({ role, transport }) => { const b = { role, transport, sync: null, closes: 0, then: null }; calls.push(b);
    return { sync: () => b.sync, close(then) { b.closes++; b.then = then; } }; };
  return { bind, calls };
}
const players = (list = []) => ({ list: () => list, map: new Map(list.map(p => [p.n, p])) });

test('host with bind: the room link goes to bind as the host; sync reads its getter; Stop ends the sync, then leaves the room', async () => {
  const Handshake = fakeHandshake(), { bind, calls } = fakeBind();
  const s = createSession({ Handshake, bind, getPaint: () => ({ body: 'red', trim: 'yellow' }) });
  await s.host();
  assert.equal(calls.length, 1); assert.equal(calls[0].role, 'host'); assert.equal(calls[0].transport.isHost, true); assert.equal(calls[0].transport.id, 'h');
  assert.ok(s.sync === null, 'no sync until the step after the bind (2f delta)'); assert.equal(s.inRoom, true);
  assert.deepEqual(s.view().players.map(p => [p.n, p.you]), [[1, true]], 'the host shows itself before its sync exists');
  calls[0].sync = { you: 1, players: players([{ n: 2, paint: { body: 'blue', trim: 'red' }, away: false, peer: 'g1' }]) };
  assert.ok(s.sync === calls[0].sync, "the session shares the bound sync");
  assert.deepEqual(s.view().players.map(p => p.n), [1, 2], 'the player list reads the sim sync');
  s.stopHosting();
  assert.equal(s.view().state, 'idle'); assert.equal(calls[0].closes, 1, 'net.close goes to the engine');
  assert.ok(s.sync === null, 'the session lets go of the getter at once'); calls[0].then(); await flush();
});
test('host with bind: the room is left only after close says the leave went out', async () => {
  const Handshake = fakeHandshake(), { bind, calls } = fakeBind(); let hs = null;
  class H extends Handshake { constructor(o) { super(o); hs = this; } }
  const s = createSession({ Handshake: H, bind, getPaint: () => null });
  await s.host(); const room = hs.room;
  s.stopHosting(); assert.equal(room.left, 0, 'not before the drain'); assert.equal(hs.closed, false);
  calls[0].then(); assert.equal(room.left, 1); assert.equal(hs.closed, true, 'an idle client closes');
});
test('guest with bind: confirmJoin binds as a guest; connected follows the sim sync; Leave closes before the room is left', async () => {
  const Handshake = fakeHandshake(), { bind, calls } = fakeBind(); let hs = null;
  class H extends Handshake { constructor(o) { super(o); hs = this; } }
  const s = createSession({ Handshake: H, bind, getPaint: () => null, welcomeMs: 5 });
  s.openJoin(); await s.submitCode('K7MX2'); await s.confirmJoin();
  assert.equal(calls[0].role, 'guest'); assert.equal(calls[0].transport.isHost, false);
  assert.equal(s.view().state, 'joined'); assert.equal(s.view().connected, false);
  calls[0].sync = { you: 2, players: players([{ n: 1, paint: { body: 'red', trim: 'yellow' }, away: false }]) };
  s.poll(); assert.equal(s.view().connected, true); assert.deepEqual(s.view().players.map(p => p.n), [1, 2]);
  const room = hs.room; s.leave();
  assert.equal(s.view().state, 'idle'); assert.equal(calls[0].closes, 1); assert.equal(room.left, 0);
  calls[0].then(); assert.equal(room.left, 1);
});
test('with bind: a room that closes by itself lets go of the port too (M-41)', async () => {
  const Handshake = fakeHandshake(), { bind, calls } = fakeBind(); let hs = null;
  class H extends Handshake { constructor(o) { super(o); hs = this; } }
  const s = createSession({ Handshake: H, bind, getPaint: () => null });
  s.openJoin(); await s.submitCode('K7MX2'); await s.confirmJoin();
  hs.room.closed = true; hs.room.emit('closed', 'host_left');
  assert.equal(s.view().state, 'idle'); assert.equal(calls[0].closes, 1);
  calls[0].then(); assert.equal(hs.room.left, 0, 'a closed room is not left again');
});
