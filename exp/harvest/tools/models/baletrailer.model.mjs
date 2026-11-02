// Harvest bale trailer: a flatbed hay trailer on two wheels that the tractor tows; round bales ride on its deck (the game draws
// them from Socket_Bed). Source for assets/models/custom/baletrailer.glb (spec: baletrailer.spec.json). Regenerate from
// exp/harvest with   node tools/models/baletrailer.model.mjs   (under the usual systemd-run memory cap); needs the glb-author kit.
// Metres, +Y up, front (the tongue) faces +Z (+X is the trailer's LEFT), origin bottom-centre on the ground.
// Every placement comes from BALETRAILER (src/defs/models.js). Contract: bed (deck, rails, headboard, frame, tongue, mudguards),
// wheel_L / wheel_R (hub origin, spin about X), Socket_Hitch (tongue tip), Socket_Tow (the next trailer's hitch), Socket_Bed
// (the deck's top centre). No grain node: the bales are the load. Material `paint` is repainted per player.
// The wheels sit under the deck: BALETRAILER puts the tyre tops 5 cm under the deck's top, so the planks are thin (3.5 cm)
// and the mudguards are arches over the tyres, under the deck.
import { BALETRAILER as C } from '../../src/defs/models.js';
import { kenney, KIT, out, extrudeX, wheel, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('baletrailer');

const mat = {
  paint: m.material('paint', { color: kenney('#2f7fd8'), roughness: 0.7 }),
  rim:   m.material('rim',   { color: kenney('#f5c22b'), roughness: 0.7 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  wood:  m.material('wood',  { color: kenney('#c08a50'), roughness: 0.9 }),
  red:   m.material('red',   { color: kenney('#d8382c'), roughness: 0.7 }),
};

// ---- numbers first
const B = C.bed, BZ = (B.z0 + B.z1) / 2, BL = B.z1 - B.z0;   // the deck: its top, half width, ends; centre and length along z
const PLANK_T = 0.035, PLANKS = 8, GAP = 0.01;              // deck planks along z (their underside clears the tyre tops)
const PW = (2 * B.half - (PLANKS - 1) * GAP) / PLANKS;
const UNDER = B.top - PLANK_T;                              // the planks' underside: everything structural hangs below it
const W = C.wheels[0], TYRE_W = 0.26;
const BEAM = { x: 0.55, w: 0.14, y0: 0.82 };                // two main beams under the deck
const CROSS = { y0: 0.9, d: 0.1, zs: [B.z1 - 0.1, 0.9, -1.6, B.z0 + 0.1] };    // full-width cross members, clear of the wheels
const SILL = { x: B.half - 0.03, w: 0.06, y0: 0.84 };        // edge sills, front and back of the wheels
const FEND = { r0: W.r + 0.06, r1: W.r + 0.12, a0: 5, x0: W.x - TYRE_W / 2 - 0.02, x1: W.x + TYRE_W / 2 + 0.02 }; // mudguard arcs
const RAIL = { x: B.half - 0.035, w: 0.05, y0: B.top + 0.12, h: 0.08, zs: [-2.0, -1.2, -0.4, 0.4, 1.2] };       // side rails on stakes
const HEAD = { z0: B.z1 - 0.1, top: B.top + 1.2, post: 0.1 };                   // front headboard
const [, HY, HZ] = C.hitch, [, TY, TZ] = C.tow;

// ---- bed
const bed = m.group('bed');
m.part('planks', merge(Array.from({ length: PLANKS }, (_, i) => ({ geo: m.box(PW, PLANK_T, BL), at: [-B.half + PW / 2 + i * (PW + GAP), B.top - PLANK_T / 2, BZ] }))),
  { parent: bed, anchor: 'none', material: mat.wood });
m.part('beams', merge([1, -1].map(s => ({ geo: m.box(BEAM.w, UNDER - BEAM.y0, BL), at: [s * BEAM.x, (BEAM.y0 + UNDER) / 2, BZ] }))), { parent: bed, anchor: 'none', material: mat.paint });
m.part('cross_members', merge(CROSS.zs.map(z => ({ geo: m.box(2 * B.half - 0.08, UNDER - CROSS.y0, CROSS.d), at: [0, (CROSS.y0 + UNDER) / 2, z] }))), { parent: bed, anchor: 'none', material: mat.paint });
// sills along the deck's edges, broken over the wheels
const wz0 = W.z - FEND.r1 - 0.06, wz1 = W.z + FEND.r1 + 0.06;
m.part('sills', merge([1, -1].flatMap(s => [[wz1, B.z1], [B.z0, wz0]].map(([z0, z1]) => ({ geo: m.box(SILL.w, UNDER - SILL.y0, z1 - z0), at: [s * SILL.x, (SILL.y0 + UNDER) / 2, (z0 + z1) / 2] })))),
  { parent: bed, anchor: 'none', material: mat.paint });
// axle on hangers from the beams
m.part('axle', m.box(2 * W.x - TYRE_W - 0.04, 0.1, 0.1), { parent: bed, at: [0, W.y, W.z], material: mat.metal });
m.part('axle_hangers', merge([1, -1].map(s => ({ geo: m.box(0.1, BEAM.y0 - W.y + 0.02, 0.14), at: [s * BEAM.x, (BEAM.y0 + W.y) / 2, W.z] }))), { parent: bed, anchor: 'none', material: mat.metal });
// mudguards: an arch over each tyre (5° to 175°), under the deck's underside
const yAt = (r, a) => W.y + r * Math.sin(a * Math.PI / 180), zAt = (r, a) => W.z + r * Math.cos(a * Math.PI / 180);
const arch = [];
for (let i = 0; i <= 12; i++) { const a = FEND.a0 + (180 - 2 * FEND.a0) * i / 12; arch.push([zAt(FEND.r1, a), yAt(FEND.r1, a)]); }
for (let i = 12; i >= 0; i--) { const a = FEND.a0 + (180 - 2 * FEND.a0) * i / 12; arch.push([zAt(FEND.r0, a), yAt(FEND.r0, a)]); }
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', [x0, x1] = s > 0 ? [FEND.x0, FEND.x1] : [-FEND.x1, -FEND.x0];
  m.part(`fender_${id}`, extrudeX(m, arch, x0, x1), { parent: bed, anchor: 'none', material: mat.paint });
}
// low side rails on stakes, standing on the deck's edges
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R';
  m.part(`stakes_${id}`, merge(RAIL.zs.map(z => ({ geo: m.box(0.045, RAIL.y0 - B.top + 0.01, 0.07), at: [s * RAIL.x, (B.top + RAIL.y0) / 2 - 0.005, z] }))), { parent: bed, anchor: 'none', material: mat.metal });
  m.part(`rail_${id}`, m.box(RAIL.w, RAIL.h, B.z1 - 0.12 - (B.z0 + 0.06)), { parent: bed, at: [s * RAIL.x, RAIL.y0, (B.z1 - 0.12 + B.z0 + 0.06) / 2], anchor: 'bottom', material: mat.paint });
}
// headboard: two posts, a top rail and a mid rail in paint, planks filling it
const HZC = HEAD.z0 + 0.05;
m.part('head_posts', merge([1, -1].map(s => ({ geo: m.box(HEAD.post, HEAD.top - B.top, HEAD.post), at: [s * (B.half - HEAD.post / 2), (B.top + HEAD.top) / 2, HZC] }))), { parent: bed, anchor: 'none', material: mat.paint });
m.part('head_rails', merge([
  { geo: m.box(2 * B.half + 0.06, 0.12, 0.14), at: [0, HEAD.top, HZC] },
  { geo: m.box(2 * B.half - 2 * HEAD.post, 0.09, 0.05), at: [0, (B.top + HEAD.top) / 2, HZC + 0.035] },
]), { parent: bed, anchor: 'none', material: mat.paint });
m.part('head_planks', merge([0, 1, 2, 3].map(i => ({ geo: m.box(2 * B.half - 2 * HEAD.post, 0.22, 0.04), at: [0, B.top + 0.17 + i * 0.27, HZC - 0.01] }))), { parent: bed, anchor: 'none', material: mat.wood });
// A-frame tongue from the beams to the hitch eye, a jack stand
for (const s of [1, -1]) m.beam(`tongue_${s > 0 ? 'L' : 'R'}`, [s * BEAM.x, BEAM.y0 + 0.08, B.z1 - 0.25], [0, HY, HZ - 0.12], { parent: bed, size: 0.1, material: mat.paint });
m.part('hitch_eye', m.cyl(0.08, 0.08, 0.06, 8), { parent: bed, at: [0, HY, HZ - 0.07], material: mat.metal });
const JZ = B.z1 + 0.4, jf = (JZ - (B.z1 - 0.25)) / (HZ - 0.12 - (B.z1 - 0.25));      // a brace across the tongue, the jack under it
const JY = BEAM.y0 + 0.08 + (HY - BEAM.y0 - 0.08) * jf, JX = BEAM.x * (1 - jf);
m.part('tongue_brace', m.box(2 * JX + 0.04, 0.07, 0.08), { parent: bed, at: [0, JY, JZ], material: mat.paint });
m.part('jack', m.cyl(0.04, 0.04, JY - 0.12, 6), { parent: bed, at: [0, 0.12, JZ], anchor: 'bottom', material: mat.metal });
m.part('jack_foot', m.box(0.16, 0.04, 0.12), { parent: bed, at: [0, 0.08, JZ], anchor: 'bottom', material: mat.metal });
// tow: a drop bracket off the back cross member and a bar to the tow pin
m.part('tow_bracket', m.box(0.16, UNDER - TY + 0.04, 0.1), { parent: bed, at: [0, TY - 0.04, B.z0 + 0.1], anchor: 'bottom', material: mat.metal });
m.part('tow_bar', m.box(0.12, 0.08, B.z0 + 0.1 - TZ + 0.04), { parent: bed, at: [0, TY, B.z0 + 0.1], anchor: 'front', material: mat.metal });
m.part('tow_pin', m.cyl(0.03, 0.03, 0.2, 6), { parent: bed, at: [0, TY + 0.02, TZ + 0.02], material: mat.rim });
m.part('tail_lights', merge([1, -1].map(s => ({ geo: m.box(0.16, 0.08, 0.04), at: [s * (B.half - 0.15), (CROSS.y0 + UNDER) / 2, B.z0 + 0.03] }))), { parent: bed, anchor: 'none', material: mat.red });

// ---- wheels
for (const w of C.wheels) wheel(m, w.name.slice(6), w, { width: TYRE_W, lugs: 12, mat });

// ---- sockets
m.socket('Socket_Hitch', { at: C.hitch });
m.socket('Socket_Tow', { at: C.tow });
m.socket('Socket_Bed', { at: [0, B.top, BZ] });

await m.write(out('baletrailer'));
