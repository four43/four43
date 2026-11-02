// Flying grain (H-H7, H-S1): small kernels as one instanced mesh, each thrown with a velocity and pulled down by gravity until it
// lands or its time is up. The combine's chute blows them in an arc into the wagon that is filling; wagons over the silo pit drop
// them out of their floors. View only; a fixed pool, the oldest kernel reused when it is full.
import * as THREE from 'three';

const N = 400;
export const G = 9.81; // gravity on a kernel
export function createGrain(scene) {
  const geo = new THREE.BoxGeometry(0.24, 0.24, 0.24), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geo, mat, N); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const p = new Float32Array(N * 3), v = new Float32Array(N * 3), life = new Float32Array(N), floor = new Float32Array(N), col = new THREE.Color();
  const M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, Z); mesh.setColorAt(i, col.set(0xffffff)); }
  scene.add(mesh);
  let next = 0;
  return {
    // one kernel at (x, y, z) with velocity (vx, vy, vz), gone after `t` s or below y = `under`
    emit(x, y, z, vx, vy, vz, colour, t, under = 0) {
      const i = next; next = (next + 1) % N;
      p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz; life[i] = t; floor[i] = under;
      mesh.setColorAt(i, col.set(colour)); mesh.instanceColor.needsUpdate = true;
    },
    // a kernel thrown from a to land on b in t seconds
    throwTo(a, b, colour, t, jitter) {
      const vx = (b.x - a.x) / t + jitter() * 0.3, vz = (b.z - a.z) / t + jitter() * 0.3, vy = (b.y - a.y) / t + 0.5 * G * t;
      this.emit(a.x, a.y, a.z, vx, vy, vz, colour, t, -1);
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        any = true;
        life[i] -= dt; v[i * 3 + 1] -= G * dt;
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
        if (life[i] <= 0 || p[i * 3 + 1] < floor[i]) { life[i] = 0; mesh.setMatrixAt(i, Z); continue; }
        mesh.setMatrixAt(i, M.makeTranslation(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
}
