// test/helpers/assets.mjs — the subset of engine.assets the view modules use (get(key)), from the baked GLBs through three's
// GLTFLoader and the meshopt decoder, as 3f's loader does. Node, no WebGL. No tests here.
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeAnimTable } from 'lion-hawk/view';
const MAN = JSON.parse(fs.readFileSync(new URL('../../baked/manifest.json', import.meta.url)));
const PHYS = JSON.parse(fs.readFileSync(new URL('../../baked/phys.json', import.meta.url)));
export async function fakeAssets(keys) { // the subset of engine.assets the view modules use: get(key)
  const l = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), out = new Map();
  for (const k of keys) { const b = fs.readFileSync(new URL(`../../baked/${MAN.models[k].glb}`, import.meta.url));
    const g = await l.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    const anim = MAN.models[k].anim ? decodeAnimTable(JSON.parse(fs.readFileSync(new URL(`../../baked/${MAN.models[k].anim}`, import.meta.url)))) : null;
    out.set(k, { scene: g.scene, clips: g.animations, anim, sockets: PHYS.models[k].sockets }); }
  return { get: k => out.get(k) };
}
