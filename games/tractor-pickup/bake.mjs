// Bake the model files in assets/models/ (spec X-8) into compact vertex-colored geometry and Cube Pets animation tables
// (src/assets.json, embedded by the build). Edit a model, then: npm run bake && npm run build.
import fs from 'fs';
import { io, vertexColors } from './tools/glb.mjs';
const MODELS = 'assets/models';

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
  // mesh geometry of a node, transformed by matrix m
  // mesh geometry of a node, transformed by matrix m. Paint areas (W-3) come from the material names paint-body / paint-trim
  // (area 1 / 2 per vertex); a material marked keepUV (the barn's planks and shingles) keeps its UVs and gives the part its name.
  function geom(node, m) {
    const pos = [], nrm = [], col = [], idx = [], area = [], uv = [], e = []; let mat = null, hasArea = false;
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0'), base = pos.length / 3, M = prim.getMaterial();
      const a = { 'paint-body': 1, 'paint-trim': 2 }[M?.getName()] || 0, keepUV = !!M?.getExtras()?.keepUV; if (a) hasArea = true; if (keepUV) mat = M.getName();
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); pos.push(...xfP(m, e)); N.getElement(i, e); nrm.push(...xfN(m, e)); area.push(a); if (keepUV && UV) { UV.getElement(i, e); uv.push(e[0], e[1]); } }
      for (const c of vertexColors(prim)) col.push(...c);
      const I = prim.getIndices(); if (I) for (let i = 0; i < I.getCount(); i++) idx.push(base + I.getScalar(i)); else for (let i = 0; i < P.getCount(); i++) idx.push(base + i);
    }
    return { pos: pos.map(v => +v.toFixed(3)), nrm: nrm.map(v => +v.toFixed(2)), col, idx, ...(hasArea ? { area } : {}), ...(mat ? { mat, uv: uv.map(v => +v.toFixed(3)) } : {}) };
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
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken']; // animated Cube Pets (and the ones made from them)
const out = {};
for (const f of fs.readdirSync(MODELS).filter(f => f.endsWith('.glb')).sort()) {
  const name = f.slice(0, -4), file = `${MODELS}/${f}`;
  if (PETS.includes(name)) { out[name] = await bakePet(file); continue; }
  const { root, geom } = await load(file), parts = {};
  for (const n of root.listNodes()) if (n.getMesh()) parts[n.getName()] = geom(n, worldOf(n)); // world space of the file, keyed by node name
  out[name] = parts;
}
for (const need of PETS) if (!out[need]) throw new Error(`bake: ${MODELS}/${need}.glb is missing`);
fs.writeFileSync('src/assets.json', JSON.stringify(out));
console.log('bytes', fs.statSync('src/assets.json').size);
for (const pet of PETS) console.log(pet, out[pet].parts.map(p => p.name).join(','), Object.keys(out[pet].anims).join(','));
