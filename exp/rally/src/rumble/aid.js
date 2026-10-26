// The driving-aid channel (rally-spec R9-1): the left trigger, the foot brake taking the worst wheel towards its peak slip
// (−κ / kp); with the handbrake on only the fronts count (a handbrake turn locks the rears on purpose). A kick on crossing
// `near` (re-armed under `rearm`), a level rising to the peak, and past `lock` pulses at pulseHz until back under `unlock`.
// No right trigger: wheelspin fired it all the time and didn't help (playtest 2026-10-25), and a slide is not an aid event.
// p is PARAMS.aid.
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const BRAKE_V = 1; // m/s: below this a stopped car's held brake is not a lock

// x: slip over peak slip (0 when the pedal is off); q: PARAMS.aid.brake
function step(st, x, q, dt) {
  st.kick = Math.max(0, st.kick - dt);
  if (st.armed && x >= q.near) { st.armed = false; st.kick = q.kickLen; }
  else if (!st.armed && x < q.rearm) st.armed = true;
  if (!st.locked && x >= q.lock) { st.locked = true; st.ph = 0; }
  else if (st.locked && x < q.unlock) st.locked = false;
  st.lockedNow = st.locked; st.near = x >= q.near;
  if (st.locked) { st.ph = (st.ph + dt * q.pulseHz) % 1; return st.ph < 0.5 ? q.amp : 0; }
  const warn = x >= q.near ? q.nearAmp * clamp01((x - q.near) / (1 - q.near || 1)) : 0;
  return Math.max(warn, st.kick > 0 ? q.kickAmp : 0);
}

export function createAid(p) {
  const out = { left: 0 }, brake = { armed: true, kick: 0, locked: false, ph: 0, lockedNow: false, near: false };
  return {
    update(car, dt) {
      const speed = Math.abs(car.speed), pedal = car.input?.brake ?? 0;
      const hand = (car.input?.handbrake ?? 0) > p.pedal;
      let lock = 0;
      for (const w of car.wheels) if (w.contact && (w.front || !hand)) lock = Math.max(lock, -w.kappa / w.surf.kp);
      out.left = step(brake, pedal > p.pedal && speed >= BRAKE_V ? lock : 0, p.brake, dt);
      return out;
    },
    // For the panel's readout and the tests.
    state: () => ({ brake: { near: brake.near, locked: brake.lockedNow } }),
  };
}
