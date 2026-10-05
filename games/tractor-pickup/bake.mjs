// Bake Kenney GLBs into compact vertex-coloured geometry + pig animation tables.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const lin2srgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

// --- tiny mat4 (column-major, like three/gl) ---
const mIdent = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mMul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k*4+r] * b[c*4+k]; o[c*4+r] = s; } return o; }
function mTRS(t, q, s) {
  const [x,y,z,w] = q, x2=x+x,y2=y+y,z2=z+z, xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return [(1-(yy+zz))*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0, (xy-wz)*s[1],(1-(xx+zz))*s[1],(yz+wx)*s[1],0, (xz+wy)*s[2],(yz-wx)*s[2],(1-(xx+yy))*s[2],0, t[0],t[1],t[2],1];
}
const xfP = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]];
const xfN = (m, v) => { const r=[m[0]*v[0]+m[4]*v[1]+m[8]*v[2], m[1]*v[0]+m[5]*v[1]+m[9]*v[2], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]]; const l=Math.hypot(...r)||1; return r.map(x=>x/l); };

async function load(file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const texCache = new Map();
  function texel(tex) {
    if (!texCache.has(tex)) texCache.set(tex, PNG.sync.read(Buffer.from(tex.getImage())));
    return texCache.get(tex);
  }
  function primColors(prim) {
    const mat = prim.getMaterial(); const n = prim.getAttribute('POSITION').getCount();
    const f = mat ? mat.getBaseColorFactor() : [1,1,1,1]; const out = [];
    const tex = mat && mat.getBaseColorTexture(); const uv = prim.getAttribute('TEXCOORD_0');
    const e = [];
    for (let i = 0; i < n; i++) {
      let c = [f[0], f[1], f[2]]; // Kenney writes sRGB-looking values into the factor; use as-is
      if (tex && uv) { const png = texel(tex); uv.getElement(i, e);
        let u = ((e[0] % 1) + 1) % 1, v = ((e[1] % 1) + 1) % 1;
        const px = Math.min(png.width-1, Math.floor(u*png.width)), py = Math.min(png.height-1, Math.floor(v*png.height));
        const o = (py*png.width+px)*4; c = [png.data[o]/255*c[0], png.data[o+1]/255*c[1], png.data[o+2]/255*c[2]]; }
      out.push(...c.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
    }
    return out;
  }
  // mesh geometry of a node, transformed by matrix m
  function geom(node, m) {
    const pos = [], nrm = [], col = [], idx = []; const e = [];
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), base = pos.length / 3;
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); pos.push(...xfP(m, e)); N.getElement(i, e); nrm.push(...xfN(m, e)); }
      col.push(...primColors(prim));
      const I = prim.getIndices(); if (I) for (let i = 0; i < I.getCount(); i++) idx.push(base + I.getScalar(i)); else for (let i = 0; i < P.getCount(); i++) idx.push(base + i);
    }
    return { pos: pos.map(v => +v.toFixed(3)), nrm: nrm.map(v => +v.toFixed(2)), col, idx };
  }
  return { doc, root, geom };
}
const local = n => mTRS(n.getTranslation(), n.getRotation(), n.getScale());
function worldOf(n) { let m = local(n), p = n.getParentNode(); while (p) { m = mMul(local(p), m); p = p.getParentNode(); } return m; }

// Cube pets: per-part geometry in node-local space + per-anim per-frame pet-space matrices.
async function bakePet(file) {
  const { root, geom } = await load(file);
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  const order = ['body', 'Group', 'leg-front-left', 'leg-front-right', 'leg-back-left', 'leg-back-right', 'wing-left', 'wing-right', 'tail'];
  meshNodes.sort((a, b) => order.indexOf(a.getName()) - order.indexOf(b.getName()));
  const parts = meshNodes.map(n => ({ name: n.getName(), ...geom(n, mIdent()) }));
  const anims = {}; const FPS = 30;
  for (const a of root.listAnimations()) {
    const name = a.getName(); if (!['idle', 'walk', 'run', 'eat', 'dance', 'gesture-negative'].includes(name)) continue;
    let dur = 0; for (const s of a.listSamplers()) { const t = s.getInput().getArray(); dur = Math.max(dur, t[t.length - 1]); }
    const nf = Math.max(1, Math.round(dur * FPS));
    const sampleChan = (node, path, time) => {
      const ch = a.listChannels().find(c => c.getTargetNode() === node && c.getTargetPath() === path);
      const def = path === 'translation' ? node.getTranslation() : path === 'rotation' ? node.getRotation() : node.getScale();
      if (!ch) return def;
      const s = ch.getSampler(), T = s.getInput().getArray(), V = s.getOutput().getArray(), w = path === 'rotation' ? 4 : 3;
      if (time <= T[0]) return Array.from(V.slice(0, w));
      if (time >= T[T.length - 1]) return Array.from(V.slice((T.length - 1) * w, T.length * w));
      let i = 0; while (T[i + 1] < time) i++;
      const u = s.getInterpolation() === 'STEP' ? 0 : (time - T[i]) / (T[i + 1] - T[i]);
      const A = V.slice(i * w, i * w + w), B = V.slice(i * w + w, i * w + 2 * w);
      if (w === 4) { let d = A[0]*B[0]+A[1]*B[1]+A[2]*B[2]+A[3]*B[3]; const sg = d < 0 ? -1 : 1; const r = [0,1,2,3].map(k => A[k] * (1 - u) + sg * B[k] * u); const l = Math.hypot(...r); return r.map(x => x / l); }
      return [0,1,2].map(k => A[k] * (1 - u) + B[k] * u);
    };
    const nodeM = (n, t) => mTRS(sampleChan(n, 'translation', t), sampleChan(n, 'rotation', t), sampleChan(n, 'scale', t));
    const chainM = (n, t) => { let m = nodeM(n, t), p = n.getParentNode(); while (p) { m = mMul(nodeM(p, t), m); p = p.getParentNode(); } return m; };
    const frames = [];
    for (let f = 0; f < nf; f++) {
      const t = (f / nf) * dur;
      frames.push(meshNodes.map(n => chainM(n, t).map(v => +v.toFixed(3))));
    }
    anims[name] = { dur: +dur.toFixed(4), frames };
  }
  return { parts, anims };
}
const KENNEY = process.env.KENNEY || `${process.env.HOME}/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets`;
const NK = f => `${KENNEY}/Nature Kit/Models/GLTF format/${f}.glb`;
const PET = f => `${KENNEY}/Cube Pets/Models/GLB format/${f}.glb`;
const statics = {
  tractor: `${KENNEY}/Car Kit/Models/GLB format/tractor.glb`,
  oak: NK('tree_oak'), tree: NK('tree_default'), treeFat: NK('tree_fat'), bush: NK('plant_bushLarge'), bushS: NK('plant_bush'),
  fence: NK('fence_simple'), rock: NK('rock_smallC'), pumpkin: NK('crop_pumpkin'), corn: NK('crops_cornStageD'), grass: NK('grass_large'),
  flowerY: NK('flower_yellowB'), flowerR: NK('flower_redA'), log: NK('log'), stump: NK('stump_old'), hay: `${KENNEY}/Graveyard Kit/Models/GLB format/hay-bale.glb`,
};
const out = {};
for (const [k, f] of Object.entries(statics)) {
  const { root, geom } = await load(f);
  const parts = {};
  for (const n of root.listNodes()) if (n.getMesh()) parts[n.getName()] = geom(n, worldOf(n));
  out[k] = parts;
}
for (const p of ['pig', 'cow', 'chick', 'bunny', 'dog']) out[p] = await bakePet(PET('animal-' + p));

// Sheep and duck are recolors of the pig and the chick (the pack has neither). Same parts, same anims.
const mapCols = (pet, fn) => ({ ...pet, parts: pet.parts.map(p => { const col = p.col.slice(); for (let i = 0; i < col.length; i += 3) { const [r, g, b] = fn(col[i], col[i + 1], col[i + 2], p.name); col[i] = r; col[i + 1] = g; col[i + 2] = b; } return { ...p, col }; }) });
const isPink = (r, g, b) => r > 180 && r - g > 40 && b > g - 10;
out.sheep = mapCols(out.pig, (r, g, b) => isPink(r, g, b) ? (r - g > 90 ? [70, 62, 60] : [244, 238, 226]) : [r, g, b]); // snout/ears (deep pink) -> dark face, body -> wool
out.duck = mapCols(out.chick, (r, g, b) => (r > 245 && g > 150 && b < 120) ? [246, 246, 240] : [r, g, b]);           // yellow down -> white, beak/feet stay orange
fs.writeFileSync('src/assets.json', JSON.stringify(out));
console.log('bytes', fs.statSync('src/assets.json').size);
for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck']) console.log(pet, out[pet].parts.map(p => p.name).join(','), Object.keys(out[pet].anims).join(','));
