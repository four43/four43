// The view never writes the sim (#102, 2g G4b user rule; 3l Review Focus 5): no assignment into engine.scene.state or a sim game,
// no entity part writes, no Rapier setters or impulses, no World mutation, in any view-side file. And the render config is declared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from 'lion-hawk/test';
const src = fileURLToPath(new URL('../src/', import.meta.url));
const files = p => !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).flatMap(n => files(join(p, n))) : p.endsWith('.js') ? [p] : [];
const VIEW = ['view', 'render', 'ui', 'audio', 'game.view.js', 'main.js', 'devices.js'].flatMap(p => files(join(src, p)));
const WRITES = [
  /\bengine\.scene\.state(\.[\w$]+)+\s*(=|\+=|-=|\+\+|--)(?!=)/, /\b(s|state)\.game(\.[\w$]+)+\s*(=|\+=|-=)(?!=)/,
  /\.(setTranslation|setRotation|setLinvel|setAngvel|applyImpulse|applyTorqueImpulse|setNextKinematicTranslation|setNextKinematicRotation|setEnabled)\(/,
  /\bworld\.(place|spawn|despawn|add|remove|clear|setMaterial)\(/, /\be\.(xf|body|coverage|input|net|netFix|car)\b(\.[\w$]+)*\s*(=|\+=|-=)(?!=)/,
];
test('no view-side file writes the sim', () => {
  const bad = VIEW.flatMap(f => stripComments(readFileSync(f, 'utf8')).split('\n').map((l, i) => [f, i + 1, l])).filter(([, , l]) => WRITES.some(r => r.test(l))).map(([f, n, l]) => `${f}:${n}: ${l.trim()}`);
  assert.deepEqual(bad, []);
});
test('the view declares the engine render pipeline', async () => {
  const { RENDER } = await import('../src/game.view.js');
  assert.equal(RENDER.shading, 'standard'); assert.deepEqual(RENDER.dpr, { touch: 1.5, desktop: 2 }); assert.equal(RENDER.camera.fovPortrait, 64);
  const { createLightRig } = await import('lion-hawk/view'), THREE = await import('three');
  createLightRig(new THREE.Scene(), RENDER.lights).dispose(); // 3e's names (CI-8): a flat sun colour or sunIntensity throws
  assert.equal(RENDER.lights.hemiSky, '#eef7ff'); assert.equal(RENDER.lights.presets.night.sun.color, '#9fb4ff');
});
test('the per-game GPU hygiene and geometry helpers are gone; the farm builds on the engine\'s', () => {
  for (const f of ['render/matSplit.js', 'render/shadows.js', 'render/warm.js', 'render/dispose.js', 'render/gfx.js', 'render/scene.js', 'render/camera.js', 'render/vehicles3d.js', 'render/dirtMat.js', 'view/bodies.js']) assert.equal(existsSync(join(src, f)), false, f);
  const farm = readFileSync(join(src, 'render/farm3d.js'), 'utf8');
  assert.match(farm, /createInstances/); assert.doesNotMatch(farm, /new THREE\.Mesh(Lambert|Phong|Standard)Material\(/);
  for (const f of ['render/fx.js', 'render/gibs.js']) assert.match(readFileSync(join(src, f), 'utf8'), /lion-hawk\/kits\/fx\/view/, f);
});
test('others3d and poseAt are gone; riders come from train entities', () => {
  assert.equal(existsSync(join(src, 'render/others3d.js')), false); assert.doesNotMatch(readFileSync(join(src, 'game.view.js'), 'utf8'), /poseAt|others3d/);
});
