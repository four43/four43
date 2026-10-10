// Bake Kenney GLB meshes to compact vertex-coloured JSON (sRGB colours sampled once
// from the colormap; the renderer converts to linear exactly once).
import { NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import fs from 'fs';
const io = new NodeIO();
const DIR = 'assets/models/';  // Kenney Car Kit 3.1 (CC0)
const jobs = {
  'hatchback-sports': 'hatchback-sports.glb',
  'sedan-sports': 'sedan-sports.glb',
  'wheel-racing': 'wheel-racing.glb',
  'cone': 'cone.glb',
};
const out = {};
for (const [key, file] of Object.entries(jobs)) {
  const doc = await io.read(DIR + file);
  const root = doc.getRoot();
  const tex = root.listTextures()[0];
  const png = tex ? PNG.sync.read(Buffer.from(tex.getImage())) : null;
  const parts = {};
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    // world matrix of node (Kenney nodes are translation-only, children nested)
    const wm = node.getWorldMatrix();
    const P = [], C = [], I = [];
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), uv = prim.getAttribute('TEXCOORD_0');
      const mat = prim.getMaterial(); const f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
      const base = P.length / 3; const v = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        const x = wm[0]*v[0]+wm[4]*v[1]+wm[8]*v[2]+wm[12], y = wm[1]*v[0]+wm[5]*v[1]+wm[9]*v[2]+wm[13], z = wm[2]*v[0]+wm[6]*v[1]+wm[10]*v[2]+wm[14];
        P.push(+x.toFixed(4), +y.toFixed(4), +z.toFixed(4));
        let r = 255, g = 255, b = 255;
        if (png && uv) { uv.getElement(i, t);
          const px = Math.min(png.width - 1, Math.max(0, Math.floor((t[0] % 1 + 1) % 1 * png.width)));
          const py = Math.min(png.height - 1, Math.max(0, Math.floor((t[1] % 1 + 1) % 1 * png.height)));
          const o = (py * png.width + px) * 4; r = png.data[o]; g = png.data[o + 1]; b = png.data[o + 2]; }
        // factors are linear; convert to sRGB-space multiply approximately
        const fs_ = (c) => Math.round(255 * Math.pow(Math.min(1, c), 1 / 2.2));
        C.push(Math.round(r * fs_(f[0]) / 255), Math.round(g * fs_(f[1]) / 255), Math.round(b * fs_(f[2]) / 255));
      }
      const idx = prim.getIndices();
      for (let i = 0; i < idx.getCount(); i++) I.push(base + idx.getScalar(i));
    }
    parts[node.getName()] = { p: P, c: C, i: I };
  }
  out[key] = parts;
}
fs.writeFileSync('src/assets.json', JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.keys(v).map(n => n + ':' + v[n].p.length / 3)])));
console.log('bytes', fs.statSync('src/assets.json').size);
