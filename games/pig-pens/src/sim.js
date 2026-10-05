// Pig herd simulation. No rendering dependencies so it runs headless in Node.
import { buildLayout, mulberry32, FENCE_H } from './layout.js';
import { FlowGrid, hit } from './flow.js';

export const DT = 1 / 60;
export const ST = { ROAM: 0, GRAZE: 1, TRAVEL: 2, EAT: 3, FLEE: 4, REST: 5, SNACK: 6, GRAB: 7, AIR: 8, SHOWER: 9, ZOOM: 10 };
export const ST_NAME = Object.keys(ST);
const G_GROUND = 1, G_STATIC = 2, G_PIG = 4, G_FOOD = 8, G_DOG = 16;
const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const FOOD_KINDS = ['apple', 'carrot', 'cabbage', 'cob'];
const FOOD_R = { apple: 0.17, carrot: 0.14, cabbage: 0.26, cob: 0.15 };

export const P = {
  adultR: 0.4, pigletR: 0.25, adultScale: 0.62, pigletScale: 0.38, adultMass: 60, pigletMass: 12,
  roamSpeed: 0.55, travelSpeed: 1.25, snackSpeed: 2.0, fleeBase: 1.8, fleeGain: 2.6,
  tau: 0.35, accelWalk: 3.5, accelRun: 8.0,
  sepPad: 0.35, alignR: 3.0, cohR: 5.0,
  dogRadiusActive: 6.5, dogRadiusIdle: 2.6, panicGain: 5, panicDecay: 0.22, contagion: 0.8, contagionR: 2.6,
  hungerSeek: 0.68, eatRate: 0.2, troughCap: 10, refillEvery: 14,
  smell: 16, smellHungry: 26,
  mudWallowRest: 0.16, mudWallowWalk: 0.07, mudDry: 0.0015, muddy: 0.3,
  hoseR: 1.4, hoseLure: 11, washRate: 0.45, zoomSpeed: 3.7,
  foodCap: 5, foodEatTime: 2.5, foodPursuers: 3, foodLife: 20, foodFade: 1.5,
};

export function createSim(RAPIER, opts = {}) {
  const N = opts.pigs ?? 48;
  const rng = mulberry32(opts.seed ?? 1);
  const lay = buildLayout();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const { field } = lay;

  // ---- static world ---------------------------------------------------------
  world.createCollider(RAPIER.ColliderDesc.cuboid(120, 0.5, 120).setTranslation(0, -0.5, 0).setFriction(0.8)
    .setCollisionGroups(grp(G_GROUND, 0xffff)));
  for (const o of lay.obstacles) {
    const h = o.h / 2;
    const d = o.type === 'circle' ? RAPIER.ColliderDesc.cylinder(h, o.r) : RAPIER.ColliderDesc.cuboid(o.hx, h, o.hz);
    d.setTranslation(o.x, h, o.z).setFriction(0.2).setCollisionGroups(grp(G_STATIC, 0xffff & ~G_DOG));
    if (o.rot) d.setRotation({ x: 0, y: Math.sin(o.rot / 2), z: 0, w: Math.cos(o.rot / 2) });
    world.createCollider(d);
  }
  const grid = new FlowGrid(field, 0.4, lay.obstacles, 0.48);
  const fenceObs = lay.obstacles.filter(o => o.fence);
  const destFields = lay.destinations.map(d => grid.field(d.x, d.z, d.r));
  const troughs = lay.pens.map((p, i) => {
    const t = p.trough;
    const ex = t.x, ez = t.z + t.inward * 0.95;
    return { id: i, pen: i, ...t, ex, ez, level: 0.3 + 0.7 * rng(), field: grid.field(ex, ez, 1.0), claim: 0, eating: 0 };
  });

  // ---- pigs -----------------------------------------------------------------
  const pigs = [];
  const freeSpot = (x0, z0, x1, z1, r) => {
    for (let k = 0; k < 200; k++) {
      const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
      if (lay.obstacles.some(o => hit(o, x, z, r + 0.15))) continue;
      if (pigs.some(p => Math.hypot(p.spawnX - x, p.spawnZ - z) < p.r + r + 0.2)) continue;
      return [x, z];
    }
    return [x0, z0];
  };
  function makeBody(x, z, r, mass, group) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, r, z).lockRotations()
      .setLinearDamping(0.05).setAngularDamping(1.2).setCcdEnabled(true).setCanSleep(false));
    const vol = (4 / 3) * Math.PI * r ** 3;
    const col = world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(mass / vol).setFriction(0)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0.15).setCollisionGroups(group), body);
    return { body, col };
  }
  const nAdults = Math.round(N * 0.72);
  for (let i = 0; i < N; i++) {
    const piglet = i >= nAdults;
    const r = piglet ? P.pigletR : P.adultR;
    let x, z, mom = -1;
    if (!piglet) {
      const pen = lay.pens[i % 6];
      [x, z] = freeSpot(pen.x0 + 1, pen.z0 + 1, pen.x1 - 1, pen.z1 - 1, r);
    } else {
      mom = Math.floor(rng() * nAdults);
      const m = pigs[mom];
      [x, z] = freeSpot(m.spawnX - 1.8, m.spawnZ - 1.8, m.spawnX + 1.8, m.spawnZ + 1.8, r);
    }
    const { body, col } = makeBody(x, z, r, piglet ? P.pigletMass : P.adultMass, grp(G_PIG, 0xffff));
    pigs.push({
      i, body, col, r, piglet, mom, spawnX: x, spawnZ: z,
      scale: (piglet ? P.pigletScale : P.adultScale) * (0.93 + 0.14 * rng()),
      mass: piglet ? P.pigletMass : P.adultMass,
      state: ST.GRAZE, timer: 1 + rng() * 5, yaw: rng() * Math.PI * 2, wa: rng() * Math.PI * 2,
      hunger: rng() * 0.6, hungerRate: 1 / (50 + rng() * 35), panic: 0, threatX: 0, threatZ: 0,
      curiosity: 15 + rng() * 50, target: null, trough: -1, snack: -1, eatT: 0,
      px: x, py: r, pz: z, vx: 0, vy: 0, vz: 0, speed: 0, dvx: 0, dvz: 0,
      region: lay.region(x, z), getUp: 0, tumbleQ: [0, 0, 0, 1], airT: 0, settleT: 0, rot: [0, 0, 0, 1],
      oink: 0, mud: rng() < 0.35 ? 0.45 + 0.55 * rng() : 0, seed: rng(), washed: 0,
    });
  }

  // ---- dog ------------------------------------------------------------------
  const dogB = makeBody(22, -9, 0.36, 25, grp(G_DOG, G_GROUND | G_PIG | G_FOOD));
  const dog = { ...dogB, r: 0.36, x: 22, z: -9, yaw: -2.2, tx: 22, tz: -9, active: false, hop: 0, speed: 0, vx: 0, vz: 0, bark: 0 };

  // ---- food -------------------------------------------------------------------
  const foods = []; let foodSeq = 0;

  // ---- events (for sound / UI) ------------------------------------------------
  const events = [];
  const emit = (type, data) => { if (events.length < 64) events.push({ type, ...data }); };

  const refillEvery = P.refillEvery * 48 / N;
  let t = 0, refillT = refillEvery * 0.5, transitions = 0;
  const tmp = [0, 0];

  function readState() {
    for (const p of pigs) {
      const tr = p.body.translation(), lv = p.body.linvel();
      p.px = tr.x; p.py = tr.y; p.pz = tr.z; p.vx = lv.x; p.vy = lv.y; p.vz = lv.z;
      p.speed = Math.hypot(lv.x, lv.z);
      const q = p.body.rotation(); p.rot[0] = q.x; p.rot[1] = q.y; p.rot[2] = q.z; p.rot[3] = q.w;
    }
    const d = dog.body.translation(), dv = dog.body.linvel();
    dog.x = d.x; dog.z = d.z; dog.vx = dv.x; dog.vz = dv.z; dog.speed = Math.hypot(dv.x, dv.z);
  }
  readState();

  // ---- raycast feelers --------------------------------------------------------
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  const RAY_GROUPS = grp(0xffff, G_STATIC);
  function feelers(p, dx, dz, len, out) {
    let sx = 0, sz = 0;
    for (const [a, w] of [[0, 1], [0.6, 0.75], [-0.6, 0.75]]) {
      const c = Math.cos(a), s = Math.sin(a);
      const rx = dx * c - dz * s, rz = dx * s + dz * c;
      ray.origin.x = p.px; ray.origin.y = 0.3; ray.origin.z = p.pz;
      ray.dir.x = rx; ray.dir.y = 0; ray.dir.z = rz;
      const h = world.castRayAndGetNormal(ray, len, true, undefined, RAY_GROUPS);
      if (!h) continue;
      const k = (1 - h.timeOfImpact / len) * w;
      let nx = h.normal.x, nz = h.normal.z; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      sx += nx * k; sz += nz * k;
      if (a === 0) { // slide along the wall toward whichever side the desire already leans
        let tx = -nz, tz = nx; if (tx * dx + tz * dz < 0) { tx = -tx; tz = -tz; }
        sx += tx * k * 0.8; sz += tz * k * 0.8;
      }
    }
    out[0] = sx; out[1] = sz;
  }

  function chooseTrough(p) {
    let best = -1, bs = Infinity;
    for (const tr of troughs) {
      if (tr.level < 0.06) continue;
      const d = grid.dist(tr.field, p.px, p.pz); if (!isFinite(d)) continue;
      const s = d + 5 * tr.claim + (tr.level < 0.2 ? 12 : 0);
      if (s < bs) { bs = s; best = tr.id; }
    }
    return best;
  }
  function setState(p, s, timer = 0) { p.state = s; p.timer = timer; }
  function startTravel(p, dest) { p.target = dest; p.trough = -1; setState(p, ST.TRAVEL, 70); }
  function startTrough(p, id) { p.trough = id; p.target = null; troughs[id].claim++; setState(p, ST.TRAVEL, 60); }
  function dropClaims(p) {
    if (p.trough >= 0) { troughs[p.trough].claim = Math.max(0, troughs[p.trough].claim - 1); p.trough = -1; }
    if (p.snack >= 0) { const f = foods.find(f => f.id === p.snack); if (f) f.claims = Math.max(0, f.claims - 1); p.snack = -1; }
    p.target = null;
  }
  function inEatStrip(p, tr) {
    const along = Math.abs(p.px - tr.x), out = (p.pz - tr.z) * tr.inward;
    return along < tr.len / 2 + 0.25 && out > 0.2 && out < 1.25 + p.r;
  }

  // ---- public controls -------------------------------------------------------
  let grabbed = -1; const grabT = { x: 0, y: 0, z: 0 };
  function pick(ox, oy, oz, dx, dy, dz) {
    let best = -1, bd = Infinity;
    for (const p of pigs) {
      const cx = p.px - ox, cy = p.py + p.r * 0.3 - oy, cz = p.pz - oz;
      const tt = cx * dx + cy * dy + cz * dz; if (tt < 0) continue;
      const ex = cx - dx * tt, ey = cy - dy * tt, ez = cz - dz * tt;
      const miss = Math.hypot(ex, ey, ez), tol = p.r * 1.6 + tt * 0.02;
      if (miss < tol && tt < bd) { bd = tt; best = p.i; }
    }
    return best;
  }
  function grab(i) {
    if (i < 0) return; const p = pigs[i]; dropClaims(p);
    grabbed = i; setState(p, ST.GRAB); p.panic = 1; p.threatX = p.px; p.threatZ = p.pz;
    p.body.lockRotations(false, true); p.body.setAngularDamping(3);
    p.col.setFriction(0.7); p.col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average);
    grabT.x = p.px; grabT.y = p.py + 1.2; grabT.z = p.pz;
    emit('squeal', { i, x: p.px, z: p.pz });
  }
  function moveGrab(x, y, z) { grabT.x = x; grabT.y = y; grabT.z = z; }
  function release() {
    if (grabbed < 0) return; const p = pigs[grabbed]; grabbed = -1;
    setState(p, ST.AIR); p.airT = 0; p.settleT = 0; p.body.setAngularDamping(0.8);
    const v = p.body.linvel(), sp = Math.hypot(v.x, v.y, v.z);
    if (sp > 14) p.body.setLinvel({ x: v.x * 14 / sp, y: v.y * 14 / sp, z: v.z * 14 / sp }, true);
  }
  const hose = { x: 0, z: 0, sx: 0, sz: 0, active: false, idle: 99, field: null, fx: 1e9, fz: 1e9, ft: 0 };
  function setHose(x, z, active, sx, sz) {
    hose.active = active;
    if (x !== null && x !== undefined) { hose.x = x; hose.z = z; hose.sx = sx ?? x; hose.sz = sz ?? z; }
  }
  function setDog(x, z, active) {
    dog.active = active;
    if (x !== null) { dog.tx = Math.max(field.x0 + 1, Math.min(field.x1 - 1, x)); dog.tz = Math.max(field.z0 + 1, Math.min(field.z1 - 1, z)); }
  }
  function tossFood(fx, fy, fz, tx, tz, kind) {
    if (!kind) kind = FOOD_KINDS[foodSeq % FOOD_KINDS.length];
    if (foods.length >= P.foodCap) return null; // hard cap: no new snacks until some are eaten
    const r = FOOD_R[kind];
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(fx, fy, fz).setCcdEnabled(true)
      .setLinearDamping(0.1).setAngularDamping(0.6));
    const col = world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(500).setFriction(0.9).setRestitution(0.35)
      .setCollisionGroups(grp(G_FOOD, 0xffff)), body);
    const T = 0.85, dx = tx - fx, dz = tz - fz, dy = r - fy;
    body.setLinvel({ x: dx / T, y: (dy + 0.5 * 9.81 * T * T) / T, z: dz / T }, true);
    body.setAngvel({ x: (rng() - 0.5) * 12, y: (rng() - 0.5) * 6, z: (rng() - 0.5) * 12 }, true);
    const f = { id: foodSeq++, kind, body, col, r, x: tx, y: r, z: tz, rot: [0, 0, 0, 1], fx: tx, fz: tz,
      field: grid.field(tx, tz, 0.9), claims: 0, bites: 0, age: 0, ground: 0, life: 1 };
    foods.push(f);
    return f;
  }
  function removeFood(f) {
    const k = foods.indexOf(f); if (k < 0) return;
    for (const p of pigs) if (p.snack === f.id) { p.snack = -1; if (p.state === ST.SNACK) setState(p, ST.GRAZE, 1 + rng()); }
    world.removeRigidBody(f.body); foods.splice(k, 1);
  }
  function bell() {
    for (const tr of troughs) tr.level = 1;
    for (const p of pigs) if (p.state !== ST.GRAB && p.state !== ST.AIR) p.hunger = Math.max(p.hunger, 0.72 + 0.2 * rng());
    emit('bell', {});
  }

  // ---- main step -----------------------------------------------------------------
  const counts = new Array(8).fill(0);
  function step() {
    t += DT;
    // farmer tops up one trough at a time, which keeps the herd moving between pens
    refillT -= DT;
    if (refillT <= 0) {
      refillT = refillEvery;
      const cand = troughs.filter(tr => tr.level < 0.5);
      if (cand.length) { const tr = cand[Math.floor(rng() * cand.length)]; tr.level = 1; emit('refill', { id: tr.id }); }
    }
    for (const tr of troughs) tr.eating = 0;

    // route-finding field toward the spray, refreshed at most twice a second as it moves
    hose.ft -= DT;
    if (hose.active && hose.ft <= 0 && Math.hypot(hose.x - hose.fx, hose.z - hose.fz) > 0.8) { hose.field = grid.field(hose.x, hose.z, 1.2); hose.fx = hose.x; hose.fz = hose.z; hose.ft = 0.5; }
    // dog
    {
      const dx = dog.tx - dog.x, dz = dog.tz - dog.z, d = Math.hypot(dx, dz);
      const sp = dog.active ? Math.min(8, d * 3) : Math.min(3, d * 2);
      const vdx = d > 0.05 ? dx / d * sp : 0, vdz = d > 0.05 ? dz / d * sp : 0;
      let ax = (vdx - dog.vx) / 0.15, az = (vdz - dog.vz) / 0.15; const al = Math.hypot(ax, az);
      if (al > 16) { ax *= 16 / al; az *= 16 / al; }
      dog.body.applyImpulse({ x: ax * 25 * DT, y: 0, z: az * 25 * DT }, true);
      if (dog.speed > 0.4) dog.yaw = turnToward(dog.yaw, Math.atan2(dog.vx, dog.vz), 9 * DT);
      // visual hop over fences (the dog does not collide with fences)
      let near = false; for (const o of fenceObs) if (hit(o, dog.x, dog.z, 0.45)) { near = true; break; }
      dog.hop += ((near ? 1 : 0) - dog.hop) * Math.min(1, DT * 14);
    }

    // food bookkeeping
    for (let k = foods.length - 1; k >= 0; k--) {
      const f = foods[k]; f.age += DT;
      if (f.y < f.r + 0.15) f.ground += DT;
      // uneaten snacks get trampled into the mud, so they can't attract the herd forever
      if (f.ground > P.foodLife) { f.life -= DT / P.foodFade; if (f.life <= 0) { removeFood(f); continue; } }
      const tr = f.body.translation(), q = f.body.rotation();
      f.x = tr.x; f.y = tr.y; f.z = tr.z; f.rot[0] = q.x; f.rot[1] = q.y; f.rot[2] = q.z; f.rot[3] = q.w;
      if (Math.hypot(f.x - f.fx, f.z - f.fz) > 1.2 && f.body.linvel().y > -0.5 && f.y < 0.6) { f.field = grid.field(f.x, f.z, 0.9); f.fx = f.x; f.fz = f.z; }
      if (f.y < -3 || f.x < field.x0 || f.x > field.x1 || f.z < field.z0 || f.z > field.z1) removeFood(f);
    }

    const sep = [0, 0], fl = [0, 0];
    for (const p of pigs) {
      // ---- grabbed: spring at the scruff ---------------------------------------
      if (p.state === ST.GRAB) {
        const q = p.body.rotation();
        const ax = 2 * (q.x * q.y - q.w * q.z) * 0.3, ay = (1 - 2 * (q.x * q.x + q.z * q.z)) * 0.3, az = 2 * (q.y * q.z + q.w * q.x) * 0.3;
        const Ax = p.px + ax, Ay = p.py + ay, Az = p.pz + az;
        const w = 8, k = p.mass * w * w, c = 2 * p.mass * w * 0.6;
        const av = p.body.angvel();
        const vAx = p.vx + av.y * az - av.z * ay, vAy = p.vy + av.z * ax - av.x * az, vAz = p.vz + av.x * ay - av.y * ax;
        let Fx = k * (grabT.x - Ax) - c * vAx, Fy = k * (grabT.y - Ay) - c * vAy + p.mass * 9.81, Fz = k * (grabT.z - Az) - c * vAz;
        const Fl = Math.hypot(Fx, Fy, Fz), Fm = p.mass * 60; if (Fl > Fm) { Fx *= Fm / Fl; Fy *= Fm / Fl; Fz *= Fm / Fl; }
        p.body.applyImpulseAtPoint({ x: Fx * DT, y: Fy * DT, z: Fz * DT }, { x: Ax, y: Ay, z: Az }, true);
        p.panic = 1; p.threatX = p.px; p.threatZ = p.pz;
        continue;
      }
      // ---- thrown / tumbling ---------------------------------------------------
      if (p.state === ST.AIR) {
        p.airT += DT;
        const low = p.py < p.r + 0.12 && Math.abs(p.vy) < 0.6;
        const slow = p.speed < 0.5 && (() => { const w = p.body.angvel(); return Math.hypot(w.x, w.y, w.z); })() < 1.5;
        p.settleT = low && slow ? p.settleT + DT : 0;
        if (p.py < p.r + 0.2) { // a tumbling pig is not a ball: scrub speed and spin while in ground contact
          p.body.applyImpulse({ x: -p.vx * p.mass * 2.5 * DT, y: 0, z: -p.vz * p.mass * 2.5 * DT }, true);
          const w = p.body.angvel(), k = 1 - 3 * DT; p.body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
        }
        if (p.settleT > 0.35 || p.airT > 8) {
          p.tumbleQ = [...p.rot]; p.getUp = 1;
          p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
          p.body.lockRotations(true, true); p.body.setAngularDamping(1.2);
          p.col.setFriction(0); p.col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
          p.panic = 0.45; p.threatX = p.px - Math.sin(p.yaw); p.threatZ = p.pz - Math.cos(p.yaw);
          setState(p, ST.GRAZE, 1.5);
          if (p.py > 2 || p.px < field.x0 || p.px > field.x1 || p.pz < field.z0 || p.pz > field.z1) respawn(p);
        }
        continue;
      }
      if (p.getUp > 0) p.getUp = Math.max(0, p.getUp - DT * 1.6);

      // ---- neighbourhood ---------------------------------------------------------
      sep[0] = sep[1] = 0; let ax = 0, az = 0, an = 0, cx = 0, cz = 0, cn = 0, nbPanic = 0, nbTX = 0, nbTZ = 0;
      for (const o of pigs) {
        if (o === p) continue;
        const dx = p.px - o.px, dz = p.pz - o.pz, d2 = dx * dx + dz * dz;
        if (d2 > P.cohR * P.cohR) continue;
        const d = Math.sqrt(d2) + 1e-4;
        const sr = p.r + o.r + P.sepPad;
        if (d < sr) { const k = (sr - d) / sr; sep[0] += dx / d * k; sep[1] += dz / d * k; }
        if (o.state === ST.GRAB || o.state === ST.AIR) {
          if (d < 4) { const pp = 1 - d / 4; if (pp > nbPanic) { nbPanic = pp; nbTX = o.px; nbTZ = o.pz; } }
          continue;
        }
        if (d < P.alignR) { ax += o.vx; az += o.vz; an++; }
        cx += o.px; cz += o.pz; cn++;
        if (d < P.contagionR && o.panic > nbPanic) { nbPanic = o.panic; nbTX = o.threatX; nbTZ = o.threatZ; }
      }
      // ---- fear ----------------------------------------------------------------
      {
        const dd = Math.hypot(p.px - dog.x, p.pz - dog.z);
        const R = dog.active || dog.speed > 1.5 ? P.dogRadiusActive : P.dogRadiusIdle;
        if (dd < R) { p.panic = Math.min(1, p.panic + (1 - dd / R) * P.panicGain * DT * (p.piglet ? 1.3 : 1)); p.threatX = dog.x; p.threatZ = dog.z; if (p.panic > 0.5 && p.oink <= 0) { emit('oink', { i: p.i, x: p.px, z: p.pz, scared: 1 }); p.oink = 2 + rng() * 3; } }
        const cv = nbPanic * P.contagion;
        if (cv > p.panic) { p.panic += (cv - p.panic) * Math.min(1, DT * 6); p.threatX = nbTX; p.threatZ = nbTZ; }
        p.panic = Math.max(0, p.panic - P.panicDecay * DT);
      }
      p.hunger = Math.min(1, p.hunger + p.hungerRate * DT);
      // mud: wallowing piles it on, it only dries off very slowly
      { const w = lay.wallow, ex = (p.px - w.x) / w.rx, ez = (p.pz - w.z) / w.rz;
        if (ex * ex + ez * ez < 1) p.mud = Math.min(1, p.mud + (p.state === ST.REST ? P.mudWallowRest : P.mudWallowWalk) * DT);
        else p.mud = Math.max(0, p.mud - P.mudDry * DT); }
      p.curiosity -= DT; p.oink -= DT; p.timer -= DT;

      // ---- decisions -------------------------------------------------------------
      if (p.panic > 0.3 && p.state !== ST.FLEE) { dropClaims(p); setState(p, ST.FLEE); }
      const calm = p.state !== ST.FLEE;
      const mom = p.mom >= 0 ? pigs[p.mom] : null;
      if (calm && (p.state === ST.ROAM || p.state === ST.GRAZE || p.state === ST.REST || (p.state === ST.TRAVEL && p.target))) {
        // snacks on the ground beat everything
        if (((p.i + Math.floor(t * 4)) & 3) === 0) {
          let bf = null, bd = p.hunger > 0.5 ? P.smellHungry : P.smell;
          for (const f of foods) {
            if (f.life < 1) continue;
            const close = Math.hypot(f.x - p.px, f.z - p.pz) < p.r + f.r + 0.9;
            if (!close && f.claims >= P.foodPursuers) continue;
            const d = close ? 0 : grid.dist(f.field, p.px, p.pz); if (d < bd) { bd = d; bf = f; }
          }
          if (bf && p.state !== ST.REST) { dropClaims(p); bf.claims++; p.snack = bf.id; setState(p, ST.SNACK, 25); emit('oink', { i: p.i, x: p.px, z: p.pz }); }
        }
      }
      if (calm && (p.state === ST.ROAM || p.state === ST.GRAZE || (p.state === ST.REST && p.hunger > 0.85) || (p.state === ST.TRAVEL && p.target))) {
        if (p.hunger > P.hungerSeek) { const id = chooseTrough(p); if (id >= 0) { dropClaims(p); startTrough(p, id); } }
      }
      if (calm && (p.state === ST.ROAM || p.state === ST.GRAZE) && p.curiosity <= 0) {
        p.curiosity = 35 + rng() * 55;
        if (!p.piglet && p.hunger < 0.5) {
          const here = p.region; let dest;
          if (rng() < (p.mud < P.muddy ? 0.5 : 0.12)) dest = lay.destinations.length - 1;
          else { do dest = Math.floor(rng() * 6); while (dest === here); }
          startTravel(p, dest);
          // nearby calm pigs tag along
          for (const o of pigs) {
            if (o === p || o.piglet || (o.state !== ST.ROAM && o.state !== ST.GRAZE) || o.hunger > 0.6) continue;
            if (Math.hypot(o.px - p.px, o.pz - p.pz) < 3.5 && rng() < 0.6) { startTravel(o, dest); o.curiosity = 25 + rng() * 45; }
          }
        }
      }

      // muddy pigs come for a bath when the hose is running
      if (calm && hose.active && p.mud > P.muddy &&
          (p.state === ST.ROAM || p.state === ST.GRAZE || p.state === ST.REST || p.state === ST.TRAVEL || p.state === ST.SNACK) &&
          Math.hypot(p.px - hose.x, p.pz - hose.z) < P.hoseLure) {
        dropClaims(p); setState(p, ST.SHOWER, 0); emit('oink', { i: p.i, x: p.px, z: p.pz, happy: 1 });
      }

      // ---- state behaviour -----------------------------------------------------------
      let dvx = 0, dvz = 0, speed = 0, accel = P.accelWalk, face = null, useFeelers = false;
      const flowTo = (d, w) => { if (grid.dir(d, p.px, p.pz, tmp)) { dvx += tmp[0] * w; dvz += tmp[1] * w; return true; } return false; };
      switch (p.state) {
        case ST.ROAM: case ST.GRAZE: {
          if (p.timer <= 0) { if (p.state === ST.ROAM) setState(p, ST.GRAZE, 4 + rng() * 7); else setState(p, ST.ROAM, 3 + rng() * 5); }
          if (p.state === ST.ROAM) {
            p.wa += (rng() - 0.5) * 3 * DT * 4;
            dvx = Math.sin(p.wa) * 1.0; dvz = Math.cos(p.wa) * 1.0;
            if (an) { const l = Math.hypot(ax, az) || 1; dvx += ax / l * 0.5; dvz += az / l * 0.5; }
            if (cn) { const mx = cx / cn - p.px, mz = cz / cn - p.pz, l = Math.hypot(mx, mz) || 1, w = Math.min(1, l / 3) * 0.6; dvx += mx / l * w; dvz += mz / l * w; }
            speed = P.roamSpeed * (p.piglet ? 1.15 : 1); useFeelers = true;
          }
          break;
        }
        case ST.TRAVEL: {
          let d = null;
          if (p.trough >= 0) {
            const tr = troughs[p.trough];
            if (tr.level < 0.04) { dropClaims(p); const id = chooseTrough(p); if (id >= 0) startTrough(p, id); else setState(p, ST.ROAM, 4); break; }
            if (inEatStrip(p, tr)) { setState(p, ST.EAT); break; }
            d = tr.field;
          } else if (p.target !== null) {
            const dst = lay.destinations[p.target];
            if (Math.hypot(p.px - dst.x, p.pz - dst.z) < dst.r + 1.2) {
              p.target = null;
              if (dst.kind === 'wallow') setState(p, ST.REST, 14 + rng() * 14); else setState(p, ST.GRAZE, 2 + rng() * 4);
              break;
            }
            d = destFields[p.target];
          }
          if (!d || p.timer <= 0) { dropClaims(p); setState(p, ST.ROAM, 3); break; }
          if (!flowTo(d, 1.6)) { dropClaims(p); setState(p, ST.ROAM, 3); break; }
          if (an) { const l = Math.hypot(ax, az) || 1; dvx += ax / l * 0.2; dvz += az / l * 0.2; }
          speed = P.travelSpeed + (p.trough >= 0 ? 0.6 * p.hunger : 0);
          break;
        }
        case ST.EAT: {
          const tr = troughs[p.trough];
          if (!tr || !inEatStrip(p, tr)) { if (tr) { setState(p, ST.TRAVEL, 30); } else setState(p, ST.ROAM, 2); break; }
          tr.eating++;
          const bite = P.eatRate * DT; p.hunger = Math.max(0, p.hunger - bite); tr.level = Math.max(0, tr.level - bite / P.troughCap * (p.piglet ? 0.4 : 1));
          // hold position at the trough edge, facing it
          const want = tr.z + tr.inward * (0.55 + p.r);
          dvz = (want - p.pz) * 1.5; dvx = 0;
          speed = Math.min(0.6, Math.hypot(dvx, dvz)); face = tr.inward > 0 ? Math.PI : 0;
          if (p.hunger < 0.04 || tr.level <= 0.001) { dropClaims(p); setState(p, ST.GRAZE, 2 + rng() * 3); }
          else if (rng() < DT * 0.08 && p.oink <= 0) { emit('oink', { i: p.i, x: p.px, z: p.pz, happy: 1 }); p.oink = 4; }
          break;
        }
        case ST.SNACK: {
          const f = foods.find(f => f.id === p.snack);
          if (!f || p.timer <= 0) { dropClaims(p); setState(p, ST.GRAZE, 1); break; }
          const dx = f.x - p.px, dz = f.z - p.pz, d = Math.hypot(dx, dz);
          if (d < p.r + f.r + 0.35 && f.y < 0.7) {
            f.bites += DT; face = Math.atan2(dx, dz); speed = 0; p.hunger = Math.max(0, p.hunger - 0.12 * DT);
            if (f.bites >= P.foodEatTime) { emit('munch', { i: p.i, x: f.x, z: f.z }); dropClaims(p); removeFood(f); setState(p, ST.GRAZE, 1.5 + rng()); }
          } else if (d < 2.2) { dvx = dx / d; dvz = dz / d; speed = Math.min(P.snackSpeed, 0.5 + d); }
          else { flowTo(f.field, 1.0); speed = P.snackSpeed * (p.piglet ? 1.1 : 1); }
          break;
        }
        case ST.SHOWER: {
          if (hose.active) p.timer = 0; else if ((p.timer += 2 * DT) > 2.5) { setState(p, ST.GRAZE, 1 + rng()); break; } // waits a moment if the water stops
          const dx = hose.x - p.px, dz = hose.z - p.pz, d = Math.hypot(dx, dz) || 1;
          if (d > P.hoseR * 0.6) { if (d > 2.5 && hose.field && flowTo(hose.field, 1)) {} else { dvx = dx / d; dvz = dz / d; } speed = Math.min(1.8, 0.4 + d * 0.5); }
          else face = Math.atan2(hose.sx - p.px, hose.sz - p.pz);
          break;
        }
        case ST.ZOOM: { // freshly clean: happy sprint away from the hose
          if (p.timer <= 0) { setState(p, ST.GRAZE, 2 + rng() * 3); break; }
          p.wa += (rng() - 0.5) * 6 * DT;
          const dx = p.px - p.threatX, dz = p.pz - p.threatZ, d = Math.hypot(dx, dz) || 1;
          dvx = dx / d * 1.3 + Math.sin(p.wa) * 0.5; dvz = dz / d * 1.3 + Math.cos(p.wa) * 0.5;
          speed = P.zoomSpeed * (p.piglet ? 0.9 : 1); accel = P.accelRun; useFeelers = true;
          break;
        }
        case ST.REST: {
          if (p.timer <= 0) setState(p, ST.GRAZE, 1 + rng() * 2);
          speed = 0;
          break;
        }
        case ST.FLEE: {
          const dx = p.px - p.threatX, dz = p.pz - p.threatZ, d = Math.hypot(dx, dz) || 1;
          dvx = dx / d * 1.4; dvz = dz / d * 1.4;
          if (an) { const l = Math.hypot(ax, az) || 1; dvx += ax / l * 0.7; dvz += az / l * 0.7; }
          speed = P.fleeBase + P.fleeGain * p.panic; accel = P.accelRun; useFeelers = true;
          if (p.panic < 0.12) setState(p, ST.GRAZE, 1 + rng() * 2);
          break;
        }
      }
      // piglets stay close to mum unless panicking or eating
      if (mom && p.trough < 0 && p.state !== ST.SHOWER && p.state !== ST.ZOOM && p.state !== ST.FLEE && p.state !== ST.EAT && p.state !== ST.SNACK && mom.state !== ST.GRAB && mom.state !== ST.AIR) {
        const dx = mom.px - p.px, dz = mom.pz - p.pz, d = Math.hypot(dx, dz);
        if (d > 1.6) {
          const w = Math.min(2.5, (d - 1.6) * 0.8);
          const df = destFieldFor(mom);
          if (d < 4 || !df || !grid.dir(df, p.px, p.pz, tmp)) { dvx += dx / d * w; dvz += dz / d * w; }
          else { dvx += tmp[0] * w; dvz += tmp[1] * w; }
          speed = Math.max(speed, Math.min(2.6, 0.4 + d * 0.5)); if (p.state === ST.GRAZE || p.state === ST.REST) p.state = ST.ROAM, p.timer = 2;
        } else if (mom.state === ST.REST && p.state !== ST.REST && p.state !== ST.TRAVEL) setState(p, ST.REST, mom.timer + 1);
      }
      // normalise desire, then add separation and wall avoidance
      let dl = Math.hypot(dvx, dvz);
      if (dl > 1e-3) { dvx /= dl; dvz /= dl; }
      if (useFeelers && ((p.i + Math.floor(t * 60)) & 1) === 0 && (dl > 1e-3)) {
        feelers(p, dvx, dvz, 1.2 + speed * 0.5, fl); p.flx = fl[0]; p.flz = fl[1];
      } else if (!useFeelers) { p.flx = 0; p.flz = 0; }
      dvx = dvx * speed + (p.flx || 0) * 2.5 * Math.max(speed, 0.8) + sep[0] * 1.6;
      dvz = dvz * speed + (p.flz || 0) * 2.5 * Math.max(speed, 0.8) + sep[1] * 1.6;
      dl = Math.hypot(dvx, dvz); const vmax = Math.max(speed, 0.9) * 1.1;
      if (dl > vmax) { dvx *= vmax / dl; dvz *= vmax / dl; }
      p.dvx = dvx; p.dvz = dvz;

      // ---- traction (grip-limited acceleration) ---------------------------------
      if (p.py < p.r + 0.15) {
        let axc = (dvx - p.vx) / P.tau, azc = (dvz - p.vz) / P.tau; const al = Math.hypot(axc, azc);
        if (al > accel) { axc *= accel / al; azc *= accel / al; }
        p.body.applyImpulse({ x: axc * p.mass * DT, y: 0, z: azc * p.mass * DT }, true);
      }
      // ---- heading ---------------------------------------------------------------
      const turn = (p.state === ST.FLEE ? 7 : 3.5) * DT;
      if (face !== null) p.yaw = turnToward(p.yaw, face, turn);
      else if (p.speed > 0.25) p.yaw = turnToward(p.yaw, Math.atan2(p.vx, p.vz), turn * Math.min(1, p.speed));
    }

    world.step();
    readState();

    // hose: rinse every pig in the spray; once clean, off they go
    hose.idle = hose.active ? 0 : hose.idle + DT;
    if (hose.active) for (const p of pigs) {
      if (p.state === ST.ZOOM || p.state === ST.FLEE) continue;
      if (Math.hypot(p.px - hose.x, p.pz - hose.z) > P.hoseR + p.r) continue;
      const was = p.mud; p.mud = Math.max(0, p.mud - P.washRate * DT); p.washed += DT;
      if (p.mud < 0.03 && p.state !== ST.GRAB && p.state !== ST.AIR) {
        // radiate away from the middle of the spray (back through the queue of bathers would be slow)
        let ax = p.px - hose.x, az = p.pz - hose.z; if (Math.hypot(ax, az) < 0.2) { ax = p.px - hose.sx; az = p.pz - hose.sz; }
        dropClaims(p); p.threatX = p.px - ax; p.threatZ = p.pz - az; p.wa = Math.atan2(ax, az);
        setState(p, ST.ZOOM, 2.5 + rng() * 2.5);
        if (was >= 0.03) { emit('oink', { i: p.i, x: p.px, z: p.pz, happy: 1, zoom: 1 }); emit('clean', { i: p.i, x: p.px, z: p.pz }); }
      }
    }

    // regions / escapes
    counts.fill(0);
    for (const p of pigs) {
      if (p.state !== ST.GRAB && p.state !== ST.AIR && (p.py < -2 || p.px < field.x0 - 1 || p.px > field.x1 + 1 || p.pz < field.z0 - 1 || p.pz > field.z1 + 1)) respawn(p);
      const r = lay.region(p.px, p.pz);
      if (r !== p.region) { p.region = r; transitions++; }
      counts[r]++;
    }
  }
  function destFieldFor(mom) {
    if (mom.trough >= 0) return troughs[mom.trough].field;
    if (mom.target !== null && mom.target !== undefined) return destFields[mom.target];
    return null;
  }
  function respawn(p) {
    const lane = lay.lane; const x = (lane.x0 + lane.x1) / 2 + (rng() - 0.5) * 6, z = (lane.z0 + lane.z1) / 2;
    p.body.setTranslation({ x, y: p.r + 0.6, z }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.body.lockRotations(true, true); p.col.setFriction(0); p.col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    dropClaims(p); setState(p, ST.GRAZE, 1); p.panic = 0; p.respawns = (p.respawns || 0) + 1;
  }

  return {
    world, lay, grid, pigs, dog, foods, troughs, events, counts,
    step, pick, grab, moveGrab, release, setDog, setHose, tossFood, bell, hose,
    get time() { return t; }, get foodCap() { return P.foodCap; }, get transitions() { return transitions; }, get grabbed() { return grabbed; },
  };
}

export function turnToward(a, b, maxStep) {
  let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}
