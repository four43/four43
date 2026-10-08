// X-4 (review 3: stutters on the trail): three.js draws every shadow caster with one shared depth material. Instanced casters (trees,
// bushes, fences, stumps) and plain ones (props, vehicles, animals) take turns in the shadow pass, so that one material changes between
// an instanced and a plain program at each turn, and the renderer looks the program up again: a parameter object and a joined cache key,
// many times a frame. The garbage ends as a GC pause every few seconds on an iPad, worst out on the routes, where the sun's shadow box
// holds the most trees. All instanced casters get a depth material of their own, so neither material ever changes kind.
import * as THREE from 'three';
const instancedDepth = new THREE.MeshDepthMaterial(); // the same as three.js's own depth material, for instanced meshes only
export function instancedShadows(root) {
  root.traverse(o => { if (o.isInstancedMesh && o.castShadow) o.customDepthMaterial = instancedDepth; });
}
