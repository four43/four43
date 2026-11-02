// Tiling procedural ground textures (after Tractor Pickup's render/textures.js), sampled in world space so the ground stays sharp at
// any size: grass, gravel, and a grey detail texture the fields multiply their cell colours by. Made once per page.
import * as THREE from 'three';

function lcg(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const canvas = N => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
function finish(c, anisotropy, colour = true) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (colour) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = anisotropy; return t;
}
// draw fn at (x, y) and its wrapped copies, so strokes across an edge tile seamlessly
const wrapped = N => (x, y, fn) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) fn(x + dx, y + dy); };

// Grass: green base, soft lighter and darker patches, short blades and speckle
export function makeGrassTexture(anisotropy = 1) {
  const N = 512, c = canvas(N), g = c.getContext('2d'), rnd = lcg(11), wrap = wrapped(N);
  g.fillStyle = '#86b84a'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * N, y = rnd() * N, rx = 40 + rnd() * 70, ry = 30 + rnd() * 50, a = rnd() * 3, light = rnd() < 0.5;
    g.fillStyle = light ? `rgba(190,225,120,${0.1 + rnd() * 0.08})` : `rgba(50,105,40,${0.08 + rnd() * 0.08})`;
    wrap(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, 7); g.fill(); });
  }
  g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * N, y = rnd() * N, l = 5 + rnd() * 7, a = -Math.PI / 2 + (rnd() - 0.5) * 1.1, dark = rnd() < 0.65;
    g.strokeStyle = dark ? `rgba(58,112,40,${0.35 + rnd() * 0.3})` : `rgba(196,230,130,${0.3 + rnd() * 0.3})`;
    wrap(x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(40,90,35,.4)' : 'rgba(225,245,170,.35)'; g.fillRect(rnd() * N, rnd() * N, 2, 2); }
  return finish(c, anisotropy);
}

// Gravel: sandy base, darker patches and light and dark speckle
export function makeGravelTexture(anisotropy = 1) {
  const N = 512, c = canvas(N), g = c.getContext('2d'), rnd = lcg(7), wrap = wrapped(N);
  g.fillStyle = '#cdb184'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * N, y = rnd() * N, rx = 30 + rnd() * 60, ry = 20 + rnd() * 40, a = rnd() * 3;
    g.fillStyle = `rgba(120,90,50,${0.08 + rnd() * 0.08})`; wrap(x, y, (px, py) => { g.beginPath(); g.ellipse(px, py, rx, ry, a, 0, 7); g.fill(); });
  }
  for (let i = 0; i < 2600; i++) { const l = rnd() < 0.5; g.fillStyle = l ? 'rgba(245,230,200,.5)' : 'rgba(80,60,35,.45)'; g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 2, 2 + rnd() * 2); }
  return finish(c, anisotropy);
}

// Detail: grey round 0.8, with blades and speckle; a field's cell colour is multiplied by it (÷ 0.8), so it adds texture, not tint
export function makeDetailTexture(anisotropy = 1) {
  const N = 256, c = canvas(N), g = c.getContext('2d'), rnd = lcg(23), wrap = wrapped(N);
  g.fillStyle = 'rgb(204,204,204)'; g.fillRect(0, 0, N, N);
  g.lineWidth = 1.5; g.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * N, y = rnd() * N, l = 3 + rnd() * 5, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, v = rnd() < 0.6 ? 150 + rnd() * 30 : 230 + rnd() * 25;
    g.strokeStyle = `rgba(${v},${v},${v},.7)`; wrap(x, y, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  for (let i = 0; i < 1500; i++) { const v = rnd() < 0.5 ? 140 : 240; g.fillStyle = `rgba(${v},${v},${v},.5)`; g.fillRect(rnd() * N, rnd() * N, 1.5, 1.5); }
  return finish(c, anisotropy, false);
}

// UVs in world metres / tile on a plane laid flat at (x, z) (after rotateX(-π/2) and positioning), so neighbouring planes line up
export function worldUV(geo, x, z, tile) {
  const P = geo.attributes.position, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[2 * i] = (P.getX(i) + x) / tile; uv[2 * i + 1] = -(P.getZ(i) + z) / tile; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// A Lambert material whose colour is multiplied by `detail` sampled at the world x, z / tile (÷ 0.8: the detail's grey is 0.8)
export function withDetail(material, detail, tile) {
  material.onBeforeCompile = sh => {
    sh.uniforms.hvDetail = { value: detail };
    sh.vertexShader = 'varying vec2 vHvXZ;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHvXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D hvDetail;\nvarying vec2 vHvXZ;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      `#include <map_fragment>\ndiffuseColor.rgb *= texture2D(hvDetail, vHvXZ / ${tile.toFixed(2)}).rgb / 0.8;`);
  };
  material.customProgramCacheKey = () => `hv-detail-${tile}`;
  return material;
}
