// The whole simulation: farm + terrain + physics + tractor + train + trees + herd + boops + flights + riders + barn pass + show hooks.
import { createPhysics, DT } from './physics.js';
import { createTractor, quatAxes } from './tractor.js';
import { createTrain, local2world, TR } from './hitch.js';
import { generateFarm, YARD_HALF, yardFree, inWash } from './track.js';
import { buildRoad, FARM_HALF, makeBarnPass } from './road.js';
import { scatterScenery, addFarmColliders, addYardProps, roadside } from './scenery.js';
import { createTrees } from './trees.js';
import { createTerrain } from './terrain.js';
import { createHerd, TYPES } from './herd.js';
import { createLoad, slotPoint, newRider, stepRider } from './slots.js';
import { launchLocal, FLIGHT, SPLIT } from './launch.js';
import { spawnPoint } from './spawn.js';
import { makeRng } from './rng.js';
import { stepDirt, stepRiderDirt, WASH_RATE } from './dirt.js';

export const CAPACITY = 12;                            // G-1: 6 in the trailer + 6 in the wagon
export const CATCH = { x0: 1.6, x1: 4.0, half: 1.6 }; // B-1: box in front of the nose, 1.5 x tractor width
const AIM = { range: 6, cone: 30 * Math.PI / 180, gain: 1.2, max: 0.35 }; // B-3
const STILL = { thr: 0, steer: 0, horn: false };
export const CLAIM_WAIT = 1; // M-14: s a guest's animal waits at the top of its arc for the host's answer
const STOP = 0.88; // F-5: speed kept per step while the train stops in the barn (stopped from full speed in about half a second)

export function createGame(RAPIER, { seed, power = 'medium', player = 1 }) {
  const farm = generateFarm(seed), road = buildRoad(farm), terrain = createTerrain(farm, road, makeRng(seed ^ 0x7e11a1)), rng = makeRng(seed ^ 0x51ed);
  const items = scatterScenery(farm, road, makeRng(seed ^ 0x9e3779b9), terrain);
  const phys = createPhysics(RAPIER, { terrain }); addFarmColliders(phys, farm, road, terrain); // routes are closed in by banks, fences and the yard fence (T-17)
  const yardProps = addYardProps(phys, farm), s = spawnPoint(farm, player); // M-10
  const trees = createTrees(phys, [...farm.yard.obstacles.filter(o => o.kind === 'tree' || o.kind === 'bush'), ...roadside(farm, road, makeRng(seed ^ 0x70adc0de))]); // T-34, T-35
  const tractor = createTractor(phys, { x: s.x, z: s.z, yaw: s.yaw, power, surfaceAt: road.surfaceAt });
  const train = createTrain(phys, tractor), bodies = [tractor.body, ...train.cars.map(c => c.body)];
  const flights = [], barnPass = makeBarnPass(farm.yard.barn);
  const mudSpots = farm.routes.flatMap((R, r) => R.tiles.flatMap((t, k) => t.type === 'mud' ? [road.featureCenter(r, k)] : []));
  const env = {
    bounds: FARM_HALF - 3, mudSpots, pond: farm.yard.pond, hideSpots: farm.hideSpots, barn: farm.yard.barn,
    roadNearest: (x, z) => road.nearest(x, z),
    roadAhead: (x, z, yaw, dist) => { const n = road.nearest(x, z), f = n.pt.tx * Math.sin(yaw) + n.pt.tz * Math.cos(yaw); return road.ahead(n.pt, f >= 0 ? dist : -dist); },
    yard: { half: YARD_HALF, randomPoint: r => { for (let i = 0; i < 60; i++) { const x = r.range(-YARD_HALF, YARD_HALF), z = r.range(-YARD_HALF, YARD_HALF); if (yardFree(farm.yard, x, z, 0.6)) return { x, z }; } return { x: YARD_HALF - 4, z: YARD_HALF - 4 }; } },
    routePoint: r => { const R = r.pick(road.routes), p = r.pick(R.pts.slice(10, -10)), off = r.range(-5, 5); return { x: p.x - p.tz * off, z: p.z + p.tx * off }; }, // on the road, away from the yard ends
  };
  const herd = createHerd({ rng, env });
  const tractorWorld = (l, out) => Object.assign(out, local2world(tractor.body, l));
  let axes = null; // the tractor's axes, computed twice per step (before and after physics) and reused by every tractorLocal call in it; outside a step they are fresh
  const tractorLocal = (x, y, z, out) => { const p = tractor.body.translation(), { f, u, r } = axes || quatAxes(tractor.body.rotation()), dx = x - p.x, dy = y - p.y, dz = z - p.z;
    out.x = dx * f.x + dy * f.y + dz * f.z; out.y = dx * u.x + dy * u.y + dz * u.z; out.z = dx * r.x + dy * r.y + dz * r.z; return out; };
  const slotWorld = (sl, out) => Object.assign(out, local2world(train.cars[sl.car].body, slotPoint(sl.k, sl.animal.ride?.rider, TR.half.y, {})));
  const prevVel = train.cars.map(c => { const v = c.body.linvel(); return { x: v.x, y: v.y, z: v.z }; });
  const tmp = {}, tmp2 = {}, tmp3 = {}, tmp4 = {}, aw = {}, al = {};
  let pendingPass = false, lastSurface = 'gravel', wasClean = true;

  const game = {
    farm, road, terrain, items, phys, yardProps, trees, tractor, train, herd, flights, rng, tractorWorld, tractorLocal, slotWorld,
    load: createLoad(CAPACITY), mode: 'drive', dirt: { tractor: 0 }, // T-16: dirt levels 0..1 (cars and animals carry their own)
    others: [], claims: false, boopsPaused: false, // multiplayer: other tractors for the herd (M-12), boops wait for the host (M-14), host away (M-40)
    // F-5: the show takes over. Riders in slot order (trailer then wagon, the order they were booped in); obstacles go back to their places and broken trees regrow (T-32, T-34).
    startShow() { game.mode = 'show'; yardProps.reset(); trees.reset(); return game.load.slots.filter(sl => sl.landed).map(sl => ({ animal: sl.animal, slot: sl })); },
    // F-10, A-16, G-3: delivered animals walk into the barn and are gone, new ones appear on the routes, the trailer and wagon are empty again.
    finishShow(riders) {
      for (const r of riders) r.animal.ride = null;
      herd.toBarn(riders.map(r => r.animal)); if (!herd.remote) herd.respawn(); // M-16: on a guest the host makes the new animals
      game.load = createLoad(CAPACITY); game.mode = 'drive';
    },
    // M-14: the host's answer to a guest's claim. ok: it lands as usual. Not ok: it disappears with a poof and its slot is free again.
    resolveClaim(id, ok) {
      const i = flights.findIndex(f => f.animal.id === id && f.claim === 'pending'); if (i < 0) return [];
      if (ok) { flights[i].claim = null; return []; }
      const ev = []; dropFlight(i, ev, 'refused'); return ev;
    },
    step(input) {
      const drive = game.mode === 'drive' ? input : STILL, load = game.load, events = [];
      axes = quatAxes(tractor.body.rotation());
      if (drive.horn) { herd.horn(tractor); events.push({ type: 'horn' }); }
      // B-3 aim help: nudge steering toward a close animal ahead
      let assist = 0, best = AIM.range;
      if (game.mode === 'drive') for (const a of herd.free()) { const l = tractorLocal(a.x, 0, a.z, tmp), d = Math.hypot(l.x, l.z);
        if (l.x > 0 && d < best && Math.abs(Math.atan2(l.z, l.x)) < AIM.cone) { best = d; assist = Math.max(-AIM.max, Math.min(AIM.max, -Math.atan2(l.z, l.x) * AIM.gain)); } }
      tractor.setAssist(tractor.fwd > 0.5 ? assist : 0);
      tractor.hold = game.mode !== 'drive'; tractor.setInput(drive.thr, drive.steer); tractor.step(DT);
      train.step(DT, { parked: tractor.hold || (Math.abs(drive.thr) < 0.05 && tractor.speed < 0.3) });
      events.push(...trees.step(DT, bodies, game.mode === 'drive')); phys.world.step(); // trees first: a broken trunk's collider is gone before contact resolves
      axes = quatAxes(tractor.body.rotation());
      herd.step(DT, { tractor, others: game.others });
      // boops (B-1, B-2: any speed; A-13: a hider sits at its bush, so driving into the bush finds it) and the dog that jumps in by itself (A-7)
      if (game.mode === 'drive' && !load.full() && !game.boopsPaused) for (const a of herd.free()) {
        if (a.state === 'fly') continue; // launched earlier in this loop with its hen-and-chicks line
        const l = tractorLocal(a.x, 0, a.z, tmp), r = TYPES[a.type].r;
        const inZone = l.x > CATCH.x0 - r && l.x < CATCH.x1 + r && Math.abs(l.z) < CATCH.half + r;
        const dogJump = a.type === 'dog' && !a.hidden && Math.hypot(l.x, l.z) < 4;
        if (inZone || dogJump) boop(a, events);
        if (load.full()) break;
      }
      // B-14: full, so no boop: an animal in front of the tractor or beside a trailer hops out of the way, to the side away from it
      if (game.mode === 'drive' && load.full() && !herd.remote) fullDodge(herd, tractor.body.translation(), tractor.body.rotation(), train.cars.map(c => ({ p: c.body.translation(), q: c.body.rotation() })), events); // B-14 (the host does it for guests, M-12)
      // flights
      for (let i = flights.length - 1; i >= 0; i--) {
        const fl = flights[i]; fl.u += DT / fl.dur; fl.prev.x = fl.pos.x; fl.prev.y = fl.pos.y; fl.prev.z = fl.pos.z;
        if (fl.claim === 'pending' && fl.u > SPLIT) { fl.u = SPLIT; if ((fl.hold += DT) > CLAIM_WAIT) { dropFlight(i, events, 'timeout'); continue; } } // M-14: no landing before the host's yes
        if (fl.u < 0) continue;
        const sw = slotWorld(fl.slot, tmp2), sl = tractorLocal(sw.x, sw.y, sw.z, tmp3);
        const lp = launchLocal(Math.min(1, fl.u), fl.start, sl, tmp4); tractorWorld(lp, fl.pos);
        fl.animal.x = fl.pos.x; fl.animal.z = fl.pos.z; fl.animal.y = fl.pos.y;
        if (fl.u >= 1) { flights.splice(i, 1); const a = fl.animal; a.state = 'ride'; a.ride = { slot: fl.slot, rider: newRider() }; fl.load.land(fl.slot); events.push({ type: 'land', animal: a, slot: fl.slot, n: fl.load.landed() }); }
      }
      // riders: spring against the car's acceleration in its own frame (D-12)
      train.cars.forEach((c, k) => {
        const v = c.body.linvel(), pv = prevVel[k]; aw.x = (v.x - pv.x) / DT; aw.y = (v.y - pv.y) / DT; aw.z = (v.z - pv.z) / DT; pv.x = v.x; pv.y = v.y; pv.z = v.z;
        const { f, u, r } = quatAxes(c.body.rotation()); al.x = aw.x * f.x + aw.y * f.y + aw.z * f.z; al.y = aw.x * u.x + aw.y * u.y + aw.z * u.z; al.z = aw.x * r.x + aw.y * r.y + aw.z * r.z;
        for (const s2 of game.load.slots) if (s2.car === k && s2.landed && s2.animal.state === 'ride') { stepRider(s2.animal.ride.rider, al, DT); const w = slotWorld(s2, tmp2); s2.animal.x = w.x; s2.animal.y = w.y; s2.animal.z = w.z; }
      });
      // F-1: a pass through the barn with at least one rider starts the show (after any flight has landed)
      // F-1, F-5: 3/4 of the way through the barn with a rider (or one still flying in), the tractor and the wagons stop where they are
      if (game.mode === 'drive' && barnPass(tractor.x, tractor.z) && (load.landed() > 0 || flights.length > 0)) { pendingPass = true; game.mode = 'arrive'; }
      if (pendingPass && flights.length === 0) { pendingPass = false; if (load.landed() > 0) events.push({ type: 'barnPass' }); else game.mode = 'drive'; } // M-14: the only flight was refused or timed out: no show for no animals, drive on
      if (game.mode === 'arrive' || game.mode === 'show') for (const b of bodies) { const v = b.linvel(); if (Math.hypot(v.x, v.z) > 0.05) b.setLinvel({ x: v.x * STOP, y: v.y, z: v.z * STOP }, true); }
      // dirt (T-15, T-16): mud and gravel dirty the tractor, cars and riders; only the sprinkler and the farmyard wash (T-36) clean
      const sf = tractor.speed / tractor.P.vmax, washAt = (x, z) => road.inSprinkler(x, z) ? 1 : inWash(farm.yard, x, z) ? WASH_RATE : 0, washing = washAt(tractor.x, tractor.z); let anyWash = washing > 0;
      game.dirt.tractor = stepDirt(game.dirt.tractor, { surface: tractor.surface, speedFrac: sf, washing }, DT);
      for (const c of train.cars) {
        const p = c.body.translation(), w = washAt(p.x, p.z), surf = road.surfaceAt(p.x, p.z);
        anyWash ||= w > 0; c.dirt = stepDirt(c.dirt, { surface: surf, speedFrac: sf, washing: w }, DT);
        for (const sl of load.slots) if (sl.car === c.index && sl.landed) sl.animal.dirt = stepRiderDirt(sl.animal.dirt, { carInMud: surf === 'mud', speed: tractor.speed, washing: w }, DT);
      }
      if (tractor.surface === 'mud' && lastSurface !== 'mud') events.push({ type: 'mud-enter' });
      lastSurface = tractor.surface;
      if (anyWash && !wasClean && game.dirt.tractor < 0.05 && train.cars.every(c => c.dirt === 0)) { events.push({ type: 'washed' }); wasClean = true; }
      if (game.dirt.tractor > 0.05) wasClean = false;
      axes = null;
      return events;
    },
  };
  function dropFlight(i, events, reason) { const fl = flights.splice(i, 1)[0], a = fl.animal; fl.load.release(fl.slot); a.state = 'elsewhere'; events.push({ type: 'unclaim', animal: a, reason, pos: { ...fl.pos } }); }
  function launch(a, events, delay = 0) {
    const sl = game.load.reserve(a); if (!sl) return false;
    a.state = 'fly'; a.hidden = false;
    flights.push({ animal: a, slot: sl, load: game.load, u: -delay, dur: FLIGHT[a.type].dur, claim: game.claims ? 'pending' : null, hold: 0, start: tractorLocal(a.x, 0, a.z, {}), pos: { x: a.x, y: 0, z: a.z }, prev: { x: a.x, y: 0, z: a.z } }); // prev: last step's pos, for render interpolation (X-1)
    events.push({ type: 'launch', animal: a }); return true;
  }
  function boop(a, events) {
    // A-12: booping any member of a hen-and-chicks line launches the whole line, one after the other
    const leaderId = a.leader ?? a.id, line = herd.animals.filter(x => (x.id === leaderId || x.leader === leaderId) && herd.free().includes(x)).sort((p, q) => p.line - q.line);
    const launched = []; line.forEach((x, i) => launch(x, launched, i * 0.25));
    if (launched.length) events.push({ type: 'boop', animal: a }, ...launched); // no boop without a launch (load full)
  }
  return game;
}
// B-14 for any full train (the host runs it for full guests too, M-12): tp, tq the tractor's position and rotation; cars [{ p, q }]
export function fullDodge(herd, tp, tq, cars, events) {
  const ax = quatAxes(tq);
  for (const a of herd.free()) {
    if (a.hidden || a.state === 'dodge') continue;
    const r = TYPES[a.type].r, dx = a.x - tp.x, dy = -tp.y, dz = a.z - tp.z;
    const lx = dx * ax.f.x + dy * ax.f.y + dz * ax.f.z, lz = dx * ax.r.x + dy * ax.r.y + dz * ax.r.z;
    if (lx > -2.2 && lx < CATCH.x1 + 1.5 && Math.abs(lz) < CATCH.half + r + 0.3) { dodgeFrom(herd, a, ax, lz, CATCH.half + r + 2.5, events); continue; }
    for (const c of cars) {
      const cx = quatAxes(c.q), ex = a.x - c.p.x, ez = a.z - c.p.z, mx = ex * cx.f.x + ez * cx.f.z, mz = ex * cx.r.x + ez * cx.r.z;
      if (Math.abs(mx) < TR.half.x + 1 && Math.abs(mz) < TR.half.z + r + 0.4) { dodgeFrom(herd, a, cx, mz, TR.half.z + r + 2.2, events); break; }
    }
  }
}
// hop sideways (along the body's right axis, on the side the animal already is) to `clear` metres from the body's center line
function dodgeFrom(herd, a, ax, side, clear, events) {
  const sd = Math.abs(side) > 0.05 ? Math.sign(side) : (a.id % 2 ? 1 : -1), hl = Math.hypot(ax.r.x, ax.r.z) || 1, move = clear - Math.abs(side);
  if (herd.dodge(a, a.x + ax.r.x / hl * sd * move, a.z + ax.r.z / hl * sd * move)) events.push({ type: 'dodge', animal: a });
}
