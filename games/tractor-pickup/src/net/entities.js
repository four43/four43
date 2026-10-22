// The host's replicated entities (lion-hawk 3l, N-9, E-7). While hosting, each live herd animal and each roster row is a bodiless net
// entity, and each farm tree's entity (sim/trees.js) carries a net part; mirrorHost keeps them in step after every host step, unmirrorHost
// drops them when hosting stops (a solo farm has no net entities, so its goldens never see them). netStore(world) gives a guest sync the
// get/all view it had of its own store, over the entities replication made (each holds its last record in e.rec).
const byNet = new WeakMap(); // world → { animal: Map(netId → e), player: Map(n → e) }
const maps = world => { let m = byNet.get(world); if (!m || m.serial !== world.serial) byNet.set(world, m = { serial: world.serial, animal: new Map(), player: new Map() }); return m; };
export function mirrorHost(world, game, roster) {
  const m = maps(world);
  for (const a of game.herd.animals) {
    const e = m.animal.get(a.id), live = a.state !== 'gone';
    if (e && (!live || e.animal !== a)) { world.despawn(e); m.animal.delete(a.id); }
    if (live && !m.animal.has(a.id)) m.animal.set(a.id, world.spawn({ tags: ['animal'], net: 'animal', netId: a.id, animal: a }));
  }
  for (const t of game.trees.list) if (!t.e.net) { t.e.netId = t.id; world.add(t.e, 'net', 'tree'); }
  const seen = new Set();
  for (const p of roster) { seen.add(p.n); const e = m.player.get(p.n);
    if (e) e.player = p; else m.player.set(p.n, world.spawn({ tags: ['player'], net: 'player', netId: p.n, player: p })); }
  for (const [n, e] of m.player) if (!seen.has(n)) { world.despawn(e); m.player.delete(n); }
}
export function unmirrorHost(world, game) {
  const m = maps(world);
  for (const e of m.animal.values()) world.despawn(e); for (const e of m.player.values()) world.despawn(e); m.animal.clear(); m.player.clear();
  for (const t of game.trees.list) if (t.e.net) world.remove(t.e, 'net');
}
export function netStore(world) { // never cache what it returns across a world.clear(): replicas are respawned as new entities (CI-15)
  // the newest record the net part holds for a replica (its remote state's last; a view kind's e.rec is the interpolated one, 100 ms back)
  const recOf = e => world.net?.remoteOf?.(e)?.last ?? e.rec ?? null;
  const find = (kind, id) => { const e = world.net?.find(kind, id); return e && recOf(e) ? e : null; };
  return {
    get: (kind, id) => { const e = find(kind, id); return e ? recOf(e) : null; },
    // find first: after a world.clear() it respawns the replicas (CI-15)
    *all(kind) { world.net?.find?.(kind, -1); for (const e of world.with('net')) if (e.net === kind) { const r = recOf(e); if (r) yield [e.netId, r]; } },
    entity: find,
  };
}
// the local train becomes this player's net entity while a session runs (#77: the number is the game's; 3i sets self)
export function localTrain(world, game, you) {
  if (!you || !game?.tractor) return; const e = game.tractor.e;
  e.mode ??= 'drive'; e.full ??= false; e.dirt ??= [0, 0, 0]; e.riders ??= [];
  if (e.net && e.netId === you) return;
  if (e.net) world.remove(e, 'net');
  // [I-4], [C-3]: a net-made input in the train kind's shape (buttons as booleans); seat 0's lh.possess fills its keys each step
  e.input = { goX: 0, goZ: 0, goBack: false, horn: false };
  e.netId = you; e.owner = you; world.add(e, 'net', 'train');
}
export function dropLocalTrain(world, game) { const e = game?.tractor?.e; if (e?.net && world && !world.disposed) world.remove(e, 'net'); }
