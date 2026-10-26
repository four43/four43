// exp/test/render/page.js (browser): every baked model of one game through the engine's render path, as boot's pipeline builds
// it (lion-hawk src/view/render/pipeline.js): createRenderer with the game's render options, createLightRig with its lights,
// createMaterialCompiler(registry, { shading, paint }) and createAssets with that compiler. The game's own view factory gives the
// render options (the adapter calls it, so the options are the game's, not a copy). Only the camera is the sheet's: an
// orthographic isometric one instead of the game's rig. `lh-render-game` is the game's adapter (games/<id>.js), bundled in.
import * as THREE from 'three';
import { createRenderer, createLightRig, createMaterialCompiler, createAssets } from 'lion-hawk/view';
import game from 'lh-render-game';
import ENGINE from 'lion-hawk/package.json' with { type: 'json' };
import { fit, arrange, isoCamera, overlay, frames, sizeText, installStyle } from './layout.js';

const q = new URLSearchParams(location.search), preset = q.get('preset') || 'day';
const done = r => { window.__render = r; };
const lookText = (m, def) => { // two lines: what the compiler made (tier params), then colour source and shader features
  const a = 'roughness' in m ? `r ${+m.roughness.toFixed(2)} · m ${+m.metalness.toFixed(2)}` : 'lambert';
  const f = (m.userData.lh?.features ?? []).map(x => x.toLowerCase()), b = [m.vertexColors ? 'vc' : '#' + m.color.getHexString(), ...f];
  if (f.includes('subsurface')) b.push(def.look.subsurface.color);
  return [a, b.join(' ')];
};
async function main() {
  installStyle(document);
  const render = game.render(), canvas = document.querySelector('canvas');
  const gfx = createRenderer({ canvas, dpr: render.dpr, antialias: render.antialias, shadows: render.shadows, toneMapping: render.toneMapping, exposure: render.exposure, camera: render.camera });
  const lights = render.lights === false ? null : createLightRig(gfx.scene, render.lights ?? {});
  if (lights) { if (!lights.presets.includes(preset)) throw new Error(`unknown light preset '${preset}' (this game has: ${lights.presets.join(', ')})`); lights.set(preset); }
  const shading = render.shading ?? 'physical', mc = createMaterialCompiler(game.registry, { shading, paint: render.paint });
  const manifest = render.assets.manifest, keys = Object.keys(manifest.models);
  const assets = createAssets({ manifest, base: '/baked/', compiler: mc, renderer: gfx.renderer });
  await assets.preload(keys);

  const models = keys.map(key => {
    const root = assets.clone(key, game.cloneOpts?.(key) ?? {}), mats = new Set();
    root.traverse(o => { if (o.isMesh) for (const n of o.userData.lhMat ?? []) mats.add(n); });
    const { node, size } = fit(root);
    return { node, label: key, sub: [sizeText(size), [...mats].join(', ')] };
  });
  const swatches = game.registry.ids.filter(id => game.registry.get(id).look).map(id => {
    const m = mc.get(id, { fur: false }), mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
    mesh.castShadow = mesh.receiveShadow = true;
    return { mesh, label: id, sub: lookText(m, game.registry.get(id)) };
  });
  const ground = new THREE.MeshLambertMaterial({ color: '#8c8c8c' }); // neutral grey (not a registry look)
  const { items, center, extent } = arrange(gfx.scene, models, swatches, { ground });
  lights?.follow(center.x, center.z);
  const { w, h } = gfx.size, { camera, farthest } = isoCamera(items, center, extent, w / h);
  const fog = gfx.scene.fog, fogNote = fog ? ` · fog ${fog.near}-${fog.far} m (sheet depth ≤ ${farthest.toFixed(0)} m)` : '';
  gfx.renderer.render(gfx.scene, camera); await frames(); gfx.renderer.render(gfx.scene, camera);
  overlay(document, camera, items, [
    `${game.id} · engine path (lion-hawk ${ENGINE.version}, three r${THREE.REVISION})`,
    `shading '${shading}' · toneMapping '${render.toneMapping ?? 'none'}' exposure ${render.exposure ?? 1} · lights preset '${preset}'${fogNote}`,
    `paint base '${render.paint?.base ?? 'steel'}' · ${models.length} models scaled to one cell (labels: real size, registry ids) · swatches: every registry look, no vertex colours`,
  ], { w, h });
  await frames();
  done({ ok: true, models: models.length, swatches: swatches.length, programs: gfx.renderer.info.programs?.length ?? 0, farthest, fog: fog ? [fog.near, fog.far] : null });
}
main().catch(err => { console.error(err); done({ ok: false, error: String(err?.stack ?? err) }); });
