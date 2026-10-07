// test/session.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSession, parseRoomInput, roomName, joinUrl, ERRORS, signalServer } from '../src/net/session.js';
import { qrSvg } from '../src/ui/qr.js';
import { emitter } from '../src/net/link.js';
import { createGame } from '../src/sim/game.js';
import { NET_VERSION } from '../src/net/protocol.js';
await RAPIER.init();

test('room names and codes (M-31, M-32)', () => {
  assert.equal(roomName('K7MX2'), 'tractor-pickup-K7MX2');
  for (const s of ['K7MX2', 'k7mx2', ' tractor-pickup-k7mx2 ', 'TRACTOR-PICKUP-K7MX2']) assert.equal(parseRoomInput(s), 'K7MX2', s);
  for (const s of ['', 'K7MX', 'K7MX22', 'K0MX2', 'tractor-pickup-', 'pig-pens-K7MX2', null]) assert.equal(parseRoomInput(s), null, String(s));
  assert.equal(joinUrl('K7MX2', { origin: 'https://four43.com', pathname: '/exp/tractor-pickup/' }), 'https://four43.com/exp/tractor-pickup/?r=K7MX2');
});
test('qrSvg makes an svg', () => { const s = qrSvg('https://four43.com/exp/tractor-pickup/?r=K7MX2'); assert.match(s, /^<svg/); assert.match(s, /<\/svg>$/); });

// A fake Handshake with the same contract (the real one is vendored in Task 15)
function fakeHandshake({ peekResult, failCreate = 0, failCode = 'network', failJoin = null, roomCode = 'K7MX2', gate } = {}) {
  const made = [];
  class HandshakeError extends Error { constructor(code) { super(code); this.code = code; } }
  class Handshake {
    constructor(opts) { this.opts = opts; this.pending = new Set(); this.creates = 0; made.push(this); }
    call(fn) { // like the real client: close() rejects every pending call with HandshakeError('closed') (handshake.js close())
      return new Promise((res, rej) => { const w = { rej }; this.pending.add(w); Promise.resolve(gate).then(() => { if (!this.pending.delete(w)) return; try { res(fn()); } catch (e) { rej(e); } }); });
    }
    peek(code) { return this.call(() => { if (peekResult instanceof Error) throw peekResult; return { code, name: '', players: 1, maxPlayers: 4, locked: false, full: false, ...peekResult }; }); }
    createRoom(o) { this.creates++; return this.call(() => { if (failCreate-- > 0) throw new HandshakeError(failCode); this.created = o; return (this.room = room(true)); }); }
    joinRoom(code) { return this.call(() => { if (failJoin) throw new HandshakeError(failJoin); this.joined = code; return (this.room = room(false)); }); }
    close() { this.closed = true; for (const w of this.pending) w.rej(new HandshakeError('closed')); this.pending.clear(); }
  }
  const room = isHost => Object.assign(emitter(), { code: roomCode, key: 'k', isHost, you: isHost ? 'h' : 'g', hostId: 'h', locked: false, members: [], peers: new Map(),
    closed: false, lock(on) { this.locked = on; this.emit('meta', { meta: {}, locked: on }); }, kick(id) { this.kicked = id; }, leave() { if (this.closed) return; this.left = true; this.closed = true; this.emit('closed', 'left'); } });
  return { Handshake, HandshakeError, made };
}
const setup = (fh, extra = {}) => { let game = createGame(RAPIER, { seed: 5, power: 'medium' }), changes = 0;
  const s = createSession({ Handshake: fh.Handshake, getGame: () => game, onFarm: (seed, n) => (game = createGame(RAPIER, { seed, power: 'medium', player: n })), getPaint: () => ({ body: 'red', trim: 'yellow' }), onChange: () => changes++, retryMs: 5, ...extra });
  return { s, get game() { return game; }, get changes() { return changes; } };
};

test('host: makes a public room for 4 with the game version and relay for far players; shows name, link and players (M-31, M-27, M-48)', async () => {
  const fh = fakeHandshake(), t = setup(fh);
  await t.s.host();
  const o = fh.made[0].opts; assert.equal(o.app, 'tractor-pickup'); assert.equal(o.version, NET_VERSION); assert.equal(o.relayUnlessNearby, true); assert.equal(o.server, 'https://handshake.four43.com');
  assert.deepEqual(fh.made[0].created, { public: true, maxPlayers: 4, meta: {} });
  const v = t.s.view(); assert.equal(v.state, 'hosting'); assert.equal(v.name, 'tractor-pickup-K7MX2'); assert.match(v.url, /\?r=K7MX2$/);
  assert.equal(v.players[0].n, 1); assert.equal(v.players[0].you, true);
  t.s.lock(true); assert.equal(t.s.view().locked, true);
  t.s.stopHosting(); assert.equal(t.s.view().state, 'idle'); assert.ok(t.changes > 0);
});
test('host: when the server cannot be reached, the panel says so and it tries again (M-31)', async () => {
  const fh = fakeHandshake({ failCreate: 1 }), t = setup(fh);
  await t.s.host(); assert.equal(t.s.view().state, 'starting'); assert.equal(t.s.view().error, ERRORS.network);
  await new Promise(r => setTimeout(r, 30)); assert.equal(t.s.view().state, 'hosting');
});
test('join: a code is checked first, then a prompt, then the room (M-32, M-33)', async () => {
  const fh = fakeHandshake({ peekResult: { players: 1 } }), t = setup(fh);
  t.s.openJoin(); assert.equal(t.s.view().state, 'join');
  await t.s.submitCode('nope'); assert.equal(t.s.view().error, ERRORS.badCode);
  await t.s.submitCode('tractor-pickup-k7mx2'); const v = t.s.view(); assert.equal(v.state, 'prompt'); assert.equal(v.name, 'tractor-pickup-K7MX2'); assert.equal(v.info.players, 1);
  await t.s.confirmJoin(); assert.equal(fh.made.at(-1).joined, 'K7MX2'); assert.equal(t.s.view().state, 'joined'); assert.equal(t.s.isGuest, true);
  t.s.sync.players.ensure(1); fh.made.at(-1).room.peers.set('h', { connectionType: 'relayed' }); // the guest's row for the host shows the real connection (M-31, M-33)
  assert.equal(t.s.view().players.find(p => p.n === 1 && !p.you).status, 'relayed');
  t.s.leave(); assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.isGuest, false); assert.ok(fh.made.at(-1).closed, 'the client socket is closed when not in a room');
});
test('a room lost by the server ends joining and hosting (closed reason lost, M-41)', async () => {
  const fh = fakeHandshake({ peekResult: { players: 1 } }), t = setup(fh);
  t.s.openJoin(); await t.s.submitCode('K7MX2'); await t.s.confirmJoin(); assert.equal(t.s.view().state, 'joined');
  const r = fh.made.at(-1).room; r.closed = true; r.emit('closed', 'lost');
  assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.sync, null); assert.ok(fh.made.at(-1).closed);
  const fh2 = fakeHandshake(), t2 = setup(fh2); await t2.s.host(); assert.equal(t2.s.view().state, 'hosting');
  fh2.made[0].room.closed = true; fh2.made[0].room.emit('closed', 'lost'); assert.equal(t2.s.view().state, 'idle'); assert.equal(t2.s.sync, null);
});
test('join errors become panel text (M-32, M-27)', async () => {
  for (const code of ['not_found', 'bad_key', 'full', 'locked', 'version_mismatch', 'rate_limited', 'closed']) {
    const e = Object.assign(new Error(code), { code }), fh = fakeHandshake({ peekResult: e }), t = setup(fh);
    t.s.openJoin(); await t.s.submitCode('K7MX2'); assert.equal(t.s.view().state, 'join'); assert.equal(t.s.view().error, ERRORS[code], code);
  }
  const fh = fakeHandshake({ peekResult: { locked: true } }), t = setup(fh); t.s.openJoin(); await t.s.submitCode('K7MX2'); assert.equal(t.s.view().error, ERRORS.locked);
});
test('?lag wraps the link (M-28)', async () => {
  const fh = fakeHandshake(), t = setup(fh, { lag: { delay: 300, jitter: 0, loss: 0 } }); await t.s.host();
  assert.equal(t.s.view().state, 'hosting');
});
test('guest: the panel redraws when the host connection opens and its type is known, so the host row is not stuck on connecting (M-31, M-33)', async () => {
  const fh = fakeHandshake({ peekResult: { players: 1 } }), t = setup(fh);
  t.s.openJoin(); await t.s.submitCode('K7MX2'); await t.s.confirmJoin(); t.s.sync.players.ensure(1);
  const r = fh.made.at(-1).room, peer = Object.assign(emitter(), { id: 'h', open: true, connectionType: null, send: () => true });
  r.peers.set('h', peer); let c = t.changes; r.emit('peer', peer); assert.ok(t.changes > c, 'redraw on peer');
  assert.equal(t.s.view().players.find(p => p.n === 1 && !p.you).status, 'connecting');
  peer.connectionType = 'direct'; c = t.changes; peer.emit('type', 'direct'); assert.ok(t.changes > c, 'redraw on type');
  assert.equal(t.s.view().players.find(p => p.n === 1 && !p.you).status, 'direct');
});

const held = () => { let open; const gate = new Promise(r => { open = r; }); return { gate, open }; };
test('host: a second tap while the room is being made makes no second room', async () => {
  const g = held(), fh = fakeHandshake({ gate: g.gate }), t = setup(fh);
  const a = t.s.host(), b = t.s.host(); g.open(); await a; await b;
  assert.equal(fh.made.length, 1); assert.equal(fh.made[0].creates, 1); assert.equal(t.s.view().state, 'hosting');
});
test('host: a failure that is not retried closes the client; a bad room code is an error, and the room is left (M-31, M-44)', async () => {
  const fh = fakeHandshake({ failCreate: 1, failCode: 'rate_limited' }), t = setup(fh);
  await t.s.host(); assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.view().error, ERRORS.rate_limited); assert.ok(fh.made[0].closed, 'client closed');
  for (const roomCode of ['k0', '<b>X</b>', 'K7MX2/../x']) {
    const fh2 = fakeHandshake({ roomCode }), t2 = setup(fh2); await t2.s.host();
    assert.equal(t2.s.view().state, 'idle', roomCode); assert.equal(t2.s.view().error, ERRORS.other); assert.equal(t2.s.view().url, null); assert.equal(t2.s.sync, null);
    assert.ok(fh2.made[0].room.left, 'room left'); assert.ok(fh2.made[0].closed, 'client closed');
  }
});
test('host: when the host sync cannot be made the room is left and nothing is kept', async () => {
  const fh = fakeHandshake(), t = setup(fh, { getGame: () => { throw new Error('no game'); } });
  await t.s.host(); assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.view().error, ERRORS.other); assert.equal(t.s.sync, null); assert.equal(t.s.view().code, null);
  assert.ok(fh.made[0].room.left, 'room left'); assert.ok(fh.made[0].closed, 'client closed');
});
test('host: Cancel while the room is being made shows no error afterwards', async () => {
  const g = held(), fh = fakeHandshake({ gate: g.gate }), t = setup(fh);
  const p = t.s.host(); assert.equal(t.s.view().state, 'starting'); t.s.stopHosting(); g.open(); await p;
  assert.equal(t.s.view().state, 'idle'); assert.equal(t.s.view().error, null); assert.ok(fh.made[0].closed); assert.equal(fh.made[0].room, undefined);
});
test('join: a failed join closes the client; Back or the X during a check or at the prompt ends it with no stale error (M-32, M-33)', async () => {
  const fh = fakeHandshake({ failJoin: 'full' }), t = setup(fh);
  t.s.openJoin(); await t.s.submitCode('K7MX2'); await t.s.confirmJoin();
  assert.equal(t.s.view().state, 'join'); assert.equal(t.s.view().error, ERRORS.full); assert.ok(fh.made[0].closed, 'client closed');
  const g = held(), fh2 = fakeHandshake({ gate: g.gate }), t2 = setup(fh2);
  t2.s.openJoin(); const p = t2.s.submitCode('K7MX2'); assert.equal(t2.s.view().state, 'checking'); t2.s.cancel(); g.open(); await p;
  assert.equal(t2.s.view().state, 'idle'); assert.equal(t2.s.view().error, null); assert.equal(t2.s.view().info, null); assert.ok(fh2.made[0].closed);
  const fh3 = fakeHandshake(), t3 = setup(fh3);
  t3.s.openJoin(); await t3.s.submitCode('K7MX2'); assert.equal(t3.s.view().state, 'prompt'); t3.s.cancel();
  assert.equal(t3.s.view().state, 'idle'); assert.equal(t3.s.view().name, null); assert.ok(fh3.made[0].closed);
});
test('join: a network error does not promise to try again (only Host retries)', async () => {
  const e = Object.assign(new Error('network'), { code: 'network' }), fh = fakeHandshake({ peekResult: e }), t = setup(fh);
  t.s.openJoin(); await t.s.submitCode('K7MX2'); assert.equal(t.s.view().error, ERRORS.joinNetwork); assert.doesNotMatch(ERRORS.joinNetwork, /again…/);
});
test('?signal= takes only a local server or this page\'s own origin; anything else is ignored (M-28, M-48)', () => {
  const origin = 'https://four43.com';
  for (const ok of ['http://localhost:8787', 'https://localhost', 'http://127.0.0.1:9000', 'https://127.0.0.1', 'https://four43.com', 'https://four43.com/handshake']) assert.equal(signalServer(ok, origin), ok, ok);
  for (const bad of [null, '', 'evil.com', 'https://evil.com', 'http://localhost.evil.com', 'http://localhost@evil.com', 'wss://localhost', 'javascript:alert(1)', 'https://four43.com.evil.com', 'http://four43.com', 'ftp://127.0.0.1']) assert.equal(signalServer(bad, origin), undefined, String(bad));
});
