// exp/test/render/layout.js (browser): the model sheet's layout, shared by the engine page (page.js) and the e03ed71 page
// (legacy-tractor.js). Models stand in a grid on a neutral ground, each scaled to one cell (its real size goes in the label),
// with a row of material swatches in front, seen by an orthographic isometric camera. Labels are DOM overlays placed under
// each item's projected bounding box.
import * as THREE from 'three';

const EL = Math.atan(1 / Math.SQRT2); // true isometric elevation (35.26°), azimuth 45°
export const U = new THREE.Vector3(1, 0, -1).normalize();    // screen right
export const V = new THREE.Vector3(1, 0, 1).normalize();     // screen down (towards the camera)
const TO_CAMERA = new THREE.Vector3(Math.cos(EL) * Math.SQRT1_2, Math.sin(EL), Math.cos(EL) * Math.SQRT1_2);
export const CELL = 2.6;                                     // a model's largest side, in metres
const PITCH = { u: 3.6, v: 7.4 };                            // cell spacing: v is wider, labels and tall models need room
const SWATCH = { r: 0.6, u: 3.0, v: 3.4 };

const fmt = n => n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2);
export const sizeText = s => `${fmt(s.x)} × ${fmt(s.y)} × ${fmt(s.z)} m`;

// root → a group whose child is root, centred on x/z, standing on y = 0, scaled so its largest side is CELL
export function fit(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const wrap = new THREE.Group(), s = CELL / Math.max(size.x, size.y, size.z, 1e-3);
  root.position.x -= c.x; root.position.y -= box.min.y; root.position.z -= c.z;
  wrap.add(root); wrap.scale.setScalar(s);
  return { node: wrap, size };
}

// models: [{ node, label, sub }] (fit() nodes); swatches: [{ mesh, label, sub }] (unit spheres, any material). Adds everything and
// a ground to scene; returns { items, center, extent } (items carry their world boxes after placement).
export function arrange(scene, models, swatches = [], { ground } = {}) {
  const cols = Math.max(4, Math.ceil(Math.sqrt(models.length * 1.6))), items = [];
  const place = (node, u, v) => { node.position.copy(U).multiplyScalar(u).addScaledVector(V, v); scene.add(node); };
  models.forEach((m, i) => { place(m.node, (i % cols) * PITCH.u, Math.floor(i / cols) * PITCH.v); items.push(m); });
  const rows = Math.ceil(models.length / cols), width = (cols - 1) * PITCH.u, sCols = Math.max(1, Math.floor(width / SWATCH.u) + 1);
  swatches.forEach((s, i) => {
    s.mesh.scale.setScalar(SWATCH.r); s.mesh.position.y = SWATCH.r;
    const g = new THREE.Group(); g.add(s.mesh); s.node = g;
    place(g, (i % sCols) * SWATCH.u, rows * PITCH.v - 0.6 + Math.floor(i / sCols) * SWATCH.v); items.push({ ...s, small: true });
  });
  scene.updateMatrixWorld(true);
  const all = new THREE.Box3();
  for (const it of items) { it.box = new THREE.Box3().setFromObject(it.node, true); all.union(it.box); }
  const center = all.getCenter(new THREE.Vector3()), size = all.getSize(new THREE.Vector3());
  if (ground) { // a neutral ground plane under everything
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 12, size.z + 12).rotateX(-Math.PI / 2), ground);
    g.position.set(center.x, -0.001, center.z); g.receiveShadow = true; scene.add(g);
  }
  return { items, center, extent: size.length() / 2 };
}

// An orthographic isometric camera framing the items, with room under each for its label
export function isoCamera(items, center, extent, aspect) {
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000), dist = extent + 6;
  cam.position.copy(center).addScaledVector(TO_CAMERA, dist); cam.lookAt(center); cam.updateMatrixWorld(true);
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, far: 0 }, p = new THREE.Vector3();
  for (const it of items) for (const c of corners(it.box)) {
    p.copy(c).applyMatrix4(cam.matrixWorldInverse);
    b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x); b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y); b.far = Math.max(b.far, -p.z);
  }
  const pad = 1.4; b.x0 -= pad; b.x1 += pad; b.y0 -= pad * 1.6; b.y1 += pad * 1.4; // bottom: the last row's labels; top: the header
  let w = b.x1 - b.x0, h = b.y1 - b.y0;
  if (w / h > aspect) { const d = (w / aspect - h) / 2; b.y0 -= d; b.y1 += d; h = w / aspect; } else { const d = (h * aspect - w) / 2; b.x0 -= d; b.x1 += d; w = h * aspect; }
  Object.assign(cam, { left: b.x0, right: b.x1, top: b.y1, bottom: b.y0, near: 0.1, far: dist + extent + 10 });
  cam.updateProjectionMatrix();
  return { camera: cam, farthest: b.far };
}

function corners(box) {
  const { min: a, max: b } = box, out = [];
  for (const x of [a.x, b.x]) for (const y of [a.y, b.y]) for (const z of [a.z, b.z]) out.push(new THREE.Vector3(x, y, z));
  return out;
}

const CSS = `body{margin:0;overflow:hidden;background:#000;font:13px/1.25 system-ui,sans-serif}canvas{position:fixed;inset:0;width:100vw;height:100vh;display:block}
#lbl{position:fixed;inset:0;pointer-events:none}.l{position:absolute;transform:translateX(-50%);text-align:center;white-space:nowrap;color:#111;
background:rgba(255,255,255,.82);border-radius:4px;padding:1px 5px}.l b{font-size:14px}.l i{display:block;font-style:normal;font-size:11px;color:#444}
.l.s{font-size:11px;padding:0 4px}.l.s b{font-size:11px}.l.s i{font-size:10px}
#hdr{position:fixed;left:12px;top:10px;color:#111;background:rgba(255,255,255,.88);border-radius:6px;padding:6px 10px;font-size:13px;max-width:70vw}`;

// the page's styles: the full-window canvas first (the renderer sizes from its CSS box), then the label overlay
export function installStyle(doc) { const st = doc.createElement('style'); st.textContent = CSS; doc.head.appendChild(st); }

export function overlay(doc, camera, items, header, { w, h }) {
  const root = doc.createElement('div'); root.id = 'lbl'; doc.body.appendChild(root);
  const p = new THREE.Vector3(), esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  for (const it of items) {
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of corners(it.box)) { p.copy(c).project(camera); const x = (p.x + 1) / 2 * w, y = (1 - p.y) / 2 * h; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const d = doc.createElement('div'); d.className = it.small ? 'l s' : 'l';
    d.style.left = `${(x0 + x1) / 2}px`; d.style.top = `${y1 + 2}px`;
    d.innerHTML = `<b>${esc(it.label)}</b>${(it.sub ?? []).map(s => `<i>${esc(s)}</i>`).join('')}`;
    root.appendChild(d);
  }
  const hd = doc.createElement('div'); hd.id = 'hdr'; hd.innerHTML = header.map(esc).join('<br>'); doc.body.appendChild(hd);
}

// three draws on the next frames; resolve after two so the canvas has the image before the screenshot
export const frames = (n = 2) => new Promise(r => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
