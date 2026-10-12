// Point to go (spec 7.2, C-1, C-2, C-8..C-11): the stick points where the tractor must go on the screen; the pilot turns that into the
// tractor's throttle and steer. The stick is always read against the camera now (C-2): the camera swings behind the tractor, so a stick
// held to one side keeps the tractor turning in a circle (review 3: she can learn). Mutable so ?tune can adjust.
const D = Math.PI / 180;
export const PILOT = { revCone: 35 * D, fullErr: 30 * D, crawlErr: 90 * D, crawl: 0.2, gain: 2.2, helpSpeed: 3 };
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), clamp = v => Math.max(-1, Math.min(1, v));

// The stick in the world frame (lion-hawk 2f, #81): the wanted direction (goX, goZ), length = stick distance, as yaws go
// (x = sin, z = cos); goBack is decided on the screen (C-8: within revCone of straight down), which a world vector cannot say.
export function stickToWorld(sx, sy, camYaw, out) {
  const m = Math.min(1, Math.hypot(sx, sy));
  if (m === 0) { out.goX = out.goZ = 0; out.goBack = false; return out; }
  const a = Math.atan2(sx, sy), want = camYaw - a;
  out.goX = m * Math.sin(want); out.goZ = m * Math.cos(want); out.goBack = Math.abs(a) > Math.PI - PILOT.revCone;
  return out;
}

// stick: { x, y } on the screen (x right, y up), length 0..1. Yaws as tractor.yaw (positive steer turns the yaw up, screen right is camYaw - 90 deg).
export function createPilot() {
  const out = { thr: 0, steer: 0, turn: 0, onTarget: true }; // reused: nothing allocated per step
  // m: stick distance 0..1; want: the wanted world yaw; back: the stick is in the reverse cone
  function go(m, want, back, yaw, speed) {
    if (m === 0) { out.thr = out.steer = out.turn = 0; out.onTarget = true; return out; }
    if (back) { // C-8: back up, the rear of the tractor turning toward the stick
      const err = wrap(want - (yaw + Math.PI));
      out.thr = -m; out.steer = clamp(-err * PILOT.gain); out.turn = 0; out.onTarget = true; return out;
    }
    const err = wrap(want - yaw), e = Math.abs(err);
    const k = e <= PILOT.fullErr ? 1 : e >= PILOT.crawlErr ? PILOT.crawl : 1 - (1 - PILOT.crawl) * (e - PILOT.fullErr) / (PILOT.crawlErr - PILOT.fullErr);
    out.thr = m * k; out.steer = clamp(err * PILOT.gain); out.onTarget = e < PILOT.fullErr;
    out.turn = e > PILOT.fullErr && speed < PILOT.helpSpeed ? Math.sign(err) : 0;
    return out;
  }
  return {
    update(stick, camYaw, yaw, speed) {
      const m = Math.min(1, Math.hypot(stick.x, stick.y));
      if (m === 0) return go(0, 0, false, yaw, speed);
      const a = Math.atan2(stick.x, stick.y);
      return go(m, camYaw - a, Math.abs(a) > Math.PI - PILOT.revCone, yaw, speed);
    },
    // The world-frame stick (the goX/goZ/goBack actions, stickToWorld): what update gives for the same stick, within 1e-9 (#81)
    drive(goX, goZ, back, yaw, speed) {
      const m = Math.min(1, Math.hypot(goX, goZ));
      return go(m, m === 0 ? 0 : Math.atan2(goX, goZ), back, yaw, speed);
    },
  };
}
