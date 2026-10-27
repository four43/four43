// Shared helpers for Pig Pens' glb-author model scripts (tools/models/*.model.mjs).
//
// Pig Pens' bake (palette 'vertex') reads baseColorFactor as Kenney's kits store it: sRGB numbers, which it then linearises.
// So the factor written must hold the colour's sRGB values. m.material linearises a hex colour, so hand it the hex that
// linearises to those values (sRGB-encode each channel once more); the baked vertex colour is then the hex given here.
const enc = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const kenney = hex => '#' + [1, 3, 5].map(i => Math.round(255 * enc(parseInt(hex.slice(i, i + 2), 16) / 255)).toString(16).padStart(2, '0')).join('');

// The glb-author kit, by absolute path (the skill lives outside the repo).
export const KIT = '/home/smiller/.claude/skills/glb-author/scripts/kit.mjs';
