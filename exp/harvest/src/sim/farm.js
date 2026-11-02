// One farm on the scene's World (spec §3–§6): the ground, the static colliders, the fields, and a rig per player (its vehicle, the
// carts it tows and the load; H-V1). step() drives each rig, cuts the crop its vehicle and blades can cut under its cutter, unloads
// each bin over a sell zone, says which zone the vehicle is in and when a field is done. A player owns vehicles and swaps between
// them in the barn (H-V2); each vehicle keeps its own levels and its own load. The purse, the levels and the fields' records are the farm's
// `progress`; the scene persists them through events (record()). Sim-pure.
import { createFields } from './field.js';
import { createLoad } from './load.js';
import { staticShapes, ZONES, SELL_ZONES, inZone, GATES } from './layout.js';
import { GATE } from '../defs/models.js';
import { vehicleDesc, attachVehicle, createCarts, headerStrip, axes } from './combine.js';
import { TUNE, CROP_IDS, FIELD_IDS, START_COINS } from '../defs/econ.js';
import { VEHICLES, VEHICLE_IDS, UPGRADE_IDS, costOf, upgrade } from '../defs/vehicles.js';

export const SAVE_VERSION = 4;
// a fresh record, or a stored one checked field by field (no stored value can break the farm). A save of another version starts
// a fresh farm. { v, coins, owned: { <vehicle>: bool }, active, vehicles: { <vehicle>: { levels } }, fields: { <id>: { done, cut } } }
export function clampProgress(p) {
  const out = { v: SAVE_VERSION, coins: START_COINS, owned: Object.fromEntries(VEHICLE_IDS.map((id, k) => [id, k === 0])), active: VEHICLE_IDS[0],
    vehicles: Object.fromEntries(VEHICLE_IDS.map(id => [id, { levels: Object.fromEntries(UPGRADE_IDS.map(u => [u, 0])) }])),
    fields: Object.fromEntries(FIELD_IDS.map(id => [id, { done: false, cut: null }])) };
  if (!p || typeof p !== 'object' || p.v !== SAVE_VERSION) return out;
  if (Number.isFinite(p.coins) && p.coins >= 0) out.coins = Math.min(1e12, Math.floor(p.coins));
  for (const v of VEHICLE_IDS) {
    if (p.owned?.[v] === true) out.owned[v] = true;
    for (const u of UPGRADE_IDS) { const l = p.vehicles?.[v]?.levels?.[u]; if (Number.isInteger(l)) out.vehicles[v].levels[u] = Math.max(0, Math.min(upgrade(v, u).max, l)); }
  }
  if (out.owned[p.active]) out.active = p.active;
  for (const id of FIELD_IDS) {
    const f = p.fields?.[id];
    if (f?.done === true) out.fields[id].done = true;
    if (Array.isArray(f?.cut) && f.cut.length <= 20000) out.fields[id].cut = f.cut.slice();
  }
  return out;
}

const QI = { x: 0, y: 0, z: 0, w: 1 };
const CROP_HOLD = 20; // steps the combine stays `in crop` after its last cut
// a vehicle's bins, each the bin size: its own catcher (the mower's) first, then one per cart it tows
const capsOf = (v, levels) => Array.from({ length: (VEHICLES[v].bag ? 1 : 0) + upgrade(v, 'carts').value(levels.carts) }, () => upgrade(v, 'bins').value(levels.bins));

export function createFarm(world, { progress }) {
  const prog = clampProgress(progress);
  world.spawn({ tags: ['ground'], body: 'fixed', groups: { member: ['ground'] },
    colliders: [{ shape: 'box', half: [200, 0.5, 200], p: [0, -0.5, 0], q: [0, 0, 0, 1], material: 'ground' }] });
  for (const s of staticShapes()) {
    const collider = s.box ? { shape: 'box', half: s.box, p: [0, 0, 0], q: [0, 0, 0, 1], material: s.wall ? 'fence' : 'building' }
      : { shape: 'cylinder', halfHeight: s.cyl[1] / 2, r: s.cyl[0], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'building' };
    const q = s.yaw ? [0, Math.sin(s.yaw / 2), 0, Math.cos(s.yaw / 2)] : [0, 0, 0, 1];
    world.spawn({ tags: [s.wall ? 'fence' : 'building'], body: 'fixed', at: s.at, q, groups: { member: [s.wall ? 'wall' : 'static'] }, colliders: [collider] });
  }
  // H-F8, H-F9: each gate stays shut (a collider) until the vehicle it opens for is owned
  const gates = {};
  const gateShut = () => {
    for (const [id, g] of Object.entries(GATES)) {
      if (prog.owned[g.opens]) { if (gates[id]) { world.despawn(gates[id]); delete gates[id]; } continue; }
      gates[id] ??= world.spawn({ tags: ['gate'], body: 'fixed', at: [g.x, GATE.h / 2, g.z], q: [0, Math.sin(g.yaw / 2), 0, Math.cos(g.yaw / 2)], groups: { member: ['wall'] },
        colliders: [{ shape: 'box', half: [g.half, GATE.h / 2, 0.2], p: [0, 0, 0], q: [0, 0, 0, 1], material: 'fence' }] });
    }
  };
  gateShut();
  const fields = createFields();
  fields.restore(prog.fields); delete prog.fields; // the fields keep these now (record() reads them back)

  const rigs = []; // one per player: { player, vehicle, levels, levelsOf, loads, c (the vehicle's body and driving), train, load, zone, strip, … }
  // spawn (or respawn after an upgrade) a player's vehicle and carts at a pose; the load keeps its grain
  function spawnRig(r, x, z, yaw) {
    const v = r.vehicle, width = upgrade(v, 'width').value(r.levels.width);
    const e = world.spawn(vehicleDesc(v, { x, z, yaw, width, player: r.player }));
    r.c = attachVehicle(world, e, v, { vmax: VEHICLES[v].road, vcut: upgrade(v, 'speed').value(r.levels.speed) });
    r.train = createCarts(world, v, e, upgrade(v, 'carts').value(r.levels.carts), r.player);
    r.width = width;
  }
  // put the rig in `vehicle`: its levels and its own load (made on first use)
  function useVehicle(r, vehicle) {
    r.vehicle = vehicle; r.levels = r.levelsOf[vehicle];
    r.load = r.loads[vehicle] ??= createLoad(capsOf(vehicle, r.levels));
    r.pend.length = 0; r.cutField = null; r.hold = 0; r.wasFull = r.load.full();
  }
  // a player's rig in their vehicle; levelsOf: every vehicle's levels; pose: the vehicle's start unless given
  function addRig(player, vehicle, levelsOf, pose = VEHICLES[vehicle].start) {
    const r = { player, vehicle, levelsOf: structuredClone(levelsOf), loads: {}, levels: null, c: null, train: null, load: null, zone: null, wasFull: false, width: 3,
      strip: { x: 0, z: 0, fx: 0, fz: 1, hw: 1.5, hd: 0.95 }, cutAcc: 0, cutCrop: 0, cutField: null, hold: 0, blocked: null, selling: false,
      sold: { acc: 0, coins: 0, cart: 0 }, pend: [] }; // pend: grain owed per bin over a sell zone (the unload rate's fractions)
    useVehicle(r, vehicle);
    spawnRig(r, pose.x, pose.z, pose.yaw);
    rigs.push(r);
    return r;
  }
  // the body a bin rides on: the vehicle for its own catcher, else the cart that holds it
  const binBody = (r, i) => VEHICLES[r.vehicle].bag ? (i === 0 ? r.c.body : r.train.carts[i - 1]?.body) : r.train.carts[i]?.body;
  function despawnRig(r) {
    for (const k of r.train.carts) world.despawn(k.e);
    world.despawn(r.c.e);
  }
  function respawnRig(r) {
    const p = r.c.body.translation(), A = axes(r.c.body.rotation(), { f: { ...QI }, u: { ...QI }, l: { ...QI } });
    const yaw = Math.atan2(A.f.x, A.f.z);
    despawnRig(r); spawnRig(r, p.x, p.z, yaw);
  }

  // field cut callbacks, made once (no closure per step)
  let cutRig = null;
  const room = () => cutRig.load.room();
  const take = f => { cutRig.load.add(f.cropK); cutRig.cutAcc++; cutRig.cutCrop = f.cropK; cutRig.cutField = f; };

  const farm = {
    world, fields, rigs, prog,
    addRig,
    // the records to save: the purse and levels, the done fields and the active field's cut cells
    record() {
      const out = structuredClone(prog);
      out.fields = Object.fromEntries(fields.list.map(f => [f.id, { done: f.done, cut: fields.cutRuns(f) }]));
      return out;
    },
    rigOf: player => rigs.find(r => r.player === player) ?? null,
    // events: out.push({ type, ... }) for the scene to emit
    step(dt, inputs, out) {
      fields.step(dt);
      for (const r of rigs) {
        const inp = inputs(r);
        r.c.setInput(inp.thr, inp.steer);
        // H-H1: cut under the header (while it is low and the combine rolls forward)
        headerStrip(r.c, r.width, r.strip);
        cutRig = r;
        const before = r.cutAcc;
        const st = r.strip, blades = r.levels.blades;
        if (!r.load.full()) fields.cutStrip(st.x, st.z, st.fx, st.fz, st.hw, st.hd, r.vehicle, blades, room, take);
        // in crop: cut in the last CROP_HOLD steps (a slow header does not cross a cell every step), or ripe crop just ahead
        // of the header (full wagons stop the cutting, not the crop speed)
        const ahead = st.hd + 0.6;
        if (r.cutAcc > before) r.hold = CROP_HOLD; else if (r.hold > 0) r.hold--;
        const crop = r.hold > 0 ? r.cutField : fields.ripeAt(st.x + st.fx * ahead, st.z + st.fz * ahead);
        r.c.cutting = !!crop;
        // H-H6: a crop the vehicle cannot cut (another vehicle's, or too tough for the blades) stays standing; it pushes through slowly
        r.blocked = crop && (crop.vehicle !== r.vehicle || crop.tough > blades) ? crop : null;
        r.c.step(dt, r.blocked ? TUNE.toughSlow : 1);
        r.train.step(Math.abs(r.c.thr) < 0.05 && r.c.speed < 0.3);
        // H-H3: full now
        const full = r.load.full();
        if (full && !r.wasFull) out.push({ type: 'full', player: r.player });
        r.wasFull = full;
        if (r.cutAcc >= 4) { out.push({ type: 'cut', player: r.player, n: r.cutAcc, crop: CROP_IDS[r.cutCrop] }); r.cutAcc = 0; }
        // H-F5: a field done grows back from now on
        const done = fields.finish();
        if (done) out.push({ type: 'fieldDone', field: done.id });
        // zones: the combine's (the barn is the scene's: it opens the workshop card)
        const p = r.c.body.translation();
        let zone = null;
        for (const id in ZONES) if (inZone(ZONES[id], p.x, p.z)) { zone = id; break; }
        if (zone !== r.zone) { out.push({ type: 'zone', player: r.player, zone, from: r.zone }); r.zone = zone; }
        // H-S1: each bin over a sell zone (a wagon over the silo pit, the mower's catcher and tip carts by the compost) unloads
        r.selling = false;
        const had = r.load.total();
        for (let i = 0; i < r.load.bins.length; i++) {
          const b = r.load.bins[i], body = binBody(r, i); if (!body) continue;
          const q = body.translation();
          if (b.n === 0 || !overSell(q.x, q.z)) { r.pend[i] = 0; continue; }
          r.selling = true;
          r.pend[i] = (r.pend[i] ?? 0) + (VEHICLES[r.vehicle].unload ?? TUNE.unloadRate) * dt;
          const n = Math.floor(r.pend[i]); if (n <= 0) continue;
          r.pend[i] -= n; const before = b.n, coins = r.load.unloadBin(i, n);
          prog.coins += coins; r.sold.acc += before - b.n; r.sold.coins += coins; r.sold.cart = i;
        }
        if (r.sold.acc > 0 && (r.sold.acc >= 10 || r.load.total() === 0 || !r.selling)) {
          out.push({ type: 'sold', player: r.player, n: r.sold.acc, coins: r.sold.coins, cart: r.sold.cart, done: had > 0 && r.load.total() === 0, last: !r.selling });
          r.sold.acc = r.sold.coins = 0;
        }
      }
    },
    // H-U4: an upgrade to the player's vehicle bought from the purse; false when maxed or too dear
    buy(player, id) {
      const r = farm.rigOf(player); if (!r || !UPGRADE_IDS.includes(id)) return false;
      const v = r.vehicle, cost = costOf(v, id, r.levels[id]); if (cost === null || prog.coins < cost) return false;
      prog.coins -= cost; r.levels[id]++;
      if (player === 1) prog.vehicles[v].levels[id] = r.levels[id]; // r.levels is r.levelsOf[v]
      if (id === 'speed') r.c.vcut = upgrade(v, 'speed').value(r.levels.speed);
      if (id === 'bins' || id === 'carts') r.load.resize(capsOf(v, r.levels));
      if (id === 'width' || id === 'carts') respawnRig(r);
      return true;
    },
    // H-V2: a player drives `vehicle`: bought first (from the purse) if not owned; the rig respawns in it at the vehicle's home (the
    // mower by the compost, the combine in the yard). 'bought' | 'swapped' | false (unknown, already driving it, or too dear)
    drive(player, vehicle) {
      const r = farm.rigOf(player), def = VEHICLES[vehicle]; if (!r || !def || r.vehicle === vehicle) return false;
      let res = 'swapped';
      if (!prog.owned[vehicle]) { if (prog.coins < def.price) return false; prog.coins -= def.price; prog.owned[vehicle] = true; res = 'bought'; }
      if (player === 1) prog.active = vehicle;
      gateShut();
      const home = def.start;
      despawnRig(r); useVehicle(r, vehicle); spawnRig(r, home.x, home.z, home.yaw);
      return res;
    },
  };
  const overSell = (x, z) => { for (const id of SELL_ZONES) if (inZone(ZONES[id], x, z)) return true; return false; };
  return farm;
}
