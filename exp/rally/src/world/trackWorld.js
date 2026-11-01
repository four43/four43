// A generated Track as a World (spec tracks T-8, T-11): one heightfield ground collider, marker
// posts as knock-over props, static gate posts, per-position surfaces from the locator.
import { createTerrain } from 'lion-hawk/kits/terrain';
import { materialOf, surface, blendSurface } from '../surface.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { heightAt } from '../gen/terrain.js';
import { onRoad } from '../gen/edges.js';
import { SCENERY } from '../gen/scenery.js';

// Posts are flat-sided like real roadside delineators: a round post rolls down the verge like a
// pencil for ever, and damping can't stop a roll that gravity keeps feeding. Damping still stops
// knocked posts spinning and sliding (spec R3-3). r is the visual radius.
const MARKER = { h: 1.2, r: 0.06, half: [0.06, 0.6, 0.045], mass: 5, angDamp: 6, linDamp: 1.0 }; // friction: the 'marker' material
const GATE_POST = { off: 6, h: 4, r: 0.15 };   // posts ~6 m either side, outside the verge
const RECOVER_BACK = 5, RECOVER_Y = 0.6;       // m back along the road; CoM above the road
// Scenery (rally-spec R19-3), sizes at scale 1 from the models: trunks are fixed cylinders up to the lowest branches (sunk
// SCENERY.sink m, as drawn); rocks fixed round boxes in the ground group, so the wheels' rays ride up them; fence sections and
// their end posts knock-over bodies, asleep until the car wakes them, like the markers.
export const SCENERY_PHYS = {
  sink: SCENERY.sink,
  trunk: { pine: { r: 0.24, h: 2.6 }, leafy: { r: 0.26, h: 3.0 } },
  rock: { 'rock-a': { half: [0.68, 0.42, 0.7], round: 0.12 }, 'rock-b': { half: [1.08, 0.3, 0.72], round: 0.1 } },
  fence: { half: [0.08, 0.5, 1.5], y: 0.6, gap: 0.15, mass: 30, angDamp: 2, linDamp: 0.4 }, // gap: m short of each post, so neighbours never touch
  post: { half: [0.08, 0.57, 0.08], mass: 8, angDamp: 2, linDamp: 0.4 },
};

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
    this.buildScenery(lh);
  }

  buildScenery(lh) {
    const S = this.track.scenery, P = SCENERY_PHYS, I = [0, 0, 0, 1];
    if (!S) return;
    const trunks = S.trees.map((t) => {
      const k = P.trunk[t.kind], h = k.h * t.scale;
      return { shape: 'cylinder', halfHeight: h / 2, r: k.r * t.scale, p: [t.x, t.y - P.sink + h / 2, t.z], q: I, material: 'tree' };
    });
    if (trunks.length) this.treeEntity = lh.spawn({ tags: ['tree'], body: 'fixed', colliders: trunks, groups: { member: ['prop'] } });
    const rocks = S.rocks.map((r) => {
      const k = P.rock[r.kind], half = k.half.map((v) => v * r.scale);
      return { shape: 'box', half, round: k.round * r.scale, p: [r.x, r.y - P.sink * r.scale + half[1], r.z], q: yawPitchQ(r.yaw, 0), material: 'rock' };
    });
    if (rocks.length) this.rockEntity = lh.spawn({ tags: ['rock'], body: 'fixed', colliders: rocks, groups: { member: ['ground'] } });
    for (const run of S.fences) {
      for (const f of run.sections) {
        const home = { x: f.x, y: f.y, z: f.z, q: yawPitchQ(f.yaw, f.pitch), len: f.len };
        this.props.push({ e: this.makeFence(home), home, kind: 'fence' });
      }
      const p = run.end, home = { x: p.x, y: p.y, z: p.z, q: I };
      this.props.push({ e: this.makePost(home), home, kind: 'post' });
    }
    for (const p of this.props) p.body = p.e.body;
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

  // A fence section: body origin at the model's (bottom centre, between its posts), one box over post and rails.
  makeFence(home) {
    const F = SCENERY_PHYS.fence;
    return this.lh.spawn({
      tags: ['fence'], at: [home.x, home.y - SCENERY_PHYS.sink, home.z], q: home.q,
      body: { type: 'dynamic', sleep: true, canSleep: true, mass: F.mass, angularDamping: F.angDamp, linearDamping: F.linDamp },
      colliders: [{ shape: 'box', half: [F.half[0], F.half[1], home.len / 2 - F.gap], p: [0.04, F.y, 0], q: [0, 0, 0, 1], material: 'fence' }],
      groups: { member: ['prop'] },
    });
  }
  makePost(home) {
    const F = SCENERY_PHYS.post;
    return this.lh.spawn({
      tags: ['fence'], at: [home.x, home.y - SCENERY_PHYS.sink, home.z], q: home.q,
      body: { type: 'dynamic', sleep: true, canSleep: true, mass: F.mass, angularDamping: F.angDamp, linearDamping: F.linDamp },
      colliders: [{ shape: 'box', half: F.half, p: [0, F.half[1], 0], q: [0, 0, 0, 1], material: 'fence' }],
      groups: { member: ['prop'] },
    });
  }

  // Teleporting a post wakes it, so a reset respawns each one (same prop object, new entity and body: views read p.e).
  resetProps() {
    for (const p of this.props) {
      this.lh.despawn(p.e);
      p.e = p.kind === 'fence' ? this.makeFence(p.home) : p.kind === 'post' ? this.makePost(p.home) : this.makeMarker(p.home);
      p.body = p.e.body;
    }
  }

  // Back on the road centre RECOVER_BACK m behind the nearest point, facing along the road.
  recover(x, z) {
    const L = this.track.layout, { s } = this.track.locator.locate(x, z);
    const p = pointAt(L, s - RECOVER_BACK);
    return { x: p.x, y: p.road(this.track.terrain.road) + RECOVER_Y, z: p.z, yaw: p.yaw };
  }
}

// Yaw about +Y, then pitch about the turned +X (three's 'YXZ' order): a section's +Z runs from post to post.
export function yawPitchQ(yaw, pitch) {
  const sy = Math.sin(yaw / 2), cy = Math.cos(yaw / 2), sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
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
