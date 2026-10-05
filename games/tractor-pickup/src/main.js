import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
async function main() {
  await RAPIER.init();
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe6f5');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 500); camera.position.set(0, 8, 12); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#eef7ff', '#b9a27c', 2));
  const g = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#88cc72' }));
  scene.add(g);
  const resize = () => { renderer.setSize(innerWidth, innerHeight, false); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));
}
main();
