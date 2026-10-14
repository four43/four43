// The farm's work between the vehicle kit's wheel update and the Rapier step (lion-hawk 3l): the tractor's slide help, turn help, yaw
// clamp and self-righting, and the cars' jackknife limit and self-righting ran right after each controller's updateVehicle, so they
// run in one system after VEHICLE_SYSTEM and before lh.physics.step (3h's "for the game plans"), in creation order. A tractor or car
// arms its hook in its pre step; the system runs each armed hook once. Sim-pure.
import { VEHICLE_SYSTEM } from 'lion-hawk/kits/vehicle';

export const AFTER_WHEELS = 'tp.afterWheels';
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
