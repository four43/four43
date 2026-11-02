// Harvest silo: the sell station. A red-and-white drive-through bay along Z with a dump-pit grate in its floor, and two
// tall galvanised grain silos on its +X side joined by a bucket-elevator leg. Source for assets/models/custom/silo.glb
// (spec: silo.spec.json). Regenerate from exp/harvest with   node tools/models/silo.model.mjs   (under the usual
// systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the bay runs along Z (either end is a way in), origin on the ground at the bay centre (= Socket_Pit).
// Every placement comes from SILO (src/defs/models.js). Contract nodes: bay, silos, grate, signboard, Socket_Pit.
import { SILO as S } from '../../src/defs/models.js';
import { kenney, KIT, out, merge, Soup, ring, tube, fan } from './lib.mjs';
const { model } = await import(KIT);

const m = model('silo');

const mat = {
  galv:     m.material('galv',     { color: kenney('#c3c9cf'), roughness: 0.5 }),
  red:      m.material('red',      { color: kenney('#c8372d'), roughness: 0.8 }),
  white:    m.material('white',    { color: kenney('#f3efe6'), roughness: 0.85 }),
  concrete: m.material('concrete', { color: kenney('#bcb7ab'), roughness: 0.95 }),
  metal:    m.material('metal',    { color: kenney('#4f545a'), roughness: 0.6 }),
  trim:     m.material('trim',     { color: kenney('#f5c22b'), roughness: 0.7 }),
};

// ---- numbers first
const B = S.bay, P = B.post;
const PAD = 0.06;                                       // concrete pad under the bay
const BEAM = 0.4;                                       // depth of the beams the roof sits on
const OVX = 0.6, OVZ = 0.5, RISE = 1.6, RT = 0.25;      // roof overhang at the sides / ends; ridge rise above the eave; slab thickness
const PIT = { hx: 1.6, hz: 2.2 };                       // dump-pit grate half extents
const SIDES = 16, BANDS = 5, CONE = 2.2, EAVE_OV = 0.15; // silo facets, ribbed bands, cone height, cone overhang
const LEG = { x: S.silos[0].x, z: (S.silos[0].z + S.silos[1].z) / 2, w: 0.8, h: Math.max(...S.silos.map(s => s.h)) + CONE + 1.8 };

// ---- bay: pad, corner posts, beams, a red gable roof with white gable ends
const bay = m.group('bay');
m.part('pad', m.box(2 * (B.half + 0.5), PAD, 2 * (B.len + 0.5)), { parent: bay, anchor: 'bottom', material: mat.concrete });
m.part('posts', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(P, B.roof, P), at: [sx * B.half, B.roof / 2, sz * B.len] }))),
  { parent: bay, anchor: 'none', material: mat.white });
m.part('post_feet', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(P + 0.2, 0.5, P + 0.2), at: [sx * B.half, 0.25, sz * B.len] }))),
  { parent: bay, anchor: 'none', material: mat.red });
m.part('beams', merge([
  ...[1, -1].map(s => ({ geo: m.box(P, BEAM, 2 * B.len + P), at: [s * B.half, B.roof - BEAM / 2, 0] })),
  ...[1, -1].map(s => ({ geo: m.box(2 * B.half + P, BEAM, P), at: [0, B.roof - BEAM / 2, s * B.len] })),
]), { parent: bay, anchor: 'none', material: mat.red });
const EX = B.half + OVX, slope = RISE / B.half, Y0 = B.roof;   // the roof underside passes through the beam tops
const under = x => Y0 + RISE - slope * Math.abs(x);
const RTV = RT * Math.sqrt(1 + slope * slope);
const chevron = [[-EX, under(EX)], [0, under(0)], [EX, under(EX)], [EX, under(EX) + RTV], [0, under(0) + RTV], [-EX, under(EX) + RTV]];
m.part('roof', m.extrude(chevron, 2 * (B.len + OVZ)), { parent: bay, at: [0, 0, -(B.len + OVZ)], anchor: 'none', material: mat.red });
m.part('gables', merge([1, -1].map(s => ({ geo: m.extrude([[-B.half, Y0], [B.half, Y0], [0, under(0)]], 0.12), at: [0, 0, s * B.len - 0.06] }))),
  { parent: bay, anchor: 'none', material: mat.white });
m.part('fascia', merge([1, -1].map(s => ({ geo: m.extrude([[-EX - 0.05, under(EX) - 0.12], [0, under(0) - 0.12], [EX + 0.05, under(EX) - 0.12], [EX + 0.05, under(EX) + RTV + 0.06], [0, under(0) + RTV + 0.06], [-EX - 0.05, under(EX) + RTV + 0.06]], 0.1),
  at: [0, 0, s * (B.len + OVZ) - 0.05] }))), { parent: bay, anchor: 'none', material: mat.white });
// signboard: a light board on the +Z gable over the way in; uv 'fit' maps its front face 0..1 for the game's picture
m.part('signboard', m.box(2.6, 0.9, 0.08), { at: [0, B.roof + 0.5, B.len + 0.07], anchor: 'back', uv: 'fit', material: mat.white });
// conveyor housing from the pit, under the bay edge, to the elevator boot
m.beam('conveyor', [PIT.hx, PAD + 0.3, 0], [LEG.x - LEG.w / 2, 1.3, LEG.z], { parent: bay, size: [0.7, 0.6], material: mat.galv });

// ---- grate: the dump pit in the middle of the bay floor: dark pit, yellow border, metal bars
const grate = m.group('grate');
m.part('pit', m.box(2 * PIT.hx, 0.02, 2 * PIT.hz), { parent: grate, at: [0, PAD, 0], anchor: 'bottom', material: mat.metal });
m.part('pit_border', merge([
  ...[1, -1].map(s => ({ geo: m.box(2 * PIT.hx + 0.4, 0.04, 0.2), at: [0, PAD + 0.02, s * (PIT.hz + 0.1)] })),
  ...[1, -1].map(s => ({ geo: m.box(0.2, 0.04, 2 * PIT.hz), at: [s * (PIT.hx + 0.1), PAD + 0.02, 0] })),
]), { parent: grate, anchor: 'none', material: mat.trim });
m.part('pit_bars', merge(Array.from({ length: 9 }, (_, i) => ({ geo: m.box(2 * PIT.hx, 0.04, 0.1), at: [0, PAD + 0.04, -PIT.hz + 0.25 + i * (2 * PIT.hz - 0.5) / 8] }))),
  { parent: grate, anchor: 'none', material: mat.galv });

// ---- silos: ribbed galvanised bins with cone roofs, a ladder each, and the elevator leg between them
const silos = m.group('silos');
for (const [i, s] of S.silos.entries()) {
  const id = i ? 'B' : 'A';
  m.part(`foundation_${id}`, m.cyl(s.r + 0.2, s.r + 0.25, 0.3, SIDES), { parent: silos, at: [s.x, 0, s.z], anchor: 'bottom', material: mat.concrete });
  m.part(`bin_${id}`, m.cyl(s.r, s.r, s.h - 0.3, SIDES), { parent: silos, at: [s.x, 0.3, s.z], anchor: 'bottom', material: mat.galv });
  const ribs = new Soup();
  for (let b = 0; b < BANDS; b++) { const y = 0.3 + (s.h - 0.3) * (b + 0.5) / BANDS; tube(ribs, ring(s.x, y - 0.1, s.z, s.r + 0.06, SIDES, 360 / SIDES / 2), ring(s.x, y + 0.1, s.z, s.r + 0.06, SIDES, 360 / SIDES / 2)); }
  m.part(`bands_${id}`, ribs.geometry(), { parent: silos, anchor: 'none', material: mat.white });
  const cone = new Soup(), eave = ring(s.x, s.h, s.z, s.r + EAVE_OV, SIDES, 360 / SIDES / 2);
  fan(cone, eave, [s.x, s.h + CONE, s.z]);
  fan(cone, eave, [s.x, s.h - 0.01, s.z]);      // flat-ish underside under the overhang
  m.part(`cone_${id}`, cone.geometry(), { parent: silos, anchor: 'none', material: mat.galv });
  m.part(`vent_${id}`, m.cyl(0.35, 0.45, 0.4, 8), { parent: silos, at: [s.x, s.h + CONE - 0.15, s.z], anchor: 'bottom', material: mat.red });
  // ladder on the side facing the bay (-X), from near the ground to the eave, plus a hoop at the top
  const lx = s.x - s.r - 0.12, rails = [-0.25, 0.25];
  m.part(`ladder_rails_${id}`, merge(rails.map(dz => ({ geo: m.box(0.07, s.h + 0.6 - 0.6, 0.07), at: [lx, (s.h + 0.6 + 0.6) / 2, s.z + dz] }))), { parent: silos, anchor: 'none', material: mat.metal });
  m.part(`ladder_rungs_${id}`, merge(Array.from({ length: Math.floor((s.h - 0.6) / 0.6) }, (_, k) => ({ geo: m.box(0.05, 0.05, 0.5), at: [lx, 0.9 + k * 0.6, s.z] }))), { parent: silos, anchor: 'none', material: mat.metal });
}
// bucket elevator leg: a tall square tower between the silos, a head box on top, spouts down to both cones
m.part('leg', m.box(LEG.w, LEG.h, LEG.w), { parent: silos, at: [LEG.x, 0, LEG.z], anchor: 'bottom', material: mat.red });
m.part('leg_head', m.box(1.5, 1.1, 1.5), { parent: silos, at: [LEG.x, LEG.h, LEG.z], anchor: 'bottom', material: mat.red });
m.part('leg_cap', m.box(1.7, 0.15, 1.7), { parent: silos, at: [LEG.x, LEG.h + 1.1, LEG.z], anchor: 'bottom', material: mat.white });
for (const [i, s] of S.silos.entries())
  m.beam(`spout_${i ? 'B' : 'A'}`, [LEG.x, LEG.h + 0.3, LEG.z + Math.sign(s.z - LEG.z) * 0.7], [s.x, s.h + CONE + 0.25, s.z], { parent: silos, size: 0.3, round: true, sides: 6, material: mat.galv });

m.socket('Socket_Pit', { at: [0, 0, 0] });

await m.write(out('silo'));
