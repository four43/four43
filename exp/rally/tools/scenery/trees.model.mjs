// Trees (rally-spec R19-1): tree-pine and tree-pine-snow (one shape, the snow variant whitens the upward faces), and
// tree-leafy, a broadleaf of lumpy leaf blobs. Each GLB holds lod0 (near), lod1 (mid) and lod2 (far, a handful of
// triangles) at the same origin: bottom centre, +Y up. Run: node tools/scenery/trees.model.mjs
import { model, OUT, rng, starTier, blob, colourFaces, snowOn } from './lib.mjs';

// Pine: a tapered trunk and five star tiers, each overlapping the one below.
const PINE = { h: 7.6, trunkR: [0.22, 0.07], trunkH: 6.4, tiers: 5, base: 1.3, r: [2.1, 0.75], overlap: 0.52 };
const BARK = '#4b3527', NEEDLE = '#2f4a2a', NEEDLE_TOP = '#3d5a30';

function pine(name, snow) {
  const m = model(name), bark = m.material('bark', { color: BARK, roughness: 1 });
  const dark = m.material('needle', { color: NEEDLE, roughness: 1 }), light = m.material('needle_top', { color: NEEDLE_TOP, roughness: 1 });
  // Tier heights so the apex of the last lands at PINE.h: each tier rises h_i and the next starts overlap·h_i above it.
  const T = PINE.tiers, span = PINE.h - PINE.base, w = [1.25, 1.12, 1, 0.9, 0.8];
  const sumStep = w.slice(0, T - 1).reduce((a, b) => a + b * PINE.overlap, 0) + w[T - 1], unit = span / sumStep;
  const tiers = []; let y = PINE.base;
  for (let i = 0; i < T; i++) {
    const h = w[i] * unit, r = PINE.r[0] + (PINE.r[1] - PINE.r[0]) * (i / (T - 1));
    tiers.push({ y, h, r }); y += h * PINE.overlap;
  }
  for (const [lod, opt] of [['lod0', { points: 8, mid: true, sides: 6 }], ['lod1', { points: 6, mid: false, sides: 4 }]]) {
    const g = m.group(lod), rand = rng(`${name}|${lod}`);
    m.part(`${lod}_trunk`, m.cyl(PINE.trunkR[1], PINE.trunkR[0], PINE.trunkH, opt.sides), { parent: g, at: [0, 0, 0], anchor: 'bottom', material: bark });
    tiers.forEach((t, i) => m.part(`${lod}_tier${i}`, starTier({ ...t, points: opt.points, mid: opt.mid, droop: 0.12 * t.r, rand }),
      { parent: g, at: [0, t.y, 0], anchor: 'none', material: i >= T - 2 ? light : dark }));
  }
  // Far: one six-sided cone over the canopy's span (no trunk: it's under the skirt at that distance).
  const far = m.group('lod2');
  m.part('lod2_canopy', m.cone(PINE.r[0] * 0.92, PINE.h - PINE.base * 0.7, 6), { parent: far, at: [0, PINE.base * 0.7, 0], anchor: 'bottom', material: dark });
  colourFaces(m, snow ? { needle: snowOn(0.35, () => NEEDLE), needle_top: snowOn(0.3, () => NEEDLE_TOP), bark: null } : {}, { seed: name, shade: 0.1 });
  return m.write(`${OUT}${name}.glb`);
}

// Broadleaf: trunk, two limbs, and a crown of lumpy blobs; the crown's top faces catch the light, its underside is shadowed.
const LEAFY = { trunkH: 3.2, trunkR: [0.24, 0.13], crown: 3.0, crownY: 4.6, h: 7.0 };
const LEAF = '#456728', LEAF_LIGHT = '#5a7d31', LEAF_DARK = '#344f20';
const CROWN = [ // x, y, z, r (y above crownY)
  [0, 0.4, 0, 1.9], [1.2, -0.3, 0.5, 1.35], [-1.1, -0.2, -0.6, 1.4], [0.3, -0.5, -1.2, 1.25], [-0.5, -0.4, 1.2, 1.3], [0.2, 1.3, 0.2, 1.2],
];

function leafy(name) {
  const m = model(name), bark = m.material('bark', { color: '#5b4636', roughness: 1 }), leaf = m.material('leaf', { color: LEAF, roughness: 1 });
  for (const [lod, detail, n] of [['lod0', 1, CROWN.length], ['lod1', 0, 4]]) {
    const g = m.group(lod), rand = rng(`${name}|${lod}`);
    m.part(`${lod}_trunk`, m.cyl(LEAFY.trunkR[1], LEAFY.trunkR[0], LEAFY.trunkH + 0.6, lod === 'lod0' ? 6 : 4), { parent: g, at: [0, 0, 0], anchor: 'bottom', material: bark });
    if (lod === 'lod0') {
      m.beam('lod0_limb_L', [0, LEAFY.trunkH - 0.7, 0], [1.1, LEAFY.crownY - 0.2, 0.4], { parent: g, size: 0.16, round: true, sides: 5, material: bark });
      m.beam('lod0_limb_R', [0, LEAFY.trunkH - 0.4, 0], [-1.0, LEAFY.crownY - 0.1, -0.5], { parent: g, size: 0.14, round: true, sides: 5, material: bark });
    }
    // lod1 keeps the four biggest blobs, a little larger to fill the gaps.
    const crown = n === CROWN.length ? CROWN : [...CROWN].sort((a, b) => b[3] - a[3]).slice(0, n).map(([x, y, z, r]) => [x, y, z, r * 1.12]);
    crown.forEach(([x, y, z, r], i) => m.part(`${lod}_leaves${i}`, blob(r, { detail, lump: detail ? 0.16 : 0.1, scale: [1, 0.85, 1], rand }),
      { parent: g, at: [x, LEAFY.crownY + y, z], anchor: 'none', material: leaf }));
  }
  const far = m.group('lod2'), rand = rng(`${name}|lod2`);
  m.part('lod2_trunk', m.box(0.3, LEAFY.trunkH, 0.3), { parent: far, at: [0, 0, 0], anchor: 'bottom', material: bark });
  m.part('lod2_crown', blob(2.6, { detail: 0, lump: 0.05, scale: [1, 0.8, 1], rand }), { parent: far, at: [0, LEAFY.crownY + 0.2, 0], anchor: 'none', material: leaf });
  colourFaces(m, { leaf: (ny, r) => (ny > 0.45 + r.next() * 0.2 ? LEAF_LIGHT : ny < -0.3 ? LEAF_DARK : LEAF) }, { seed: name, shade: 0.12 });
  return m.write(`${OUT}${name}.glb`);
}

// Bush: three small blobs on the ground, no trunk; lod1 is one.
function bush(name) {
  const m = model(name), leaf = m.material('leaf', { color: '#4a6a2b', roughness: 1 });
  const parts = [[0, 0.7, 0, 0.75], [0.6, 0.55, 0.25, 0.55], [-0.5, 0.55, -0.2, 0.6]];
  const g0 = m.group('lod0'), r0 = rng(`${name}|lod0`);
  parts.forEach(([x, y, z, r], i) => m.part(`lod0_leaves${i}`, blob(r, { detail: 1, lump: 0.18, scale: [1, 0.8, 1], rand: r0 }), { parent: g0, at: [x, y, z], anchor: 'none', material: leaf }));
  const g1 = m.group('lod1');
  m.part('lod1_leaves', blob(0.95, { detail: 0, lump: 0.08, scale: [1.2, 0.7, 1], rand: rng(`${name}|lod1`) }), { parent: g1, at: [0, 0.7, 0], anchor: 'none', material: leaf });
  colourFaces(m, { leaf: (ny, r) => (ny > 0.5 + r.next() * 0.2 ? '#5f8234' : ny < -0.3 ? '#37521f' : '#4a6a2b') }, { seed: name, shade: 0.12 });
  return m.write(`${OUT}${name}.glb`);
}

await pine('tree-pine', false);
await pine('tree-pine-snow', true);
await leafy('tree-leafy');
await bush('bush');
