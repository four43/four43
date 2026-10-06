// Rapier world shared by every sim module. Ground top is y = 0: a flat slab, or with a terrain its height grid.
export const DT = 1 / 60;
// WALL: fences and barn walls. Bodies hit them, but wheel rays (GROUND | STATIC) do not: a wheel that pokes over a wall
// beside its body would otherwise start its ray inside the wall and jack that side up.
export const G = { GROUND: 1, STATIC: 2, VEHICLE: 4, TRAILER: 8, PROP: 16, WALL: 32 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export function createPhysics(RAPIER, { terrain } = {}) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const cg = groups(G.GROUND, 0xffff);
  if (terrain) { // one heightfield over the farm; Rapier centers it on the origin and reads the heights column-major (x-major)
    const { n, size, heights } = terrain.grid;
    world.createCollider(RAPIER.ColliderDesc.heightfield(n - 1, n - 1, heights, { x: size, y: 1, z: size }, RAPIER.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.6).setCollisionGroups(cg));
  } else world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.9).setCollisionGroups(cg));
  return { RAPIER, world };
}
