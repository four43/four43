// The Milestone 1 test pad as a World (spec T-1): flat ground with ramps, humps, a slope and
// cones. One surface covers the whole pad and is chosen in the settings sheet.
import { surfaceOfKey } from '../surface.js';


// Static pad features, shared by physics and renderer.
export const PAD = {
  size: 640,
  skidpad: { x: 0, z: -90, r: 40 },
  start: { x: 0, z: 40, yaw: 0 },
  ramps: [
    { x: -60, z: 70, w: 8, len: 10, h: 1.2, yaw: 0 },   // kicker
    { x: -60, z: 120, w: 8, len: 16, h: 1.6, yaw: Math.PI }, // landing ramp facing back
  ],
  bumps: [ // speed humps across the lane at x = 60 (cylinders, axis along x)
    ...Array.from({ length: 8 }, (_, i) => ({ x: 60, z: 30 + i * 9, r: 0.45, depth: 0.27, w: 10 })),
  ],
  slope: { x: 120, z: 40, w: 20, len: 40, grade: 0.10 },
};

const CONE_Y = 0.36; // cone body centre above the ground

const q4 = q => [q.x, q.y, q.z, q.w];
const ID = [0, 0, 0, 1];

// Static pad features as inline World colliders (overview §4.3 entry shape), all 'rally-ground': the flat ground
// first (snow binds to it), then ramps, humps and the slope. Shared with the renderer through PAD.
export function padColliders(pad = PAD) {
  const half = pad.size / 2, out = [];
  out.push({ shape: 'box', half: [half, 1, half], p: [0, -1, 0], q: ID, material: 'rally-ground' });
  for (const r of pad.ramps) {
    const ang = Math.atan2(r.h, r.len), hl = Math.hypot(r.len, r.h) / 2, thick = 0.5;
    // Box whose top face is the ramp surface; centred so the low edge meets the ground.
    const cx = r.x + Math.sin(r.yaw) * (r.len / 2), cz = r.z + Math.cos(r.yaw) * (r.len / 2), cy = r.h / 2 - thick * Math.cos(ang);
    out.push({ shape: 'box', half: [r.w / 2, thick, hl], p: [cx, cy, cz], q: q4(quatYX(r.yaw, -ang)), material: 'rally-ground' });
  }
  for (const b of pad.bumps) {
    out.push({ shape: 'cylinder', halfHeight: b.w / 2, r: b.r, p: [b.x, -b.r + b.depth, b.z],
      q: [0, 0, Math.sin(Math.PI / 4), Math.cos(Math.PI / 4)], material: 'rally-ground' });
  }
  const s = pad.slope;
  if (s) {
    const ang = Math.atan(s.grade), thick = 1, hl = s.len / 2 / Math.cos(ang);
    // Plateau-free incline starting at ground level, rising toward +z.
    out.push({ shape: 'box', half: [s.w / 2, thick, hl], p: [s.x, s.len / 2 * s.grade - thick / Math.cos(ang), s.z + s.len / 2],
      q: q4(quatYX(0, -ang)), material: 'rally-ground' });
  }
  return out;
}

function quatYX(yaw, pitch) { // yaw about Y then pitch about local X
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
}

// A cone as a convex hull: apex and a 32-point base ring (Rapier's cone primitive isn't a phase 3 collider shape).
export function coneHull(halfHeight = 0.35, r = 0.22, n = 32) {
  const pts = [0, halfHeight, 0];
  for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; pts.push(Math.cos(a) * r, -halfHeight, Math.sin(a) * r); }
  return pts;
}

export function coneLayout(pad = PAD) {
  // Slalom gates down the left lane and a ring of cones round the skidpad.
  const out = [];
  for (let i = 0; i < 9; i++) out.push({ x: -20 + (i % 2 ? 2.5 : -2.5), z: 10 + i * 16 });
  const sp = pad.skidpad;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    out.push({ x: sp.x + Math.cos(a) * (sp.r - 5), z: sp.z + Math.sin(a) * (sp.r - 5) });
    out.push({ x: sp.x + Math.cos(a) * (sp.r + 5), z: sp.z + Math.sin(a) * (sp.r + 5) });
  }
  return out;
}

export class PadWorld {
  // opts: { pad = PAD, cones = true, surface = 'gravel' }
  constructor(opts = {}) {
    this.kind = 'pad';
    this.pad = opts.pad || PAD;
    this.withCones = opts.cones !== false;
    this.surfaceKey = opts.surface || 'gravel';
    const st = PAD.start; // spawn y is filled in by Sim from the car's ride height
    this.spawn = { x: st.x, y: null, z: st.z, yaw: st.yaw };
    this.ground = new Set();
    this.props = [];
  }

  build(lh) {
    this.lh = lh;
    this.groundEntity = lh.spawn({ tags: ['ground', 'pad'], body: 'fixed', colliders: padColliders(this.pad), groups: { member: ['ground'] } });
    this.groundCollider = this.groundEntity.colliders[0].collider;
    this.ground = new Set(this.groundEntity.colliders.map(c => c.collider.handle));
    this.props = [];
    if (!this.withCones) return;
    for (const c of coneLayout()) {
      const e = lh.spawn({ tags: ['cone'], at: [c.x, CONE_Y, c.z], body: { type: 'dynamic', mass: 3 },
        colliders: [{ shape: 'hull', points: coneHull(), p: [0, 0, 0], q: [0, 0, 0, 1], material: 'cone' }], groups: { member: ['prop'] } });
      this.props.push({ e, body: e.body, home: { x: c.x, y: CONE_Y, z: c.z, yaw: 0 }, kind: 'cone' });
    }
  }

  // 'snow' is deformable fresh snow over the flat ground (spec R2-6); the features poking
  // through it (ramps, humps, slope) are packed snow.
  setSurface(key) { this.surfaceKey = key; }
  surfaceAt() { return surfaceOfKey(this.surfaceKey === 'snow' ? 'packed' : this.surfaceKey); }

  resetProps() { for (const p of this.props) this.lh.place(p.e, { at: [p.home.x, p.home.y, p.home.z] }, { yaw: p.home.yaw }); }
}
