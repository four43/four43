// The camera rig (lion-hawk 3l, CI-10): the engine's chase rig, heading style (V-1..V-3, X-12, F-10), and view.project, one per
// page. CAM is the rig's opts object, shared by every farm's rig, so a ?tune value outlives a new farm. rig.yaw is the heading the stick
// is read against (C-2, #81): the chase rig's, or before its first follow or snap the tractor's. Nothing here writes the sim.
import { createChaseRig, makeProject } from 'lion-hawk/view';
export const CAM = {}; // filled with the heading defaults by the first createChaseRig (distance 12, height 10.2, lookAhead 11, portrait 1.25, ...)
const NDC = { nx: 0, ny: 0, nz: 0, behind: false }; let proj = null;
export const rig = {
  camera: null, chase: null, tractor: null,
  get yaw() { return rig.chase?.yaw ?? rig.tractor?.yaw ?? 0; },
  attach(camera, { canvas, tractor }) { // a fresh chase per farm; the page's camera and canvas never change
    if (rig.camera !== camera || !proj) proj = makeProject(camera, canvas);
    rig.camera = camera; rig.tractor = tractor; rig.chase = createChaseRig(camera, CAM);
  },
  follow(pose, dt) { rig.chase.follow(pose, dt); }, // pose { x, y, z, yaw, fwd, velYaw: atan2(v.x, v.z) }
  snap(pose) { rig.chase.snap(pose); },             // a new farm: straight behind; cancels a blend and a shake
  shake(a) { rig.chase?.shake(a); },                // boop 0.35, bump 0.25
  blendFrom(q) { rig.chase?.blendFrom(q, 1); },     // F-10: the show's last camera turn, eased out over 1 s
  project: (p, out) => proj(p, out),                // engine.view.project (S-1, #73): one stable function for the page
  toNdc: (x, y, z) => proj.ndc(x, y, z, NDC),       // M-77 (hud.js arrows and finder): { nx, ny, nz, behind }, one reused object
};
