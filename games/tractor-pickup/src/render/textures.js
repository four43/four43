// Tiling procedural ground textures. Without them a flat ground gives no sense of speed (playtest 1).
import * as THREE from 'three';

function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
function finish(c, anisotropy) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; return t;
}
const canvas = N => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };

// Gravel: speckle and darker patches; `grid` adds a faint line every quarter tile (2 m on an 8 m tile) so motion reads at speed.
export function makeGravelTexture({ anisotropy = 1, grid = true } = {}) {
  const N = 512, c = canvas(N), g = c.getContext('2d'), rnd = lcg(7);
  g.fillStyle = '#cdb38a'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(120,90,50,${0.08 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 30 + rnd() * 60, 20 + rnd() * 40, rnd() * 3, 0, 7); g.fill(); }
  for (let i = 0; i < 2500; i++) { const l = rnd() < 0.5; g.fillStyle = l ? 'rgba(245,230,200,.5)' : 'rgba(80,60,35,.45)'; g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 2, 2 + rnd() * 2); }
  if (grid) {
    g.strokeStyle = 'rgba(90,65,35,.35)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const p = i * N / 4 + 1; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, N); g.moveTo(0, p); g.lineTo(N, p); g.stroke(); }
  }
  return finish(c, anisotropy);
}

// Grass: green base, soft lighter and darker patches, short darker blades and speckle. Wraps seamlessly (strokes are drawn at +-N too).
export function makeGrassTexture({ anisotropy = 1 } = {}) {
  const N = 512, c = canvas(N), g = c.getContext('2d'), rnd = lcg(11);
  g.fillStyle = '#86cc70'; g.fillRect(0, 0, N, N);
  const wrap = (x, y, fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) fn(x + dx, y + dy); };
  for (let i = 0; i < 22; i++) {
    const x = rnd() * N, y = rnd() * N, rx = 40 + rnd() * 70, ry = 30 + rnd() * 50, a = rnd() * 3, light = rnd() < 0.5;
    g.fillStyle = light ? `rgba(190,235,140,${0.1 + rnd() * 0.08})` : `rgba(40,110,60,${0.08 + rnd() * 0.08})`;
    wrap(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, 7); g.fill(); });
  }
  g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * N, y = rnd() * N, l = 5 + rnd() * 7, a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, dark = rnd() < 0.65;
    g.strokeStyle = dark ? `rgba(48,120,58,${0.35 + rnd() * 0.3})` : `rgba(200,240,150,${0.3 + rnd() * 0.3})`;
    wrap(x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(30,90,45,.4)' : 'rgba(230,250,180,.35)'; g.fillRect(rnd() * N, rnd() * N, 2, 2); }
  return finish(c, anisotropy);
}

// Texture coordinates from world x/z: one repeat per `meters` (the geometry must already be in world position).
export function worldUV(geo, meters) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / meters; uv[i * 2 + 1] = p.getZ(i) / meters; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}

// Barn boards (T-28): red vertical planks with dark seams, grain streaks and light weathering. One repeat is 2 m x 2 m (8 boards).
export function makePlankTexture({ anisotropy = 1 } = {}) {
  const N = 256, c = canvas(N), g = c.getContext('2d'), rnd = lcg(23), W = N / 8;
  for (let i = 0; i < 8; i++) { const k = 0.9 + rnd() * 0.16; g.fillStyle = `rgb(${Math.round(184 * k)},${Math.round(52 * k)},${Math.round(42 * k)})`; g.fillRect(i * W, 0, W, N); }
  for (let i = 0; i < 160; i++) { const x = rnd() * N, y = rnd() * N; g.fillStyle = rnd() < 0.5 ? 'rgba(90,20,15,.18)' : 'rgba(255,220,200,.12)'; g.fillRect(x, y, 1 + rnd() * 1.5, 10 + rnd() * 40); }
  for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(230,200,180,.10)'; g.beginPath(); g.ellipse(rnd() * N, rnd() * N, 6 + rnd() * 14, 20 + rnd() * 40, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(70,15,12,.85)'; for (let i = 0; i < 8; i++) g.fillRect(i * W, 0, 2, N);
  return finish(c, anisotropy);
}

// Roof shingles: dark red-brown rows of staggered tabs with a shadow line under each row. One repeat is 2 m x 2 m (8 rows).
export function makeShingleTexture({ anisotropy = 1 } = {}) {
  const N = 256, c = canvas(N), g = c.getContext('2d'), rnd = lcg(31), H = N / 8, T = N / 6;
  for (let r = 0; r < 8; r++) for (let t = -1; t < 7; t++) {
    const k = 0.85 + rnd() * 0.25, x = t * T + (r % 2) * T / 2;
    g.fillStyle = `rgb(${Math.round(112 * k)},${Math.round(58 * k)},${Math.round(50 * k)})`; g.fillRect(x, r * H, T, H);
    g.fillStyle = 'rgba(30,12,10,.55)'; g.fillRect(x, r * H, 2, H);
  }
  g.fillStyle = 'rgba(25,10,8,.6)'; for (let r = 0; r < 8; r++) g.fillRect(0, r * H, N, 3);
  return finish(c, anisotropy);
}
