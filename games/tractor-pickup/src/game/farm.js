// The farm scene (lion-hawk 2f, [S-1]…[S-6], field notes #4, #28, #81, #87, #90; 3l): one main scene owns the createGame farm
// (terrain, tractor, train, herd) on the scene's World, and the player's records. The flow main.js kept in its frame closure moves
// into ctx.state ([S-4], #4). The step is split around the engine's Rapier step (lh.physics.step, stage physics.world): the scene's
// step hook runs net before → input → game.pre; a 'post' stage system runs game.post → bridge → net after → sounds → bedtime → the
// trip (flow.js), only after a stepped pre, so a load suspends all of it. A new farm builds through ctx.load (world.clear() first);
// a guest's farm too (#80: the welcome waits for it, game/net.js).
// While `raw` drives it nothing here touches the game, so the scene steps exactly the createGame the phase-0 goldens drive.
import { createGame } from '../sim/game.js';
import { createSandbox } from '../sim/sandbox.js';
import { createPilot } from '../sim/pilot.js';
import { createTrip } from '../sim/trip.js';
import { newRider } from '../sim/slots.js';
import { quatAxes } from '../sim/tractor.js';
import { DT } from '../sim/ground.js';
import { TYPES } from '../sim/herd.js';
import { clampBedtime, sleepNow } from '../sim/bedtime.js';
import { clampProgress, clampSettings, wornHats, hasPaintChoice, seedParam, powerParam } from '../sim/progress.js';
import { createWarnOnce } from 'lion-hawk/sim';
import { play, stepFlow, stepBed, lastDrive, goSleep, wake, open, setGuide } from './flow.js';

// The farm's own event types (never a game.step type), so the engine-path goldens can filter them out
export const FARM_EVENTS = new Set(['play', 'say', 'guide', 'help', 'show', 'showSkip', 'reward', 'progress', 'settings', 'bed', 'sleep', 'wake',
  'whee', 'cheer', 'squelch', 'farm', 'tune', 'tune.reset']);
const NONE = [];

// Move the whole (straight, parked) train so the tractor stands at (x, z) facing yaw; the cars keep their offsets in the tractor's frame.
// ground: also lift or lower it by the terrain height between the old and the new place (0.3 m above, so it settles onto its wheels).
// A copy of test/train.mjs's (src never imports tests): debug.trainAt and the barn preset.
export const moveTrain = (g, x, z, yaw, { ground = false } = {}) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const dy = ground ? g.terrain.height(x, z) - g.terrain.height(p0.x, p0.z) + 0.3 : 0;
  const list = [g.tractor.e, ...g.train.cars.map(c => c.e)].map(e => { const t = e.body.translation(); return [e, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [e, l] of list) g.world.place(e, { at: [x + f.x * l.x + u.x * l.y + r.x * l.z, p0.y + dy + f.y * l.x + u.y * l.y + r.y * l.z, z + f.z * l.x + u.z * l.y + r.z * l.z] }, { q: [q.x, q.y, q.z, q.w] });
};

// Input (C-1, C-2, C-8, #81): `raw` (goldens, the mp harness) or the world-frame stick through the pilot, into the reused stepIn.
function readInput(e, s) {
  const r = s.raw, o = s.stepIn;
  if (r) { o.thr = r.thr; o.steer = r.steer; o.turn = r.turn ?? 0; o.onTarget = r.onTarget !== false; o.horn = !!r.horn; return o; } // as game.step reads a plain input
  const I = e.input.snapshot, t = s.game.tractor, p = s.pilot.drive(I.goX, I.goZ, I.goBack.down, t.yaw, t.speed);
  o.thr = p.thr; o.steer = p.steer; o.turn = p.turn; o.onTarget = p.onTarget; o.horn = I.horn.pressed;
  return o;
}
// #57: game.step's events, in order, unchanged (the payload keeps its objects: animal, tree, slot)
function bridge(e, ev) { for (let i = 0; i < ev.length; i++) e.emit(ev[i].type, ev[i]); }
// Per-step sound cues (#87, main.js stepSounds): the squelch when the wheels enter mud (T-13, the sandbox only: the farm game sends
// mud-enter); whee, and a cheer with riders aboard, when all four wheels leave the ground for over 0.15 s (T-14)
function sounds(e, s) {
  const g = s.game, t = g.tractor, f = s.sfx;
  if (t.surface === 'mud' && f.surface !== 'mud' && !g.dirt) e.emit('squelch');
  f.surface = t.surface;
  let air = true; for (let i = 0; i < 4; i++) if (t.vc.wheelIsInContact(i)) { air = false; break; } // B-6: no closure per step
  f.air = air ? f.air + DT : 0;
  if (!air) f.whee = false;
  else if (f.air > 0.15 && !f.whee) { f.whee = true; e.emit('whee'); if (g.load?.landed() > 0) e.emit('cheer'); }
}
const freshSfx = () => ({ surface: 'gravel', air: 0, whee: false });

export function makeFarm({ clock = null, bindings = null } = {}) { // clock, bindings: the syncs' (game/net.js reads them from the api)
  const S = e => { if (e.scene.name !== 'farm') throw new Error('tractor: the farm scene is not the main scene'); return e.scene.state; };
  const warn = createWarnOnce(); // M-44: a sync error never stops the step
  // Builds this scene's farm (main.js build, sim half): hats (W-4), the bedtime phase (E-5) and the start mode (F-11).
  function build(e, s, seed, power, player) {
    s.game = createGame(e.world, { seed, power, player }); s.stepped = false; s.seed = seed; s.gen++; s.sfx = freshSfx();
    s.game.wearHats(wornHats(s.progress));
    s.game.lastDrive = s.bed.phase === 'last';
    s.game.mode = s.started ? (s.bed.phase === 'asleep' ? 'sleep' : 'drive') : hasPaintChoice(s.progress) ? 'start' : 'drive';
    e.emit('farm', { gen: s.gen, seed });
  }
  // P-8, M-1, M-19: the old farm goes (world.clear(): the terrain, trees, props and vehicles) and a new one is built;
  // started and the bedtime stay. The old farm's screens close with it, the paint screen and the book too (the old ui/menus.js
  // closed its screen on a new farm); the parent menu stays for its own close. D-3: a farm that fails to build is tried once more
  // with a fresh seed
  function rebuild(e, s, seed, player) {
    for (const n of ['show', 'reward', 'start', 'paint', 'book']) e.close(n);
    s.game = null; e.world.clear();
    s.trip = s.tripOn ? createTrip() : null; s.show = null; s.reward = null; s.showDone = s.rewardDone = false; setGuide(e, s, false);
    try { build(e, s, seed, s.power, player); }
    catch (err) { console.error('new farm failed, retrying with a fresh seed', err); s.game = null; e.world.clear(); build(e, s, e.rng('seeds').int(0, 0xffffffff), s.power, player); }
  }
  // the farm step's second half (3l): after the engine's Rapier step, in the same step; never without a pre (a load, #90)
  function post(e, ctx) {
    const s = ctx.state; if (!s.stepped || !s.game) return; s.stepped = false;
    const ev = s.game.post(), net = s.net;
    bridge(e, ev);
    if (net.sync) try { net.sync.after(ev, e.time.wall); } catch (err) { warn('net after', err); } // N-4: the step's wall stamp is the frame clock (M-69)
    sounds(e, s);
    if (s.tripOn && s.started && s.bed.phase !== 'asleep') stepBed(e, s); // E-5, #85
    if (s.tripOn && s.started && s.bed.phase !== 'asleep') stepFlow(e, s, ev); // spec 3.1 (not after bedtime put the farm to sleep)
  }
  // a load's then: the next farm asked for while it ran (a guest's welcome first: it is the host's)
  const next = (e, ctx) => { const s = ctx.state; if (s.netFarm) api.guestFarm(e, ctx, s.netFarm.seed, s.netFarm.player); else if (s.nextFarm) { s.nextFarm = false; api.newFarm(e, ctx); } };
  // --- the API (commands, UI controls, presets and debug call these; each takes the engine first) ---------------
  const api = {
    clock, bindings,
    play: e => play(e, S(e)), // F-11, A-7: the trip starts (flow.js)
    lastDrive: e => lastDrive(e, S(e)), goSleep: (e, o) => goSleep(e, S(e), o), wake: e => wake(e, S(e)),
    // n free single animals (no chick, no hen with a line: as test pickup() boops them) land in the first slots, as a
    // flight's landing does (game.step), with their hats (W-4)
    riders(e, n) {
      const g = S(e).game, free = g.herd.free().filter(a => !a.hidden && a.type !== 'chick' && a.leader == null && !g.herd.animals.some(c => c.leader === a.id));
      for (const a of free.slice(0, n)) {
        const sl = g.load.reserve(a); if (!sl) break;
        a.state = 'ride'; a.hidden = false; a.ride = { slot: sl, rider: newRider() }; g.load.land(sl);
      }
      g.wearHats(g.hats);
    },
    // P-8, M-19, [S-6], #6: a new farm one presented frame after the request (the view drops the old one first), then a
    // synchronous seeded build (no Promise, no worker); started and the bedtime stay. A request during a load waits for it.
    newFarm(e, ctx) {
      const s = ctx.state;
      if (s.net?.role === 'guest') return; // M-19: the host's farm is the guest's
      if (e.loading.active) { s.nextFarm = true; return; }
      ctx.load({ label: 'farm', frames: 1,
        build() { rebuild(e, s, s.settings.seed ?? e.rng('seeds').int(0, 0xffffffff), s.player); }, // #86
        then() {
          if (s.net?.role === 'host') s.net.sync?.setGame(s.game); // M-19: the guests get the new farm too
          enterStart(e, s); next(e, ctx);
        } });
    },
    // M-1, #80: a guest builds the host's farm (its seed, this guest's spawn place) through ctx.load, as main.js's onFarm did
    // (and the trip starts); the guest sync's welcome waits for it (farmReady). A welcome during a load waits for that load's
    // then, and the newest one wins: the build reads netFarm when it runs
    guestFarm(e, ctx, seed, player) {
      const s = ctx.state; s.netFarm = { seed, player };
      if (e.loading.active) return;
      ctx.load({ label: 'farm', frames: 1,
        build() { const f = s.netFarm; s.netFarm = null; s.player = f.player; rebuild(e, s, f.seed, f.player); if (!s.started) play(e, s); },
        then() { if (s.net?.role === 'guest') s.net.sync?.farmReady(s.game); enterStart(e, s); next(e, ctx); } });
    },
  };
  // F-11: the start screen (paint and go) is up only with a paint choice (build gave mode 'start')
  const enterStart = (e, s) => { if (!s.started && s.game.mode === 'start') open(e, 'start'); };

  const scene = {
    // [S-5, #25] known states, never stepping; (engine, opts) as jump calls them
    presets: {
      started: e => api.play(e),
      riders: (e, o = {}) => { api.play(e); api.riders(e, o.n ?? 3); },
      // n riders and the train 20 m out from the barn door, facing in: drive straight on for a barn pass. ground: the barn
      // stands on a terrain pad, not where the farm put the tractor, so the train settles onto its wheels there (as trainAt)
      barn: (e, o = {}) => {
        api.play(e); api.riders(e, o.n ?? 3);
        const g = S(e).game, b = g.farm.yard.barn; moveTrain(g, b.x - Math.sin(b.yaw) * 20, b.z - Math.cos(b.yaw) * 20, b.yaw, { ground: true });
      },
      // E-5: bedtime's last drive (the barn path and the voice), and asleep (quiet, as after a reload)
      last: e => { const s = S(e); Object.assign(s.bed, { phase: 'last', at: null, choice: null }); e.emit('bed', { bed: { ...s.bed } }); if (s.started) api.lastDrive(e); else api.play(e); },
      asleep: e => { const s = S(e); if (s.started) api.goSleep(e, { quiet: true }); else { sleepNow(s.bed); api.play(e); } },
    },
    enter(e, ctx) {
      const a = ctx.args ?? {}, settings = clampSettings(a.settings), progress = clampProgress(a.progress, Object.keys(TYPES)), bed = clampBedtime(a.bed);
      const seed = seedParam(a.seed) ?? settings.seed ?? e.rng('seeds').int(0, 0xffffffff), power = powerParam(a.power, settings.power); // #86
      const player = Number.isInteger(a.player) && a.player >= 1 ? a.player : 1, tripOn = a.trip !== false;
      const s = Object.assign(ctx.state, {
        game: null, gen: 0, seed, player, started: !!a.started, tripOn, trip: tripOn ? createTrip() : null,
        raw: null, pilot: createPilot(), stepIn: { thr: 0, steer: 0, turn: 0, onTarget: true, horn: false },
        guide: false, sleepAfter: false, show: null, showDone: false, rewardDone: false, reward: null,
        bed, date: null, progress, settings, power, sfx: freshSfx(), nextFarm: false, netFarm: null,
        net: { role: 'solo', sync: null, facade: null, at: null, registry: null }, // game/net.js (net.open)
      });
      build(e, s, seed, power, player);
      ctx.system('tp.farm.post', en => post(en, ctx), { stage: 'post' });
      if (s.started && s.bed.phase === 'asleep') goSleep(e, s, { quiet: true }); // N-7: a reload while asleep
      enterStart(e, s);
    },
    exit() {}, // [S-3]: the engine disposes the scene's World (the terrain, trees, props and vehicles) after exit
    step(e, dt, ctx) {
      const s = ctx.state, I = e.input.snapshot, net = s.net; // #88: the sync is looked up here each step and called by name (tests replace its methods)
      if (net.sync) { let nev = NONE; try { nev = net.sync.before(e.time.wall); } catch (err) { warn('net before', err); } bridge(e, nev); } // M-44: net events first
      if (e.loading.active) return; // #80: the welcome asked for the host's farm: the old one steps no more (the load suspends this hook)
      if (!s.started && s.game.mode === 'drive' && (I.goX || I.goZ)) api.play(e); // A-7: the first stick move starts the trip
      s.game.pre(readInput(e, s)); s.stepped = true; // the rest runs in post, after lh.physics.step
    },
    // #69: the controls close over this scene's ctx.state
    ui(u, e, ctx) {
      const s = ctx.state, driving = () => s.started && s.game?.mode === 'drive' && !s.show; // U-6: the drive buttons
      u.button({ id: 'paint', label: 'Paint', when: driving, action: e => open(e, 'paint') });
      u.button({ id: 'book', label: 'Sticker book', when: driving, action: e => open(e, 'book') });
      u.hold({ id: 'parent', label: 'Grown-ups', seconds: 2, wall: true, action: e => open(e, 'parent') }); // P-1, #83: the old gear's holdToFire(gear, 2000) (ui/hold.js), on wall time
    },
  };
  return { scene, api };
}

// ?sandbox (T-13, T-14): a flat test pad with a ramp and mud, driven like the farm (no trip, no net)
export function makeSandbox() {
  const scene = {
    enter(e, ctx) {
      const a = ctx.args ?? {}, settings = clampSettings(a.settings);
      Object.assign(ctx.state, {
        game: createSandbox(e.world, { power: powerParam(a.power, settings.power) }), gen: 1, seed: null, started: true, raw: null, stepped: false,
        pilot: createPilot(), stepIn: { thr: 0, steer: 0, turn: 0, onTarget: true, horn: false }, settings, sfx: freshSfx(),
      });
      ctx.system('tp.sandbox.post', en => { const s = ctx.state; if (!s.stepped) return; s.stepped = false; bridge(en, s.game.post()); sounds(en, s); }, { stage: 'post' });
    },
    exit() {},
    step(e, dt, ctx) { const s = ctx.state; s.game.pre(readInput(e, s)); s.stepped = true; },
  };
  return { scene };
}
