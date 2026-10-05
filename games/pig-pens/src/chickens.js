// Chickens: a flock with a pecking order, grain, eggs, chicks, a coop bedtime and a fox at night.
import { hit } from './flow.js';

export const CST = { PECK: 0, ROAM: 1, GRAIN: 2, NEST: 3, LAY: 4, BROOD: 5, DUST: 6, FLEE: 7, ROOST: 8, ENTER: 9, INSIDE: 10, EXIT: 11, CARRIED: 12, LOST: 13, GRAB: 14, AIR: 15, HOME: 16, DEFEND: 17 };
export const CST_NAME = Object.keys(CST);
export const FST = { AWAY: 0, PROWL: 1, CHASE: 2, CARRY: 3, FLEE: 4 };

export const CP = {
  henR: 0.17, roosterR: 0.2, chickR: 0.09, henMass: 2.2, roosterMass: 3.4, chickMass: 0.15,
  henScale: 0.3, roosterScale: 0.36, chickScale: 0.14,
  walk: 0.5, run: 2.8, chickRun: 2.2, accel: 7, tau: 0.25,
  flapVy: 4.6, flapV: 2.6, glide: 0.55,
  layFrom: 7.5, layTo: 15, laySit: 6, broodAfter: 80, broodSit: 25, maxBirds: 24,
  grainPerHandful: 30, maxHandfuls: 3, peck: 0.35,
  fearDog: 5, fearFox: 6, panicGain: 6, panicDecay: 0.35,
  roostHour: 18.5, wakeHour: 6.5,
  foxFrom: 20, foxTo: 4.5, foxProwl: 1.7, foxChase: 4.7, foxCarry: 4.0, foxFlee: 6.2,
};
const HEN_NAMES = ['Clementine', 'Marigold', 'Pecky', 'Dolly', 'Butterscotch', 'Henrietta', 'Nugget', 'Pip', 'Mabel', 'Ginger', 'Saffron', 'Biscuit', 'Hazel', 'Poppy', 'Custard', 'Waffles'];
const CHICK_NAMES = ['Peep', 'Fluff', 'Bean', 'Dot', 'Puff', 'Sunny', 'Tiny', 'Crumb', 'Pea', 'Button', 'Sprout', 'Twig', 'Wisp', 'Fuzz'];

export function createFlock(ctx) {
  const { RAPIER, world, lay, rng, grid, emit, grp, G, DT, feelers, turnToward } = ctx;
  const { coop, nests, dust, run, field } = lay;
  const birds = [], eggs = [], handfuls = [];
  let eggSeq = 0, grainSeq = 0, basket = 0;

  // flow fields toward the places chickens care about
  const F = {};
  function buildFields() {
    F.coop = grid.field(coop.doorX, coop.rampZ, 0.45);
    F.nests = nests.map(n => grid.field(n.ax, n.az, 0.3));
    F.dust = grid.field(dust.x, dust.z, dust.r * 0.8);
    F.home = grid.field((run.x0 + run.x1) / 2, (run.z0 + run.z1) / 2 + 0.6, 2.2);
    for (const h of handfuls) h.field = grid.field(h.x, h.z, 1.4);
  }
  buildFields();

  function makeBird(kind, x, z, mom = -1) {
    const r = kind === 'hen' ? CP.henR : kind === 'rooster' ? CP.roosterR : CP.chickR;
    const mass = kind === 'hen' ? CP.henMass : kind === 'rooster' ? CP.roosterMass : CP.chickMass;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, r, z).lockRotations().setLinearDamping(0.05).setCcdEnabled(true).setCanSleep(false));
    const col = world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(mass / ((4 / 3) * Math.PI * r ** 3)).setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0.1).setCollisionGroups(grp(G.CHICK, 0xffff & ~G.FOX)), body);
    const b = {
      i: birds.length, kind, body, col, r, mass, mom,
      scale: (kind === 'hen' ? CP.henScale : kind === 'rooster' ? CP.roosterScale : CP.chickScale) * (0.94 + 0.12 * rng()),
      tint: kind === 'rooster' ? [1, 0.52, 0.32] : kind === 'chick' ? [1, 0.84, 0.36] : [[1, 1, 1], [1, 0.97, 0.9], [0.95, 0.95, 0.95], [1, 0.98, 0.94]][Math.floor(rng() * 4)], // white laying hens, copper rooster, yellow chicks
      name: kind === 'chick' ? CHICK_NAMES[birds.filter(b => b.kind === 'chick').length % CHICK_NAMES.length] : kind === 'rooster' ? 'Sir Reginald' : HEN_NAMES[birds.filter(b => b.kind === 'hen').length % HEN_NAMES.length],
      rank: 0, state: CST.PECK, timer: rng() * 2, yaw: rng() * 6.28, wa: rng() * 6.28,
      px: x, py: r, pz: z, vx: 0, vy: 0, vz: 0, speed: 0, panic: 0, threatX: 0, threatZ: 0,
      nest: -1, grain: null, egg: -1, eggsToday: 0, eggsTotal: 0, layAt: 20 + rng() * 100,
      flapCd: 0, airT: 0, hidden: false, tween: 0, displaced: 0, enabled: true, cluck: rng() * 5, dustT: 20 + rng() * 60,
    };
    birds.push(b); return b;
  }
  // starting flock inside the run
  const spot = (r) => { for (let k = 0; k < 100; k++) { const x = run.x0 + 1 + rng() * (run.x1 - run.x0 - 2), z = run.z0 + 1.2 + rng() * (run.z1 - run.z0 - 2); if (!lay.obstacles.some(o => hit(o, x, z, r + 0.2)) && !birds.some(b => Math.hypot(b.px - x, b.pz - z) < 0.6)) return [x, z]; } return [run.x0 + 2, run.z1 - 1]; };
  makeBird('rooster', ...spot(0.2));
  for (let k = 0; k < 10; k++) makeBird('hen', ...spot(0.17));
  // pecking order: rooster on top, hens shuffled below him
  { const hens = birds.filter(b => b.kind === 'hen').sort(() => rng() - 0.5); hens.forEach((h, k) => h.rank = k + 1); }

  function setEnabled(b, on) { if (b.enabled === on) return; b.enabled = on; b.body.setEnabled(on); }
  function place(b, x, y, z) { b.body.setTranslation({ x, y, z }, true); b.body.setLinvel({ x: 0, y: 0, z: 0 }, true); b.px = x; b.py = y; b.pz = z; }
  function setState(b, s, timer = 0) { b.state = s; b.timer = timer; }
  function releaseClaims(b) { if (b.grain) { b.grain.claim = -1; b.grain = null; } b.nest = -1; }
  const outside = b => b.enabled && !b.hidden && b.state !== CST.CARRIED && b.state !== CST.LOST;

  // ---- fox ------------------------------------------------------------------------
  const foxB = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, -50, 0).lockRotations().setCanSleep(false).setEnabled(false));
  world.createCollider(RAPIER.ColliderDesc.ball(0.26).setDensity(7 / ((4 / 3) * Math.PI * 0.26 ** 3)).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setCollisionGroups(grp(G.FOX, G.GROUND | G.PIG | G.DOG | G.TRACTOR)), foxB);
  const fox = { body: foxB, state: FST.AWAY, wa: 0, x: 0, z: -50, vx: 0, vz: 0, speed: 0, yaw: 0, target: null, carrying: null, fear: 0, cooldown: 30, timer: 0, hop: 0, raids: 0, steals: 0, ex: 0, ez: 0 };
  // escape points around the inside of the boundary, away from the coop
  const exits = [];
  for (let x = field.x0 + 1; x < field.x1; x += 6) { exits.push([x, field.z0 + 0.8]); exits.push([x, field.z1 - 0.8]); }
  for (let z = field.z0 + 1; z < field.z1; z += 6) { exits.push([field.x0 + 0.8, z]); exits.push([field.x1 - 0.8, z]); }
  const safeExits = exits.filter(([x, z]) => Math.abs(x - coop.x) > coop.hx + 2.5 || Math.abs(z - coop.z) > coop.hz + 2.5);
  function edgePoint(x, z) { let best = safeExits[0], bd = Infinity; for (const e of safeExits) { const d = Math.hypot(e[0] - x, e[1] - z); if (d < bd) { bd = d; best = e; } } return best; }
  function foxSpawn() {
    // comes in from the north-west woods, somewhere along that corner of the boundary
    const along = rng();
    const [x, z] = along < 0.5 ? [field.x0 + 0.8, field.z0 + 2 + along * 2 * 16] : [field.x0 + 2 + (along - 0.5) * 2 * 26, field.z0 + 0.8];
    fox.body.setEnabled(true); fox.body.setTranslation({ x, y: 0.26, z }, true); fox.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    fox.x = x; fox.z = z; fox.state = FST.PROWL; fox.fear = 0; fox.timer = 45; fox.raids++; emit('fox', { x, z });
  }
  const feathers = (b, n, x, y, z) => emit('feathers', { x: x ?? b.px, y: y ?? b.py + 0.15, z: z ?? b.pz, n, tint: b.tint });
  function gulp(b) { // the fox swallows a chicken whole: puffy cheeks, feathers everywhere
    releaseClaims(b); setState(b, CST.CARRIED); b.hidden = true; setEnabled(b, false);
    fox.carrying = b; fox.state = FST.CARRY; fox.timer = 22 + rng() * 8; fox.wa = rng() * 6.28;
    feathers(b, 12, fox.x + Math.sin(fox.yaw) * 0.45, 0.5, fox.z + Math.cos(fox.yaw) * 0.45);
    emit('gulp', { i: b.i, name: b.name, x: fox.x, z: fox.z });
  }
  function foxSpit(reason) { // ptooey: out she comes, ruffled but fine
    const b = fox.carrying; if (!b) return false; fox.carrying = null;
    const mx = fox.x + Math.sin(fox.yaw) * 0.5, mz = fox.z + Math.cos(fox.yaw) * 0.5;
    b.hidden = false; setEnabled(b, true); place(b, mx, 0.6, mz);
    b.body.setLinvel({ x: Math.sin(fox.yaw) * 2.6 + (rng() - 0.5), y: 3.6, z: Math.cos(fox.yaw) * 2.6 + (rng() - 0.5) }, true);
    b.panic = 1; b.threatX = fox.x; b.threatZ = fox.z; setState(b, CST.AIR); b.airT = 0; b.flustered = 8;
    feathers(b, 16, mx, 0.6, mz);
    emit('spit', { i: b.i, name: b.name, reason, x: mx, z: mz });
    return true;
  }
  function foxLeave(flee) {
    if (fox.state === FST.AWAY) return;
    if (fox.carrying) foxSpit(flee ? 'scared' : 'morning');
    [fox.ex, fox.ez] = edgePoint(fox.x, fox.z);
    fox.state = flee ? FST.FLEE : FST.FLEE; fox.timer = 12;
  }
  function stepFox(clock, threats, dog, hose) {
    const night = clock.night;
    if (fox.state === FST.AWAY) {
      fox.cooldown -= DT;
      if (night && fox.cooldown <= 0) foxSpawn();
      return;
    }
    const tr = fox.body.translation(), lv = fox.body.linvel();
    fox.x = tr.x; fox.z = tr.z; fox.vx = lv.x; fox.vz = lv.z; fox.speed = Math.hypot(lv.x, lv.z);
    // fear: the dog, the rooster, a moving tractor, the horn, and a soaking from the hose
    for (const t of threats) { if (t.kind === 'fox') continue; const d = Math.hypot(fox.x - t.x, fox.z - t.z); if (d < t.R) fox.fear += (1 - d / t.R) * 2.5 * DT; }
    const roo = birds.find(b => b.kind === 'rooster' && outside(b));
    if (roo && Math.hypot(roo.px - fox.x, roo.pz - fox.z) < 1.1) { fox.fear += 1.6 * DT; if (rng() < DT * 3) emit('squawk', { x: fox.x, z: fox.z }); }
    if (hose.active && Math.hypot(hose.x - fox.x, hose.z - fox.z) < 1.9) fox.fear += 2.5 * DT;
    fox.fear = Math.max(0, fox.fear - 0.15 * DT);
    if (fox.fear > 0.6 && fox.state !== FST.FLEE) { foxLeave(true); emit('yip', { x: fox.x, z: fox.z }); }
    if (!night && fox.state !== FST.FLEE) foxLeave(false);

    let tx = fox.x, tz = fox.z, sp = 0;
    switch (fox.state) {
      case FST.PROWL: case FST.CHASE: {
        fox.timer -= DT;
        let best = null, bd = Infinity;
        for (const b of birds) if (outside(b) && b.state !== CST.ENTER) { const d = Math.hypot(b.px - fox.x, b.pz - fox.z); if (d < bd) { bd = d; best = b; } }
        const inside = birds.filter(b => b.state === CST.INSIDE);
        if (best && bd < 22) {
          tx = best.px; tz = best.pz; fox.target = best.i;
          fox.state = bd < 5 ? FST.CHASE : FST.PROWL; sp = fox.state === FST.CHASE ? CP.foxChase : CP.foxProwl;
          if (bd < best.r + 0.42) gulp(best); // caught one
        } else {
          // everyone is tucked away: sniff around the coop door
          fox.target = null; tx = coop.doorX + Math.sin(clock.t * 0.4) * 1.5; tz = coop.rampZ + 1.2 + Math.cos(clock.t * 0.4) * 0.8; sp = CP.foxProwl * 0.8;
          if (coop.open && inside.length && Math.hypot(fox.x - coop.doorX, fox.z - coop.rampZ) < 0.9) {
            gulp(inside[Math.floor(rng() * inside.length)]);
          } else if (coop.open && inside.length) { tx = coop.doorX; tz = coop.rampZ; sp = CP.foxProwl; }
        }
        if (fox.timer <= 0 && fox.state !== FST.CARRY) foxLeave(false);
        break;
      }
      case FST.CARRY: { // strolls about looking pleased with itself until something makes it spit
        fox.timer -= DT; fox.wa += (rng() - 0.5) * 2 * DT;
        let wx = Math.sin(fox.wa), wz = Math.cos(fox.wa);
        const m = 4; if (fox.x < field.x0 + m) wx += 1.5; if (fox.x > field.x1 - m) wx -= 1.5; if (fox.z < field.z0 + m) wz += 1.5; if (fox.z > field.z1 - m) wz -= 1.5;
        tx = fox.x + wx * 3; tz = fox.z + wz * 3; sp = 0.9;
        if (fox.carrying) { const b = fox.carrying; b.px = fox.x + Math.sin(fox.yaw) * 0.5; b.pz = fox.z + Math.cos(fox.yaw) * 0.5; b.py = 0.5; }
        if (fox.timer <= 0) { foxSpit('hiccup'); [fox.ex, fox.ez] = edgePoint(fox.x, fox.z); fox.state = FST.FLEE; fox.timer = 12; }
        break;
      }
      case FST.FLEE: {
        tx = fox.ex; tz = fox.ez; sp = CP.foxFlee; fox.timer -= DT;
        if (Math.hypot(fox.x - fox.ex, fox.z - fox.ez) < 0.9 || fox.timer <= 0) { fox.state = FST.AWAY; fox.cooldown = 35; fox.body.setEnabled(false); fox.carrying = null; }
        break;
      }
    }
    if (fox.state === FST.AWAY) return;
    // steer, keeping out of the coop footprint
    let dx = tx - fox.x, dz = tz - fox.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const cx = fox.x - coop.x, cz = fox.z - coop.z; const qx = Math.max(Math.abs(cx) - coop.hx - 0.4, 0), qz = Math.max(Math.abs(cz) - coop.hz - 0.4, 0);
    if (qx === 0 && qz === 0) { const l = Math.hypot(cx, cz) || 1; dx += cx / l * 2; dz += cz / l * 2; }
    const vdx = dx * Math.min(sp, d * 2.5), vdz = dz * Math.min(sp, d * 2.5);
    let ax = (vdx - fox.vx) / 0.2, az = (vdz - fox.vz) / 0.2; const al = Math.hypot(ax, az); if (al > 14) { ax *= 14 / al; az *= 14 / al; }
    fox.body.applyImpulse({ x: ax * 7 * DT, y: 0, z: az * 7 * DT }, true);
    if (fox.speed > 0.3) fox.yaw = turnToward(fox.yaw, Math.atan2(fox.vx, fox.vz), 8 * DT);
    let near = false; for (const o of lay.obstacles) if (o.fence && hit(o, fox.x, fox.z, 0.4)) { near = true; break; }
    fox.hop += ((near ? 1 : 0) - fox.hop) * Math.min(1, DT * 14);
  }

  // ---- grain ------------------------------------------------------------------------
  function scatterGrain(fx, fy, fz, tx, tz) {
    if (handfuls.length >= CP.maxHandfuls) return null;
    const h = { id: grainSeq++, x: tx, z: tz, grains: [], field: grid.field(tx, tz, 1.4), age: 0 };
    for (let k = 0; k < CP.grainPerHandful; k++) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * 1.3, T = 0.55 + rng() * 0.15;
      const gx = tx + Math.cos(a) * r, gz = tz + Math.sin(a) * r;
      h.grains.push({ x: fx, y: fy, z: fz, vx: (gx - fx) / T, vy: (0.02 - fy + 4.905 * T * T) / T, vz: (gz - fz) / T, landed: false, eaten: false, claim: -1, h });
    }
    handfuls.push(h); return h;
  }
  function stepGrain(pigs) {
    for (let k = handfuls.length - 1; k >= 0; k--) {
      const h = handfuls[k]; h.age += DT; let left = 0;
      for (const g of h.grains) {
        if (g.eaten) continue; left++;
        if (!g.landed) { g.vy -= 9.81 * DT; g.x += g.vx * DT; g.y += g.vy * DT; g.z += g.vz * DT; if (g.y <= 0.02) { g.y = 0.02; g.landed = true; } continue; }
        // pigs hoover up any grain they walk over
        for (const p of pigs) if (Math.abs(p.px - g.x) < 0.6 && Math.abs(p.pz - g.z) < 0.6 && p.state !== 7 && p.state !== 8) { g.eaten = true; p.hunger = Math.max(0, p.hunger - 0.01); break; }
      }
      if (!left || h.age > 240) { for (const g of h.grains) if (g.claim >= 0 && birds[g.claim]) birds[g.claim].grain = null; handfuls.splice(k, 1); }
    }
  }
  const grainLeft = () => handfuls.reduce((a, h) => a + h.grains.filter(g => !g.eaten).length, 0);

  // ---- eggs -------------------------------------------------------------------------
  function layEgg(b) {
    const n = nests[b.nest]; const slot = eggs.filter(e => e.nest === n.id).length;
    if (slot >= 3) return;
    eggs.push({ id: eggSeq++, nest: n.id, x: n.x + (slot - 1) * 0.12, y: 0.06, z: n.z + 0.05 * (slot % 2), age: 0, layer: b.i, hatch: 0, brooder: -1 });
    b.eggsToday++; b.eggsTotal++; emit('lay', { i: b.i, x: n.x, z: n.z });
  }
  function collectEgg(id) {
    const k = eggs.findIndex(e => e.id === id); if (k < 0) return false;
    const e = eggs[k]; if (e.brooder >= 0) { const h = birds[e.brooder]; if (h && h.state === CST.BROOD) setState(h, CST.ROAM, 2); }
    eggs.splice(k, 1); basket++; emit('egg', { x: e.x, z: e.z }); return true;
  }
  function hatch(e, hen) {
    eggs.splice(eggs.indexOf(e), 1);
    if (birds.length >= CP.maxBirds) return;
    const n = nests[e.nest];
    const c = makeBird('chick', n.ax, n.az + 0.3, hen.i); c.rank = 99;
    setState(c, CST.PECK, 1); emit('hatch', { i: c.i, mom: hen.i, x: n.x, z: n.z });
  }

  // ---- grab -------------------------------------------------------------------------
  let grabbed = -1; const grabT = { x: 0, y: 0, z: 0 };
  function pick(ox, oy, oz, dx, dy, dz) {
    let best = -1, bd = Infinity;
    for (const b of birds) {
      if (!outside(b)) continue;
      const cx = b.px - ox, cy = b.py + b.r * 0.5 - oy, cz = b.pz - oz, t = cx * dx + cy * dy + cz * dz; if (t < 0) continue;
      const miss = Math.hypot(cx - dx * t, cy - dy * t, cz - dz * t);
      if (miss < b.r * 2.4 + 0.12 + t * 0.015 && t < bd) { bd = t; best = b.i; }
    }
    return best;
  }
  function grab(i) { const b = birds[i]; if (!b) return; feathers(b, 5); releaseClaims(b); grabbed = i; setState(b, CST.GRAB); grabT.x = b.px; grabT.y = 1.4; grabT.z = b.pz; emit('squawk', { x: b.px, z: b.pz }); }
  function moveGrab(x, y, z) { grabT.x = x; grabT.y = y; grabT.z = z; }
  function release() { if (grabbed < 0) return; const b = birds[grabbed]; grabbed = -1; setState(b, CST.AIR); b.airT = 0; }

  // ---- per-step behaviour ---------------------------------------------------------------
  const tmp = [0, 0], fl = [0, 0];
  let dayT = 0;
  function newDay() { dayT = 0; for (const b of birds) if (b.kind === 'hen') { b.eggsToday = 0; b.layAt = 20 + rng() * 100; } emit('crow', {}); }
  function onNight() { if (fox.state === FST.AWAY) fox.cooldown = 7 + rng() * 6; }
  function step(clock, threats, pigs, hose, dog, t) {
    const night = clock.night;
    if (!night) dayT += DT;
    stepGrain(pigs);
    for (const e of eggs) { e.age += DT; }
    stepFox(clock, threats, dog, hose);
    const foxThreat = fox.state !== FST.AWAY && fox.state !== FST.FLEE;

    // coop: release birds in the morning, one at a time
    if (!night && coop.open) {
      const b = birds.filter(b => b.state === CST.INSIDE).sort((a, c) => a.rank - c.rank)[0];
      if (b && (t * 10 | 0) % 6 === 0 && !birds.some(o => o.state === CST.EXIT)) { b.hidden = false; setEnabled(b, true); place(b, coop.doorX, 0.6, coop.doorZ - 0.1); setState(b, CST.EXIT, 0.7); b.tween = 0; }
    }

    for (const b of birds) {
      if (!b.enabled && b.state !== CST.INSIDE && b.state !== CST.CARRIED && b.state !== CST.LOST) continue;
      if (b.state === CST.INSIDE || b.state === CST.CARRIED || b.state === CST.LOST) continue;
      const tr = b.body.translation(), lv = b.body.linvel();
      b.px = tr.x; b.py = tr.y; b.pz = tr.z; b.vx = lv.x; b.vy = lv.y; b.vz = lv.z; b.speed = Math.hypot(lv.x, lv.z);
      b.timer -= DT; b.flapCd -= DT; b.cluck -= DT; b.dustT -= DT; b.crowCd = (b.crowCd || 0) - DT;
      if (b.cluck <= 0) { b.cluck = 4 + rng() * 8; if (b.state !== CST.INSIDE) emit(b.kind === 'chick' ? 'peep' : 'cluck', { x: b.px, z: b.pz }); }

      if (b.state === CST.GRAB) {
        const k = b.mass * 64, c = 2 * b.mass * 8 * 0.7;
        let Fx = k * (grabT.x - b.px) - c * b.vx, Fy = k * (grabT.y - b.py) - c * b.vy + b.mass * 9.81, Fz = k * (grabT.z - b.pz) - c * b.vz;
        b.body.applyImpulse({ x: Fx * DT, y: Fy * DT, z: Fz * DT }, true); b.panic = 1; if (rng() < DT * 2.5) feathers(b, 1); continue;
      }
      if (b.state === CST.AIR) { // flapping: wings slow the fall
        b.airT += DT;
        if (b.vy < 0) b.body.applyImpulse({ x: 0, y: b.mass * 9.81 * CP.glide * DT, z: 0 }, true);
        if (b.airT > 0.2 && b.py < b.r + 0.05 && Math.abs(b.vy) < 0.5) { setState(b, b.panic > 0.3 ? CST.FLEE : CST.PECK, 1); }
        if (b.speed > 0.3) b.yaw = turnToward(b.yaw, Math.atan2(b.vx, b.vz), 6 * DT);
        continue;
      }
      if (b.state === CST.ENTER || b.state === CST.EXIT) { // walk the ramp
        b.tween += DT / 0.7;
        const u = Math.min(1, b.tween), up = b.state === CST.ENTER ? u : 1 - u;
        const x = coop.doorX, z = coop.rampZ + (coop.doorZ - coop.rampZ) * up, y = b.r + 0.45 * up;
        place(b, x, y, z); b.yaw = b.state === CST.ENTER ? Math.PI : 0;
        if (u >= 1) {
          if (b.state === CST.ENTER) { setState(b, CST.INSIDE); b.hidden = true; setEnabled(b, false); }
          else { place(b, x, b.r, coop.rampZ + 0.2); setState(b, CST.ROAM, 1.5); }
        }
        continue;
      }

      // neighbours: separation with a pecking order (lower birds give way), loose flocking
      let sx = 0, sz = 0, ax = 0, az = 0, an = 0, cx = 0, cz = 0, cn = 0, nbPanic = 0, nbTX = 0, nbTZ = 0;
      for (const o of birds) {
        if (o === b || !outside(o)) continue;
        const dx = b.px - o.px, dz = b.pz - o.pz, d2 = dx * dx + dz * dz; if (d2 > 16) continue;
        const d = Math.sqrt(d2) + 1e-4;
        let sr = b.r + o.r + 0.12;
        if (b.kind !== 'chick' && o.kind !== 'chick' && o.rank < b.rank) sr += 0.35;
        if (d < sr) { const k = (sr - d) / sr; sx += dx / d * k; sz += dz / d * k; if (o.rank < b.rank && b.state === CST.GRAIN && d < sr * 0.8) b.displaced += DT; }
        if (d < 1.5) { ax += o.vx; az += o.vz; an++; }
        if (o.kind !== 'chick') { cx += o.px; cz += o.pz; cn++; }
        if (d < 2.2 && o.panic > nbPanic) { nbPanic = o.panic; nbTX = o.threatX; nbTZ = o.threatZ; }
      }
      for (const p of pigs) { // keep clear of trotters
        const dx = b.px - p.px, dz = b.pz - p.pz, d = Math.hypot(dx, dz) + 1e-4, sr = p.r + b.r + 0.55;
        if (d < sr) { const k = (sr - d) / sr; sx += dx / d * k * 1.5; sz += dz / d * k * 1.5; }
      }
      // fear
      for (const th of threats) {
        if (th.kind === 'fox' && (!foxThreat || b.kind === 'rooster')) continue;
        const R = th.kind === 'dog' ? Math.min(th.R, CP.fearDog) : th.kind === 'fox' ? CP.fearFox : th.R;
        const d = Math.hypot(b.px - th.x, b.pz - th.z);
        if (d < R) { b.panic = Math.min(1, b.panic + (1 - d / R) * CP.panicGain * DT); b.threatX = th.x; b.threatZ = th.z; }
      }
      if (nbPanic * 0.85 > b.panic) { b.panic += (nbPanic * 0.85 - b.panic) * Math.min(1, DT * 6); b.threatX = nbTX; b.threatZ = nbTZ; }
      b.panic = Math.max(0, b.panic - CP.panicDecay * DT);

      // ---- decisions ---------------------------------------------------------------
      const calm = b.state !== CST.FLEE && b.state !== CST.DEFEND;
      if (b.panic > 0.3 && b.state !== CST.FLEE) { feathers(b, 2 + (rng() * 3 | 0)); releaseClaims(b); if (b.state === CST.BROOD || b.state === CST.LAY) b.timer = 0; setState(b, CST.FLEE); }
      if (b.kind === 'rooster' && foxThreat && Math.hypot(fox.x - b.px, fox.z - b.pz) < 9 && b.state !== CST.DEFEND) { releaseClaims(b); setState(b, CST.DEFEND); if (!(b.crowCd > 0)) { emit('crow', { short: 1 }); b.crowCd = 8; } }
      const mom = b.mom >= 0 ? birds[b.mom] : null;
      const busy = [CST.FLEE, CST.DEFEND, CST.LAY, CST.BROOD, CST.ROOST, CST.HOME].includes(b.state);
      if (night && !busy && b.state !== CST.ROOST) { releaseClaims(b); setState(b, CST.ROOST); }
      if (!night && calm && !busy && b.kind === 'chick' && mom && mom.state === CST.INSIDE) { setState(b, CST.ROOST); }
      if (!night && calm && !busy && (b.state === CST.PECK || b.state === CST.ROAM || b.state === CST.DUST)) {
        // lay an egg once a day
        if (b.kind === 'hen' && b.eggsToday === 0 && dayT >= b.layAt) {
          const free = nests.filter(n => !birds.some(o => o.nest === n.id) && eggs.filter(e => e.nest === n.id).length < 3);
          if (free.length) { const n = free[Math.floor(rng() * free.length)]; b.nest = n.id; setState(b, CST.NEST, 60); }
        }
        // go broody on an egg nobody collected
        if (b.kind === 'hen' && b.state !== CST.NEST) {
          const e = eggs.find(e => e.age > CP.broodAfter && e.brooder < 0 && !birds.some(o => o.nest === e.nest));
          if (e && (e.layer === b.i || rng() < DT * 0.05)) { e.brooder = b.i; b.egg = e.id; b.nest = e.nest; setState(b, CST.NEST, 60); }
        }
        // grain on the ground
        if (b.state !== CST.NEST && ((b.i + (t * 4 | 0)) & 3) === 0 && b.kind !== 'chick' || (b.kind === 'chick' && b.state !== CST.NEST && ((b.i + (t * 4 | 0)) & 3) === 0)) {
          let best = null, bd = b.kind === 'chick' ? 2.5 : 18;
          for (const h of handfuls) {
            const dd = Math.hypot(h.x - b.px, h.z - b.pz) < 3 ? Math.hypot(h.x - b.px, h.z - b.pz) : grid.dist(h.field, b.px, b.pz);
            if (dd > bd) continue;
            for (const g of h.grains) {
              if (g.eaten || !g.landed) continue;
              const owner = g.claim >= 0 ? birds[g.claim] : null;
              if (owner && owner !== b && owner.rank <= b.rank) continue; // can only take grain from a lower bird
              const d = Math.hypot(g.x - b.px, g.z - b.pz) + (dd > 3 ? dd : 0); if (d < bd) { bd = d; best = g; }
            }
          }
          if (best && b.state !== CST.GRAIN) { if (best.claim >= 0 && birds[best.claim]) { birds[best.claim].grain = null; } best.claim = b.i; b.grain = best; setState(b, CST.GRAIN, 20); }
        }
        if (b.kind === 'hen' && b.dustT <= 0 && b.state === CST.ROAM) { b.dustT = 60 + rng() * 90; setState(b, CST.DUST, 45); b.dusting = false; }
      }
      if (b.state === CST.HOME && (b.px > run.x0 && b.px < run.x1 && b.pz > run.z0 && b.pz < run.z1)) setState(b, CST.PECK, 2);

      // ---- behaviour -------------------------------------------------------------
      let dvx = 0, dvz = 0, speed = 0, accel = CP.accel, face = null, useFeelers = false;
      const flowTo = (d, w) => { if (d && grid.dir(d, b.px, b.pz, tmp)) { dvx += tmp[0] * w; dvz += tmp[1] * w; return true; } return false; };
      const seek = (x, z, sp, field, near = 2.5) => {
        const dx = x - b.px, dz = z - b.pz, d = Math.hypot(dx, dz) || 1;
        if (d < near || !flowTo(field, 1)) { dvx = dx / d; dvz = dz / d; }
        speed = Math.min(sp, 0.25 + d * 1.5); return d;
      };
      switch (b.state) {
        case CST.PECK: case CST.ROAM: {
          if (b.timer <= 0) setState(b, b.state === CST.PECK ? CST.ROAM : CST.PECK, b.state === CST.PECK ? 1 + rng() * 2.5 : 1 + rng() * 3);
          if (b.state === CST.ROAM) {
            b.wa += (rng() - 0.5) * 10 * DT;
            dvx = Math.sin(b.wa); dvz = Math.cos(b.wa);
            if (cn) { const mx = cx / cn - b.px, mz = cz / cn - b.pz, l = Math.hypot(mx, mz) || 1, w = Math.min(1, l / 3) * 0.5; dvx += mx / l * w; dvz += mz / l * w; }
            speed = CP.walk; useFeelers = true;
          }
          break;
        }
        case CST.GRAIN: {
          const g = b.grain;
          if (!g || g.eaten || g.claim !== b.i || b.timer <= 0) { if (g && g.claim === b.i) g.claim = -1; b.grain = null; setState(b, CST.PECK, 0.3 + rng() * 0.6); break; }
          if (b.displaced > 0.6) { g.claim = -1; b.grain = null; b.displaced = 0; setState(b, CST.ROAM, 0.6); b.wa = Math.atan2(b.px - g.x, b.pz - g.z); break; } // pushed off by a bigger hen
          const d = seek(g.x, g.z, 1.4, g.h.field, 3);
          if (d < b.r + 0.12) { speed = 0; face = Math.atan2(g.x - b.px, g.z - b.pz); b.pecking = (b.pecking || 0) + DT; if (b.pecking > CP.peck) { g.eaten = true; b.ate = (b.ate || 0) + 1; b.pecking = 0; b.grain = null; setState(b, CST.PECK, 0.05); } }
          break;
        }
        case CST.NEST: {
          const n = nests[b.nest]; if (!n || b.timer <= 0) { releaseClaims(b); setState(b, CST.ROAM, 2); break; }
          const d = seek(n.ax, n.az, 1.1, F.nests[n.id], 1.6);
          if (d < 0.35) { const e = eggs.find(e => e.id === b.egg); setState(b, e ? CST.BROOD : CST.LAY, e ? CP.broodSit : CP.laySit); }
          break;
        }
        case CST.LAY: case CST.BROOD: {
          const n = nests[b.nest]; if (!n) { setState(b, CST.ROAM, 1); break; }
          dvx = (n.x - b.px) * 3; dvz = (n.z + 0.15 - b.pz) * 3; speed = Math.min(0.6, Math.hypot(dvx, dvz)); face = 0;
          if (b.state === CST.BROOD) { const e = eggs.find(e => e.id === b.egg); if (!e) { releaseClaims(b); b.egg = -1; setState(b, CST.ROAM, 2); break; } e.hatch += DT; }
          if (b.timer <= 0) {
            if (b.state === CST.LAY) layEgg(b);
            else { const e = eggs.find(e => e.id === b.egg); if (e) hatch(e, b); b.egg = -1; }
            releaseClaims(b); setState(b, CST.PECK, 2);
          }
          break;
        }
        case CST.DUST: {
          const d = seek(dust.x + Math.sin(b.i) * 0.5, dust.z + Math.cos(b.i) * 0.5, 1.0, F.dust, 2);
          if (d < 0.5) { speed = 0; if (!b.dusting) { b.dusting = true; b.timer = 6 + rng() * 4; } }
          if (b.timer <= 0) { b.dusting = false; setState(b, CST.ROAM, 2); }
          break;
        }
        case CST.FLEE: {
          const dx = b.px - b.threatX, dz = b.pz - b.threatZ, d = Math.hypot(dx, dz) || 1;
          dvx = dx / d + Math.sin(t * 9 + b.i) * 0.4; dvz = dz / d + Math.cos(t * 7 + b.i) * 0.4; // zig-zag
          speed = (b.kind === 'chick' ? CP.chickRun : CP.run) * (0.5 + 0.5 * b.panic); accel = CP.accel * 2; useFeelers = true;
          if (b.panic < 0.12) setState(b, CST.PECK, 1);
          break;
        }
        case CST.DEFEND: { // the rooster runs at the fox
          if (!foxThreat) { setState(b, night ? CST.ROOST : CST.ROAM, 2); break; }
          const dx = fox.x - b.px, dz = fox.z - b.pz, d = Math.hypot(dx, dz) || 1;
          if (d > 11) { setState(b, CST.ROAM, 2); break; }
          dvx = dx / d; dvz = dz / d; speed = 3.0; accel = CP.accel * 2;
          break;
        }
        case CST.ROOST: {
          if (!night && !(b.kind === 'chick' && mom && mom.state === CST.INSIDE)) { setState(b, CST.PECK, 1); break; }
          const d = seek(coop.doorX, coop.rampZ, 1.3, F.coop, 1.5);
          if (d < 0.45) {
            if (coop.open && !birds.some(o => o.state === CST.ENTER)) { setState(b, CST.ENTER); b.tween = 0; }
            else { speed = 0; if (!coop.open && rng() < DT * 0.3) emit('cluck', { x: b.px, z: b.pz, worried: 1 }); }
          }
          break;
        }
        case CST.HOME: {
          if (b.timer <= 0) setState(b, CST.PECK, 1);
          flowTo(F.home, 1); speed = 1.2;
          break;
        }
      }
      // chicks: follow mum in a line
      if (b.kind === 'chick' && mom && outside(mom) && ![CST.FLEE, CST.GRAIN, CST.ROOST].includes(b.state)) {
        const sib = birds.filter(o => o.mom === mom.i && outside(o));
        const k = sib.indexOf(b), lead = k > 0 ? sib[k - 1] : mom;
        const fx = lead.px - Math.sin(lead.yaw) * (lead === mom ? 0.45 : 0.3), fz = lead.pz - Math.cos(lead.yaw) * (lead === mom ? 0.45 : 0.3);
        const dx = fx - b.px, dz = fz - b.pz, d = Math.hypot(dx, dz);
        if (d > 0.12) { dvx = dx / d; dvz = dz / d; speed = Math.min(CP.chickRun, d * 3); useFeelers = false; }
        else speed = 0;
        if (b.state === CST.ROAM || b.state === CST.PECK) b.timer = Math.max(b.timer, 0.2);
      }
      // ---- flap over a fence when panicking and blocked ----------------------------------
      let dl = Math.hypot(dvx, dvz); if (dl > 1e-3) { dvx /= dl; dvz /= dl; }
      if (useFeelers && dl > 1e-3 && ((b.i + (t * 60 | 0)) & 1) === 0) { feelers(b, dvx, dvz, 0.6 + speed * 0.3, fl); b.flx = fl[0]; b.flz = fl[1]; }
      else if (!useFeelers) { b.flx = b.flz = 0; }
      if (b.state === CST.FLEE && b.panic > 0.45 && b.flapCd <= 0 && b.py < b.r + 0.05 && Math.hypot(b.flx || 0, b.flz || 0) > 0.35 && b.kind !== 'chick') {
        b.flapCd = 2.5; setState(b, CST.AIR); b.airT = 0;
        b.body.setLinvel({ x: dvx * CP.flapV, y: CP.flapVy, z: dvz * CP.flapV }, true); emit('flap', { x: b.px, z: b.pz }); feathers(b, 4);
        continue;
      }
      dvx = dvx * speed + (b.flx || 0) * 2 * Math.max(speed, 0.5) + sx * 1.4;
      dvz = dvz * speed + (b.flz || 0) * 2 * Math.max(speed, 0.5) + sz * 1.4;
      if (b.py < b.r + 0.08) {
        let axc = (dvx - b.vx) / CP.tau, azc = (dvz - b.vz) / CP.tau; const al = Math.hypot(axc, azc);
        if (al > accel) { axc *= accel / al; azc *= accel / al; }
        b.body.applyImpulse({ x: axc * b.mass * DT, y: 0, z: azc * b.mass * DT }, true);
      }
      if (face !== null) b.yaw = turnToward(b.yaw, face, 6 * DT);
      else if (b.speed > 0.15) b.yaw = turnToward(b.yaw, Math.atan2(b.vx, b.vz), 8 * DT);
      // escaped the farm somehow: put back in the run
      if (b.py < -2 || b.px < field.x0 - 1 || b.px > field.x1 + 1 || b.pz < field.z0 - 1 || b.pz > field.z1 + 1) { place(b, (run.x0 + run.x1) / 2, 0.5, run.z1 - 1); setState(b, CST.PECK, 1); }
    }
  }

  return {
    birds, eggs, handfuls, fox, F, buildFields, step, newDay, onNight,
    tapFox() { if (fox.state === FST.AWAY) return false; if (fox.carrying) { foxSpit('tap'); [fox.ex, fox.ez] = edgePoint(fox.x, fox.z); fox.state = FST.FLEE; fox.timer = 12; } else foxLeave(true); emit('yip', { x: fox.x, z: fox.z }); return true; }, scatterGrain, collectEgg, grainLeft, pick, grab, moveGrab, release,
    get basket() { return basket; }, get grabbed() { return grabbed; },
  };
}
