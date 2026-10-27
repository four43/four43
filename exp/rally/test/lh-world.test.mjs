// Rally on the scene-owned World (lion-hawk §4.4, §4.5): the engine owns the Rapier world; Rally's vehicle runs before
// lh.physics.step; collision groups keep today's bits.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim, game } from './helpers/bench.mjs';
import { headless } from 'lion-hawk/test';
import { DT, HZ } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import MATERIALS from '../src/defs/materials.js';
import { CARS } from '../src/cars.js';
import { WHEEL_PARTS } from '../src/vehicle.js';
import { heightAt } from '../src/gen/terrain.js';
await R.init();

test('rallyGame needs the initialised Rapier module (D9)', () => {
  assert.throws(() => game({ rapier: undefined }), /rallyGame: pass \{ rapier \}/);
  assert.equal(game().sim.hz, HZ); assert.equal(1 / HZ, DT);
});
test('a raw body on the World\'s Rapier world falls under the engine step (Review Focus 1)', () => {
  const sim = benchSim({ car: 'impreza-555', cones: false, assist: true });
  const b = sim.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(500, 50, 500));
  sim.phys.createCollider(R.ColliderDesc.ball(0.5), b); // a body without mass never falls
  for (let i = 0; i < HZ; i++) sim.step();
  assert.ok(b.translation().y < 50 - 4, `fell ${50 - b.translation().y} m in 1 s`);
});
test('groups keep today\'s bits: ground 1, prop 2, car 4, ray 8 (Review Focus 2)', () => {
  const sim = benchSim({ car: 'impreza-555', cones: false });
  const g = sim.lh.groups;
  assert.deepEqual([g.ground, g.prop, g.car, g.ray], [1, 2, 4, 8]);
  assert.equal(g.mask(['ray'], ['ground']), (0x0008 << 16) | 0x0001);
});
test('the stage builds its Sim on the engine\'s World and steps it from the schedule', () => {
  const h = headless(game(), { args: { pad: true } });
  const s = h.engine.scene.state;
  assert.ok(s.sim.lh === h.engine.world, "sim.lh is the engine world");
  assert.ok(s.sim.phys === h.engine.world.rapier, "sim.phys is the engine rapier");
  const text = JSON.stringify(h.engine.schedule());
  assert.ok(text.indexOf('rally.vehicle') < text.indexOf('lh.physics.step'), text);
  assert.ok(text.indexOf('lh.physics.step') < text.indexOf('rally.after'), text);
});
test('during a track rebuild neither Rapier nor Rally\'s systems step (3c CI-16)', () => {
  const h = headless(game(), { args: { settings: { mode: 'freeDrive', world: 'loop', seed: 'ld1', theme: 'summer', assist: true } } });
  const e = h.engine, S = () => e.scene.state;
  h.until(x => !x.engine.loading.active && x.state().phase === 'title', { maxSeconds: 10, message: 'first build' });
  h.fill('title.seed', 'ld2');
  for (let n = 0; !e.loading.active && n < 60; n++) h.step(1);
  assert.ok(e.loading.active, 'a load started');
  const t0 = S().sim.time;
  for (let k = 0; e.loading.active && k < 2400; k++) {
    const car = S().sim.car, p = car.body.translation(), w = car.wheels.map(x => x.omega);
    h.step(1);
    if (!e.loading.active) break; // the step that ends the load runs physics after the build, as any step does
    assert.equal(S().sim.time, t0, 'the sim clock does not run during a load');
    if (S().sim.car !== car) continue; // the load's build placed a new car
    const q = car.body.translation();
    assert.deepEqual([q.x, q.y, q.z], [p.x, p.y, p.z]); assert.deepEqual(car.wheels.map(x => x.omega), w);
  }
  assert.equal(e.loading.active, false, 'the load finished');
});

test('pad ground and features are one fixed ground entity with rally-ground colliders (√f, Multiply; M-9)', () => {
  const sim = benchSim({ car: 'impreza-555', cones: false });
  const e = sim.world.groundEntity, c = e.colliders[0].collider;
  assert.ok(sim.world.groundCollider === c, "the ground collider is the world one");
  assert.ok(e.colliders.length >= 1 + 2 + 8 + 1, 'ground, 2 ramps, 8 humps, slope');
  for (const { material } of e.colliders) assert.equal(material, 'rally-ground');
  assert.equal(c.friction(), Math.fround(MATERIALS.collider('rally-ground').friction));
  assert.equal(c.frictionCombineRule(), R.CoefficientCombineRule.Multiply);
  assert.equal(sim.lh.materialOf(c.handle), 'rally-ground');
});
test('a track\'s heightfield is the World\'s and its gate posts are prop-group cylinders', () => {
  const sim = benchSim({ world: new TrackWorld(generateTrack('g1', { kind: 'stage' })), car: 'impreza-555' });
  const w = sim.world;
  assert.equal(sim.lh.materialOf(w.groundCollider.handle), 'rally-ground');
  assert.ok(w.ground.has(w.groundCollider.handle));
  assert.equal(w.gateEntity.colliders.length, w.gatePosts.length);
  for (const { collider, material } of w.gateEntity.colliders) {
    assert.equal(material, 'gate-post');
    assert.equal(collider.collisionGroups() >>> 16, sim.lh.groups.prop);
  }
});

test('untouched marker posts stay asleep after spawn and after reset (Review Focus 4)', () => {
  const sim = benchSim({ world: new TrackWorld(generateTrack('markers', { kind: 'loop', style: 'flowing' })), car: 'impreza-555' });
  const posts = sim.world.props.filter(p => p.kind === 'marker');
  assert.ok(posts.length > 50);
  for (const p of posts) { assert.ok(p.body === p.e.body, "post body is the entity body"); assert.ok(p.e.tags.has('marker')); }
  sim.car.reset({ x: 1e4, y: 50, z: 1e4 }, 0); // far from every post
  for (let i = 0; i < 2 * HZ; i++) sim.step();
  const awake = () => posts.filter(p => !p.body.isSleeping()).length;
  assert.equal(awake(), 0, 'posts asleep after spawn');
  const ids = posts.map(p => p.e.id);
  sim.world.resetProps();
  assert.notDeepEqual(posts.map(p => p.e.id), ids, 'reset respawns each post');
  for (let i = 0; i < 2; i++) sim.step();
  assert.equal(awake(), 0, 'posts asleep after reset');
  const p0 = posts[3], h = p0.home, t = p0.body.translation();
  assert.ok(Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z) < 1e-3, 'unmoved (one step of gravity before the re-sleep: ~1e-4 m)');
});
test('props weigh today\'s masses (body.mass, D3)', () => {
  const pad = benchSim({ car: 'impreza-555' }), cone = pad.world.props[0];
  assert.ok(Math.abs(cone.body.mass() - 3) < 3e-3, `cone ${cone.body.mass()}`);
  const track = benchSim({ world: new TrackWorld(generateTrack('g1', { kind: 'stage' })), car: 'impreza-555' });
  assert.ok(Math.abs(track.world.props[0].body.mass() - 5) < 5e-3);
  assert.equal(pad.lh.materialOf(cone.e.colliders[0].collider.handle), 'cone');
  assert.equal(track.lh.materialOf(track.world.props[0].e.colliders[0].collider.handle), 'marker');
});
test('pad reset puts cones home, stopped', () => {
  const sim = benchSim({ car: 'impreza-555' }), c = sim.world.props[0];
  c.body.setLinvel({ x: 5, y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) sim.step();
  sim.world.resetProps();
  const t = c.body.translation(), v = c.body.linvel();
  assert.deepEqual([t.x, t.y, t.z].map(Math.fround), [c.home.x, c.home.y, c.home.z].map(Math.fround));
  assert.equal(Math.hypot(v.x, v.y, v.z), 0);
});
test('the car is a World entity with cars.js mass and inertia (massProps, D3) and car-group colliders', () => {
  for (const id of ['impreza-555', 'escort-rs1800']) {
    const sim = benchSim({ car: id, cones: false }), car = sim.car, cfg = CARS[id];
    assert.ok(car.body === car.e.body, "car body is the entity body"); assert.ok(car.e.tags.has('car')); assert.ok(car.e.model === cfg.model, "car model is the config model");
    assert.ok(Math.abs(car.body.mass() - cfg.mass) < 1e-6 * cfg.mass, `${id} mass ${car.body.mass()}`);
    const I = car.body.principalInertia();
    assert.deepEqual([I.x, I.y, I.z].map(Math.round).sort(), [cfg.inertia.x, cfg.inertia.y, cfg.inertia.z].sort()); // Rapier sorts the principal axes
    assert.deepEqual(car.e.colliders.map(c => c.material), ['car-hull', 'car-cabin']);
    for (const c of car.colliders) assert.equal(c.collisionGroups() >>> 16, sim.lh.groups.car);
    assert.equal(car.colliders[0].friction(), Math.fround(MATERIALS.collider('car-hull').friction));
    const hull = car.colliders[0], [W, , L] = cfg.size, he = hull.halfExtents(); // the car's overall width and length (R16-2)
    assert.equal(hull.shapeType(), R.ShapeType.RoundCuboid); assert.equal(hull.roundRadius(), Math.fround(0.2));
    assert.deepEqual([he.x, he.y, he.z], [W / 2 - 0.02 - 0.2, 0.24 - 0.2, L / 2 - 0.2].map(Math.fround));
  }
});
test('changing car despawns the old body; reset places the car stopped', () => {
  const sim = benchSim({ car: 'impreza-555', cones: false }), old = sim.car.e;
  sim.setCar('escort-rs1800');
  assert.ok(sim.lh.get(old.id) === undefined, "the old entity is gone");
  sim.car.body.setLinvel({ x: 3, y: 0, z: 0 }, true);
  sim.car.reset({ x: 10, y: 1, z: 20 }, Math.PI / 2);
  const t = sim.car.body.translation(), v = sim.car.body.linvel();
  assert.deepEqual([t.x, t.y, t.z], [10, 1, 20]); assert.equal(Math.hypot(v.x, v.y, v.z), 0);
});

test('the track uses the terrain kit: materialAt, blendAt and heightAt agree with Rally\'s generator', () => {
  const track = generateTrack('t2', { kind: 'loop' }), sim = benchSim({ world: new TrackWorld(track), car: 'impreza-555' });
  const w = sim.world, L = track.layout;
  assert.ok(w.groundEntity === w.terrain.entity, "ground entity is the terrain entity");
  assert.equal(sim.lh.materialOf(w.groundCollider.handle), 'rally-ground');
  assert.match(w.materialAt(L.x[40], L.z[40]), /^rally-(tarmac|hardpack|gravel|packed|ice)$/);
  assert.match(w.materialAt(L.x[40] + 30 * Math.cos(L.heading[40]), L.z[40] - 30 * Math.sin(L.heading[40])), /^rally-(grass|snowbank|sand|mud)$/);
  for (let i = 0; i < L.n; i += 97) assert.ok(Math.abs(w.terrain.heightAt(L.x[i] + 2, L.z[i]) - heightAt(track.terrain, L.x[i] + 2, L.z[i])) < 0.05);
});

const qmul = (a, b) => ({ x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z });
const axis = (x, y, z, t) => ({ x: x * Math.sin(t / 2), y: y * Math.sin(t / 2), z: z * Math.sin(t / 2), w: Math.cos(t / 2) });
test('the car is drawn by view sync: model, wheel part poses (hub in the body frame, Ry(steer) Rx(spin)), seeded at spawn', () => {
  const sim = benchSim({ car: 'impreza-555', cones: false }), car = sim.car, e = car.e, c = car.cfg;
  assert.ok(e.model === c.model, "same model"); assert.ok(e.draw === undefined, "no draw"); // view sync draws the model; render.js carView shapes it
  assert.deepEqual(Object.keys(e.partXf), WHEEL_PARTS);
  car.wheels.forEach((w, i) => { // before any step: both halves at the static compression, so a first render has wheels on hubs
    const hub = [w.local.x, w.local.y - Math.max(0, c.travel - car.staticComp), w.local.z], prev = sim.lh.partXfPrev(e, WHEEL_PARTS[i]);
    for (const P of [e.partXf[WHEEL_PARTS[i]], prev]) { assert.deepEqual([P.p.x, P.p.y, P.p.z], hub, `wheel ${i} seeded hub`); assert.deepEqual([P.q.x, P.q.y, P.q.z, P.q.w], [0, 0, 0, 1]); }
  });
  car.input.steer = 0.5; car.input.throttle = 1;
  for (let i = 0; i < 240; i++) sim.step();
  car.wheels.forEach((w, i) => {
    const P = e.partXf[WHEEL_PARTS[i]], q = qmul(axis(0, 1, 0, w.steer), axis(1, 0, 0, w.spin));
    assert.deepEqual([P.p.x, P.p.y, P.p.z], [w.local.x, w.local.y - Math.max(0, c.travel - w.x), w.local.z], `wheel ${i} hub`);
    for (const k of ['x', 'y', 'z', 'w']) assert.ok(Math.abs(P.q[k] - q[k]) < 1e-12, `wheel ${i} q.${k}`);
  });
  assert.ok(car.wheels[0].steer !== 0 && car.wheels[2].spin !== 0, 'the test steered and rolled');
});
