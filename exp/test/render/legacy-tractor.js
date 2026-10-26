// exp/test/render/legacy-tractor.js (browser): Tractor Pickup's models the way the released game (git e03ed71) drew them, for
// --compare. `legacy:` modules are that commit's own files, read with `git show` by the bundler (render-models.mjs), never checked
// out: src/render/scene.js (renderer, sky, fog, hemisphere and sun) and src/render/gfx.js (src/assets.json, embedded, with its
// sRGB byte colours made linear by s2l in geoFrom). The materials are that build's: one MeshLambertMaterial({ vertexColors })
// for the tractor, trailer, hats, props and pets (vehicles3d.js, animals3d.js, farm3d.js). paintable() is vehicles3d.js's,
// copied (its module pulls in the sim).
import * as THREE from 'three';
import { createScene } from 'legacy:render/scene.js';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from 'legacy:render/gfx.js';
import { fit, arrange, isoCamera, overlay, frames, sizeText, installStyle } from './layout.js';

const PAINTS = { red: '#d8342c', yellow: '#f2c230' }; // vehicles3d.js PAINTS; a new player's START_PAINT is red body, yellow trim
function paintable(parts, { body, trim }) { // e03ed71 vehicles3d.js paintable(), applied once
  const g = geoFrom(parts), area = parts.flatMap(p => p.area || Array(p.pos.length / 3).fill(0)), src = g.attributes.color.array.slice(), lum = [], top = [0, 0, 0];
  for (let i = 0; i < area.length; i++) { const l = 0.3 * src[i * 3] + 0.6 * src[i * 3 + 1] + 0.1 * src[i * 3 + 2]; lum.push(l); top[area[i]] = Math.max(top[area[i]], l); }
  const c = new THREE.Color(), dst = g.attributes.color;
  for (let i = 0; i < area.length; i++) {
    const a = area[i]; if (!a) continue;
    const k = Math.min(1.1, 0.25 + 0.85 * lum[i] / top[a]); c.set(PAINTS[a === 1 ? body : trim]); dst.setXYZ(i, c.r * k, c.g * k, c.b * k);
  }
  return g;
}

const done = r => { window.__render = r; };
async function main() {
  installStyle(document);
  const order = JSON.parse(new URLSearchParams(location.search).get('keys') || '[]'); // the baked manifest's order, so both sheets line up
  const { renderer, scene, follow } = createScene(document.querySelector('canvas'));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), shown = [];
  const models = order.filter(k => ASSETS[k]).map(key => {
    const a = ASSETS[key], root = new THREE.Group();
    if (a.parts) { // a Cube Pet: node-local parts posed by the idle table's first frame (animals3d.js)
      a.parts.forEach((p, i) => { const m = new THREE.Mesh(geoFrom([p]), mat); m.matrixAutoUpdate = false; sampleAnim(PET_ANIMS[key], 'idle', 0, i, m.matrix); m.castShadow = true; root.add(m); });
    } else {
      const parts = Object.values(a), g = key === 'tractor' ? paintable(parts, { body: 'red', trim: 'yellow' }) : geoFrom(parts);
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; root.add(m);
    }
    shown.push(key);
    const { node, size } = fit(root);
    return { node, label: key, sub: [sizeText(size), 'Lambert · vertex colours' + (key === 'barn' ? ' (textures not drawn)' : '')] };
  });
  const missing = order.filter(k => !ASSETS[k]);
  const { items, center, extent } = arrange(scene, models, [], { ground: new THREE.MeshLambertMaterial({ color: '#8c8c8c' }) });
  follow(center.x, center.z);
  const w = innerWidth, h = innerHeight, { camera } = isoCamera(items, center, extent, w / h);
  renderer.render(scene, camera); await frames(); renderer.render(scene, camera);
  overlay(document, camera, items, [
    `tractor-pickup · released game e03ed71 path (src/assets.json + Lambert, three r${THREE.REVISION} of today's lockfile)`,
    `old scene.js: no tone mapping · hemi 1.3 · sun 2.1 (day)${missing.length ? ` · not in that build: ${missing.join(', ')}` : ''}`,
  ], { w, h });
  await frames();
  done({ ok: true, models: shown.length, missing });
}
main().catch(err => { console.error(err); done({ ok: false, error: String(err?.stack ?? err) }); });
