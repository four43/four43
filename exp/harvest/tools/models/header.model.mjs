// Harvest header: the combine's cutting table, built exactly 1 m wide so the game stretches `bar` and `reel` in X to the
// header level's width and moves `end_L` / `end_R` out to +/- width/2. Source for assets/models/custom/header.glb
// (spec: header.spec.json). Regenerate from exp/harvest with   node tools/models/header.model.mjs   (under the usual
// systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, front faces +Z (+X is the header's LEFT). Origin: the back edge centre on the ground, which hangs on the
// combine's Socket_Header. Numbers from HEADER (src/defs/models.js). Material `paint` is repainted per player.
import { HEADER as H } from '../../src/defs/models.js';
import { kenney, KIT, out, extrudeX, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('header');

const mat = {
  paint: m.material('paint', { color: kenney('#3f9e3a'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
};

// ---- numbers first
const HW = 0.5, D = H.depth, TOP = H.height;           // half width (exactly 1 m wide), depth, back wall height
const PAN = 0.1, WALL = 0.12, LIP = 0.3;                // floor pan thickness, back wall thickness, forward lip on its top
const AUG = { y: 0.4, z: 0.5, r: 0.25 };                // cross auger tube (feeds the crop to the middle)
const R = H.reel, BAT_D = 0.16, BAT_T = 0.045, BATS = 6;  // reel: radius to the bat tips, bat depth, thickness, count
const SH = 0.06, DIV = 0.12;                            // end shield thickness; crop divider reach out past the shield
const NOSE = D + 0.5;                                   // the divider's point

// ---- bar: floor pan + back wall as one side profile across the width, the cutter bar with guards, the cross auger
const bar = m.group('bar');
m.part('tray', extrudeX(m, [[0, 0], [D - 0.12, 0], [D - 0.12, PAN], [0.6, PAN], [WALL, 0.42], [WALL, TOP - 0.12], [LIP, TOP], [0, TOP]], -HW, HW),
  { parent: bar, anchor: 'none', material: mat.paint });
m.part('top_rail', m.box(2 * HW, 0.07, 0.07), { parent: bar, at: [0, TOP, LIP - 0.03], material: mat.trim });
m.part('cutter_bar', m.box(2 * HW, 0.07, 0.14), { parent: bar, at: [0, 0, D - 0.07], anchor: 'bottom', material: mat.metal });
m.part('guards', merge(Array.from({ length: 10 }, (_, i) => ({ geo: m.box(0.04, 0.035, 0.14), at: [-HW + 0.05 + i * 0.1, 0.035, D + 0.06] }))),
  { parent: bar, anchor: 'none', material: mat.metal });
m.part('auger', m.cyl(AUG.r, AUG.r, 2 * HW, 8), { parent: bar, at: [0, AUG.y, AUG.z], geoRot: [0, 0, 90], material: mat.metal });

// ---- reel: node origin on its axle; bats are paddles out to radius R.r; spider arms at both ends and the middle
const reel = m.group('reel', { at: [0, R.y, R.z] });
m.part('reel_axle', m.cyl(0.07, 0.07, 2 * HW, 8), { parent: reel, geoRot: [0, 0, 90], material: mat.metal });
const ang = i => 360 * i / BATS, rad = d => d * Math.PI / 180;
m.part('reel_bats', merge(Array.from({ length: BATS }, (_, i) => {
  const a = rad(ang(i)), rho = R.r - BAT_D / 2;
  return { geo: m.box(2 * HW, BAT_D, BAT_T), at: [0, rho * Math.cos(a), rho * Math.sin(a)], rot: [ang(i), 0, 0] };
})), { parent: reel, anchor: 'none', material: mat.trim });
m.part('reel_arms', merge([-HW + 0.02, 0, HW - 0.02].flatMap(x => Array.from({ length: BATS }, (_, i) => {
  const a = rad(ang(i)), len = R.r - BAT_D + 0.02;
  return { geo: m.box(0.035, len, 0.035), at: [x, len / 2 * Math.cos(a), len / 2 * Math.sin(a)], rot: [ang(i), 0, 0] };
}))), { parent: reel, anchor: 'none', material: mat.trim });

// ---- end shields: pivot at the inner edge (x = +/-0.5); a side plate with a pointed crop divider, and the reel's support arm
function end(id, s) {
  const e = m.group(`end_${id}`, { at: [s * HW, 0, 0] });
  const [x0, x1] = s > 0 ? [0, SH] : [-SH, 0];
  m.part(`shield_${id}`, extrudeX(m, [[0, 0], [D + 0.25, 0], [D + 0.25, 0.14], [0.95, 0.5], [0.3, TOP + 0.05], [0, TOP + 0.05]], x0, x1),
    { parent: e, anchor: 'none', material: mat.paint });
  // divider: a four-sided cone lying along +Z, its point at NOSE, hugging the ground beside the shield
  m.part(`divider_${id}`, m.cone(0.09, NOSE - (D - 0.25), 4), { parent: e, at: [s * (DIV - 0.09 + 0.0), 0.11, (NOSE + D - 0.25) / 2], geoRot: [90, 45, 0], material: mat.trim });
  // reel support arm from the top of the back wall forward to the reel axle, with a bearing on the end
  m.beam(`reel_arm_${id}`, [s * (HW + SH + 0.035), TOP - 0.05, 0.2], [s * (HW + SH + 0.035), R.y, R.z], { parent: e, size: 0.07, material: mat.metal });
  m.part(`bearing_${id}`, m.cyl(0.11, 0.11, 0.08, 8), { parent: e, at: [s * (SH / 2 + 0.01), R.y, R.z], geoRot: [0, 0, 90], material: mat.metal });
}
end('L', 1);
end('R', -1);

await m.write(out('header'));
