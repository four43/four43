import * as THREE from 'three';
export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), SKY = new THREE.Color('#bfe6f5');
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 90, 220);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 500);
  scene.add(new THREE.HemisphereLight('#eef7ff', '#b9a27c', 1.3));
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize); resize();
  // the sun's shadow box follows the tractor
  const follow = (x, z) => { sun.position.set(x - 26, 46, z + 22); sun.target.position.set(x, 0, z); };
  return { renderer, scene, camera, sun, resize, follow };
}
