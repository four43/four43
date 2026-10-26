// Tractor's netcode on engine commands (lion-hawk 2f T6, [N-1]…[N-4], [I-7], #75, #77, #78, #80, #88; 3l). A port (lion-hawk/net) turns
// the transport into game-wide commands. Replication is the engine's World net part (3i: defineGame({ net: { world: true } })): the
// herd, trees, roster and trains are net entities whose records the engine sends and applies; its built-in net.frame handler runs
// before this game's, which only lets the sync watch the frame (watchdog, herd buffer, repairs). The host and guest syncs (net/host.js,
// net/guest.js) keep the JSON messages and the game rules, through a facade that looks like a transport (N-1). Messages are handled
// at the next step's input.apply, so a tape records them (#75). The farm step calls sync.before and sync.after around its step (farm.js).
import { frameFromJson, createRegistry, createWarnOnce, MAX_FRAME } from 'lion-hawk/sim';
import { createHostSync } from '../net/host.js';
import { createGuestSync } from '../net/guest.js';
import { KINDS } from '../net/kinds.js';
import { localTrain, dropLocalTrain } from '../net/entities.js';
import { TO_HOST, TO_GUEST, MAX_PLAYERS, MAX_JSON, RATE } from '../net/protocol.js';

// N-1: the syncs' net. send and leave go out through engine.net; emit(event, ...args) is how the net.peer handler raises a transport event
export function netFacade(engine, { isHost, id, hostId }) {
  const ls = new Map();
  return {
    isHost, id, hostId,
    send: (to, data, reliable) => engine.net.send(to, data, reliable),
    on(ev, f) { if (!ls.has(ev)) ls.set(ev, new Set()); ls.get(ev).add(f); }, off(ev, f) { ls.get(ev)?.delete(f); },
    leave: () => engine.net.leave(),
    emit(ev, ...a) { for (const f of [...(ls.get(ev) ?? [])]) f(...a); },
  };
}
// N-3, #91: the port's limits are 1.8's (M-50, C-3) and the messages are JSON: tag 'claim' is the command 'host.claim'. world: the
// engine's World net part replicates the kinds (NET_VERSION 4)
const tags = (table, side) => Object.fromEntries(Object.keys(table).map(t => [t, `${side}.${t}`]));
export const netConfig = (kinds = KINDS) => ({
  kinds, world: true,
  join: 'engine', maxPlayers: MAX_PLAYERS, maxSeats: 1, // [N-19] the engine's join: guests get 2..4, one tractor per page; rejoinSeconds stays 60 (B6)
  maxSender: MAX_PLAYERS, maxJson: MAX_JSON, maxFrame: MAX_FRAME,
  rates: { host: { reliable: RATE.perSec, fast: RATE.perSec, reliableFrames: RATE.guestKeys }, guest: { reliable: RATE.perSec, fast: RATE.guestFast } },
  wire: { toHost: tags(TO_HOST, 'host'), toGuest: tags(TO_GUEST, 'guest') }, codec: 'json',
});
export const NET = netConfig();

// game.step's events and the syncs' (their payloads keep their objects), in order
const bridge = (e, ev) => { for (let i = 0; i < ev.length; i++) e.emit(ev[i].type, ev[i]); };
const PEER_ARGS = { peerLeft: d => [d.id, d.reason], closed: d => [d.reason], hostAway: () => [], hostBack: () => [] };

// api: the farm's (guestFarm; clock overrides the syncs' wall clock: tests only)
export function netCommands(api) {
  const { clock } = api, warn = createWarnOnce(); let registry = null; // the engine's kinds (with lh.player, lh.game), made at the first frame
  const live = ctx => { const n = ctx?.name === 'farm' ? ctx.state.net : null; return n?.sync ? n : null; };
  // M-44: a sync error never stops the step; n.at is the message's arrival on the port's clock, the syncs' wall clock while it is handled
  const at = (n, t, what, fn) => { n.at = t; try { fn(); } catch (err) { warn(what, err); } finally { n.at = null; } };
  // M-39, M-41: a sync that ends here still plays the events it pushed on the way out (playerGone poofs, alone)
  const end = (e, n) => { const y = n.sync; n.role = 'solo'; n.sync = null; bridge(e, y.out.splice(0)); dropLocalTrain(e.world, y.game); };
  const message = (side, t) => (e, d, ctx) => {
    const n = live(ctx); if (!n || n.role !== side) return;
    const { from, at: t0, reliable, ...fields } = d; at(n, t0, 'net message', () => n.sync.message(from, { t, ...fields }, reliable));
  };
  const schemaed = (table, side) => Object.fromEntries(Object.keys(table).map(t => [`${side}.${t}`, { schema: table[t], handler: message(side, t) }]));
  return {
    // N-1: a port is bound. An earlier sync is closed first, with its sends cut off (they would go out on this port)
    'net.open': (e, d, ctx) => {
      if (ctx?.name !== 'farm' || !ctx.state.game) return warn('net open', new Error(`net.open with no farm (main scene '${ctx?.name}'): no sync`)); // M-44: said once, never silent
      const s = ctx.state, old = live(ctx);
      if (old) { old.facade.send = old.facade.leave = () => {}; try { old.sync.close(); } catch (err) { warn('net close', err); } end(e, old); }
      const host = d.role === 'host', n = s.net = { role: d.role, sync: null, facade: netFacade(e, { isHost: host, id: d.id, hostId: d.hostId }), at: null };
      const o = { engine: e, game: s.game, world: e.world, net: n.facade, paint: s.progress.paint, clock: clock ?? (() => n.at ?? e.time.wall) }; // N-4
      n.sync = host ? createHostSync(o) : createGuestSync({ ...o, onFarm: (seed, you) => { api.guestFarm(e, ctx, seed, you); return null; } }); // #80: the welcome waits for farmReady
      if (host) localTrain(e.world, s.game, 1); // the host is player 1 (3i); a guest's train joins at its welcome
    },
    'net.peer': (e, d, ctx) => {
      const n = live(ctx); if (!n) return;
      at(n, d.at, 'net peer', () => n.facade.emit(d.event, ...(PEER_ARGS[d.event]?.(d) ?? [d.id])));
      if (d.event !== 'closed') return;
      if (n.role === 'host') try { n.sync.close(); } catch (err) { warn('net close', err); }
      end(e, n); // M-41: the guest sync has gone on alone
    },
    'net.frame': (e, d, ctx) => { const n = live(ctx); if (n) { registry ??= createRegistry(e.game.net.kinds, { maxSender: MAX_PLAYERS }); at(n, d.at, 'net message', () => n.sync.frame(d.from, frameFromJson(d.frame, registry), d.reliable)); } }, // #78: the engine applied it already; the sync watches
    ...schemaed(TO_HOST, 'host'), ...schemaed(TO_GUEST, 'guest'),
    // the panel's Leave or Stop: the guest's leave goes out through the outbox (its close calls net.leave); a host leaves the room too
    'net.close': (e, d, ctx) => {
      const n = live(ctx); if (!n) return;
      try { n.sync.close(); if (n.role === 'host') n.facade.leave(); } catch (err) { warn('net close', err); }
      end(e, n);
    },
  };
}
