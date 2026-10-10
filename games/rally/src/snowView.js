// Draws the deformable snow (spec R2-6). A 256 m window of the SnowField lives in an RGBA8 texture
// re-centred around the car: smoothed height, wear, and the smoothed surface's normal (x, z),
// rebuilt on the CPU for just the cells tire marks change (after "Real-time Snow Deformation",
// Hanák 2021: blur the deformation, then precompute normals, so each pixel reads one texel).
// One mesh, displaced in the vertex shader, covers the window: 0.125 m spacing within 16 m of its
// centre, growing smoothly to a few metres at the edge. It casts shadows onto itself. Fresh snow
// gets wind-blown undulation, fine grain and glints, all fading out where it is packed.
import * as THREE from 'three';
import { SNOW, TILE, H_MAX, H_FRESH } from './snow.js';

const N = 2048;                    // window cells per side
const SIZE = N * SNOW.cell;        // 256 m
const AHEAD = 8;                   // the mesh's fine centre sits this far ahead of the car (m)
const SEG = 384, FINE_SEG = 256;   // mesh segments per side, of which the fine (one per cell) centre
const FINE = FINE_SEG / 2 * SNOW.cell; // fine half-width (16 m)
const HALF = SIZE / 2;             // mesh half-width (128 m)
const FRESH_PX = (H_FRESH | 128 << 16 | 128 << 24) >>> 0; // fresh, unworn, flat (little-endian RGBA)

// One axis of the mesh: uniform cells to +-FINE, then spacing grows smoothly (continuous slope)
// so the last vertex lands at +-HALF.
function axis() {
  const a = FINE_SEG / SEG, s0 = FINE / a, tMax = 1 - a;
  const k = (HALF - FINE - s0 * tMax) / (tMax * tMax);
  return Array.from({ length: SEG + 1 }, (_, i) => {
    const u = i / SEG * 2 - 1, au = Math.abs(u);
    const d = au <= a ? au * s0 : FINE + s0 * (au - a) + k * (au - a) ** 2;
    return Math.sign(u) * d;
  });
}

function grid() {
  const ax = axis(), n = SEG + 1, pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = (j * n + i) * 3; pos[k] = ax[i]; pos[k + 2] = ax[j]; nor[k + 1] = 1;
  }
  const idx = new Uint32Array(SEG * SEG * 6);
  let q = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Shared GLSL. snowTex: the packed texel at a world xz (fresh and flat outside the window).
// snowFresh: 1 for full-depth snow, 0 once packed. drift: wind-blown undulation of fresh snow,
// height (m) and its x/z gradient.
const GLSL = `uniform sampler2D uSnow; uniform vec2 uOrigin; uniform float uSize, uHMax, uDepth, uPacked;
  varying vec2 vSnowXZ;
  vec4 snowTex(vec2 xz) {
    vec2 uv = (xz - uOrigin) / uSize;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(uDepth / uHMax, 0.0, 0.5, 0.5);
    return texture2D(uSnow, uv);
  }
  float snowFresh(float h) { return clamp((h - uPacked) / (uDepth - uPacked), 0.0, 1.0); }
  vec3 drift(vec2 p) {
    const vec2 a = vec2(0.95, 0.42), b = vec2(0.58, -0.71), c = vec2(2.1, 1.3);
    float h = 0.012 * sin(dot(p, a)) + 0.011 * sin(dot(p, b) + 1.7) + 0.004 * sin(dot(p, c) + 0.4);
    vec2 g = 0.012 * cos(dot(p, a)) * a + 0.011 * cos(dot(p, b) + 1.7) * b + 0.004 * cos(dot(p, c) + 0.4) * c;
    return vec3(h, g);
  }
`;
const DISPLACE = `#include <begin_vertex>
  vSnowXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
  float sVh = snowTex(vSnowXZ).r * uHMax;
  transformed.y += sVh + drift(vSnowXZ).x * snowFresh(sVh);`;
const NOISE = `
  float sHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float sNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
  }
`;

export class SnowView {
  constructor(renderer, scene) {
    this.r = renderer;
    this.px = new Uint32Array(N * N);
    this.data = new Uint8Array(this.px.buffer);
    const tex = this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    this.origin = { ix: 0, iz: 0 };   // window's first cell
    this.version = -1;
    this.field = null;
    this.uniforms = {
      uSnow: { value: tex }, uOrigin: { value: new THREE.Vector2() }, uSize: { value: SIZE },
      uHMax: { value: H_MAX }, uDepth: { value: SNOW.depth }, uPacked: { value: SNOW.packed },
    };
    const mesh = this.mesh = new THREE.Mesh(grid(), this.material());
    mesh.customDepthMaterial = this.depthMaterial();
    mesh.receiveShadow = mesh.castShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
  }

  material() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = GLSL + sh.vertexShader.replace('#include <begin_vertex>', DISPLACE);
      sh.fragmentShader = GLSL + NOISE + sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          vec4 sT = snowTex(vSnowXZ);
          float sH = sT.r * uHMax, sWear = sT.g, sFr = snowFresh(sH);
          // Smoothed-surface normal from the texture, plus drift and grain on fresh snow.
          vec2 sNxz = sT.ba * 2.0 - 1.0;
          vec3 sN = vec3(sNxz.x, sqrt(max(0.0, 1.0 - dot(sNxz, sNxz))), sNxz.y);
          sN /= sN.y;
          sN.xz -= drift(vSnowXZ).yz * sFr;
          sN.xz += (vec2(sNoise(vSnowXZ * 7.0), sNoise(vSnowXZ * 7.0 + 31.0)) - 0.5) * 0.12 * sFr;
          sN.xz += (vec2(sNoise(vSnowXZ * 31.0), sNoise(vSnowXZ * 31.0 + 17.0)) - 0.5) * 0.06 * sFr;
          // Glints: a few crystals are mirror-smooth facets at random angles. Only those facing
          // the sun light up, so they twinkle as the view moves and go out in shadow.
          vec2 sC = floor(vSnowXZ * 40.0);
          float sGlint = step(0.985, sHash(sC)) * sFr * (1.0 - smoothstep(8.0, 25.0, length(vViewPosition)));
          sN.xz += (vec2(sHash(sC + 3.1), sHash(sC + 7.7)) - 0.5) * 0.5 * sGlint;
          sN = normalize(sN);`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 sCol = mix(vec3(0.66, 0.71, 0.79), vec3(0.95, 0.965, 0.99), sFr);
          sCol = mix(sCol, vec3(0.50, 0.66, 0.80), sWear);
          diffuseColor.rgb *= sCol;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(mix(roughnessFactor, 0.12, sWear), 0.03, sGlint);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize((viewMatrix * vec4(sN, 0.0)).xyz);`);
    };
    return m;
  }

  // Shadow-map pass with the same displacement, so rut walls and berms shade the snow.
  depthMaterial() {
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = GLSL + sh.vertexShader.replace('#include <begin_vertex>', DISPLACE);
    };
    return m;
  }

  show(on) { this.mesh.visible = on; }

  // Per frame: follow the car, refill on a new field or a big move, upload fresh tire marks.
  update(field, carPos, fwd) {
    const c = SNOW.cell;
    this.mesh.position.set(Math.round((carPos.x + fwd.x * AHEAD) / c) * c, 0, Math.round((carPos.z + fwd.z * AHEAD) / c) * c);
    const cx = (this.origin.ix + N / 2) * c, cz = (this.origin.iz + N / 2) * c;
    if (field !== this.field || field.version !== this.version || Math.abs(carPos.x - cx) > SIZE / 4 || Math.abs(carPos.z - cz) > SIZE / 4) {
      this.field = field; this.version = field.version; field.takeDirty();
      this.fill(carPos);
      return;
    }
    const d = field.takeDirty();
    if (d) this.upload(d);
  }

  fill(p) {
    const o = this.origin, c = SNOW.cell;
    o.ix = Math.round(p.x / c / TILE) * TILE - N / 2; o.iz = Math.round(p.z / c / TILE) * TILE - N / 2;
    this.uniforms.uOrigin.value.set(o.ix * c, o.iz * c);
    this.px.fill(FRESH_PX);
    for (const key of this.field.tiles.keys()) {
      const x0 = (Math.floor(key / 256) - 128) * TILE - o.ix, z0 = ((key % 256) - 128) * TILE - o.iz;
      this.process(x0 - 2, z0 - 2, x0 + TILE + 1, z0 + TILE + 1);
    }
    this.tex.needsUpdate = true;
  }

  // Rebuild the window texels in [x0..x1] x [z0..z1] (clipped): smooth the field's height with a
  // 3x3 binomial filter, then pack height, wear and the smoothed surface's normal. Returns the
  // clipped rectangle, or null if it is outside the window.
  process(x0, z0, x1, z1) {
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(N - 1, x1); z1 = Math.min(N - 1, z1);
    if (x0 > x1 || z0 > z1) return null;
    const o = this.origin, f = this.field, W = x1 - x0 + 5, H = z1 - z0 + 5;
    const raw = new Float32Array(W * H), blur = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) raw[j * W + i] = f.cell(x0 - 2 + i + o.ix, z0 - 2 + j + o.iz).h;
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const k = j * W + i;
      blur[k] = (4 * raw[k] + 2 * (raw[k - 1] + raw[k + 1] + raw[k - W] + raw[k + W])
        + raw[k - W - 1] + raw[k - W + 1] + raw[k + W - 1] + raw[k + W + 1]) / 16;
    }
    const g = H_MAX / 255 / (2 * SNOW.cell);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = (z - z0 + 2) * W + (x - x0 + 2);
      const gx = (blur[k + 1] - blur[k - 1]) * g, gz = (blur[k + W] - blur[k - W]) * g, l = Math.hypot(gx, 1, gz);
      const nx = Math.round((0.5 - 0.5 * gx / l) * 255), nz = Math.round((0.5 - 0.5 * gz / l) * 255);
      const wear = f.cell(x + o.ix, z + o.iz).w >> 8;
      this.px[z * N + x] = (Math.round(blur[k]) | wear << 8 | nx << 16 | nz << 24) >>> 0;
    }
    return { x0, z0, x1, z1 };
  }

  // Rebuild the texels a changed cell rectangle affects (the blur and normals reach 2 cells) and
  // send just that part to the GPU.
  upload(d) {
    const o = this.origin;
    const r = this.process(d.x0 - o.ix - 2, d.z0 - o.iz - 2, d.x1 - o.ix + 2, d.z1 - o.iz + 2);
    if (!r) return;
    const props = this.r.properties.get(this.tex);
    if (!props.__webglTexture || this.tex.needsUpdate) { this.tex.needsUpdate = true; return; }
    const gl = this.r.getContext();
    this.r.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, N); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, r.x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, r.z0);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, r.x0, r.z0, r.x1 - r.x0 + 1, r.z1 - r.z0 + 1, gl.RGBA, gl.UNSIGNED_BYTE, this.data);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0); gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }
}
