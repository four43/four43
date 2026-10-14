// Tractor Pickup's sim half (lion-hawk 2f, [S-1]…[S-6]): actions, the `farm` and `sandbox` main scenes, the JSON-safe state
// and the debug extras. Never touches three.js or the DOM. The caller initialises Rapier (`await R.init()`) before
// createEngine/boot (#6).
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, axis, button } from 'lion-hawk/sim';
import { makeFarm, makeSandbox, moveTrain, FARM_EVENTS } from './game/farm.js';
import { makeOverlays } from './game/overlays.js';
import { makeCommands } from './game/commands.js';
import { netCommands, netConfig } from './game/net.js';
import MATERIALS from './defs/materials.js';
import PHYS from '../baked/phys.json' with { type: 'json' };
import { PHYSICS } from './sim/ground.js';

export { FARM_EVENTS };
// the entry initialises Rapier through here (#6, D9: the defineGame file is the one that holds Rapier)
export const initPhysics = () => R.init();

// #81: goX/goZ are the wanted direction in the world frame (length = stick distance), merged across devices as one vector
// (I-1); goBack: the stick is in the reverse cone on the screen (C-8). The device map hook writes them (2g).
export const ACTIONS = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button(), horn: button() });

// JSON-safe summary for tests and the hook (#28: the createGame object stays in ctx.state, never here).
function state(e) {
  const s = e.scene.state, g = s.game;
  if (!g) return {};
  const t = g.tractor, p = t.body.translation();
  return {
    mode: g.mode ?? null, started: s.started, gen: s.gen, seed: s.seed, landed: g.load?.landed() ?? 0, full: g.load?.full() ?? false,
    tractor: { x: p.x, z: p.z, yaw: t.yaw, speed: t.speed }, trip: s.trip?.state ?? null, guide: !!s.guide,
    show: s.show ? { riders: s.show.riders.map(r => r.animal.id), done: s.show.done, skipped: s.show.skipped } : null,
    reward: s.reward ? { sticker: { ...s.reward.sticker }, newPaint: s.reward.newPaint, newHat: s.reward.newHat } : null,
    bed: s.bed ? { phase: s.bed.phase, choice: s.bed.choice } : null, net: { role: s.net?.role ?? 'solo', you: s.net?.sync?.you || s.player || 1 },
    paint: s.progress ? { ...s.progress.paint } : null, shows: s.progress?.shows ?? 0, barnWait: g.barnWait ?? 0,
    // T8 ([T-9], #78): enough of the world that a tape's checksums catch a divergence away from the tractor (the sandbox has
    // no herd, trees or flights). Rows are arrays to keep the canonical string short; a possibly-undefined field is `?? null`, so
    // rows are plain JSON (canonical() already wrote undefined in an array as null, so no checksum moves).
    animals: g.herd?.animals.map(a => [a.id, a.type, a.state, a.x, a.y, a.z, a.yaw, a.epoch, a.hidden ?? null, a.golden ?? null, a.hat ?? null, a.dirt]) ?? [],
    cars: g.train.cars.map(c => { const q = c.body.translation(); return [q.x, q.y, q.z, c.dirt ?? 0]; }), dirt: g.dirt?.tractor ?? 0,
    flights: g.flights?.map(f => [f.animal.id, f.u, f.claim ?? null]) ?? [], trees: g.trees?.list.filter(t => t.state !== 'standing').map(t => [t.id, t.state, t.grow]) ?? [],
    others: g.others?.map(o => [o.n, o.x, o.z, o.yaw, o.held ?? null]) ?? [],
  };
}

// clock overrides the syncs' wall clock, bindings the replicated kinds and the port's (tests only, T6). ?fps: the entry passes
// performance.now as boot's timer; world.stats.stepMsTotal is Rapier's running total (#106). R is handed to the engine here (D9).
export function tractorGame({ clock, bindings } = {}) {
  const { scene: farm, api } = makeFarm({ clock, bindings }), { scene: sandbox } = makeSandbox();
  // → window.engine.debug
  const debug = e => ({
    get game() { return e.scene.state.game; }, get farm() { return e.scene.state; }, get sync() { return e.scene.state.net?.sync ?? null; },
    drive(raw) { e.scene.state.raw = raw ?? null; }, // { thr, steer, turn?, horn } in place of the pilot; null gives it back
    trainAt(x, z, yaw) { moveTrain(e.scene.state.game, x, z, yaw, { ground: true }); },
    riders(n) { api.riders(e, n); }, // n free singles land in the slots
    newFarm() { e.command('farm.new', {}); },
  });
  return defineGame({
    id: 'tractor-pickup', sim: { hz: 60, maxCatchUp: 3, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm', // hz: the physics step (DT)
    defs: { materials: MATERIALS, models: PHYS }, physics: { rapier: R, ...PHYSICS },
    scenes: { farm, sandbox, ...makeOverlays() }, commands: { ...makeCommands(api), ...netCommands(api) }, net: netConfig(bindings ?? undefined), state, debug,
  });
}

export default tractorGame();
