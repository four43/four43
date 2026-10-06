// Free everything a Group owns on the GPU: geometries, materials and the textures they hold (maps, plus any listed in material.userData.textures
// for textures that only a patched shader reads). Used when a new farm replaces the old one.
export function disposeTree(root) {
  root.traverse(o => {
    o.geometry?.dispose();
    if (o.isInstancedMesh) o.dispose();
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
      for (const t of m.userData?.textures || []) t.dispose();
      m.dispose();
    }
  });
}
