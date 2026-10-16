// A headless farm for tests and the tuning scripts (phase 3k T6): the farm scene's createSim object, stepped through the
// engine (think → Rapier → settle → farm.events), with `log` collecting what the sim emitted (the farm's own UI events,
// FARM_EVENTS, left out) so `sim.log.splice(0)` replaces the old `sim.events.splice(0)`.
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { FARM_EVENTS } from '../src/game/farm.js';
await R.init();

export function farmSim({ pigs = 48, seed = 1, night = false } = {}) {
  const h = headless(pigPensGame(), { seed, args: { pigs, seed, night } });
  const sim = h.engine.scene.state.sim, log = [];
  h.engine.events.on(e => { if (!FARM_EVENTS.has(e.type)) log.push(e); });
  return Object.assign(sim, { h, log, step(n = 1) { h.step(n); } });
}
