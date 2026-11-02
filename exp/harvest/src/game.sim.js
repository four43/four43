// Harvest's sim half (lion-hawk defineGame): the actions, the farm scene with its shop card, the commands and the
// JSON-safe state for tests and the page hook. Never touches three.js or the DOM. The entry initialises Rapier (initPhysics)
// before boot.
import R from '@dimforge/rapier3d-compat';
import { defineGame } from 'lion-hawk/sim';
import { ACTIONS } from './sim/actions.js';
import { GROUPS } from './sim/combine.js';
import { makeScenes, makeCommands } from './game/scene.js';
import { CROP_IDS } from './defs/econ.js';
import MATERIALS from './defs/materials.js';
import PHYS from '../baked/phys.json' with { type: 'json' };

export { ACTIONS };
export const initPhysics = () => R.init();

function state(e) {
  const s = e.scene.state, f = s.farm, r = s.rig;
  if (!f || !r) return {};
  const p = r.c.body.translation();
  return {
    coins: f.prog.coins, vehicle: r.vehicle, owned: { ...f.prog.owned }, levels: { ...r.levels }, done: f.fields.done(), blocked: r.blocked?.id ?? null, selling: r.selling,
    load: { n: r.load.total(), cap: r.load.capacity(), bins: r.load.bins.map(b => [b.n, b.cap, CROP_IDS[b.last]]) },
    combine: { x: p.x, y: p.y, z: p.z, yaw: r.c.yaw, speed: r.c.speed, cutting: r.c.cutting }, carts: r.train.carts.length,
    zone: r.zone, ripe: Object.fromEntries(f.fields.list.map(x => [x.id, x.ripe])),
  };
}

export function harvestGame() {
  const { farm, shop } = makeScenes();
  const debug = e => ({
    get farm() { return e.scene.state.farm; }, get rig() { return e.scene.state.rig; },
    drive(raw) { e.scene.state.raw = raw ?? null; }, // { thr, steer } in place of the pilot; null gives it back
    coins(n) { e.scene.state.farm.prog.coins = n; },
  });
  return defineGame({
    id: 'harvest', sim: { hz: 60, maxCatchUp: 3, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm',
    defs: { materials: MATERIALS, models: PHYS }, physics: { rapier: R, gravity: [0, -9.81, 0], groups: GROUPS },
    scenes: { farm, shop }, commands: makeCommands(), state, debug,
  });
}

export default harvestGame();
