// Rapier world shared by every sim module. Ground top is y = 0.
export const DT = 1 / 60;
export const G = { GROUND: 1, STATIC: 2, VEHICLE: 4, TRAILER: 8, PROP: 16 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export function createPhysics(RAPIER) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0).setFriction(0.9)
    .setCollisionGroups(groups(G.GROUND, 0xffff)));
  return { RAPIER, world };
}
