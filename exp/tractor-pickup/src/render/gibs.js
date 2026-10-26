// Tree gibs (T-34): wood chunks and leaf cubes on the fx kit's particle pool (3l; one draw call, no physics bodies). A gib flies,
// bounces on the ground (bounce 0.35, ground friction 0.65), rests and shrinks away over the last half of its life. compiler: the
// view's material compiler.
import { createParticles } from 'lion-hawk/kits/fx/view';
import { GIB_GROUND } from '../defs/materials.js';

export const GIB = { cap: 600, perBurst: 40, gravity: 9.8, life: 5 };
const WOOD = ['#8a6240', '#a47850', '#6e4c30'], LEAF = ['#29c9ab', '#3fd6b4', '#1fa88f']; // wood: oak trunk tones; leaves: the oak canopy greens

export function createGibs(scene, { compiler, groundY = () => 0 } = {}) {
  const parts = createParticles({ max: GIB.cap, gravity: GIB.gravity, drag: 0, ...GIB_GROUND, floor: groundY, material: compiler?.get('paper', { instanced: true }) ?? null });
  scene.add(parts.mesh);
  const rnd = (a, b) => a + Math.random() * (b - a), pick = l => l[(Math.random() * l.length) | 0];
  return {
    burst(x, y, z, dir, scale = 1, leaves = false) { // leaves: a bush, no wood
      const n = Math.round(GIB.perBurst * scale), base = Math.atan2(dir.x, dir.z);
      for (let k = 0; k < n; k++) {
        const wood = !leaves && Math.random() < 0.35, a = base + rnd(-1, 1) * Math.PI / 3, h = rnd(2, 6) * (0.6 + 0.4 * scale);
        parts.emit(x + rnd(-0.4, 0.4) * scale, y + rnd(0, 0.8) * scale, z + rnd(-0.4, 0.4) * scale, Math.sin(a) * h, rnd(4, 8), Math.cos(a) * h,
          GIB.life + rnd(-0.5, 0.5), wood ? rnd(0.15, 0.35) : rnd(0.2, 0.4), wood ? pick(WOOD) : pick(LEAF));
      }
    },
    update(dt) { parts.update(dt); },
    get live() { return parts.live; },
  };
}
