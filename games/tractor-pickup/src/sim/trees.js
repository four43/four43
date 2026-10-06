// Farmyard trees (T-31, T-34): a fixed trunk collider each, until the tractor hits one at breakSpeed or faster. Then it bursts
// (the renderer shows gibs and a stump), the tractor loses a little speed, and reset() grows it back. Pure sim: no three.
import { G, groups } from './physics.js';
import { quatAxes } from './tractor.js';

export const TREE = { breakSpeed: 4, slowdown: 0.15, regrowTime: 0.8 }; // m/s, fraction of speed lost per break, s
const FRONT = 2;        // m from the chassis center to the tractor's nose
const REACH = 0.6;      // break detection: the nose is this close to the canopy edge (r)
const NEAR = 1.2;       // bump detection: the nose is this close to the canopy edge (r), moving
const WOBBLE_TIME = 1;  // s for a wobble to die out
const TRUNK = { single: 0.7, young: 0.4 }; // collider radius

export function createTrees(phys, farm) {
  const { RAPIER, world } = phys, cg = groups(G.WALL, 0xffff);
  const list = farm.yard.obstacles.filter(o => o.kind === 'tree').map((o, id) => ({ id, x: o.x, z: o.z, r: o.r, young: !!o.young, scale: o.scale ?? 1, state: 'standing', wobble: 0, grow: 1, near: false, collider: null }));
  const addCollider = t => { t.collider = world.createCollider(RAPIER.ColliderDesc.cylinder(1.2, t.young ? TRUNK.young : TRUNK.single).setTranslation(t.x, 1.2, t.z).setFriction(0.1).setCollisionGroups(cg)); };
  const dropCollider = t => { if (t.collider) { world.removeCollider(t.collider, true); t.collider = null; } };
  list.forEach(addCollider);
  return {
    list,
    // bodies[0] is the tractor; the trailer cars after it only ever bump into trees (they are solid, never broken).
    step(dt, bodies, canBreak = true) {
      const events = [], tb = bodies[0], p = tb.translation(), { f } = quatAxes(tb.rotation()), lv = tb.linvel(), speed = Math.hypot(lv.x, lv.z);
      const hl = Math.hypot(f.x, f.z) || 1, dir = { x: f.x / hl, z: f.z / hl }, nx = p.x + dir.x * FRONT, nz = p.z + dir.z * FRONT;
      for (const t of list) {
        t.wobble = Math.max(0, t.wobble - dt / WOBBLE_TIME);
        if (t.state === 'growing') { t.grow = Math.min(1, t.grow + dt / TREE.regrowTime); if (t.grow >= 1) t.state = 'standing'; continue; }
        if (t.state !== 'standing') continue;
        const d = Math.hypot(nx - t.x, nz - t.z);
        if (d < t.r + REACH && speed >= TREE.breakSpeed && canBreak) {
          dropCollider(t); t.state = 'broken'; t.wobble = 0; t.near = false; t.grow = 0;
          tb.setLinvel({ x: lv.x * (1 - TREE.slowdown), y: lv.y, z: lv.z * (1 - TREE.slowdown) }, true);
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
