// Biscuit in the clinic (2.15.0): off duty at night he trots in through the front door to his bed beside the cat's, and in
// the morning he is up and running out to his day; Shoo onto the clinic sends him in (and he naps there till you send him
// out). Outside, sim.js steers his body; inside he walks the clinic's walk graph (clinic.js clinicRoute, as Dr. Emmy does)
// with his body off, so he needs no doorways in the clinic's walls. Sim only: never touches three.js or the DOM.
// createDogClinic({ dog, clock, emit, now }) → { step(dt) → true while he is inside (sim.js leaves him be), wants(),
// tuckIn() (a farm that starts at night: already in his bed) }
// dog.sendIn: Shoo sent him in; dog.inn: { mode: 'in' | 'bed' | 'out', path, node } while he is inside; dog.zoom: until
// when he runs (out of the door in the morning)
import { CLINIC } from './defs/buildings.js';
import { clinicPoint, clinicRoute } from './clinic.js';

export const DOG_IN = {
  near: 0.45,     // m from the front door's step he goes in
  trot: 1.8,      // m/s inside (off duty)
  hurry: 3.2,     // m/s inside while you send him with Shoo
  run: 4.5,       // m/s out of the door in the morning…
  runFor: 5,      // …for this many s
  runTo: 5,       // m out in front of the clinic he runs to
};

export function createDogClinic({ dog, clock, emit, now }) {
  const door = clinicPoint('frontOut'), bed = CLINIC.spots.dogBed;
  // in, with the vet, at night (off duty); or sent in
  const wants = () => !!dog.sendIn || (clock.night && !dog.active && !dog.visit);
  function goIn() {
    dog.body.setLinvel({ x: 0, y: 0, z: 0 }, true); dog.body.setEnabled(false);
    dog.inn = { mode: 'in', path: clinicRoute('frontOut', 'dogBed'), node: 'frontOut' }; dog.home = 0; dog.bored = 0;
  }
  function comeOut() {
    const morning = !clock.night && !dog.active;
    dog.inn = null; dog.lie = 0;
    dog.body.setTranslation({ x: door[0], y: dog.r, z: door[1] }, true); dog.body.setLinvel({ x: 0, y: 0, z: 0 }, true); dog.body.setEnabled(true);
    if (morning) { dog.tx = door[0]; dog.tz = door[1] + DOG_IN.runTo; dog.zoom = now() + DOG_IN.runFor; dog.bored = 0; emit('woof', { x: door[0], z: door[1] }); } // up and off!
  }
  function step(dt) {
    const I = dog.inn;
    if (!I) {
      if (!wants()) return false;
      dog.tx = door[0]; dog.tz = door[1]; dog.home = 0; dog.bored = 0; // to the front door (sim.js steers him there)
      if (Math.hypot(door[0] - dog.x, door[1] - dog.z) < DOG_IN.near) goIn();
      return !!dog.inn;
    }
    // turned round: wanted out (morning, or Shoo outside) or back in
    if (I.mode !== 'out' && !wants()) { I.mode = 'out'; I.path = clinicRoute(I.node, 'frontOut'); }
    else if (I.mode === 'out' && wants()) { I.mode = 'in'; I.path = clinicRoute(I.node, 'dogBed'); }
    if (I.mode === 'bed') {
      [dog.x, dog.z] = clinicPoint('dogBed'); dog.vx = dog.vz = dog.speed = 0;
      dog.yaw = turn(dog.yaw, bed.yaw, 4 * dt); dog.lie += (1 - dog.lie) * Math.min(1, dt * 2);
      return true;
    }
    dog.lie += (0 - dog.lie) * Math.min(1, dt * 4);
    if (!I.path.length) { if (I.mode === 'in') I.mode = 'bed'; else comeOut(); return !!dog.inn; }
    const [tx, tz] = clinicPoint(I.path[0]), dx = tx - dog.x, dz = tz - dog.z, d = Math.hypot(dx, dz), sp = dog.active ? DOG_IN.hurry : DOG_IN.trot, s = sp * dt;
    if (d <= s) { dog.x = tx; dog.z = tz; I.node = I.path.shift(); } else { dog.x += dx / d * s; dog.z += dz / d * s; }
    dog.vx = d > 1e-6 ? dx / d * sp : 0; dog.vz = d > 1e-6 ? dz / d * sp : 0; dog.speed = sp;
    if (d > 1e-6) dog.yaw = turn(dog.yaw, Math.atan2(dx, dz), 9 * dt);
    return true;
  }
  function tuckIn() { goIn(); dog.inn.mode = 'bed'; dog.inn.path = []; dog.inn.node = 'dogBed'; [dog.x, dog.z] = clinicPoint('dogBed'); dog.yaw = bed.yaw; dog.lie = 1; }
  return { step, wants, tuckIn };
}
const turn = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * Math.min(1, k); };
