import * as THREE from 'three';
// X-11: the size of the game view (the canvas: the full screen height when installed, see template.html). Screen items use it, not the window.
export const VIEW = { w: globalThis.innerWidth || 1, h: globalThis.innerHeight || 1 };
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), SKY = new THREE.Color('#bfe6f5');
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 90, 220);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.3, 500);
  const hemi = new THREE.HemisphereLight('#eef7ff', '#b9a27c', 1.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
  const resize = () => { // iPad (touch): pixel ratio capped at 1.5 to hold 60 fps (X-4)
    VIEW.w = canvas.clientWidth || innerWidth; VIEW.h = canvas.clientHeight || innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, navigator.maxTouchPoints > 1 ? 1.5 : 2)); renderer.setSize(VIEW.w, VIEW.h, false);
    camera.aspect = VIEW.w / VIEW.h; camera.fov = camera.aspect < 0.9 ? 64 : 60; camera.updateProjectionMatrix(); // X-12: a wider view in portrait, as Pig Pens
  };
  addEventListener('resize', resize); resize();
  // the sun's shadow box follows the tractor
  const follow = (x, z) => { sun.position.set(x - 26, 46, z + 22); sun.target.position.set(x, 0, z); };
  // E-5: bedtime. k 0 = day, 0.5 = sunset, 1 = night: the sky, the fog and the light change (intensity and color only: no new shader)
  const DAY = SKY.clone(), DUSK = new THREE.Color('#f4a76b'), NIGHT = new THREE.Color('#1b2440'), SUN = [new THREE.Color('#fff3dc'), new THREE.Color('#ffa860'), new THREE.Color('#9fb4ff')];
  const mix = (cols, k, out) => k < 0.5 ? out.copy(cols[0]).lerp(cols[1], k * 2) : out.copy(cols[1]).lerp(cols[2], k * 2 - 1);
  const setNight = k => { mix([DAY, DUSK, NIGHT], k, SKY); scene.fog.color.copy(SKY); mix(SUN, k, sun.color); hemi.intensity = 1.3 - 1.0 * k; sun.intensity = 2.1 - 1.95 * k; };
  return { renderer, scene, camera, sun, resize, follow, setNight };
}
