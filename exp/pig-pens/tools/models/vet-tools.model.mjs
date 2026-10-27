// Pig Pens vet's tools: ten chunky, kid-friendly tools that hang on the exam-room pegboard (flat colours, no textures).
// Source for assets/models/custom/vet-tools.glb (spec: vet-tools.spec.json). Regenerate from exp/pig-pens with
//   node tools/models/vet-tools.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Each tool is its own top-level group `tool_<name>` (the game reparents it). A tool's frame is the contract:
//   origin = its peg point (top-centre); it hangs DOWN (-Y), lies flat in XY like a thing hung on a wall,
//   back face at z ~ 0 against the board, front facing +Z; fits ~0.30 x 0.40 x 0.08 m; nothing behind z = -0.01.
//   Socket_<tool>_tip marks the business end the game points at the patient.
import { model } from '/home/smiller/.claude/skills/glb-author/scripts/kit.mjs';
import { kenney } from './lib.mjs';

const m = model('vet-tools', { flat: false });   // smooth round toys; also keeps vertices shared (KB budget)
const SPACING = 0.45;

const C = {
  white: m.material('white', { color: kenney('#f6f2e8'), roughness: 0.8 }),
  metal: m.material('metal', { color: kenney('#b9c7d6'), roughness: 0.8 }),  // "steel": light blue-grey, never metallic
  teal:  m.material('teal',  { color: kenney('#23a99c'), roughness: 0.8 }),
  red:   m.material('red',   { color: kenney('#e2483f'), roughness: 0.8 }),
  pink:  m.material('pink',  { color: kenney('#f47eb0'), roughness: 0.8 }),
  yellow:m.material('yellow',{ color: kenney('#ffcf3a'), roughness: 0.8 }),
  glass: m.material('glass', { color: kenney('#8fd0f2'), roughness: 0.8 }),  // lenses, syringe barrel
  dark:  m.material('dark',  { color: kenney('#3b4250'), roughness: 0.8 }),
};

// Shapes facing the viewer: a disc whose flat face looks +Z.
const disc = (r, h, sides = 12) => m.cyl(r, r, h, sides);
const FACE = [90, 0, 0];

let slot = 0;
// A new tool group at its slot along X; returns { g, W } where W(x,y,z) turns tool-local into world (for beams).
function tool(name) {
  const gx = (slot++ - 4.5) * SPACING;
  const g = m.group(name, { at: [gx, 0, 0] });
  return { g, W: (x, y, z) => [gx + x, y, z] };
}
const tip = (name, g, at) => m.socket(`Socket_${name}_tip`, { parent: g, at });

// ---- 1 stethoscope: two ear tips on a teal Y of tubing, a loop of tube, a round silver chest piece
{
  const { g, W } = tool('tool_stethoscope');
  const TUBE = 0.026, Z = 0.016;                 // tube diameter, tube centre depth
  const EAR_X = 0.08, EAR_Y = -0.02, FORK_Y = -0.16, LOOP_R = 0.05, LOOP_Y = -0.255, CHEST_R = 0.05, CHEST_Y = -0.335;
  for (const [id, s] of [['L', 1], ['R', -1]]) {
    m.part(`steth_ear_${id}`, m.sphere(0.02, 6, 4), { parent: g, at: [s * EAR_X, EAR_Y, Z], material: C.dark });
    m.beam(`steth_bin_${id}`, W(s * EAR_X, EAR_Y, Z), W(s * 0.065, -0.07, Z), { parent: g, size: 0.018, round: true, material: C.metal });
    m.beam(`steth_arm_${id}`, W(s * 0.065, -0.07, Z), W(0, FORK_Y, Z), { parent: g, size: TUBE, round: true, material: C.teal });
  }
  m.part('steth_fork', m.sphere(0.02, 6, 4), { parent: g, at: [0, FORK_Y, Z], material: C.metal });
  m.beam('steth_stem', W(0, FORK_Y, Z), W(0, LOOP_Y + LOOP_R, Z), { parent: g, size: TUBE, round: true, material: C.teal });
  m.part('steth_loop', m.torus(LOOP_R, TUBE / 2, 6, 14), { parent: g, at: [0, LOOP_Y, Z], material: C.teal });
  m.part('steth_chest', disc(CHEST_R, 0.03), { parent: g, at: [0, CHEST_Y, 0.02], geoRot: FACE, material: C.metal });
  m.part('steth_diaphragm', disc(CHEST_R * 0.65, 0.01), { parent: g, at: [0, CHEST_Y, 0.04], geoRot: FACE, material: C.dark });
  tip('tool_stethoscope', g, [0, CHEST_Y, 0.045]);
}

// ---- 2 otoscope: head on top (body along X, cone pointing +X, lens at -X), handle hanging below
{
  const { g } = tool('tool_otoscope');
  const HR = 0.038, HZ = 0.04, HY = -HR, HX0 = -0.07, HX1 = 0.02, CONE_L = 0.08, HANDLE_X = -0.02;
  m.part('oto_head', m.cyl(HR, HR, HX1 - HX0, 10), { parent: g, at: [(HX0 + HX1) / 2, HY, HZ], geoRot: [0, 0, 90], material: C.white });
  m.part('oto_cone', m.cyl(0.012, HR * 0.8, CONE_L, 10), { parent: g, at: [HX1, HY, HZ], geoRot: [0, 0, -90], anchor: 'left', material: C.dark });
  m.part('oto_lens', m.cyl(HR * 0.85, HR * 0.85, 0.014, 10), { parent: g, at: [HX0, HY, HZ], geoRot: [0, 0, 90], anchor: 'right', material: C.glass });
  m.part('oto_neck', m.cyl(0.026, 0.026, 0.03, 8), { parent: g, at: [HANDLE_X, HY - HR + 0.005, 0.035], anchor: 'top', material: C.metal });
  m.part('oto_handle', m.cyl(0.028, 0.028, 0.22, 8), { parent: g, at: [HANDLE_X, HY - HR - 0.02, 0.035], anchor: 'top', material: C.teal });
  for (const [i, y] of [-0.16, -0.24].entries())
    m.part(`oto_grip_${i}`, m.cyl(0.031, 0.031, 0.02, 8), { parent: g, at: [HANDLE_X, y, 0.035], material: C.metal });
  m.part('oto_cap', m.cyl(0.03, 0.024, 0.02, 8), { parent: g, at: [HANDLE_X, HY - HR - 0.24, 0.035], anchor: 'top', material: C.metal });
  tip('tool_otoscope', g, [HX1 + CONE_L, HY, HZ]);
}

// ---- 3 thermometer: fat white stick, teal cap, red column + dark scale ticks, red bulb at the bottom
{
  const { g } = tool('tool_thermometer');
  const R = 0.026, Z = 0.036, TOP = 0.05, BODY_END = -0.29, BULB_R = 0.036, BULB_Y = BODY_END - 0.012;
  m.part('therm_cap', m.cyl(R + 0.003, R + 0.003, TOP, 8), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.teal });
  m.part('therm_body', m.cyl(R, R, -TOP - BODY_END, 8), { parent: g, at: [0, -TOP, Z], anchor: 'top', material: C.white });
  m.part('therm_column', m.box(0.012, 0.15, 0.006), { parent: g, at: [0, BODY_END, Z + R - 0.002], anchor: 'bottom', material: C.red });
  for (let i = 0; i < 6; i++)
    m.part(`therm_tick_${i}`, m.box(i % 2 ? 0.016 : 0.026, 0.008, 0.006), { parent: g, at: [-0.012, -0.08 - i * 0.03, Z + R - 0.003], anchor: 'right', material: C.dark });
  m.part('therm_bulb', m.sphere(BULB_R, 8, 6), { parent: g, at: [0, BULB_Y, Z], material: C.red });
  tip('tool_thermometer', g, [0, BULB_Y - BULB_R, Z]);
}

// ---- 4 magnifier: yellow handle on top, silver ring with a pale blue lens below
{
  const { g } = tool('tool_magnifier');
  const Z = 0.02, HANDLE = 0.15, RING_R = 0.085, TUBE = 0.017, LENS_Y = -(HANDLE + 0.03 + RING_R + TUBE) + 0.004;
  m.part('mag_handle', m.cyl(0.024, 0.02, HANDLE, 8), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.yellow });
  m.part('mag_neck', m.cyl(0.017, 0.017, 0.035, 8), { parent: g, at: [0, -HANDLE + 0.003, Z], anchor: 'top', material: C.metal });
  m.part('mag_ring', m.torus(RING_R, TUBE, 6, 14), { parent: g, at: [0, LENS_Y, Z], material: C.metal });
  m.part('mag_lens', disc(RING_R, 0.012, 16), { parent: g, at: [0, LENS_Y, Z], geoRot: FACE, material: C.glass });
  tip('tool_magnifier', g, [0, LENS_Y, Z + 0.006]);
}

// ---- 5 shot: plunger pad on top, finger flange, barrel half full of pink medicine with measure lines, short blunt needle
{
  const { g } = tool('tool_shot');
  const Z = 0.04, R = 0.036, PAD_H = 0.02, ROD = 0.08, FLANGE_Y = -(PAD_H + ROD), BARREL = 0.2, BARREL_END = FLANGE_Y - BARREL;
  m.part('shot_pad', m.cyl(0.042, 0.042, PAD_H, 10), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.teal });
  m.part('shot_rod', m.box(0.026, ROD + 0.01, 0.026), { parent: g, at: [0, -PAD_H + 0.005, Z], anchor: 'top', material: C.white });
  m.part('shot_flange', m.box(0.13, 0.022, 0.05), { parent: g, at: [0, FLANGE_Y, Z], anchor: 'top', material: C.teal });
  m.part('shot_barrel', m.cyl(R, R, BARREL * 0.45, 10), { parent: g, at: [0, FLANGE_Y - 0.02, Z], anchor: 'top', material: C.glass });
  m.part('shot_medicine', m.cyl(R, R, BARREL * 0.55 - 0.02, 10), { parent: g, at: [0, BARREL_END, Z], anchor: 'bottom', material: C.pink });
  m.part('shot_stopper', m.cyl(R + 0.002, R + 0.002, 0.016, 10), { parent: g, at: [0, BARREL_END + BARREL * 0.55 - 0.02, Z], material: C.dark });
  for (let i = 0; i < 5; i++)
    m.part(`shot_line_${i}`, m.box(i % 2 ? 0.02 : 0.034, 0.007, 0.006), { parent: g, at: [-0.01, FLANGE_Y - 0.05 - i * 0.03, Z + R - 0.002], anchor: 'right', material: C.dark });
  m.part('shot_hub', m.cyl(R, 0.014, 0.03, 10), { parent: g, at: [0, BARREL_END, Z], anchor: 'top', material: C.white });
  m.part('shot_needle', m.cyl(0.009, 0.009, 0.045, 8), { parent: g, at: [0, BARREL_END - 0.025, Z], anchor: 'top', material: C.metal });
  m.part('shot_needle_tip', m.sphere(0.011, 6, 4), { parent: g, at: [0, BARREL_END - 0.07, Z], material: C.metal });
  tip('tool_shot', g, [0, BARREL_END - 0.081, Z]);
}

// ---- 6 drops: squat bottle (flattened in Z to fit the board depth) with a label band and a red rubber teat on top
{
  const { g } = tool('tool_drops');
  const Z = 0.036, ZS = 0.7, BR = 0.052, BODY = 0.12, TEAT_H = 0.065, COLLAR = 0.028;
  const BOTTLE_TOP = -(TEAT_H + COLLAR) + 0.004;
  // profile bottom -> top: base, straight side, shoulder, neck
  const bottle = m.lathe([[0, 0], [BR, 0], [BR, BODY], [0.026, BODY + 0.035], [0.022, BODY + 0.045], [0, BODY + 0.045]], 12).scale(1, 1, ZS);
  m.part('drops_bottle', bottle, { parent: g, at: [0, BOTTLE_TOP, Z], anchor: 'top', material: C.teal });
  const BOT = BOTTLE_TOP - BODY - 0.045;
  m.part('drops_label', m.cyl(BR + 0.004, BR + 0.004, 0.06, 12).scale(1, 1, ZS), { parent: g, at: [0, BOT + 0.055, Z], material: C.white });
  m.part('drops_cross_v', m.box(0.012, 0.038, 0.006), { parent: g, at: [0, BOT + 0.055, Z + (BR + 0.004) * ZS], material: C.red });
  m.part('drops_cross_h', m.box(0.038, 0.012, 0.006), { parent: g, at: [0, BOT + 0.055, Z + (BR + 0.004) * ZS], material: C.red });
  m.part('drops_collar', m.cyl(0.03, 0.03, COLLAR, 10), { parent: g, at: [0, -TEAT_H, Z], anchor: 'top', material: C.white });
  m.part('drops_teat', m.lathe([[0, 0], [0.026, 0], [0.03, 0.02], [0.026, 0.045], [0.015, 0.06], [0, TEAT_H]], 10), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.red });
  tip('tool_drops', g, [0, 0, Z]);
}

// ---- 7 spoon: flat white handle on top, bowl below with a pink medicine blob
{
  const { g } = tool('tool_spoon');
  const Z = 0.016, HANDLE = 0.2, BOWL_Y = -0.28, BOWL_R = 0.062;
  m.part('spoon_end', disc(0.024, 0.016, 10), { parent: g, at: [0, -0.024, Z], geoRot: FACE, material: C.white });
  m.part('spoon_handle', m.box(0.034, HANDLE, 0.016), { parent: g, at: [0, -0.024, Z], anchor: 'top', material: C.white });
  m.part('spoon_bowl', m.sphere(BOWL_R, 10, 6).scale(1, 1.25, 0.4), { parent: g, at: [0, BOWL_Y, Z + 0.005], material: C.white });
  m.part('spoon_medicine', m.sphere(BOWL_R * 0.78, 10, 6).scale(1, 1.15, 0.35), { parent: g, at: [0, BOWL_Y - 0.004, Z + 0.016], material: C.pink });
  tip('tool_spoon', g, [0, BOWL_Y, Z + 0.03]);
}

// ---- 8 tweezers: two silver arms joined at a top block, teal grips, slightly open tips bent inward
{
  const { g, W } = tool('tool_tweezers');
  const Z = 0.014, ARM = [0.024, 0.016], TIP_Y = -0.335;
  m.part('tweez_joint', m.box(0.07, 0.045, 0.026), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.metal });
  for (const [id, s] of [['L', 1], ['R', -1]]) {
    m.beam(`tweez_arm_${id}`, W(s * 0.022, -0.04, Z), W(s * 0.045, -0.29, Z), { parent: g, size: ARM, material: C.metal });
    m.beam(`tweez_tip_${id}`, W(s * 0.045, -0.29, Z), W(s * 0.016, TIP_Y, Z), { parent: g, size: ARM, material: C.metal });
    m.beam(`tweez_grip_${id}`, W(s * 0.029, -0.11, Z + 0.006), W(s * 0.038, -0.21, Z + 0.006), { parent: g, size: [0.03, 0.018], material: C.teal });
  }
  tip('tool_tweezers', g, [0, TIP_Y, Z]);
}

// ---- 9 bandage: white roll (face to the front, silver core), a tail strip hanging below with a red cross on it
{
  const { g } = tool('tool_bandage');
  const R = 0.075, H = 0.06, Z = H / 2, CY = -R, TAIL_W = 0.085, TAIL_L = 0.23, TAIL_TOP = CY - 0.02;
  m.part('band_roll', disc(R, H, 14), { parent: g, at: [0, CY, Z], geoRot: FACE, material: C.white });
  m.part('band_core', disc(0.03, 0.006, 12), { parent: g, at: [0, CY, H], geoRot: FACE, material: C.metal });
  m.part('band_hole', disc(0.017, 0.004, 10), { parent: g, at: [0, CY, H + 0.004], geoRot: FACE, material: C.dark });
  const tail = m.group('band_tail', { parent: g, at: [R * 0.35, TAIL_TOP, 0.012], rot: [0, 0, 6] });
  m.part('band_strip', m.box(TAIL_W, TAIL_L, 0.01), { parent: tail, anchor: 'top', material: C.white });
  m.part('band_cross_v', m.box(0.018, 0.06, 0.006), { parent: tail, at: [0, -TAIL_L + 0.06, 0.005], anchor: 'back', material: C.red });
  m.part('band_cross_h', m.box(0.06, 0.018, 0.006), { parent: tail, at: [0, -TAIL_L + 0.06, 0.005], anchor: 'back', material: C.red });
  m.socket('Socket_tool_bandage_tip', { parent: tail, at: [0, -TAIL_L, 0.005] });
}

// ---- 10 lollipop: white stick on top, pink candy disc below with a raised white swirl and a yellow centre
{
  const { g } = tool('tool_lollipop');
  const Z = 0.025, STICK = 0.17, CR = 0.09, CH = 0.035, CY = -(STICK + CR) + 0.012;
  m.part('lolly_stick', m.cyl(0.01, 0.01, STICK, 8), { parent: g, at: [0, 0, Z], anchor: 'top', material: C.white });
  m.part('lolly_candy', disc(CR, CH, 16), { parent: g, at: [0, CY, Z], geoRot: FACE, material: C.pink });
  // a flat spiral strip: centre line r = A + B*t, outline = outer edge out, inner edge back
  const TURNS = 2.25, N = 26, W = 0.011, A = 0.016, B = (CR - 0.016 - A) / (TURNS * 2 * Math.PI);
  const line = Array.from({ length: N + 1 }, (_, i) => { const t = (i / N) * TURNS * 2 * Math.PI; return [t, A + B * t]; });
  let outline = [...line.map(([t, r]) => [(r + W / 2) * Math.cos(t), (r + W / 2) * Math.sin(t)]),
    ...line.reverse().map(([t, r]) => [(r - W / 2) * Math.cos(t), (r - W / 2) * Math.sin(t)])];
  const area = outline.reduce((s, [x, y], i) => { const [x2, y2] = outline[(i + 1) % outline.length]; return s + x * y2 - x2 * y; }, 0);
  if (area < 0) outline = outline.reverse();
  m.part('lolly_swirl', m.extrude(outline, 0.006), { parent: g, at: [0, CY, Z + CH / 2 - 0.001], anchor: 'none', material: C.white });
  m.part('lolly_centre', disc(0.016, 0.008, 10), { parent: g, at: [0, CY, Z + CH / 2 + 0.002], geoRot: FACE, material: C.yellow });
  tip('tool_lollipop', g, [0, CY, Z + CH / 2 + 0.006]);
}

await m.write(new URL('../../assets/models/custom/vet-tools.glb', import.meta.url).pathname);
