// The stage scene (spec tracks T-20 … T-23; lion-hawk [S-3], field notes #7, #21–#23, #28): one main scene owns the
// Sim, the Rapier world and the track and survives every menu (title, pause, results and settings are overlays).
// Rally's run sub-states live in ctx.state.phase: title → loading → ready → countdown → running → finished.
// The run logic is moved from game/game.js (Game): same constants, same order (clock first, then progress), with
// this.emit → e.emit, this.set → setPhase and DT → the step's dt (the same value).
import { Sim } from '../sim.js';
import { shift } from '../drivetrain.js';
import { TrackWorld, pointAt } from '../world/trackWorld.js';
import { generateTrack } from '../gen/track.js';
import { makeProgress } from './progress.js';
import { bestKey } from './bests.js';
import { MODES } from './modes.js';
import { normalizeSettings, newSeed } from './settings.js';

export const READY_T = 0.8, COUNT_T = 3, LOAD_HOLD = 0.05, RESULTS_AFTER = 1.5, RESET_HOLD = 0.6;
export const DRIVING = new Set(['ready', 'countdown', 'running']);
const START_Y = 0.6;          // CoM above the road when placed
const EPS = 1e-9;

const isOpen = (e, name) => e.scene.overlays.includes(name);
// Opens an overlay unless it is open or already requested in this step/transition (the engine has no query for a
// pending overlay: engine gap, see the R2 report).
const openOnce = (e, name) => {
  if (isOpen(e, name)) return;
  try { e.overlay(name); } catch (err) { if (!/already open/.test(err.message)) throw err; }
};

export function makeStage({ R, bests = null }) {
  // --- state helpers (each takes the stage state s) -------------------------------------------------------------
  const track = s => s.sim.world.track ?? null;
  const modeOf = s => s.pad ? MODES.freeDrive : MODES[s.settings.mode];
  const trackKey = st => { const o = { kind: MODES[st.mode].kind ?? st.world, theme: st.theme, density: st.density, style: st.style }; return JSON.stringify([st.seed, o]); };
  const runKey = s => track(s) ? bestKey(s.mode.id, track(s), s.sim.carId) : null;

  function setPhase(e, s, phase) {
    if (phase === s.phase) return;
    const from = s.phase; s.phase = phase;
    e.emit('state', { state: phase, from });
  }

  function clear(s) {
    Object.assign(s, { t: 0, countN: 0, time: 0, lapTime: 0, clockOn: false, laps: [], splits: [], best: null, result: null, progress: null,
      resultsIn: 0 });
  }

  // Where the mode starts the car: the spawn, or startOffset m from the start line along the road.
  function startPose(s) {
    const t = track(s), off = t ? s.mode.startOffset(t) : null;
    if (off === null) { const sp = s.sim.world.spawn; return { ...s.sim.spawnPos(s.sim.car.cfg), yaw: sp.yaw, off: null }; }
    if (s.poseCache?.track !== t || s.poseCache.mode !== s.mode) {
      const p = pointAt(t.layout, t.roadside.gates[0].s + off);
      s.poseCache = { track: t, mode: s.mode, pose: { x: p.x, y: p.road(t.terrain.road) + START_Y, z: p.z, yaw: p.yaw, off } };
    }
    return s.poseCache.pose;
  }
  function place(s) { const p = startPose(s); s.sim.car.reset(p, p.yaw); s.pose = p; return p; }

  function updateBest(s) {
    const m = s.mode, t = track(s);
    if (!m.clock || !t) { s.titleBest = null; return; }
    const b = bests?.get(runKey(s)) ?? null;
    s.titleBest = { label: m.laps ? 'Best lap' : 'Best', time: b ? (m.laps ? b.lap : b.time) : null };
  }

  // The menu over the live scene: the car sits held where the selected mode starts.
  function title(e, s) { s.mode = modeOf(s); clear(s); place(s); s.sim.car.hold = true; setPhase(e, s, 'title'); updateBest(s); }

  // Start a run of the current mode on the current world.
  function begin(e, s) {
    s.mode = modeOf(s); clear(s);
    const pose = place(s), t = track(s), car = s.sim.car;
    if (t && s.mode.clock) {
      s.progress = makeProgress(t);
      s.progress.reset(pose.off ?? 0);
      s.best = bests?.get(runKey(s)) ?? null;
    }
    if (s.mode.countdown && t) { car.hold = true; setPhase(e, s, 'ready'); }
    else { car.hold = false; setPhase(e, s, 'running'); }
  }

  // Builds the world the settings ask for into s.sim (or a new Sim on the first build). Returns false, with a toast,
  // when the seed fails to generate: the current world stays (the first build falls back to the pad).
  function build(e, s) {
    const st = s.settings, key = trackKey(st);
    let world = null;
    if (!s.pad) {
      try { world = new TrackWorld(generateTrack(st.seed, { kind: MODES[st.mode].kind ?? st.world, theme: st.theme, density: st.density, style: st.style })); }
      catch (err) { e.emit('toast', { text: `Couldn't build that track (${err.message}). Try another seed.`, seconds: 5 }); if (s.sim) return false; }
    }
    if (!s.sim) s.sim = new Sim(R, { world: world ?? undefined, car: st.car, surface: st.surface, assist: st.assist });
    else if (world) s.sim.setWorld(world);
    else return false; // the pad is built once, in enter
    s.world = s.sim.world; s.sim.car.autoShift = st.gearbox === 'auto';
    s.builtKey = world ? key : null; s.poseCache = null;
    s.worldRev++; s.carRev++;
    return true;
  }

  // Leaves the loading hold (#21): build, then continue with load.then.
  function finishLoad(e, s) {
    const then = s.load.then; s.load = null;
    build(e, s);
    if (then === 'begin') begin(e, s); else title(e, s);
  }
  // A rebuild of the settings' track after LOAD_HOLD of engine time, so the browser paints its toast first (#21).
  function startLoad(e, s, then) {
    s.load = { key: trackKey(s.settings), then, t: 0 };
    s.sim.car.hold = true;
    setPhase(e, s, 'loading');
    e.emit('toast', { text: 'Building the track…', seconds: null }); // null: shown while loading
  }

  // Run events from progress (moved from Game.handle).
  function handle(e, s, ev) {
    const laps = s.mode.laps;
    switch (ev.type) {
      case 'start':
        if (s.mode.clock === 'line') { s.clockOn = true; s.lapTime = 0; e.emit('start'); }
        break;
      case 'checkpoint': {
        const t = laps ? s.lapTime : s.time, ref = s.best?.splits?.[ev.index];
        s.splits[ev.index] = t;
        e.emit('split', { index: ev.index, of: s.progress.cps.length, time: t, delta: ref != null ? t - ref : null });
        break;
      }
      case 'missed': e.emit('missed', { index: ev.index }); break;
      case 'blocked': e.emit('blocked', { index: ev.index }); break;
      case 'finish': {
        const prev = s.best?.time ?? null, isBest = prev === null || s.time < prev;
        s.result = { time: s.time, splits: s.splits.slice(), prev, delta: prev === null ? null : s.time - prev, isBest,
          bestSplits: s.best?.splits ?? [] };
        if (isBest) { s.best = { time: s.time, splits: s.splits.slice() }; bests?.put(runKey(s), s.best); }
        setPhase(e, s, 'finished');
        s.resultsIn = RESULTS_AFTER; // #22: the results card on engine time, not setTimeout
        e.emit('finish', { ...s.result });
        break;
      }
      case 'line': {
        const prev = s.best?.lap ?? null, t = s.lapTime;
        const isBest = ev.valid && (prev === null || t < prev);
        const lap = { n: s.laps.length + 1, time: t, valid: ev.valid, prev, delta: prev === null ? null : t - prev, isBest };
        if (isBest) { s.best = { lap: t, splits: s.splits.slice() }; bests?.put(runKey(s), s.best); }
        s.laps.push(lap);
        s.lapTime = 0; s.splits = [];
        e.emit('lap', { ...lap });
        break;
      }
    }
  }

  // --- the API (overlays, debug and presets call these; each takes the engine first) ----------------------------
  const S = e => e.scene.state;
  const api = {
    // From the title only: close it and start the run.
    drive(e) { const s = S(e); if (s.phase !== 'title') return; e.close('title'); begin(e, s); },
    // Markers home, then a fresh run from the start (or the run-up).
    restart(e) {
      const s = S(e); e.close('pause'); e.close('results');
      s.sim.world.resetProps(); s.sim.snow?.clear();
      begin(e, s);
    },
    // Back to the menu over the live scene; rebuilds through the loading hold when the track key changed.
    toTitle(e) {
      const s = S(e); e.close('pause'); e.close('results');
      openOnce(e, 'title');
      if (!s.pad && trackKey(s.settings) !== s.builtKey) { s.mode = modeOf(s); startLoad(e, s, 'title'); }
      else title(e, s);
    },
    // Put the car at course position p (m from the start line), facing along the road, stopped; progress follows
    // without crediting anything in between.
    teleport(e, p) {
      const s = S(e), t = track(s); if (!t) return null;
      const pt = pointAt(t.layout, t.roadside.gates[0].s + p), pose = { x: pt.x, y: pt.road(t.terrain.road) + START_Y, z: pt.z, yaw: pt.yaw, s: pt.s };
      s.sim.car.reset(pose, pose.yaw);
      if (s.progress) { s.progress.p = p + s.progress.base; s.progress.s = pose.s; }
      return pose;
    },
    // Stage: every checkpoint credited, the car d m before the finish. Time attack: d m before the line with the
    // lap's checkpoints credited.
    nearFinish(e, d = 40) {
      const s = S(e), P = s.progress; if (!P) return null;
      P.started = true; P.next = P.cps.length;
      if (s.mode.clock === 'line') s.clockOn = true;
      return api.teleport(e, P.lapLength - d);
    },
  };

  // Reset: R = back onto the road (the pad: the spawn), Shift+R = restart; the touch chip: tap = reset, held = restart.
  const recover = s => {
    const sim = s.sim;
    if (!sim.world.recover) { sim.resetCar(); return; }
    const p = sim.car.body.translation(), r = sim.world.recover(p.x, p.z); sim.car.reset(r, r.yaw);
  };
  const restartOrReset = (e, s) => { if (track(s)) api.restart(e); else s.sim.resetCar(); };

  // Buttons that act in running/finished (menus and the countdown get no resets or shifts), as main.js handleEvents.
  function actions(e, s, dt) {
    const I = e.input.snapshot, live = s.phase === 'running' || s.phase === 'finished';
    const hold = I.resetHold;
    if (hold.down) {
      s.holdT += dt;
      if (live && !s.holdFired && s.holdT >= RESET_HOLD - EPS) { s.holdFired = true; restartOrReset(e, s); return; }
    } else {
      if (hold.released && live && !s.holdFired) recover(s);
      s.holdT = 0; s.holdFired = false;
    }
    if (!live) return;
    if (I.resetAll.pressed) { restartOrReset(e, s); return; }
    if (I.reset.pressed) recover(s);
    const dir = I.shiftUp.pressed ? 1 : I.shiftDown.pressed ? -1 : 0;
    if (dir) {
      if (s.settings.gearbox === 'auto') { s.settings.gearbox = 'manual'; s.sim.car.autoShift = false; s.settingsRev++; }
      shift(s.sim.car.dt, dir);
    }
  }

  const scene = {
    enter(e, ctx) {
      const a = ctx.args ?? {}, settings = normalizeSettings(a.settings);
      if (!settings.seed) settings.seed = newSeed(e.rng('seeds'));
      const s = Object.assign(ctx.state, { settings, pad: !!a.pad, sim: null, world: null, mode: null, phase: null, pose: null, load: null,
        builtKey: null, poseCache: null, worldRev: 0, carRev: 0, settingsRev: 0, cam: 0, wheels: false, holdT: 0, holdFired: false, titleBest: null });
      clear(s);
      build(e, s);
      // Device snapshot → car controls (#23: runs under the pause overlay too; physics is frozen there anyway).
      ctx.system('rally.input', () => {
        const I = e.input.snapshot, inp = s.sim.car.input;
        if (DRIVING.has(s.phase)) { inp.steer = I.steer; inp.throttle = I.throttle; inp.brake = I.brake; inp.handbrake = I.handbrake; }
        else if (s.phase !== 'finished') { inp.steer = 0; inp.throttle = 0; inp.brake = 0; inp.handbrake = 0; }
        if (I.camera.pressed) s.cam = (s.cam + 1) % 3;
        if (I.debug.pressed) s.wheels = !s.wheels;
      }, { stage: 'input.apply', after: ['lh.input'] });
      ctx.system('rally.physics', () => s.sim.step(), { stage: 'physics.world' });
      s.mode = modeOf(s);
      if (s.pad) begin(e, s);
      else { title(e, s); e.overlay('title'); }
    },
    exit(e, ctx) { ctx.state.sim?.dispose(); }, // [S-3]
    step(e, dt, ctx) {
      const s = ctx.state, car = s.sim.car, I = e.input.snapshot;
      if (s.phase === 'loading') {
        car.hold = true;
        if ((s.load.t += dt) >= LOAD_HOLD - EPS) finishLoad(e, s);
        return;
      }
      actions(e, s, dt);
      if (I.pause.pressed && DRIVING.has(s.phase)) openOnce(e, 'pause'); // #23
      switch (s.phase) {
        case 'title': car.hold = true; break;
        case 'ready':
          car.hold = true;
          if ((s.t += dt) >= READY_T) { s.t = 0; s.countN = 3; setPhase(e, s, 'countdown'); e.emit('count', { n: 3 }); }
          break;
        case 'countdown': {
          car.hold = true;
          s.t += dt;
          const n = 3 - Math.floor(s.t / (COUNT_T / 3));
          if (s.t >= COUNT_T - EPS) {
            car.hold = false; s.countN = 0; s.t = 0;
            s.clockOn = s.mode.clock === 'go';
            setPhase(e, s, 'running'); e.emit('count', { n: 0 });
          } else if (n !== s.countN) { s.countN = n; e.emit('count', { n }); }
          break;
        }
        case 'running':
          if (s.clockOn) { s.time += dt; s.lapTime += dt; }
          if (s.progress) {
            const p = car.body.translation();
            for (const ev of s.progress.update(p.x, p.z)) handle(e, s, ev);
          }
          break;
        case 'finished':
          // Roll to a stop on its own: brake gently, then hold (holding brake at a standstill would otherwise select
          // reverse). The results card opens RESULTS_AFTER s after the finish, once (#22).
          Object.assign(car.input, { throttle: 0, brake: 0.5, handbrake: 0 });
          if (Math.abs(car.speed) < 1) car.hold = true;
          if (s.resultsIn > 0 && (s.resultsIn -= dt) <= EPS) { s.resultsIn = 0; openOnce(e, 'results'); }
          break;
      }
    },
    ui(u) {
      u.button({ id: 'pause', label: 'Pause', action: e => openOnce(e, 'pause'), when: e => DRIVING.has(e.scene.state.phase) && !isOpen(e, 'pause') });
    },
  };
  api.handle = (e, ev) => handle(e, S(e), ev); // the debug HUD fakes (R3)
  return { scene, api };
}
