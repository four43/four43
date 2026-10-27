// Rally's cameras on lion-hawk's rigs (3g, 3j #9): the travel chase rig gives the chase (heading blended toward travel,
// speed FOV) and the title orbit; the mount rig gives the bumper and bonnet views. FOVs add over camera.userData.lhFov.
import * as THREE from 'three';
import { createChaseRig, createMountRig } from 'lion-hawk/view';

// The garage turntable (rally-spec R16-5): distance and height from the car's centre, and how far below it the camera
// looks, so the car sits a little above the card; narrower than `aspect` (portrait phones) it backs off so the car fits.
const TURN = { radius: 6.2, height: 1.3, look: -0.15, aspect: 0.7 };
const _f = new THREE.Vector3();

export function createRallyCamera(cam) {
  const chase = createChaseRig(cam, { style: 'travel' });
  // The bumper and bonnet views sit at the model's sock-cam-bumper / sock-cam-bonnet (body frame, rally-spec R16-3); these
  // stand in until the model is drawn.
  const BUMPER = { p: [0, 0.05, 2.1] }, BONNET = { p: [0, 0.62, 0.35] };
  const mount = createMountRig(cam, { socket: BUMPER, fovAdd: 12 });
  let socket = null, sockets = null;
  function turntable(car, angle) {
    _f.set(0, 0, 1).applyQuaternion(car.q);
    const a = Math.atan2(_f.x, _f.z) + Math.PI + angle, r = TURN.radius * Math.max(1, TURN.aspect / cam.aspect);
    cam.position.set(car.p.x + r * Math.sin(a), car.p.y + TURN.height, car.p.z + r * Math.cos(a));
    cam.lookAt(car.p.x, car.p.y + TURN.look, car.p.z);
    cam.updateMatrixWorld();
  }
  return {
    chase, mount,
    // car: { p, q, v, sockets } (sockets: { bumper, bonnet } body-frame points from the drawn model, or null); mode 0
    // chase, 1 bumper, 2 bonnet.
    // garage: { angle } (rad round the car from behind it), or null.
    update(car, { orbit, garage, mode, dt }) {
      if (garage) { turntable(car, garage.angle); return; }
      if (orbit) { chase.orbit(car, dt); return; }
      if (mode === 0) { chase.follow(car, dt); return; }
      if (car.sockets && car.sockets !== sockets) {
        sockets = car.sockets; socket = null;
        if (sockets.bumper) BUMPER.p = [...sockets.bumper];
        if (sockets.bonnet) BONNET.p = [...sockets.bonnet];
      }
      const want = mode === 1 ? BUMPER : BONNET;
      if (socket !== want) { mount.set(want); socket = want; }
      mount.follow(car);
    },
  };
}
