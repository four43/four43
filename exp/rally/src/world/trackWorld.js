// A generated Track as a World (spec tracks T-8, T-11): one heightfield ground collider, marker
// posts as knock-over props, static gate posts, per-position surfaces from the locator.
import { createTerrain } from 'lion-hawk/kits/terrain';
import { materialOf, surface, blendSurface } from '../surface.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { heightAt } from '../gen/terrain.js';
import { onRoad } from '../gen/edges.js';

// Posts are flat-sided like real roadside delineators: a round post rolls down the verge like a
// pencil for ever, and damping can't stop a roll that gravity keeps feeding. Damping still stops
// knocked posts spinning and sliding (spec R3-3). r is the visual radius.
const MARKER = { h: 1.2, r: 0.06, half: [0.06, 0.6, 0.045], mass: 5, angDamp: 6, linDamp: 1.0 }; // friction: the 'marker' material
const GATE_POST = { off: 6, h: 4, r: 0.15 };   // posts ~6 m either side, outside the verge
const RECOVER_BACK = 5, RECOVER_Y = 0.6;       // m back along the road; CoM above the road

export class TrackWorld {
  constructor(track) {
    this.kind = 'track';
    this.track = track;
    this.spawn = track.spawn;
    this.ground = new Set();
    this.props = [];
    this.blends = new Map();
  }

  build(lh) {
    const t = this.track, T = t.terrain;
    this.lh = lh;
    // The terrain kit: the heightfield entity (row-major heights; the World reorders them for Rapier) plus the
    // material and blend lookups the wheels read (M-10).
    this.blendOut = { a: null, b: null, w: 0 };
    this.terrain = createTerrain(lh, { nx: T.nx, nz: T.nz, cell: T.cell, x0: T.x0, z0: T.z0, heights: T.heights,
      material: 'rally-ground', materials: (x, z) => this.materialAt(x, z), blend: (x, z, out) => this.blendTo(x, z, out) });
    this.groundEntity = this.terrain.entity;
    this.groundCollider = this.groundEntity.colliders[0].collider;
    this.ground = new Set([this.groundCollider.handle]);
    this.props = [];
    for (const m of t.roadside.markers) {
      const home = { x: m.x, y: m.y + MARKER.h / 2, z: m.z, yaw: m.yaw }, e = this.makeMarker(home);
      this.props.push({ e, body: e.body, home, kind: 'marker' });
    }
    this.gatePosts = [];
    const posts = [];
    for (const g of t.roadside.gates) {
      for (const side of [1, -1]) {
        const x = g.x + side * GATE_POST.off * Math.cos(g.yaw), z = g.z - side * GATE_POST.off * Math.sin(g.yaw);
        const y = heightAt(T, x, z) + GATE_POST.h / 2;
        posts.push({ shape: 'cylinder', halfHeight: GATE_POST.h / 2, r: GATE_POST.r, p: [x, y, z], q: [0, 0, 0, 1], material: 'gate-post' });
        this.gatePosts.push({ x, y, z, h: GATE_POST.h, r: GATE_POST.r, gate: g.kind });
      }
    }
    this.gateEntity = lh.spawn({ tags: ['gate-post'], body: 'fixed', colliders: posts, groups: { member: ['prop'] } });
  }

  // Road inside the track's edge on that side (R10-1), else verge (M-10: the section's own surface).
  materialAt(x, z) {
    const t = this.track, { s, d } = t.locator.locate(x, z), r = roadSurfaceAt(t.surfaces, s);
    return materialOf(onRoad(t.edges, t.layout, s, d) ? r.road : r.verge);
  }
  // The kit's blend: section a → the next section's b over the last 10 m, at weight w.
  blendTo(x, z, out) {
    const t = this.track, { s, d } = t.locator.locate(x, z);
    const r = roadSurfaceAt(t.surfaces, s), road = onRoad(t.edges, t.layout, s, d);
    const a = road ? r.road : r.verge, b = r.next ? (road ? r.next.road : r.next.verge) : a;
    out.a = materialOf(a); out.b = materialOf(b); out.w = r.t;
    return out;
  }
  // The tyre surface under a wheel: the blend quantised to tenths and cached (allocation-free per step).
  surfaceAt(x, z) {
    const o = this.terrain.blendAt(x, z, this.blendOut);
    return blendSurface(this.blends, surface(o.a), surface(o.b), Math.round(o.w * 10));
  }

  // A thin post on a sloped shoulder isn't stable in Rapier once awake (most tip over within a few seconds), so posts
  // start asleep and only fall when the car wakes them: `body.sleep`, which the World puts back to sleep after their
  // first step unless something set them moving (Rapier 0.21's wake-on-insert, #2).
  makeMarker(home) {
    return this.lh.spawn({
      tags: ['marker'], at: [home.x, home.y, home.z], yaw: home.yaw,
      body: { type: 'dynamic', sleep: true, canSleep: true, mass: MARKER.mass, angularDamping: MARKER.angDamp, linearDamping: MARKER.linDamp },
      colliders: [{ shape: 'box', half: MARKER.half, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'marker' }],
      groups: { member: ['prop'] },
    });
  }

  // Teleporting a post wakes it, so a reset respawns each one (same prop object, new entity and body: views read p.e).
  resetProps() {
    for (const p of this.props) {
      this.lh.despawn(p.e);
      p.e = this.makeMarker(p.home); p.body = p.e.body;
    }
  }

  // Back on the road centre RECOVER_BACK m behind the nearest point, facing along the road.
  recover(x, z) {
    const L = this.track.layout, { s } = this.track.locator.locate(x, z);
    const p = pointAt(L, s - RECOVER_BACK);
    return { x: p.x, y: p.road(this.track.terrain.road) + RECOVER_Y, z: p.z, yaw: p.yaw };
  }
}

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
