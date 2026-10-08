// X-4 (review 3: stutters): three.js keeps one program state per material. A material shared by instanced and plain meshes, or by
// meshes that do and do not receive shadows, makes the renderer look its program up again (a parameter object and a joined cache key)
// at every switch between them, many times a frame: garbage that ends as a GC pause on an iPad. Each kind of user gets its own clone.
export function splitShared(root, mat) {
  const kinds = new Map();
  root.traverse(o => {
    if (o.material !== mat) return;
    const key = `${o.isInstancedMesh ? 'i' : 'm'}${o.receiveShadow ? 'r' : ''}`;
    if (!kinds.has(key)) kinds.set(key, kinds.size ? mat.clone() : mat);
    o.material = kinds.get(key);
  });
  return [...kinds.values()];
}
