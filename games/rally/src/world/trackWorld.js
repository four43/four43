// A generated Track as a World (spec tracks T-8, T-11): one heightfield ground collider, marker
// posts as knock-over props, static gate posts, per-position surfaces from the locator.
import { SURFACES } from '../tire.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { heightAt } from '../gen/terrain.js';
import { GROUP_GROUND, GROUP_PROP, groups } from './padWorld.js';

const HALF_ROAD = 3.5;
// Posts are flat-sided like real roadside delineators: a round post rolls down the verge like a
// pencil for ever, and damping can't stop a roll that gravity keeps feeding. Damping still stops
// knocked posts spinning and sliding (spec R3-3). r is the visual radius.
const MARKER = { h: 1.2, r: 0.06, half: [0.06, 0.6, 0.045], mass: 5, angDamp: 6, linDamp: 1.0, friction: 0.9 };
const GATE_POST = { off: 6, h: 4, r: 0.15 };   // posts ~6 m either side, outside the verge
const RECOVER_BACK = 5, RECOVER_Y = 0.6;       // m back along the road; CoM above the road
const BLEND_KEYS = ['mu', 'C', 'kp', 'ap', 'crr', 'drag'];

// Rapier heightfield from terrain heights (row-major, heights[iz * nx + ix] at (x0 + ix, z0 + iz)).
// rapier3d-compat 0.14: heightfield(nrows, ncols, ...) takes SUBDIVISION counts (rows along z,
// columns along x), heights are (nrows+1)·(ncols+1) in column-major order (index iz + ix·nz),
// `scale` is the field's full extent and the field is centred on the collider's translation.
export function heightfieldDesc(R, t) {
  const { nx, nz, heights, cell } = t, H = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) H[iz + ix * nz] = heights[iz * nx + ix];
  const sx = (nx - 1) * cell, sz = (nz - 1) * cell;
  return R.ColliderDesc.heightfield(nz - 1, nx - 1, H, { x: sx, y: 1, z: sz })
    .setTranslation(t.x0 + sx / 2, 0, t.z0 + sz / 2);
}

export class TrackWorld {
  constructor(track) {
    this.kind = 'track';
    this.track = track;
    this.spawn = track.spawn;
    this.ground = new Set();
    this.props = [];
    this.blends = new Map();
  }

  build(R, phys) {
    const t = this.track;
    this.groundCollider = phys.createCollider(heightfieldDesc(R, t.terrain).setFriction(0.8)
      .setCollisionGroups(groups(GROUP_GROUND, 0xffff)));
    this.ground = new Set([this.groundCollider.handle]);
    this.props = [];
    const pg = groups(GROUP_PROP, 0xffff);
    this.R = R; this.phys = phys;
    for (const m of t.roadside.markers) {
      const home = { x: m.x, y: m.y + MARKER.h / 2, z: m.z, yaw: m.yaw };
      this.props.push({ body: this.makeMarker(home), home, kind: 'marker' });
    }
    this.gatePosts = [];
    for (const g of t.roadside.gates) {
      for (const side of [1, -1]) {
        const x = g.x + side * GATE_POST.off * Math.cos(g.yaw), z = g.z - side * GATE_POST.off * Math.sin(g.yaw);
        const y = heightAt(t.terrain, x, z) + GATE_POST.h / 2;
        phys.createCollider(R.ColliderDesc.cylinder(GATE_POST.h / 2, GATE_POST.r).setTranslation(x, y, z)
          .setFriction(0.6).setCollisionGroups(pg));
        this.gatePosts.push({ x, y, z, h: GATE_POST.h, r: GATE_POST.r, gate: g.kind });
      }
    }
  }

  // Road within 3.5 m of the centreline, else verge; section changes blend over 10 m. Blended
  // entries are cached per (from, to, t in 0.1 steps) so this stays allocation-free per step.
  surfaceAt(x, z) {
    const t = this.track, { s, d } = t.locator.locate(x, z);
    const r = roadSurfaceAt(t.surfaces, s), road = Math.abs(d) <= HALF_ROAD;
    const a = road ? r.road : r.verge, b = r.next ? (road ? r.next.road : r.next.verge) : a;
    const q = Math.round(r.t * 10);
    if (a === b || q === 0) return SURFACES[a];
    if (q === 10) return SURFACES[b];
    const key = `${a}|${b}|${q}`;
    let e = this.blends.get(key);
    if (!e) {
      const A = SURFACES[a], B = SURFACES[b], w = q / 10;
      e = { name: `${A.name}→${B.name}` };
      for (const k of BLEND_KEYS) e[k] = A[k] + (B[k] - A[k]) * w;
      e.B = Math.tan(Math.PI / (2 * e.C));
      this.blends.set(key, e);
    }
    return e;
  }

  // A thin post on a sloped shoulder isn't stable in Rapier once awake (most tip over within a
  // few seconds), so posts start asleep and only fall when the car wakes them. Teleporting a
  // body home wakes it on the next step, so reset rebuilds each post instead (same prop object,
  // new .body: views must read p.body every frame).
  makeMarker(home) {
    const R = this.R, phys = this.phys;
    const body = phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z)
      .setRotation(yawQ(home.yaw)).setCanSleep(true).setSleeping(true)
      .setAngularDamping(MARKER.angDamp).setLinearDamping(MARKER.linDamp));
    phys.createCollider(R.ColliderDesc.cuboid(...MARKER.half).setMass(MARKER.mass)
      .setFriction(MARKER.friction).setCollisionGroups(groups(GROUP_PROP, 0xffff)), body);
    return body;
  }

  resetProps() {
    for (const p of this.props) {
      this.phys.removeRigidBody(p.body);
      p.body = this.makeMarker(p.home);
    }
  }

  // Back on the road centre RECOVER_BACK m behind the nearest point, facing along the road.
  recover(x, z) {
    const L = this.track.layout, { s } = this.track.locator.locate(x, z);
    const p = pointAt(L, s - RECOVER_BACK);
    return { x: p.x, y: p.road(this.track.terrain.road) + RECOVER_Y, z: p.z, yaw: p.yaw };
  }
}

const yawQ = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

// Centreline point at distance s (wraps on loops, clamps on stages), interpolated between samples.
export function pointAt(L, s) {
  const { n, ds, closed, length } = L;
  s = closed ? ((s % length) + length) % length : Math.min(Math.max(s, 0), length);
  let i = Math.floor(s / ds), u = s / ds - i;
  if (!closed && i >= n - 1) { i = n - 2; u = 1; }
  const j = (i + 1) % n;
  const lerp = (A) => A[i] + (A[j] - A[i]) * u;
  return { s, i, j, u, x: lerp(L.x), z: lerp(L.z), yaw: Math.atan2(L.x[j] - L.x[i], L.z[j] - L.z[i]), road: lerp };
}
