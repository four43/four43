// The Milestone 1 test pad as a World (spec T-1): flat ground with ramps, humps, a slope and
// cones. One surface covers the whole pad and is chosen in the settings sheet.
import { SURFACES } from '../tire.js';

export const GROUP_GROUND = 0x0001, GROUP_PROP = 0x0002, GROUP_CAR = 0x0004;
export const groups = (member, filter) => (member << 16) | filter;

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

export function buildPad(R, world, pad = PAD) {
  const g = groups(GROUP_GROUND, 0xffff);
  const half = pad.size / 2;
  const ground = world.createCollider(R.ColliderDesc.cuboid(half, 1, half).setTranslation(0, -1, 0)
    .setFriction(0.8).setCollisionGroups(g));
  for (const r of pad.ramps) {
    const ang = Math.atan2(r.h, r.len);
    const hl = Math.hypot(r.len, r.h) / 2;
    const q = quatYX(r.yaw, -ang);
    // Box whose top face is the ramp surface; centred so the low edge meets the ground.
    const thick = 0.5;
    const cx = r.x + Math.sin(r.yaw) * (r.len / 2), cz = r.z + Math.cos(r.yaw) * (r.len / 2);
    const cy = r.h / 2 - thick * Math.cos(ang);
    world.createCollider(R.ColliderDesc.cuboid(r.w / 2, thick, hl).setTranslation(cx, cy, cz)
      .setRotation(q).setFriction(0.8).setCollisionGroups(g));
  }
  for (const b of pad.bumps) {
    const q = { x: 0, y: 0, z: Math.sin(Math.PI / 4), w: Math.cos(Math.PI / 4) };
    world.createCollider(R.ColliderDesc.cylinder(b.w / 2, b.r).setTranslation(b.x, -b.r + b.depth, b.z)
      .setRotation(q).setFriction(0.8).setCollisionGroups(g));
  }
  const s = pad.slope;
  if (s) {
    const ang = Math.atan(s.grade), thick = 1;
    const q = quatYX(0, -ang);
    // Plateau-free incline starting at ground level, rising toward +z.
    const hl = s.len / 2 / Math.cos(ang);
    world.createCollider(R.ColliderDesc.cuboid(s.w / 2, thick, hl)
      .setTranslation(s.x, s.len / 2 * s.grade - thick / Math.cos(ang), s.z + s.len / 2)
      .setRotation(q).setFriction(0.8).setCollisionGroups(g));
  }
  return ground;
}

function quatYX(yaw, pitch) { // yaw about Y then pitch about local X
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return { w: cy * cp, x: cy * sp, y: sy * cp, z: -sy * sp };
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

  build(R, world) {
    this.groundCollider = buildPad(R, world, this.pad);
    this.ground = new Set([this.groundCollider.handle]);
    this.props = [];
    if (!this.withCones) return;
    for (const c of coneLayout()) {
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, CONE_Y, c.z));
      world.createCollider(R.ColliderDesc.cone(0.35, 0.22).setMass(3).setFriction(0.6)
        .setCollisionGroups(groups(GROUP_PROP, 0xffff)), body);
      this.props.push({ body, home: { x: c.x, y: CONE_Y, z: c.z, yaw: 0 }, kind: 'cone' });
    }
  }

  // 'snow' is deformable fresh snow over the flat ground (spec R2-6); the features poking
  // through it (ramps, humps, slope) are packed snow.
  setSurface(key) { this.surfaceKey = key; }
  surfaceAt() { return this.surfaceKey === 'snow' ? SURFACES.packed : SURFACES[this.surfaceKey]; }

  resetProps() {
    for (const p of this.props) {
      p.body.setTranslation({ x: p.home.x, y: p.home.y, z: p.home.z }, true);
      p.body.setRotation({ x: 0, y: Math.sin(p.home.yaw / 2), z: 0, w: Math.cos(p.home.yaw / 2) }, true);
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }
}
