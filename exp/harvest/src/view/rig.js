// The camera (H-L3): the engine's chase rig in its heading style, one per page, and view.project. CAM is the rig's live opts (?tune can
// write it). rig.yaw is the heading the stick is read against (H-C1): the chase rig's, or before its first follow the combine's.
import { createChaseRig, makeProject } from 'lion-hawk/view';

// higher than Tractor Pickup's low chase: the camera looks over the carts at the cutter and the swath in front of it. Each vehicle
// has its own distances (the mower is small and close); setVehicle() writes them into CAM, the chase rig's live opts.
export const CAM = { distance: 12, height: 12.5, lookAhead: 10, lookHeight: 0, lag: 2.2, ease: 4, portrait: 1.35 };
const CAMS = {
  combine: { distance: 12, height: 12.5, lookAhead: 10 },
  mower: { distance: 7, height: 7.5, lookAhead: 5 },
  tractor: { distance: 11, height: 13, lookAhead: 9 }, // high: over the bale stack
};
const NDC = { nx: 0, ny: 0, nz: 0, behind: false }; let proj = null;
export const rig = {
  camera: null, chase: null, combine: null,
  get yaw() { return rig.chase?.yaw ?? rig.combine?.yaw ?? 0; },
  attach(camera, { canvas, combine }) {
    if (rig.camera !== camera || !proj) proj = makeProject(camera, canvas);
    rig.camera = camera; rig.combine = combine; rig.chase ??= createChaseRig(camera, CAM);
  },
  follow(pose, dt) { rig.chase.follow(pose, dt); },
  snap(pose) { rig.chase.snap(pose); },
  shake(a) { rig.chase?.shake(a); },
  setVehicle(v) { Object.assign(CAM, CAMS[v] ?? CAMS.combine); },
  project: (p, out) => proj(p, out),
  toNdc: (x, y, z) => proj.ndc(x, y, z, NDC), // { nx, ny, nz, behind }, one reused object
};
