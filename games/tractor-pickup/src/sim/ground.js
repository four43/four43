// The farm's physics on the scene's World (lion-hawk 3l; was sim/physics.js, which made its own RAPIER.World). The engine owns the
// world (S-3), steps it in 'physics.world' (60 Hz, the game's sim.hz) and frees it; this module names the collision groups and lays
// the ground: the farm's height grid as a heightfield (0.8.0; the terrain kit later) or the sandbox's flat slab. Top is y = 0.
export const DT = 1 / 60;
// wall: fences and barn walls. Bodies hit them, but wheel rays (ground | static) do not: a wheel that pokes over a wall beside its body
// would otherwise start its ray inside the wall and jack that side up.
export const GROUPS = Object.freeze(['ground', 'static', 'vehicle', 'trailer', 'prop', 'wall']);
export const PHYSICS = Object.freeze({ gravity: [0, -9.81, 0], groups: GROUPS }); // params: none, Rapier 0.21's own (pinned by the wrapper, #1)
// The terrain grid is x-major (heights[ix*n+iz], the layout Rapier itself reads); the World takes row-major heights[iz*nx+ix]
export function rowMajor({ n, heights }) {
  const out = new Float32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[j * n + i] = heights[i * n + j];
  return out;
}
export function addGround(world, { terrain = null } = {}) {
  if (terrain) {
    const { n, size, step } = terrain.grid;
    return world.heightfield({ nx: n, nz: n, cell: step, x0: -size / 2, z0: -size / 2, heights: rowMajor(terrain.grid), material: 'ground', groups: { member: ['ground'] }, fixInternalEdges: true });
  }
  return world.spawn({ tags: ['ground'], body: 'fixed', groups: { member: ['ground'] },
    colliders: [{ shape: 'box', half: [200, 0.5, 200], p: [0, -0.5, 0], q: [0, 0, 0, 1], material: 'pad' }] });
}
// wheel rays: every member bit, hitting only the ground and static colliders (today's groups(0xffff, GROUND | STATIC))
export const rayMask = world => world.groups.mask(GROUPS, ['ground', 'static']);
