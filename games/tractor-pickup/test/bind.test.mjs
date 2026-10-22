// bindPort (src/net/bind.js, lion-hawk 2g G5): a joined room's transport bound to a headless engine through a port, over the
// engine's in-memory hub. The close chain: Stop/Leave → net.close → the leave goes out at the next step's drain → the port lets
// go of the transport → then() (the session leaves the room there). session.bind.test.mjs covers the session with a fake bind.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { createMemoryHub } from 'lion-hawk/net';
import { tractorGame } from '../src/game.sim.js';
import { bindPort } from '../src/net/bind.js';
await R.init();

const ARGS = { seed: 14, started: true, trip: false };
// a hub endpoint that logs leave() and counts its listeners (the port's are the ones besides bindPort's own 'closed')
function recorded(net, log) {
  const ls = new Set();
  return { isHost: net.isHost, id: net.id, get hostId() { return net.hostId; }, get listeners() { return ls.size; },
    on(e, f) { ls.add(f); net.on(e, f); }, off(e, f) { ls.delete(f); net.off(e, f); },
    send: (to, data, reliable) => net.send(to, data, reliable), leave() { log.push('leave'); net.leave(); } };
}
const endpoint = role => { const hub = createMemoryHub(), host = hub.host(); return role === 'host' ? host : hub.join(); };

for (const role of ['host', 'guest']) {
  test(`${role}: close sends the leave at the next step, then lets go of the transport, then calls then() once`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = headless(tractorGame(), { args: ARGS }), log = [], tr = recorded(endpoint(role), log);
    const b = bindPort(h.engine, { role, transport: tr, clock: () => h.engine.time.wall });
    assert.ok(b.sync() === null, 'no sync until the step after the bind');
    h.step(1); assert.ok(b.sync(), 'net.open made the sim sync'); assert.equal(h.engine.scene.state.net.role, role);
    const bound = tr.listeners; assert.ok(bound > 1, 'the port listens');
    b.close(() => log.push('then'));
    assert.deepEqual(log, [], 'nothing is left or released before the step that drains net.close');
    assert.equal(tr.listeners, bound, 'the transport is still bound');
    h.step(1);
    assert.deepEqual(log, ['leave', 'then'], 'the leave went out on the transport before then()');
    assert.equal(tr.listeners, 1, "the port let go of the transport (bindPort's own 'closed' stays)");
    assert.equal(h.engine.scene.state.net.role, 'solo'); assert.ok(b.sync() === null);
    t.mock.timers.tick(2000); h.step(3);
    assert.deepEqual(log, ['leave', 'then'], 'then() ran exactly once (the 1 s fallback was cleared)');
  });
}
test('a page that does not step: the 1 s fallback lets go and calls then() once; the dropped outbox never leaves', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = headless(tractorGame(), { args: ARGS }), log = [], tr = recorded(endpoint('guest'), log);
  const b = bindPort(h.engine, { role: 'guest', transport: tr, clock: () => h.engine.time.wall }); h.step(1);
  b.close(() => log.push('then')); t.mock.timers.tick(999); assert.deepEqual(log, []);
  t.mock.timers.tick(1); assert.deepEqual(log, ['then']); assert.equal(tr.listeners, 1);
  h.step(2); assert.deepEqual(log, ['then'], 'no second then(); the leave in the outbox had no port');
});
test('a bind before the farm waits: the port is made only once the farm is the main scene', () => {
  const h = headless(tractorGame(), { scene: 'sandbox', args: ARGS }), log = [], tr = recorded(endpoint('host'), log);
  const b = bindPort(h.engine, { role: 'host', transport: tr, clock: () => h.engine.time.wall });
  h.step(3); assert.equal(tr.listeners, 0, 'no port on the sandbox'); assert.ok(b.sync() === null);
  h.go('farm', ARGS); h.step(1); assert.equal(h.engine.scene.name, 'farm'); assert.ok(tr.listeners > 1, 'the port is made after the step the farm arrived');
  h.step(1); assert.ok(b.sync(), 'its net.open made the sync'); assert.equal(h.engine.scene.state.net.role, 'host');
});
test('a room that closes by itself lets go of the transport; a later close calls then() at once', () => {
  const hub = createMemoryHub(); hub.host(); const g = hub.join();
  const h = headless(tractorGame(), { args: ARGS }), log = [], tr = recorded(g, log);
  const b = bindPort(h.engine, { role: 'guest', transport: tr, clock: () => h.engine.time.wall }); h.step(1); assert.ok(b.sync());
  hub.leave(g.id, 'kicked'); hub.tick(0); h.step(1);
  assert.ok(b.sync() === null); assert.equal(tr.listeners, 1, 'the port let go');
  b.close(() => log.push('then')); assert.deepEqual(log, ['then']);
});

test('the page\'s claimed key reaches the host through bindPort (N-18; main.js awaits claimPeerKey before binding)', () => {
  const hub = createMemoryHub(), H = headless(tractorGame(), { args: ARGS }), G = headless(tractorGame(), { args: { ...ARGS, seed: 15 } });
  bindPort(H.engine, { role: 'host', transport: hub.host(), clock: () => hub.now });
  bindPort(G.engine, { role: 'guest', transport: hub.join(), clock: () => hub.now, key: [7, 7, 7, 7] });
  for (let i = 1; i <= 60; i++) { hub.tick(i * 1000 / 60); H.step(1); G.step(1); }
  assert.deepEqual(H.world.net.bindings.get(2)?.key, [7, 7, 7, 7]);
});
