// Pig Pens: Dr. Emmy's laptop (2.9.0, the desk in her flat), in the Furniture Kit's style but with a lid that swings: the
// kit's laptop is one mesh. Source for assets/models/custom/laptop.glb (spec: laptop.spec.json). Regenerate from
// exp/pig-pens with  node tools/models/laptop.model.mjs  (under the usual systemd-run memory cap); needs the glb-author
// skill's kit. Metres at the game's furniture scale, +Y up, origin bottom-centre, front (+Z) toward whoever types.
// Rest pose shut; `lid` pivots on the base's back top edge (rotation.x < 0 lifts it).
import { kenney, KIT } from './lib.mjs';
const { model } = await import(KIT);

const m = model('laptop');
const W = 0.44, D = 0.3, BASE_H = 0.026, LID_T = 0.016, KEY_INSET = 0.035;
const C = {
  shell:  m.material('shell',  { color: kenney('#dfeaec'), roughness: 0.9 }),
  dark:   m.material('dark',   { color: kenney('#96a7a7'), roughness: 0.9 }),
  screen: m.material('screen', { color: kenney('#2f6f8f'), roughness: 0.9 }),
  logo:   m.material('logo',   { color: kenney('#2f9c95'), roughness: 0.9 }),
};
m.part('base', m.box(W, BASE_H, D), { at: [0, 0, 0], anchor: 'bottom', material: C.shell });
// the keyboard and the trackpad: sunk 2 mm into the base, standing 1 mm proud
m.part('keys', m.box(W - 2 * KEY_INSET, 0.003, D * 0.45), { at: [0, BASE_H - 0.002, -D * 0.16], anchor: 'bottom', material: C.dark });
m.part('trackpad', m.box(0.12, 0.003, D * 0.22), { at: [0, BASE_H - 0.002, D * 0.27], anchor: 'bottom', material: C.dark });
// the lid, shut: from its hinge on the back top edge it lies forward over the base, 3 mm above the keys. The screen is
// on its underside (it faces the front once the lid is up), sunk 1 mm into the shell; a teal paw-ish dot on its top
const lid = m.group('lid', { at: [0, BASE_H + 0.004, -D / 2] });
m.part('lid_shell', m.box(W, LID_T, D), { parent: lid, at: [0, LID_T / 2, 0], anchor: 'back', material: C.shell });
m.part('screen', m.box(W - 0.05, 0.003, D - 0.05), { parent: lid, at: [0, -0.002, 0.025], anchor: 'back', material: C.screen });
m.part('logo', m.cyl(0.03, 0.03, 0.003, 12), { parent: lid, at: [0, LID_T - 0.001, D / 2], anchor: 'bottom', material: C.logo });

await m.write(new URL('../../assets/models/custom/laptop.glb', import.meta.url).pathname);
