// Rocks and fences (rally-spec R19-1). rock-a (a boulder) and rock-b (a low slab), each with a -snow variant whose
// upward faces are snow (summer ones are mossy there); lod0 and lod1. fence: one 3 m post-and-rail section, the post at
// its back end (−Z) and the rails reaching the next section's post; fence-post closes a run. Origin bottom centre.
// Run: node tools/scenery/props.model.mjs
import { model, OUT, rng, blob, colourFaces, snowOn } from './lib.mjs';

const STONE = '#77736a', MOSS = '#5d6b3a';
const ROCKS = {
  'rock-a': { r: 0.8, scale: [1.05, 0.75, 0.9], lump: 0.24 },  // ~1.7 × 1.0 × 1.5 m boulder
  'rock-b': { r: 1.0, scale: [1.25, 0.42, 0.85], lump: 0.2 },  // ~2.5 × 0.7 × 1.7 m slab
};

// Squash the underside flat at `cut` of the height, so the rock sits on (and into) the ground instead of on a point.
function flatBottom(g, cut) {
  const p = g.attributes.position; g.computeBoundingBox();
  const b = g.boundingBox, y0 = b.min.y + (b.max.y - b.min.y) * cut;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < y0) p.setY(i, y0);
  return g;
}

function rock(name, base, snow) {
  const R = ROCKS[base], m = model(name), stone = m.material('stone', { color: STONE, roughness: 1 });
  for (const [lod, detail] of [['lod0', 1], ['lod1', 0]]) {
    // Same seed for both variants: the snow rock is the summer rock under snow.
    const g = m.group(lod), shape = flatBottom(blob(R.r, { detail, lump: detail ? R.lump : R.lump * 0.6, scale: R.scale, rand: rng(`${base}|${lod}`) }), 0.18);
    m.part(`${lod}_stone`, shape, { parent: g, at: [0, 0, 0], anchor: 'bottom', material: stone });
  }
  const top = snow ? snowOn(0.55, () => STONE) : (ny, r) => (ny > 0.8 + r.next() * 0.1 ? MOSS : ny < -0.5 ? '#5e5a52' : STONE);
  colourFaces(m, { stone: top }, { seed: name, shade: 0.1 });
  return m.write(`${OUT}${name}.glb`);
}

// Fence: split-rail style, two rails. Numbers in metres.
const F = { len: 3, postH: 1.15, postR: 0.085, rails: [0.45, 0.88], rail: [0.09, 0.14], sag: 0.03 };
const WOOD = '#7a6550', WOOD_DARK = '#5f4e3d';

function post(m, lod, g, z, rand) {
  const lean = [rand.range(-3, 3), 0, rand.range(-3, 3)];
  if (lod === 'lod0') {
    m.part(`${lod}_post`, m.cyl(F.postR * 0.9, F.postR, F.postH, 6), { parent: g, at: [0, 0, z], rot: lean, anchor: 'bottom', material: m.material('post', { color: WOOD_DARK, roughness: 1 }) });
  } else m.part(`${lod}_post`, m.box(F.postR * 1.8, F.postH, F.postR * 1.8), { parent: g, at: [0, 0, z], anchor: 'bottom', material: m.material('post', { color: WOOD_DARK, roughness: 1 }) });
}

function fence(name, snow) {
  const m = model(name), wood = m.material('rail', { color: WOOD, roughness: 1 }), z0 = -F.len / 2, z1 = F.len / 2;
  for (const lod of ['lod0', 'lod1']) {
    const g = m.group(lod), rand = rng(`${name.replace('-snow', '')}|${lod}`);
    post(m, lod, g, z0, rand);
    F.rails.forEach((y, i) => {
      // lod0: each rail in two pieces that sag a little in the middle; lod1: one straight bar.
      const ya = y + rand.range(-0.03, 0.03), yb = y + rand.range(-0.03, 0.03), x = rand.range(-0.01, 0.01) + F.postR + F.rail[0] / 2 - 0.02;
      if (lod === 'lod0') {
        const mid = [x, (ya + yb) / 2 - F.sag, 0];
        m.beam(`${lod}_rail${i}a`, [x, ya, z0], mid, { parent: g, size: F.rail, material: wood });
        m.beam(`${lod}_rail${i}b`, mid, [x, yb, z1], { parent: g, size: F.rail, material: wood });
      } else m.beam(`${lod}_rail${i}`, [x, ya, z0], [x, yb, z1], { parent: g, size: F.rail, material: wood });
    });
  }
  const under = (ny, r) => (r.next() < 0.3 ? WOOD_DARK : WOOD);
  colourFaces(m, snow ? { rail: snowOn(0.6, under), post: snowOn(0.6, () => WOOD_DARK) } : { rail: under }, { seed: name, shade: 0.08 });
  return m.write(`${OUT}${name}.glb`);
}

function fencePost(name) {
  const m = model(name);
  for (const lod of ['lod0', 'lod1']) post(m, lod, m.group(lod), 0, rng(`${name}|${lod}`));
  colourFaces(m, {}, { seed: name, shade: 0.08 });
  return m.write(`${OUT}${name}.glb`);
}

for (const base of Object.keys(ROCKS)) { await rock(base, base, false); await rock(`${base}-snow`, base, true); }
await fence('fence', false);
await fence('fence-snow', true);
await fencePost('fence-post');
