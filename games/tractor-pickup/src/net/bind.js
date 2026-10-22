// A joined room's transport bound to the engine through a lion-hawk port (2g G5, moved from main.js in the final fix wave so a
// headless test can drive its close chain: test/bind.test.mjs). View-side: it owns a timer, so it is not a sim module.
import { createPort } from 'lion-hawk/net';

// N-1, #75: a joined room's transport bound to the engine. The port is made once the farm is the main scene (2f delta: a net.open
// before that is warned and dropped), so its net.open starts the sim's host or guest sync. close(then) ends that sync (net.close:
// a guest's leave and a host's leave go out through the outbox) and lets go of the transport after the step that drained them
// (2f delta), then calls then(); a room that closes by itself (the host left, kicked) lets go the same way. A page that does not
// step (hidden) gives up waiting after 1 s: the outbox is dropped at the next step with no port, and then() leaves the room.
// transport: a net, or a function that makes it when the port is made (the test bridge replays its early events to the first listener)
// key: the page's claimed peer key (N-18; main.js awaits claimPeerKey()); without it the port makes one
export function bindPort(engine, { role, transport, clock, key }) {
  let port = null, done = false, waiting = null;
  const ready = () => engine.scene.name === 'farm' && !!engine.scene.state?.game;
  const release = then => {
    waiting?.(); waiting = null; const p = port; port = null;
    if (!p) { then?.(); return; }
    let t = 0; const off = engine.onStep(() => { off(); clearTimeout(t); p.close(); then?.(); });
    t = setTimeout(() => { off(); p.close(); then?.(); }, 1000);
  };
  const open = () => { const t = typeof transport === 'function' ? transport() : transport; port = createPort(engine, { transport: t, role, clock, key }); t.on('closed', () => { done = true; release(); }); };
  if (ready()) open(); else waiting = engine.onStep(() => { if (!done && ready()) { waiting(); waiting = null; open(); } });
  return {
    sync: () => done ? null : engine.scene.state?.net?.sync ?? null, // 2f delta: null until the step after the bind
    close(then) {
      if (done) { then?.(); return; } done = true;
      if (port) try { engine.command('net.close', {}); } catch (e) { console.warn('net close', e); }
      release(then);
    },
  };
}
