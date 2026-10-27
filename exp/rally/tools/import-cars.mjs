// Import the real cars (rally-spec R16-1): copy each <id>.glb from the authoring folder (default ~/Documents/cars/models)
// into assets/models, giving every untextured primitive COLOR_0 = its material's base colour factor. glTF factors are
// linear, but the bake's palette step reads a factor as sRGB (Kenney's quirk) and would darken the paint; a primitive
// that already has COLOR_0 is left alone by the bake. Then `npm run bake`.
// Run: node tools/import-cars.mjs [dir]
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CAR_IDS } from '../src/cars.js';

const req = createRequire(fileURLToPath(import.meta.resolve('lion-hawk/bake')));
const load = name => import(pathToFileURL(req.resolve(name)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const src = process.argv[2] ?? join(homedir(), 'Documents/cars/models');
const out = fileURLToPath(new URL('../assets/models/', import.meta.url));
for (const id of CAR_IDS) {
  const doc = await io.read(join(src, `${id}.glb`)), buf = doc.getRoot().listBuffers()[0];
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (!mat || prim.getAttribute('COLOR_0') || mat.getBaseColorTexture()) continue;
    const f = mat.getBaseColorFactor(), count = prim.getAttribute('POSITION').getCount(), c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) c.set(f.slice(0, 3), i * 3);
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(c).setBuffer(buf));
    n++;
  }
  await io.write(join(out, `${id}.glb`), doc);
  console.log(`${id}: ${n} primitives coloured`);
}
