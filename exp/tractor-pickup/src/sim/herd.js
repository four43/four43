// Farm animals (spec 5): spawn, mosey, gentle run, come to the horn, chick lines, hiding, mud baths, help (F-4),
// farmyard animals (A-15), delivery into the barn (A-16) and respawning along the routes (G-3).
// Route animals stay on the road between the edges: within WALK_HALF of the centerline.
export const TYPES = {
  pig:     { word: 'Pig',     plural: 'Pigs',     speed: 0.9, r: 0.5,  flee: false, come: true },
  cow:     { word: 'Cow',     plural: 'Cows',     speed: 0.6, r: 0.75, flee: false, come: true },
  chicken: { word: 'Chicken', plural: 'Chickens', speed: 1.1, r: 0.35, flee: true,  come: false },
  sheep:   { word: 'Sheep',   plural: 'Sheep',    speed: 0.8, r: 0.5,  flee: true,  come: false },
  duck:    { word: 'Duck',    plural: 'Ducks',    speed: 0.8, r: 0.35, flee: false, come: true },
  bunny:   { word: 'Bunny',   plural: 'Bunnies',  speed: 1.4, r: 0.3,  flee: true,  come: false },
  dog:     { word: 'Dog',     plural: 'Dogs',     speed: 1.6, r: 0.45, flee: false, come: true },
  chick:   { word: 'Chick',   plural: 'Chicks',   speed: 1.2, r: 0.2,  flee: false, come: false },
};
export const MAIN_TYPES = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog'];
export const ROUTE_ANIMALS = 18, YARD_ANIMALS = 3, WALK_HALF = 6.5;
export const PER_PLAYER = 9; // M-62: route animals added for each player after the first, so a co-op game has more to go round
const FILL = ['pig', 'cow', 'sheep', 'chicken', 'duck', 'bunny', 'pig', 'cow'];
export const DODGE = { dur: 0.5, h: 0.9 }; // B-14: the hop out of the way of a full train: s, m high
const TURN = 5, HELP_GIVE_UP = 15, BARN_GIVE_UP = 30; // rad/s; s (A-9)
const FLEE_R = 7, FLEE_V = 2.2, HORN_R = 25, WALK = { walk: 'walk', flee: 'run', come: 'walk', follow: 'walk', help: 'run', toBarn: 'walk' };
export const HELD = new Set(['fly', 'ride', 'show']); // in this device's own train or its show
const SKIP = new Set([...HELD, 'gone', 'carried', 'elsewhere']);
export const NOT_FREE = new Set([...SKIP, 'toBarn']); // carried: another player has it; elsewhere: no news from the host (M-11)
export const GONE_KEEP = 10; // s: a gone animal keeps its slot this long before a new animal may take it (G-3), so late news about it (a claim, a record) finds it gone
const turn = (a, b, max) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + Math.max(-max, Math.min(max, d)); };

export function createHerd({ rng, env, count = ROUTE_ANIMALS, yardCount = YARD_ANIMALS }) {
  const animals = [], Y = env.yard.half;
  const inYard = (x, z, m = 0) => Math.abs(x) < Y + m && Math.abs(z) < Y + m;
  const spawnNearRoad = () => { // on a route, outside the yard (the edges keep everything else unreachable)
    for (let tries = 0; tries < 80; tries++) { const p = env.routePoint(rng); if (!inYard(p.x, p.z, 3)) return p; }
    return env.routePoint(rng);
  };
  const keepOnRoad = (x, z) => { // pull a point back to within WALK_HALF of the centerline
    const n = env.roadNearest(x, z); if (n.d <= WALK_HALF) return { x, z };
    const k = WALK_HALF / n.d; return { x: n.pt.x + (x - n.pt.x) * k, z: n.pt.z + (z - n.pt.z) * k };
  };
  let births = 0;
  const make = (id, type, at, home, epoch = 0) => ({ id, type, golden: false, home, x: at.x, y: 0, z: at.z, yaw: rng.range(0, 6.28), state: 'idle', timer: rng.range(0, 3), anim: 'idle', leader: null, line: 0, hidden: false, dirt: 0, epoch, lookT: 0, tx: at.x, tz: at.z, trail: [], born: births++ });
  const grow = (type, at, home = 'route') => { const a = make(animals.length, type, at, home); animals.push(a); return a; };
  // G-3: a new animal takes the slot of the one gone longest (at least GONE_KEEP), so the herd array stays small in a long game. It is a new
  // object with a higher ownership number (M-26): whoever still holds the old one sees it gone, and late news about the old one is older.
  const add = (type, at, home = 'route') => {
    let old = null; for (const a of animals) if (a.state === 'gone' && a.goneT >= GONE_KEEP && !(old && old.goneT >= a.goneT)) old = a;
    if (!old) return grow(type, at, home);
    for (const o of animals) if (o.leader === old.id) o.leader = null;
    return (animals[old.id] = make(old.id, type, at, home, old.epoch + 1));
  };
  for (const t of MAIN_TYPES) grow(t, t === 'duck' ? { x: env.pond.x + rng.range(-3, 3), z: env.pond.z + env.pond.r + 1 } : spawnNearRoad(), t === 'duck' ? 'yard' : 'route');
  const hen = grow('chicken', spawnNearRoad());
  for (let i = 1; i <= 2; i++) { const c = grow('chick', { x: hen.x - i * 0.8, z: hen.z }); c.leader = hen.id; c.line = i; c.state = 'follow'; }
  const routeCount = () => animals.filter(a => a.home === 'route').length;
  while (routeCount() < count) grow(rng.pick(FILL), spawnNearRoad()); // the pond duck is a yard animal, so it does not count here
  // two hide in the bushes (A-13), taken from the random fill so the first animal of each type stays in view
  rng.shuffle(animals.slice(MAIN_TYPES.length + 3).filter(a => a.type !== 'cow')).slice(0, env.hideSpots.length)
    .forEach((a, i) => { a.hidden = true; a.state = 'hide'; a.x = env.hideSpots[i].x; a.z = env.hideSpots[i].z; });
  for (let i = 1; i < yardCount; i++) grow(rng.pick(['pig', 'sheep', 'duck', 'cow', 'bunny']), env.yard.randomPoint(rng), 'yard'); // the pond duck is the first
  if (rng.chance(0.5)) rng.pick(animals.filter(a => a.type !== 'chick' && !a.hidden)).golden = true; // A-8

  const free = () => animals.filter(a => !NOT_FREE.has(a.state));
  let extra = 0; // M-62: more route animals while more players are in the game (the host's herd)
  const live = []; // separation list, refilled each step
  const pickTarget = a => {
    if (a.type === 'duck' && a.home === 'yard' && rng.chance(0.7)) { const ang = rng.range(0, 6.28); a.tx = env.pond.x + Math.cos(ang) * (env.pond.r + 1); a.tz = env.pond.z + Math.sin(ang) * (env.pond.r + 1); a.state = 'walk'; return; }
    if (a.home === 'yard') { const p = env.yard.randomPoint(rng); a.tx = p.x; a.tz = p.z; a.state = 'walk'; return; }
    if (a.type === 'pig' && rng.chance(0.35)) { const m = env.mudSpots.map(s => [s, Math.hypot(s.x - a.x, s.z - a.z)]).filter(([, d]) => d < 40).sort((p, q) => p[1] - q[1])[0];
      if (m) { a.state = 'walk'; a.wallow = true; a.tx = m[0].x + rng.range(-2, 2); a.tz = m[0].z + rng.range(-2, 2); return; } }
    const n = env.roadNearest(a.x, a.z);
    if (rng.chance(0.35)) { a.tx = 2 * n.pt.x - a.x + rng.range(-1, 1); a.tz = 2 * n.pt.z - a.z + rng.range(-1, 1); } // cross the road
    else { a.tx = a.x + n.pt.tx * rng.range(-10, 10) + rng.range(-2, 2); a.tz = a.z + n.pt.tz * rng.range(-10, 10) + rng.range(-2, 2); } // wander along it
    const q = keepOnRoad(a.tx, a.tz); a.tx = q.x; a.tz = q.z;
    if (inYard(a.tx, a.tz, 2)) { a.tx = a.x; a.tz = a.z; } // route animals keep out of the yard
    a.state = 'walk';
  };
  const moveToward = (a, tx, tz, v, dt) => {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz); if (d < 0.05) return true;
    a.yaw = turn(a.yaw, Math.atan2(dx, dz), TURN * dt); const s = Math.min(d, v * dt); a.x += Math.sin(a.yaw) * s; a.z += Math.cos(a.yaw) * s;
    return d < Math.max(0.4, v / TURN + 0.05); // A-9: never less than the turn radius, or a target close at the side is circled for good
  };
  const clampHome = a => {
    if (a.home === 'yard') { const lim = Y - 2; a.x = Math.max(-lim, Math.min(lim, a.x)); a.z = Math.max(-lim, Math.min(lim, a.z)); return; }
    if (a.hidden || inYard(a.x, a.z)) return;
    const q = keepOnRoad(a.x, a.z); a.x = q.x; a.z = q.z;
  };

  const h = {
    remote: false, // M-12: on a guest the host runs the behavior; the guest only shows the host's snapshots
    animals, free,
    horn(t) {
      for (const a of free()) { if (a.hidden) continue; a.lookT = 1.5;
        if (TYPES[a.type].come && Math.hypot(a.x - t.x, a.z - t.z) < HORN_R && a.state !== 'help' && a.state !== 'wave' && a.state !== 'dodge') { a.state = 'come'; a.timer = 6; a.tx = t.x + Math.sin(t.yaw) * 6; a.tz = t.z + Math.cos(t.yaw) * 6; } }
    },
    // B-14: hop to (tx, tz), out of the way of the full tractor and trailers; nothing else moves it meanwhile
    dodge(a, tx, tz) { if (a.state === 'dodge' || a.hidden) return false; a.state = 'dodge'; a.leader = null; a.dodge = { t: 0, x0: a.x, z0: a.z, x1: tx, z1: tz }; a.yaw = Math.atan2(tx - a.x, tz - a.z); return true; },
    callHelp(t) {
      const c = free().filter(a => !a.hidden && a.type !== 'chick' && a.home === 'route' && a.state !== 'dodge').sort((p, q) => Math.hypot(p.x - t.x, p.z - t.z) - Math.hypot(q.x - t.x, q.z - t.z))[0];
      if (!c) return null; const p = env.roadAhead(t.x, t.z, t.yaw, 15); c.state = 'help'; c.timer = HELP_GIVE_UP; c.tx = p.x; c.tz = p.z; return c;
    },
    toBarn(list) { // after the show: walk into the barn, one after the other, and are gone (A-16, F-10)
      // first to a point on the barn axis just outside the end on the animal's side (clear of the door leaves), then to the center
      const B = env.barn, fx = Math.sin(B.yaw), fz = Math.cos(B.yaw), out = B.half + B.leaf + 1;
      list.forEach((a, i) => { const end = (a.x - B.x) * fx + (a.z - B.z) * fz >= 0 ? 1 : -1;
        Object.assign(a, { state: 'toBarn', leader: null, hidden: false, y: 0, timer: i * 0.4, tx: B.x + fx * out * end, tz: B.z + fz * out * end, inside: false }); });
    },
    respawn() { // G-3: new animals appear on the routes, away from the yard, to replace delivered ones
      const nRoute = count + extra - free().filter(a => a.home === 'route').length, nYard = yardCount - free().filter(a => a.home === 'yard').length;
      const goldenFree = () => free().some(a => a.golden);
      for (let i = 0; i < nRoute; i++) { const a = add(rng.pick(FILL), spawnNearRoad()); if (!goldenFree() && rng.chance(0.3)) a.golden = true; }
      for (let i = 0; i < nYard; i++) add(rng.pick(['pig', 'sheep', 'duck', 'cow', 'bunny']), env.yard.randomPoint(rng), 'yard');
      // refill empty hiding bushes with the newest route animals
      env.hideSpots.forEach(h => { if (free().some(a => a.hidden && Math.hypot(a.x - h.x, a.z - h.z) < 1)) return;
        const a = animals.filter(b => b.home === 'route' && !NOT_FREE.has(b.state) && !['help', 'wave', 'come'].includes(b.state) && !b.hidden && !b.golden && b.type !== 'cow' && b.type !== 'chick' && !animals.some(c => c.leader === b.id && !NOT_FREE.has(c.state))).reduce((m, b) => !m || b.born > m.born ? b : m, null); if (a) { a.hidden = true; a.state = 'hide'; a.x = h.x; a.z = h.z; } });
    },
    // M-62: n players in the game: respawn() keeps count + PER_PLAYER * (n - 1) route animals free. Fewer players take nothing away: the surplus is not replaced
    setPlayers(n) { extra = PER_PLAYER * Math.max(0, n - 1); },
    get target() { return count + extra; },
    // M-11: hold an animal with this id (the host's ids are its array indexes, so never a reused slot); placeholders fill any gap until the host tells about them
    ensure(id, type, golden) { while (animals.length <= id) grow(type, { x: 0, z: 0 }).state = 'elsewhere'; const a = animals[id]; a.type = type; a.golden = golden; return a; },
    step(dt, { tractor: t, others = [] }) {
      if (h.remote) return;
      for (const a of animals) {
        if (a.state === 'gone') { a.goneT = (a.goneT || 0) + dt; continue; } // G-3: how long its slot has been free
        if (SKIP.has(a.state)) continue;
        let tt = t, dT = Math.hypot(a.x - t.x, a.z - t.z); // M-12: the nearest tractor
        for (const o of others) { const d = Math.hypot(a.x - o.x, a.z - o.z); if (d < dT) { dT = d; tt = o; } }
        const def = TYPES[a.type];
        if (a.lookT > 0) { a.lookT -= dt; a.yaw = turn(a.yaw, Math.atan2(tt.x - a.x, tt.z - a.z), 6 * dt); }
        if (!NOT_FREE.has(a.state) && def.flee && !a.hidden && a.state !== 'flee' && a.state !== 'help' && a.state !== 'wave' && a.state !== 'dodge' && dT < FLEE_R && tt.speed > 0.5) { a.state = 'flee'; a.timer = 2; }
        switch (a.state) {
          case 'idle': a.anim = a.anim === 'eat' || rng.chance(0.002) ? 'eat' : 'idle'; if ((a.timer -= dt) <= 0) pickTarget(a); break;
          case 'walk': if (moveToward(a, a.tx, a.tz, def.speed, dt)) { if (a.wallow) { a.state = 'wallow'; a.timer = rng.range(6, 10); a.wallow = false; } else { a.state = 'idle'; a.timer = rng.range(2, 5); } } break;
          case 'wallow': a.dirt = Math.min(1, a.dirt + dt * 0.5); a.anim = 'eat'; if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 1; } break;
          case 'flee': { const n = env.roadNearest(a.x, a.z), away = Math.atan2(a.x - tt.x, a.z - tt.z), along = Math.atan2(n.pt.tx, n.pt.tz);
            // run away along the road (not into the edge): pick the road direction that points away from the tractor
            const ang = a.home === 'route' && !inYard(a.x, a.z) ? (Math.cos(away - along) >= 0 ? along : along + Math.PI) : away; a.yaw = turn(a.yaw, ang, 8 * dt);
            a.x += Math.sin(a.yaw) * FLEE_V * dt; a.z += Math.cos(a.yaw) * FLEE_V * dt;
            if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 1.5; a.lookT = 1.5; } break; }
          case 'come': if (moveToward(a, a.tx, a.tz, def.speed * 1.6, dt) || (a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 3; } break;
          case 'follow': { const L = animals[a.leader]; if (!L || NOT_FREE.has(L.state)) { a.state = 'idle'; a.leader = null; break; }
            const p = L.trail[Math.min(L.trail.length - 1, a.line * 3)] || L; moveToward(a, p.x, p.z, def.speed * 1.8, dt); break; }
          case 'help': if (moveToward(a, a.tx, a.tz, Math.max(def.speed * 2, 2.5), dt)) { a.state = 'wave'; a.timer = 10; } else if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 1; } break;
          case 'wave': a.anim = 'dance'; a.yaw = turn(a.yaw, Math.atan2(tt.x - a.x, tt.z - a.z), 4 * dt); if ((a.timer -= dt) <= 0) { a.state = 'idle'; a.timer = 2; } break;
          case 'hide': a.anim = 'idle'; break;
          case 'dodge': { const d = a.dodge, u = Math.min(1, (d.t += dt) / DODGE.dur); a.anim = 'run';
            a.x = d.x0 + (d.x1 - d.x0) * u; a.z = d.z0 + (d.z1 - d.z0) * u; a.y = DODGE.h * 4 * u * (1 - u);
            if (u >= 1) { a.y = 0; a.state = 'idle'; a.timer = 1.5; a.lookT = 1.5; a.dodge = null; } break; }
          case 'toBarn': if ((a.timer -= dt) > 0) { a.anim = 'idle'; break; } if (a.timer < -BARN_GIVE_UP) { a.state = 'gone'; break; } // A-9: never left walking for good
            if (moveToward(a, a.tx, a.tz, 2.2, dt)) { if (a.inside) a.state = 'gone'; else { a.inside = true; a.tx = env.barn.x; a.tz = env.barn.z; } } break;
        }
        if (['walk', 'flee', 'come', 'follow', 'help'].includes(a.state) || (a.state === 'toBarn' && a.timer <= 0)) a.anim = WALK[a.state] || 'walk';
        if (!NOT_FREE.has(a.state)) clampHome(a);
        const last = a.trail[0]; if (!last || Math.hypot(last.x - a.x, last.z - a.z) > 0.25) { const p = a.trail.length >= 12 ? a.trail.pop() : {}; p.x = a.x; p.z = a.z; a.trail.unshift(p); } // B-6: the oldest point is reused
      }
      // separation (free animals only; not the ones in flight, riding, walking into the barn or gone)
      live.length = 0; for (const a of animals) if (!NOT_FREE.has(a.state) && !a.hidden && a.state !== 'dodge') live.push(a); // B-6: one array, reused
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const p = live[i], q = live[j], dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), m = TYPES[p.type].r + TYPES[q.type].r;
        if (d > 0 && d < m) { const k = (m - d) / d / 2; p.x -= dx * k; p.z -= dz * k; q.x += dx * k; q.z += dz * k; }
      }
      for (const a of live) clampHome(a); // separation must not push anyone off the road or out of the yard
    },
  };
  return h;
}
