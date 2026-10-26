// Rally's cameras on lion-hawk's rigs (3g, 3j #9): the travel chase rig gives the chase (heading blended toward travel,
// speed FOV) and the title orbit; the mount rig gives the bumper and bonnet views. FOVs add over camera.userData.lhFov.
import { createChaseRig, createMountRig } from 'lion-hawk/view';

export function createRallyCamera(cam) {
  const chase = createChaseRig(cam, { style: 'travel' });
  const BUMPER = { p: [0, 0.05, 0] }, BONNET = { p: [0, 0.62, 0.35] };
  const mount = createMountRig(cam, { socket: BUMPER, fovAdd: 12 });
  let socket = null, zFront = NaN;
  return {
    chase, mount,
    // car: { p, q, v, zFront } (zFront: the front axle's body z, for the bumper socket); mode 0 chase, 1 bumper, 2 bonnet.
    update(car, { orbit, mode, dt }) {
      if (orbit) { chase.orbit(car, dt); return; }
      if (mode === 0) { chase.follow(car, dt); return; }
      if (car.zFront !== zFront) { zFront = car.zFront; BUMPER.p[2] = zFront + 0.9; socket = null; }
      const want = mode === 1 ? BUMPER : BONNET;
      if (socket !== want) { mount.set(want); socket = want; }
      mount.follow(car);
    },
  };
}
