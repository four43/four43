// Particle pool on one InstancedMesh of small cubes + a tire-mark ring buffer on a second InstancedMesh. Two draw calls, no per-frame allocation.
import * as THREE from 'three';
const MAX = 1200, TM = 400;
export function createFx(scene, groundY = () => 0) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  const P = Array.from({ length: MAX }, () => ({ life: 0, dead: true, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, max: 1, g: 0, drag: 0, spin: 0, gy: 0 }));
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), axis = new THREE.Vector3(0.3, 1, 0.2).normalize(), up = new THREE.Vector3(0, 1, 0);
  m4.makeScale(0, 0, 0); for (let i = 0; i < MAX; i++) { mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.set('#fff')); }
  scene.add(mesh);
  let next = 0, colorDirty = false;
  // color: any THREE.Color input, or null when `col` was already set by the caller (no string parsing in hot paths)
  const emit = (x, y, z, vx, vy, vz, size, life, color, g = 9.8, drag = 0.5) => {
    const i = next; next = (next + 1) % MAX; const p = P[i];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.life = p.max = life; p.g = g; p.drag = drag; p.spin = Math.random() * 6; p.dead = false; p.gy = groundY(x, z);
    mesh.setColorAt(i, color === null ? col : col.set(color)); colorDirty = true;
  };
  const R = a => (Math.random() - 0.5) * a;
  const hsl = (h, l = 0.6) => col.setHSL(h, 0.85, l);
  const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.45, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#5a4630', transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), TM);
  marks.count = 0; marks.frustumCulled = false; scene.add(marks); let tmNext = 0;
  return {
    stars(x, y, z) { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; emit(x, y, z, Math.cos(a) * 5, 3, Math.sin(a) * 5, 0.22, 0.6, '#ffd84a', 2); } },
    gravel(x, z, dx, dz, n = 3) { const gy = groundY(x, z); for (let i = 0; i < n; i++) emit(x + R(0.4), gy + 0.2, z + R(0.4), -dx * 4 + R(3), 2 + Math.random() * 2.5, -dz * 4 + R(3), 0.09, 0.7, Math.random() < 0.5 ? '#bfa57a' : '#8d7656'); },
    dust(x, z) { emit(x + R(0.6), groundY(x, z) + 0.3, z + R(0.6), R(0.6), 0.6, R(0.6), 0.5, 1.2, '#e3d2b0', -0.2, 1.5); },
    mudSplash(x, z) { const gy = groundY(x, z); for (let i = 0; i < 10; i++) emit(x + R(1), gy + 0.3, z + R(1), R(6), 2.5 + Math.random() * 3.5, R(6), 0.24, 0.9, Math.random() < 0.5 ? '#8a5c34' : '#7a5230'); },
    // water falls from the arch (y is the start height above the ground; depth spreads it along the road); yaw is the arch's yaw: its width runs along (cos yaw, -sin yaw)
    water(x, z, yaw, y = 4.1, n = 5, spread = 14, depth = 0) { const gy = groundY(x, z) + y; for (let i = 0; i < n; i++) { const o = R(spread), d = R(depth); emit(x + o * Math.cos(yaw) + d * Math.sin(yaw), gy, z - o * Math.sin(yaw) + d * Math.cos(yaw), R(1), -1, R(1), 0.15, 0.9, '#a8e2ff', 9, 0.2); } },
    sparkles(x, y, z) { for (let i = 0; i < 12; i++) emit(x + R(2), y + R(1.5), z + R(2), R(1), 1.5, R(1), 0.2, 1, i % 2 ? '#ffffff' : '#fff1a0', -0.5); },
    confetti(x, y, z) { for (let i = 0; i < 120; i++) { hsl(Math.random()); emit(x + R(2), y, z + R(2), R(8), 6 + Math.random() * 6, R(8), 0.14, 2.5, null, 6, 1.2); } },
    rainbowTrail(x, y, z) { hsl((performance.now() / 600) % 1, 0.6); emit(x, y, z, 0, 0, 0, 0.25, 0.6, null, 0, 0); },
    sparkleTrail(points) { for (const p of points) if (Math.random() < 0.5) emit(p.x + R(1), p.y + Math.random() * 0.6, p.z + R(1), 0, 0.5, 0, 0.18, 1, '#ffe066', -0.3); },
    // a flat quad on the ground along the heading; alpha 0..1 thins it
    tireMark(x, z, yaw, alpha = 1) {
      q.setFromAxisAngle(up, yaw); s.set(0.5 + 0.5 * alpha, 1, 0.9); m4.compose(v.set(x, groundY(x, z) + 0.06, z), q, s);
      marks.setMatrixAt(tmNext, m4); tmNext = (tmNext + 1) % TM; marks.count = Math.min(TM, marks.count + 1); marks.instanceMatrix.needsUpdate = true;
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < MAX; i++) {
        const p = P[i]; if (p.dead) continue;
        if (p.life <= 0) { p.dead = true; any = true; m4.makeScale(0, 0, 0); mesh.setMatrixAt(i, m4); continue; }
        any = true; p.life -= dt; p.vy -= p.g * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k;
        p.x += p.vx * dt; p.y = Math.max(p.gy + 0.03, p.y + p.vy * dt); p.z += p.vz * dt; p.spin += dt * 4;
        const sc = p.size * Math.min(1, p.life / p.max * 2);
        m4.compose(v.set(p.x, p.y, p.z), q.setFromAxisAngle(axis, p.spin), s.set(sc, sc, sc)); mesh.setMatrixAt(i, m4);
      }
      if (any) mesh.instanceMatrix.needsUpdate = true;
      if (colorDirty && mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; colorDirty = false; }
    },
  };
}
