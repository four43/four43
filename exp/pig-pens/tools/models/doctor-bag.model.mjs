// Pig Pens: Dr. Emmy's doctor's bag (v3 2.9.0, the desk in her flat). Source for assets/models/custom/doctor-bag.glb (spec:
// doctor-bag.spec.json). Regenerate from exp/pig-pens with  node tools/models/doctor-bag.model.mjs  (under the usual
// systemd-run memory cap); needs the glb-author skill's kit. Metres, +Y up, origin bottom-centre, front (+Z) faces out.
import { kenney, KIT } from './lib.mjs';
const { model } = await import(KIT);

const m = model('doctor_bag');
const W = 0.42, D = 0.2, BODY_H = 0.2, LID_R = D / 2, FOOT = 0.012;  // body box, half-round lid along x
const C = {
  leather: m.material('leather', { color: kenney('#8a3a2c'), roughness: 0.9 }),
  brass:   m.material('brass',   { color: kenney('#e0b44a'), roughness: 0.9 }),
  dark:    m.material('dark',    { color: kenney('#3a2420'), roughness: 0.9 }),
  white:   m.material('white',   { color: kenney('#f4f1ea'), roughness: 0.9 }),
  red:     m.material('red',     { color: kenney('#d8443a'), roughness: 0.9 }),
};
const TOP = FOOT + BODY_H;                                           // where the lid's flat side sits
m.part('body', m.box(W, BODY_H, D), { at: [0, FOOT, 0], anchor: 'bottom', material: C.leather });
for (const sx of [-1, 1]) for (const sz of [-1, 1])                  // feet, 1 cm into the body
  m.part(`foot_${sx > 0 ? 'L' : 'R'}${sz > 0 ? 'F' : 'B'}`, m.box(0.04, FOOT + 0.01, 0.04), { at: [sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04)], anchor: 'bottom', material: C.dark });
// the lid: a half cylinder along x (12 sides, a multiple of 4: flat bottom), its ends 4 mm in from the body's
const lid = m.cyl(LID_R, LID_R, W - 0.008, 12); lid.rotateZ(Math.PI / 2);
m.part('lid', lid, { at: [0, TOP - 0.01, 0], anchor: 'none', material: C.leather });
// the brass band where lid meets body, 4 mm proud all round, and the clasp on the front
m.part('clasp', m.box(W + 0.008, 0.022, D + 0.008), { at: [0, TOP - 0.011, 0], anchor: 'center', material: C.brass });
m.part('clasp_lock', m.box(0.06, 0.05, 0.012), { at: [0, TOP - 0.011, D / 2 + 0.008], anchor: 'center', material: C.brass });
// the patch with its red cross on the front face, each 3 mm proud of the one under it
m.part('patch', m.box(0.1, 0.1, 0.006), { at: [0, FOOT + BODY_H * 0.45, D / 2 + 0.002], anchor: 'center', material: C.white });
m.part('cross_v', m.box(0.026, 0.07, 0.004), { at: [0, FOOT + BODY_H * 0.45, D / 2 + 0.006], anchor: 'center', material: C.red });
m.part('cross_h', m.box(0.07, 0.026, 0.004), { at: [0, FOOT + BODY_H * 0.45, D / 2 + 0.0061], anchor: 'center', material: C.red });
// the handle: a dark grip on two short posts, standing on brass mounts on top of the lid
const handle = m.group('handle', { at: [0, TOP + LID_R - 0.004, 0] });
for (const s of [-1, 1]) {
  m.part(`mount_${s > 0 ? 'L' : 'R'}`, m.box(0.04, 0.02, 0.035), { parent: handle, at: [s * 0.075, 0, 0], anchor: 'bottom', material: C.brass });
  m.part(`post_${s > 0 ? 'L' : 'R'}`, m.box(0.02, 0.06, 0.02), { parent: handle, at: [s * 0.075, 0.015, 0], anchor: 'bottom', material: C.dark });
}
m.part('grip', m.box(0.19, 0.026, 0.026), { parent: handle, at: [0, 0.07, 0], anchor: 'bottom', material: C.dark });

await m.write(new URL('../../assets/models/custom/doctor-bag.glb', import.meta.url).pathname);
