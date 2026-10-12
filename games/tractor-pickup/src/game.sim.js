// Tractor Pickup's sim half (lion-hawk 2f, [S-1]…[S-6]): actions, the `farm` and `sandbox` main scenes, the JSON-safe state
// and the debug extras. Never touches three.js or the DOM. The caller initialises Rapier (`await R.init()`) before
// createEngine/boot (#6).
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, axis, button } from 'lion-hawk/sim';
import { makeFarm, makeSandbox, moveTrain, FARM_EVENTS } from './game/farm.js';

export { FARM_EVENTS };

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
    bed: s.bed ? { phase: s.bed.phase, choice: s.bed.choice } : null, net: { role: s.net?.role ?? 'solo', you: s.player ?? 1 },
    paint: s.progress ? { ...s.progress.paint } : null, shows: s.progress?.shows ?? 0, barnWait: g.barnWait ?? 0,
  };
}

// clock overrides the syncs' wall clock, bindings the replicated kinds (tests only, T6)
export function tractorGame({ clock, bindings } = {}) {
  const { scene: farm } = makeFarm({ R, clock, bindings }), { scene: sandbox } = makeSandbox({ R });
  // → window.engine.debug
  const debug = e => ({
    get game() { return e.scene.state.game; }, get farm() { return e.scene.state; },
    drive(raw) { e.scene.state.raw = raw ?? null; }, // { thr, steer, turn?, horn } in place of the pilot; null gives it back
    trainAt(x, z, yaw) { moveTrain(e.scene.state.game, x, z, yaw, { ground: true }); },
  });
  return defineGame({
    id: 'tractor-pickup', sim: { hz: 60, maxCatchUp: 3, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm', // hz: the physics step (DT)
    scenes: { farm, sandbox }, state, debug,
  });
}

export default tractorGame();
