// The farm's effects (3l: the pool and its motion are the fx kit's createParticles and createMarks, lion-hawk/kits/fx/view). The
// presets here (stars, gravel, dust, mud, water, sparkles, confetti, the rainbow trail and halo, the barn frame) are what the game
// emits. compiler: the view's material compiler (the cubes take the white 'paper' look, tinted per instance).
import { createParticles, createMarks } from 'lion-hawk/kits/fx/view';
export function createFx(scene, groundY = () => 0, { compiler } = {}) {
  const parts = createParticles({ max: 1200, gravity: 9.8, drag: 0.5, floor: groundY, material: compiler?.get('paper', { instanced: true }) ?? null });
  const marks = createMarks({ max: 400, width: 0.45, length: 0.9, heightAt: groundY, lift: 0.06 });
  scene.add(parts.mesh, marks.mesh);
  const col = parts.color;
  // the game's preset arguments (..., size, life, color, g, drag); the kit's emit takes life before size
  const emit = (x, y, z, vx, vy, vz, size, life, color, g = 9.8, drag = 0.5) => parts.emit(x, y, z, vx, vy, vz, life, size, color, g, drag);
  const R = a => (Math.random() - 0.5) * a;
  const hsl = (h, l = 0.6) => col.setHSL(h, 0.85, l);
  return {
    stars(x, y, z) { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; emit(x, y, z, Math.cos(a) * 5, 3, Math.sin(a) * 5, 0.22, 0.6, '#ffd84a', 2); } },
    gravel(x, z, dx, dz, n = 3) { const gy = groundY(x, z); for (let i = 0; i < n; i++) emit(x + R(0.4), gy + 0.2, z + R(0.4), -dx * 4 + R(3), 2 + Math.random() * 2.5, -dz * 4 + R(3), 0.09, 0.7, Math.random() < 0.5 ? '#bfa57a' : '#8d7656'); },
    dust(x, z) { emit(x + R(0.6), groundY(x, z) + 0.3, z + R(0.6), R(0.6), 0.6, R(0.6), 0.5, 1.2, '#e3d2b0', -0.2, 1.5); },
    mudSplash(x, z) { const gy = groundY(x, z); for (let i = 0; i < 10; i++) emit(x + R(1), gy + 0.3, z + R(1), R(6), 2.5 + Math.random() * 3.5, R(6), 0.24, 0.9, Math.random() < 0.5 ? '#8a5c34' : '#7a5230'); },
    // water falls from the arch (y is the start height above the ground; depth spreads it along the road); yaw is the arch's yaw: its width runs along (cos yaw, -sin yaw)
    water(x, z, yaw, y = 4.1, n = 5, spread = 14, depth = 0) { const gy = groundY(x, z) + y; for (let i = 0; i < n; i++) { const o = R(spread), d = R(depth); emit(x + o * Math.cos(yaw) + d * Math.sin(yaw), gy, z - o * Math.sin(yaw) + d * Math.cos(yaw), R(1), -1, R(1), 0.15, 0.9, '#a8e2ff', 9, 0.2); } },
    sparkles(x, y, z) { for (let i = 0; i < 12; i++) emit(x + R(2), y + R(1.5), z + R(2), R(1), 1.5, R(1), 0.2, 1, i % 2 ? '#ffffff' : '#fff1a0', -0.5); },
    confetti(x, y, z) { for (let i = 0; i < 120; i++) { hsl(Math.random()); emit(x + R(2), y, z + R(2), R(8), 6 + Math.random() * 6, R(8), 0.14, 2.5, null, 6, 1.2); } },
    // A-8, E-6: a rainbow trail: the hue runs with time; k > 0 spreads extra drops a little (a wider ribbon)
    rainbowTrail(x, y, z, k = 0) { hsl((performance.now() / 600 + k * 0.08) % 1, 0.6); emit(x + R(0.4) * k, y + R(0.4) * k, z + R(0.4) * k, 0, 0, 0, 0.3, 0.9, null, 0, 0); },
    // E-6: a slow ring of rainbow sparkles around a golden animal on the farm, so it is easy to spot from far away
    rainbowHalo(x, y, z, r = 1.3) { const a = Math.random() * Math.PI * 2; hsl(a / (Math.PI * 2)); emit(x + Math.cos(a) * r, y + Math.random() * 0.8, z + Math.sin(a) * r, 0, 0.8, 0, 0.22, 1.1, null, -0.2, 0.3); },
    // F-2: the sparkle frame around the barn door opening: bigger, brighter and tight on the outline, so it reads as a doorway
    sparkleFrame(points) { for (const [i, p] of points.entries()) if (Math.random() < 0.7) emit(p.x + R(0.2), p.y + R(0.2), p.z + R(0.2), 0, 0.2, 0, 0.3, 0.7, i % 3 ? '#ffe066' : '#ffffff', 0); },
    sparkleTrail(points) { for (const p of points) if (Math.random() < 0.5) emit(p.x + R(1), p.y + Math.random() * 0.6, p.z + R(1), 0, 0.5, 0, 0.18, 1, '#ffe066', -0.3); },
    // a flat quad on the ground along the heading; alpha 0..1 thins it
    tireMark(x, z, yaw, alpha = 1) { marks.add(x, z, Math.sin(yaw), Math.cos(yaw), alpha); },
    update(dt) { parts.update(dt); marks.update(); },
  };
}
