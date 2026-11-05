// Point to go (H-C1; after Tractor Pickup's sim/pilot.js, its spec 7.2 C-1..C-11): the stick points where the combine must go on the
// screen; the pilot turns that into throttle and steer, read against the camera's heading. Stick straight down backs up. Steer asks
// the combine for a turn rate (H-C4), the same sign going forward or back, so backing up turns the rear toward the stick.
const D = Math.PI / 180;
export const PILOT = { revCone: 35 * D, fullErr: 30 * D, crawlErr: 90 * D, crawl: 0.35, gain: 2.2 };
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

// Lane hold (H-C5, playtest 2026-11-04: "precision movements are kind of tough"): driving forward across one of its fields, the
// vehicle holds the row line, the field axis (N, E, S or W: the fields are axis-aligned) nearest its heading when the hold took it.
// A stick within `hold` of a quarter turn of that line (TUNE.laneHold, 0.75: 67.5 deg) asks for the line itself; past it, the stick
// steers as ever and the line is let go, so a firm turn leaves the field. Out of the field, backing up or the stick let go: no line.
const QUARTER = Math.PI / 2;
export const nearestAxis = yaw => Math.round(yaw / QUARTER) * QUARTER;

// stick: { x, y } on the screen (x right, y up), length 0..1. Yaws as tractor.yaw (positive steer turns the yaw up, screen right is camYaw - 90 deg).
export function createPilot() {
  const out = { thr: 0, steer: 0, onTarget: true, line: null }; // reused: nothing allocated per step. line: the held row yaw, or null
  // m: stick distance 0..1; want: the wanted world yaw; back: the stick is in the reverse cone; hold: the lane hold's share of a
  // quarter turn (0: none, out of a field)
  function go(m, want, back, yaw, speed, hold = 0) {
    if (m === 0 || back || hold <= 0) out.line = null;
    else {
      out.line ??= nearestAxis(yaw);
      if (Math.abs(wrap(want - out.line)) <= hold * QUARTER) want = out.line; else out.line = null;
    }
    if (m === 0) { out.thr = out.steer = 0; out.onTarget = true; return out; }
    if (back) { // C-8: back up, the rear of the tractor turning toward the stick
      const err = wrap(want - (yaw + Math.PI));
      out.thr = -m; out.steer = clamp(err * PILOT.gain); out.onTarget = true; return out;
    }
    const err = wrap(want - yaw), e = Math.abs(err);
    const k = e <= PILOT.fullErr ? 1 : e >= PILOT.crawlErr ? PILOT.crawl : 1 - (1 - PILOT.crawl) * (e - PILOT.fullErr) / (PILOT.crawlErr - PILOT.fullErr);
    out.thr = m * k; out.steer = clamp(err * PILOT.gain); out.onTarget = e < PILOT.fullErr;
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
    // hold: the lane hold's share of a quarter turn while over one of the vehicle's fields, else 0
    drive(goX, goZ, back, yaw, speed, hold = 0) {
      const m = Math.min(1, Math.hypot(goX, goZ));
      return go(m, m === 0 ? 0 : Math.atan2(goX, goZ), back, yaw, speed, hold);
    },
  };
}
// The inverse of drive() for a tractor-frame { thr, steer } (the raw seam: tests and debug.drive): the world-frame stick that the
// pilot turns back into the same thr and steer at this yaw, so another peer's pilot drives the replica alike (plan 5). Exact for
// |steer| <= 1 (the wanted heading is within PILOT.fullErr, so full speed and no turn help); thr 0 gives no stick.
export function stickOf(yaw, thr, steer, out) {
  const m = Math.min(1, Math.abs(thr));
  if (m === 0) { out.goX = out.goZ = 0; out.goBack = false; return out; }
  const back = thr < 0, want = back ? yaw + Math.PI + steer / PILOT.gain : yaw + steer / PILOT.gain;
  out.goX = m * Math.sin(want); out.goZ = m * Math.cos(want); out.goBack = back; return out;
}
