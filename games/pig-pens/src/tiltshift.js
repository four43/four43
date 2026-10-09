// Tilt-shift "miniature" look: a very shallow depth of field focused on the point the camera looks at.
// Real miniature photos look small because a tiny scene needs a huge aperture relative to its size, so only a thin
// slab is sharp. We fake that lens: blur grows with depth away from the focus distance, relative to that distance.
//
//   1. scene -> full-res MSAA target with a depth texture
//   2. half-res prefilter: colour + signed circle of confusion (CoC, from linear depth) packed in alpha
//   3. half-res gather blur: golden-angle spiral (Gustafsson "bokeh in a single pass"), where a sample only lands if
//      its own CoC reaches the centre, and sharper-behind samples can't smear over the centre (no halos round pigs)
//   4. full-res composite: sharp scene where CoC is ~0, blurred elsewhere, plus a little toy-like saturation + vignette
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PRE = `
#include <packing>
uniform sampler2D tColor, tDepth; uniform float near, far, focus, band, scale, nearScale;
varying vec2 vUv;
float coc(vec2 uv) {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
  float d = (z - focus) / focus;                       // relative distance from the focal plane
  return sign(d) * clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
}
void main() {
  // 2x2 box downsample of colour; CoC from the centre so edges stay put
  vec2 px = 0.5 / vec2(textureSize(tColor, 0));
  vec3 c = texture2D(tColor, vUv + vec2(-px.x, -px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, -px.y)).rgb
         + texture2D(tColor, vUv + vec2(-px.x, px.y)).rgb + texture2D(tColor, vUv + vec2(px.x, px.y)).rgb;
  gl_FragColor = vec4(c * 0.25, coc(vUv));
}`;

const BLUR = `
uniform sampler2D tHalf; uniform float maxR;          // maxR: biggest blur radius in half-res pixels
varying vec2 vUv;
#define N 40
void main() {
  vec2 px = 1.0 / vec2(textureSize(tHalf, 0));
  vec4 c0 = texture2D(tHalf, vUv);
  float rc = abs(c0.a) * maxR;
  vec3 acc = c0.rgb; float tot = 1.0, fg = 0.0;
  for (int i = 1; i < N; i++) {
    float r = sqrt(float(i) / float(N)) * maxR;         // even disc coverage
    float a = float(i) * 2.39996323;                     // golden angle
    vec4 s = texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * r * px);
    float rs = abs(s.a) * maxR;
    if (s.a > c0.a) rs = min(rs, rc * 2.0);              // behind the centre: can't bleed over something sharper
    float m = smoothstep(r - 0.5, r + 0.5, rs);
    if (s.a < c0.a) fg = max(fg, m * abs(s.a));            // how far a blurry foreground spills onto this pixel
    acc += mix(acc / tot, s.rgb, m); tot += 1.0;
  }
  gl_FragColor = vec4(acc / tot, fg);
}`;

const COMP = `
#include <packing>
uniform sampler2D tColor, tDepth, tBlur; uniform float near, far, focus, band, scale, nearScale, maxR, sat, vig;
varying vec2 vUv;
void main() {
  float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
  float d = (z - focus) / focus;
  float k = clamp((abs(d) - band) * (d < 0.0 ? nearScale : scale), 0.0, 1.0);
  vec3 sharp = texture2D(tColor, vUv).rgb;
  vec4 bl = texture2D(tBlur, vUv);
  // blend by blur radius in half-res pixels; also take the blurred layer where a blurry foreground spills over
  float w = smoothstep(0.25, 1.25, max(k, bl.a) * maxR);
  vec3 c = mix(sharp, bl.rgb, w);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, sat), 0.0);
  vec2 q = vUv - 0.5; c *= 1.0 - vig * dot(q, q) * 1.6;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export function createTiltShift(renderer, opts = {}) {
  const P = Object.assign({ on: true, band: 0.06, scale: 3.2, nearScale: 1.6, blur: 0.011, sat: 1.05, vig: 0.2 }, opts);
  const mk = (w, h, samples) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0 });
  const full = mk(1, 1, 4); full.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const half = mk(1, 1, 0), blurT = mk(1, 1, 0);
  const U = { near: { value: 1 }, far: { value: 100 }, focus: { value: 10 }, band: { value: P.band }, scale: { value: P.scale }, nearScale: { value: P.nearScale }, maxR: { value: 4 } };
  const pass = (frag, extra) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { ...U, ...extra }, depthTest: false, depthWrite: false });
  const pre = pass(PRE, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture } });
  const blur = pass(BLUR, { tHalf: { value: half.texture } });
  const comp = pass(COMP, { tColor: { value: full.texture }, tDepth: { value: full.depthTexture }, tBlur: { value: blurT.texture }, sat: { value: P.sat }, vig: { value: P.vig } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)), qScene = new THREE.Scene(), qCam = new THREE.Camera();
  quad.frustumCulled = false; qScene.add(quad);
  const run = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
  const size = new THREE.Vector2();

  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = size.x, h = size.y, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    if (full.width === w && full.height === h) return;
    full.setSize(w, h); half.setSize(hw, hh); blurT.setSize(hw, hh);
  }

  // focus: distance from the camera to the point it is looking at
  function render(scene, camera, focus) {
    if (!P.on) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    setSize();
    U.near.value = camera.near; U.far.value = camera.far; U.focus.value = focus;
    U.band.value = P.band; U.scale.value = P.scale; U.nearScale.value = P.nearScale; U.maxR.value = P.blur * full.height * 0.5;
    comp.uniforms.sat.value = P.sat; comp.uniforms.vig.value = P.vig;
    renderer.setRenderTarget(full); renderer.render(scene, camera);
    run(pre, half); run(blur, blurT); run(comp, null);
  }
  return { render, params: P };
}
