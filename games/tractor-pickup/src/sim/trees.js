// Breakable trees and bushes (T-31, T-34, T-35). A tree has a fixed trunk collider that only the tractor hits (the trailers go
// through), until the tractor hits it at breakSpeed or faster: then it bursts (the renderer shows gibs and a stump) and the
// tractor loses a little speed. A bush is never solid: the tractor's body touching it pops it at any speed. reset() grows
// everything back. Pure sim: no three.
import { G, groups } from './physics.js';
import { quatAxes } from './tractor.js';

export const TREE = { breakSpeed: 4, slowdown: 0.15, regrowTime: 0.8, bushSpeed: 0.5 }; // m/s, fraction of speed lost per tree, s, m/s
const FRONT = 2;        // m from the chassis center to the tractor's nose
const REAR = 1.5;       // m from the chassis center to the back of the tractor
const HALF_W = 1.1;     // half the tractor's width: a bush pops when it is this close (plus its r) to the tractor's center line
const REACH = 0.6;      // tree break detection: the nose is this close to the canopy edge (r)
const NEAR = 1.2;       // bump detection: the nose is this close to the canopy edge (r), moving
const WOBBLE_TIME = 1;  // s for a wobble to die out
const TRUNK = { single: 0.7, young: 0.4 }; // collider radius

// items: { kind: 'tree' | 'bush', x, z, r, young?, scale? } from the farmyard (track.js) and the route shoulders (scenery.js)
export function createTrees(phys, items) {
  const { RAPIER, world } = phys, cg = groups(G.WALL, G.VEHICLE | G.PROP);
  const list = items.map((o, id) => ({ id, kind: o.kind === 'bush' ? 'bush' : 'tree', x: o.x, z: o.z, r: o.r, young: !!o.young, scale: o.scale ?? 1, yaw: o.yaw ?? 0, state: 'standing', wobble: 0, grow: 1, near: false, collider: null }));
  const addCollider = t => { if (t.kind === 'tree') t.collider = world.createCollider(RAPIER.ColliderDesc.cylinder(1.2, t.young ? TRUNK.young : TRUNK.single).setTranslation(t.x, 1.2, t.z).setFriction(0.1).setCollisionGroups(cg)); };
  const dropCollider = t => { if (t.collider) { world.removeCollider(t.collider, true); t.collider = null; } };
  list.forEach(addCollider);
  return {
    list,
    // bodies[0] is the tractor; only it breaks or bumps trees and bushes
    step(dt, bodies, canBreak = true) {
      const events = [], tb = bodies[0], p = tb.translation(), { f } = quatAxes(tb.rotation()), lv = tb.linvel(), speed = Math.hypot(lv.x, lv.z);
      const hl = Math.hypot(f.x, f.z) || 1, dir = { x: f.x / hl, z: f.z / hl }, nx = p.x + dir.x * FRONT, nz = p.z + dir.z * FRONT;
      let slowed = false;
      for (const t of list) {
        t.wobble = Math.max(0, t.wobble - dt / WOBBLE_TIME);
        if (t.state === 'growing') { t.grow = Math.min(1, t.grow + dt / TREE.regrowTime); if (t.grow >= 1) t.state = 'standing'; continue; }
        if (t.state !== 'standing') continue;
        if (Math.abs(t.x - p.x) > 12 || Math.abs(t.z - p.z) > 12) { t.near = false; continue; } // far away: nothing to do
        if (t.kind === 'bush') { // distance from the bush to the tractor's center line, nose to tail
          const a = Math.max(-REAR, Math.min(FRONT, (t.x - p.x) * dir.x + (t.z - p.z) * dir.z)), d = Math.hypot(t.x - p.x - dir.x * a, t.z - p.z - dir.z * a);
          if (d < t.r + HALF_W && speed > TREE.bushSpeed && canBreak) { t.state = 'broken'; t.grow = 0; events.push({ type: 'treeBreak', tree: t, dir: { ...dir }, speed }); }
          continue;
        }
        const d = Math.hypot(nx - t.x, nz - t.z);
        if (d < t.r + REACH && speed >= TREE.breakSpeed && canBreak) {
          dropCollider(t); t.state = 'broken'; t.wobble = 0; t.near = false; t.grow = 0;
          if (!slowed) { slowed = true; tb.setLinvel({ x: lv.x * (1 - TREE.slowdown), y: lv.y, z: lv.z * (1 - TREE.slowdown) }, true); } // young groups break together: one slowdown
          events.push({ type: 'treeBreak', tree: t, dir: { ...dir }, speed });
        } else if (d < t.r + NEAR && speed > 0.3) {
          if (!t.near) { t.near = true; t.wobble = 1; events.push({ type: 'treeBump', tree: t }); }
        } else if (d > t.r + NEAR + 1) t.near = false;
      }
      return events;
    },
    reset() { for (const t of list) { if (t.state === 'broken') { t.state = 'growing'; t.grow = 0; } if (!t.collider) addCollider(t); t.wobble = 0; t.near = false; } },
  };
}
