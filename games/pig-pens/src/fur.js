// Shell fur: the plumage is drawn SHELLS more times, each copy pushed a little further out along a smoothed normal,
// and a fragment shader keeps only the parts of each shell that sit inside a "strand" of 3D cell noise. Strands taper
// towards the tips, roots are shaded darker, and the outer shells catch a soft rim light, so the boxy birds read as fluff.
// The shells live in the same geometry as the base mesh (a second group/material), so an InstancedMesh draws both
// with one set of instance matrices and colours.
import * as THREE from 'three';

export const SHELLS = 10;

// geo: indexed geometry from geoFrom; mask(i) -> 1 where vertex i is fluffy
export function furGeo(geo, mask) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count, idx = geo.index.array;
  // average normals over vertices that share a position, so shells stay closed across the hard box edges
  const sum = new Map(), key = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < n; i++) { const k = key(i), s = sum.get(k) || [0, 0, 0]; s[0] += nrm.getX(i); s[1] += nrm.getY(i); s[2] += nrm.getZ(i); sum.set(k, s); }
  const out = new THREE.BufferGeometry(), L = SHELLS + 1;
  const big = (a, size) => { const o = new Float32Array(n * L * size); for (let c = 0; c < L; c++) o.set(a, c * n * size); return o; };
  for (const k of ['position', 'normal', 'color']) out.setAttribute(k, new THREE.BufferAttribute(big(geo.attributes[k].array, 3), 3));
  const fn = new Float32Array(n * 3), fl = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = sum.get(key(i)), l = Math.hypot(...s) || 1; fn.set([s[0] / l, s[1] / l, s[2] / l], i * 3); fl[i] = mask(i); }
  out.setAttribute('furNormal', new THREE.BufferAttribute(big(fn, 3), 3));
  out.setAttribute('furMask', new THREE.BufferAttribute(big(fl, 1), 1));
  const sh = new Float32Array(n * L); for (let c = 0; c < L; c++) sh.fill(c / SHELLS, c * n, (c + 1) * n);
  out.setAttribute('furShell', new THREE.BufferAttribute(sh, 1));
  const ix = new Uint32Array(idx.length * L); for (let c = 0; c < L; c++) for (let j = 0; j < idx.length; j++) ix[c * idx.length + j] = idx[j] + c * n;
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  out.addGroup(0, idx.length, 0);                        // base mesh, normal material
  out.addGroup(idx.length, idx.length * SHELLS, 1);      // shells, fur material
  return out;
}

// len: fur length and density: strands per unit, both in model units (the cube pet is ~1.2 wide)
// bare: [min, max] model-space box where the fur is trimmed away (a face), fading back to full length over `fade`
export function furMaterial({ len = 0.07, density = 34, bare = [[0, 0, 0], [0, 0, 0]], fade = 0.14 } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.furLen = { value: len }; sh.uniforms.furDensity = { value: density }; sh.uniforms.furFade = { value: fade };
    sh.uniforms.bareMin = { value: new THREE.Vector3(...bare[0]) }; sh.uniforms.bareMax = { value: new THREE.Vector3(...bare[1]) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 furNormal; attribute float furMask, furShell; uniform float furLen;
varying vec3 vFurP; varying float vFurMask, vFurShell;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFurP = position; vFurMask = furMask; vFurShell = furShell;
transformed += (furNormal * furLen - vec3(0.0, 0.25 * furLen * furShell, 0.0)) * furShell * furMask;   // tips droop a little`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float furDensity, furFade; uniform vec3 bareMin, bareMax; varying vec3 vFurP; varying float vFurMask, vFurShell;
vec3 furHash(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
if (vFurMask < 0.5) discard;
float trim = clamp(length(max(max(bareMin - vFurP, vFurP - bareMax), 0.0)) / furFade, 0.0, 1.0);
// nearest strand in a jittered 3D grid; each strand has its own length and thins towards its tip
vec3 fp = vFurP * furDensity, fc = floor(fp); float best = 9.0, h = 0.0;
for (int i = 0; i < 8; i++) {
  vec3 c = fc + vec3(i & 1, (i >> 1) & 1, i >> 2) - 1.0 + step(0.5, fract(fp));
  vec3 r = furHash(c); float d = length(fp - (c + r * 0.8 + 0.1));
  if (d < best) { best = d; h = (0.45 + 0.55 * r.x) * trim; }
}
float aa = length(fwidth(fp));                         // far away, strands fatten into soft shells rather than shimmer
if (vFurShell > h + aa * 0.3 || best > 0.62 * (1.0 - vFurShell / h) + aa * 0.5) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= mix(0.72, 1.06, vFurShell);       // darker at the roots`)
      .replace('#include <opaque_fragment>', `float furRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);
outgoingLight += diffuseColor.rgb * furRim * vFurShell * 0.35;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'fur';
  return m;
}
