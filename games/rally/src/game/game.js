// The game loop (spec tracks T-20 … T-23): title → loading → ready → countdown → running →
// finished, plus paused. step() runs once per physics step, so time is sim time and headless runs
// are deterministic. The game places and holds the car and, after a stage finish, slows it to a
// stop; otherwise it only watches the car and the track and reports events.
import { DT } from '../vehicle.js';
import { pointAt } from '../world/trackWorld.js';
import { makeProgress } from './progress.js';
import { bestKey } from './bests.js';
import { MODES } from './modes.js';

export const READY_T = 0.8, COUNT_T = 3;
const START_Y = 0.6;          // CoM above the road when placed

export class Game {
  constructor(sim, { bests = null } = {}) {
    this.sim = sim; this.bests = bests;
    this.listeners = [];
    this.state = 'title'; this.resumeTo = null;
    this.mode = MODES.freeDrive; this.carId = 'awd';
    this.clear();
  }

  clear() {
    this.t = 0; this.countN = 0; this.time = 0; this.lapTime = 0; this.clockOn = false;
    this.laps = []; this.splits = []; this.best = null; this.result = null; this.progress = null;
  }

  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  emit(e) { for (const f of this.listeners) f(e); }
  set(state) {
    if (state === this.state) return;
    const from = this.state; this.state = state;
    this.emit({ type: 'state', state, from });
  }

  get track() { return this.sim.world.track ?? null; }
  get timed() { return !!(this.mode.clock && this.track); }
  get key() { return this.track ? bestKey(this.mode.id, this.track, this.carId) : null; }
  get car() { return this.sim.car; }

  setMode(mode, carId = this.carId) { this.mode = mode; this.carId = carId; this.poseCache = null; }

  // Where the mode starts the car: the spawn, or startOffset m from the start line along the road.
  startPose() {
    const track = this.track, off = track ? this.mode.startOffset(track) : null;
    if (off === null) { const sp = this.sim.world.spawn; return { ...this.sim.spawnPos(this.car.cfg), yaw: sp.yaw, off: null }; }
    if (this.poseCache?.track !== track) {
      const p = pointAt(track.layout, track.roadside.gates[0].s + off);
      this.poseCache = { track, pose: { x: p.x, y: p.road(track.terrain.road) + START_Y, z: p.z, yaw: p.yaw, off } };
    }
    return this.poseCache.pose;
  }

  place() { const p = this.startPose(); this.car.reset(p, p.yaw); return p; }

  // The menu over the live scene: the car sits held where the selected mode starts.
  title() { this.clear(); this.place(); this.car.hold = true; this.set('title'); }
  loading() { this.set('loading'); }

  // Start a run of the current mode on the current world.
  begin() {
    this.clear();
    const pose = this.place();
    if (this.track && this.mode.clock) {
      this.progress = makeProgress(this.track);
      this.progress.reset(pose.off ?? 0);
      this.best = this.bests?.get(this.key) ?? null;
    }
    if (this.mode.countdown && this.track) { this.car.hold = true; this.set('ready'); }
    else { this.car.hold = false; this.set('running'); }
  }

  // Markers home, then a fresh run from the start (or the run-up).
  restart() {
    this.sim.world.resetProps();
    if (this.sim.snow) this.sim.snow.clear();
    this.begin();
  }

  pause() {
    if (!['ready', 'countdown', 'running', 'finished'].includes(this.state)) return;
    this.resumeTo = this.state; this.set('paused');
  }
  resume() { if (this.state === 'paused') this.set(this.resumeTo); }

  step() {
    const car = this.car;
    switch (this.state) {
      case 'title': case 'loading': car.hold = true; break;
      case 'ready':
        car.hold = true;
        if ((this.t += DT) >= READY_T) { this.t = 0; this.countN = 3; this.set('countdown'); this.emit({ type: 'count', n: 3 }); }
        break;
      case 'countdown': {
        car.hold = true;
        this.t += DT;
        const n = 3 - Math.floor(this.t / (COUNT_T / 3));
        if (this.t >= COUNT_T - 1e-9) {
          car.hold = false; this.countN = 0; this.t = 0;
          this.clockOn = this.mode.clock === 'go';
          this.set('running'); this.emit({ type: 'count', n: 0 });
        } else if (n !== this.countN) { this.countN = n; this.emit({ type: 'count', n }); }
        break;
      }
      case 'running':
        if (this.clockOn) { this.time += DT; this.lapTime += DT; }
        if (this.progress) {
          const p = car.body.translation();
          for (const e of this.progress.update(p.x, p.z)) this.handle(e);
        }
        break;
      case 'finished':
        // Roll to a stop on its own: brake gently, then hold (holding brake at a standstill would
        // otherwise select reverse).
        Object.assign(car.input, { throttle: 0, brake: 0.5, handbrake: 0 });
        if (Math.abs(car.speed) < 1) car.hold = true;
        break;
    }
  }

  handle(e) {
    const laps = this.mode.laps;
    switch (e.type) {
      case 'start':
        if (this.mode.clock === 'line') { this.clockOn = true; this.lapTime = 0; this.emit({ type: 'start' }); }
        break;
      case 'checkpoint': {
        const t = laps ? this.lapTime : this.time, ref = this.best?.splits?.[e.index];
        this.splits[e.index] = t;
        this.emit({ type: 'split', index: e.index, of: this.progress.cps.length, time: t, delta: ref != null ? t - ref : null });
        break;
      }
      case 'missed': this.emit({ type: 'missed', index: e.index }); break;
      case 'blocked': this.emit({ type: 'blocked', index: e.index }); break;
      case 'finish': {
        const prev = this.best?.time ?? null, isBest = prev === null || this.time < prev;
        this.result = { time: this.time, splits: this.splits.slice(), prev, delta: prev === null ? null : this.time - prev, isBest,
          bestSplits: this.best?.splits ?? [] };
        if (isBest) { this.best = { time: this.time, splits: this.splits.slice() }; this.bests?.put(this.key, this.best); }
        this.set('finished');
        this.emit({ type: 'finish', ...this.result });
        break;
      }
      case 'line': {
        const prev = this.best?.lap ?? null, t = this.lapTime;
        const isBest = e.valid && (prev === null || t < prev);
        const lap = { n: this.laps.length + 1, time: t, valid: e.valid, prev, delta: prev === null ? null : t - prev, isBest };
        if (isBest) { this.best = { lap: t, splits: this.splits.slice() }; this.bests?.put(this.key, this.best); }
        this.laps.push(lap);
        this.lapTime = 0; this.splits = [];
        this.emit({ type: 'lap', ...lap });
        break;
      }
    }
  }
}
