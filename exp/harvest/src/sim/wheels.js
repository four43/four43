// Work between the vehicle kit's wheel update and the Rapier step (copied from Tractor Pickup's sim/wheels.js): the combine's
// turn help, yaw clamp and self-righting, and the carts' jackknife limit, run in one system after VEHICLE_SYSTEM and before
// lh.physics.step, in creation order. A combine or cart arms its hook in its pre step; the system runs each armed hook once. Sim-pure.
import { VEHICLE_SYSTEM } from 'lion-hawk/kits/vehicle';

export const AFTER_WHEELS = 'hv.afterWheels';
const LISTS = new WeakMap(), ENGINES = new WeakSet();
export function afterWheels(world, e, fn) {
  let list = LISTS.get(world);
  if (!list) LISTS.set(world, list = []);
  list.push(fn);
  world.own(e, () => { const k = list.indexOf(fn); if (k !== -1) list.splice(k, 1); });
  const engine = world.engine;
  if (!ENGINES.has(engine)) {
    ENGINES.add(engine);
    engine.system(AFTER_WHEELS, (en, dt) => { const l = en.world && LISTS.get(en.world); if (l) for (let i = 0; i < l.length; i++) l[i](dt); },
      { stage: 'physics.world', after: [VEHICLE_SYSTEM], before: ['lh.physics.step'] });
  }
}
