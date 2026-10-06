// Tree gibs (T-34): wood chunks and leaf cubes from a pooled InstancedMesh (one draw call). Plain ballistic motion, no physics
// bodies. A gib bounces on y = 0, slides to a stop, rests ~3 s, then shrinks away over 1 s.
import * as THREE from 'three';

export const GIB = { cap: 600, perBurst: 40, gravity: 9.8, restitution: 0.35, bounceFriction: 0.65, restTime: 3, fadeTime: 1, maxAge: 12 };
const WOOD = ['#8a6240', '#a47850', '#6e4c30'], LEAF = ['#29c9ab', '#3fd6b4', '#1fa88f']; // wood: oak trunk tones; leaves: the oak canopy greens

// One step of a gib: { x, y, z, vx, vy, vz, ax, ay, az, wx, wy, wz, size, scale, rest, age, alive }. y is the cube center, so it rests at size / 2.
export function stepGib(g, dt) {
  if (!g.alive) return g;
  g.age = (g.age || 0) + dt;
  g.vy -= GIB.gravity * dt; g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
  g.ax += g.wx * dt; g.ay += g.wy * dt; g.az += g.wz * dt;
  const floor = g.size / 2;
  if (g.y <= floor) {
    g.y = floor;
    if (g.vy < 0) { g.vy = -g.vy * GIB.restitution; if (g.vy < 1) g.vy = 0; g.vx *= GIB.bounceFriction; g.vz *= GIB.bounceFriction; g.wx *= 0.6; g.wy *= 0.6; g.wz *= 0.6; }
    if (g.vy === 0) { // sliding on the ground
      const k = Math.exp(-6 * dt); g.vx *= k; g.vz *= k; g.wx *= k; g.wy *= k; g.wz *= k;
      if (Math.hypot(g.vx, g.vz) < 0.2) { g.vx = g.vz = g.wx = g.wy = g.wz = 0; g.rest += dt; }
    }
  }
  if (g.rest > GIB.restTime) g.scale = Math.max(0, 1 - (g.rest - GIB.restTime) / GIB.fadeTime);
  if (g.rest >= GIB.restTime + GIB.fadeTime || g.age > GIB.maxAge) g.alive = false;
  return g;
}

export function createGibs(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), GIB.cap);
  mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
  const pool = Array.from({ length: GIB.cap }, () => ({ alive: false })), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let next = 0, high = 0; // the ring index reuses the oldest gib once all 400 are live
  const rnd = (a, b) => a + Math.random() * (b - a), pick = l => l[(Math.random() * l.length) | 0];
  return {
    burst(x, y, z, dir, scale = 1, leaves = false) { // leaves: a bush, no wood
      const n = Math.round(GIB.perBurst * scale), base = Math.atan2(dir.x, dir.z);
      for (let k = 0; k < n; k++) {
        const i = next; next = (next + 1) % GIB.cap; high = Math.max(high, i + 1);
        const wood = !leaves && Math.random() < 0.35, a = base + rnd(-1, 1) * Math.PI / 3, h = rnd(2, 6) * (0.6 + 0.4 * scale);
        Object.assign(pool[i], { alive: true, x: x + rnd(-0.4, 0.4) * scale, y: y + rnd(0, 0.8) * scale, z: z + rnd(-0.4, 0.4) * scale, vx: Math.sin(a) * h, vy: rnd(4, 8), vz: Math.cos(a) * h,
          ax: rnd(0, 6), ay: rnd(0, 6), az: rnd(0, 6), wx: rnd(-9, 9), wy: rnd(-9, 9), wz: rnd(-9, 9), size: wood ? rnd(0.15, 0.35) : rnd(0.2, 0.4), scale: 1, rest: 0, age: 0 });
        mesh.setColorAt(i, C.set(wood ? pick(WOOD) : pick(LEAF)));
      }
      mesh.instanceColor.needsUpdate = true; mesh.count = high;
    },
    update(dt) {
      for (let i = 0; i < high; i++) {
        const g = pool[i];
        if (g.alive) stepGib(g, dt);
        if (g.alive) mesh.setMatrixAt(i, M.compose(P.set(g.x, g.y, g.z), Q.setFromEuler(E.set(g.ax, g.ay, g.az)), S.setScalar(g.size * g.scale)));
        else if (g.drawn) mesh.setMatrixAt(i, ZERO);
        g.drawn = g.alive;
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    get live() { return pool.reduce((n, g) => n + (g.alive ? 1 : 0), 0); },
  };
}
