// Tractor Pickup's materials (lion-hawk 3l, M-2, D6). Sim-pure data: the sim reads surfaces and colliders, the bake checks the renamed
// glTF materials, the view compiles the looks. Surfaces: the old SURFACE grip/vmul (sim/tractor.js) and DIRT per-second rates
// (sim/dirt.js) moved into each surface's game block; `surface` keeps the legacy name the view, the sounds and the events use;
// `scaled`: the rate grows with the speed fraction (gravel, grass) or not (mud). Colliders: today's literal frictions. The trailer's
// bed and tongue reproduce their setMass masses through `fill` (density × volume, M-6): 260 kg over 2.8 × 0.3 × 2 m, 5 kg over 1.8 × 0.12 × 0.16 m.
import { defineMaterials } from 'lion-hawk/sim';

export const SURFACE_IDS = Object.freeze(['route', 'meadow', 'mudhole']);
const dirty = { coverage: { dirt: 1 } };
export default defineMaterials({
  // surfaces (materialAt)
  route:   { extends: 'gravel', game: { surface: 'gravel', grip: 1, vmul: 1, dirt: 0.006, scaled: true } },
  meadow:  { extends: 'grass', game: { surface: 'grass', grip: 0.8, vmul: 0.7, dirt: 0.004, scaled: true } },
  mudhole: { extends: 'mud', game: { surface: 'mud', grip: 0.55, vmul: 0.5, dirt: 0.6, scaled: false } },
  // colliders
  ground:  { extends: 'dirt', phys: { friction: 0.6, restitution: 0 } },
  pad:     { extends: 'gravel', phys: { friction: 0.9, restitution: 0 } },
  ramp:    { extends: 'wood', phys: { friction: 0.9, restitution: 0 } },
  chassis: { extends: 'steel', phys: { friction: 0.2, restitution: 0 }, ...dirty },
  bed:     { extends: 'wood', phys: { friction: 0.2, restitution: 0, sg: 1, fill: 260 / 1.68 / 1000 }, ...dirty },
  tongue:  { extends: 'steel', phys: { friction: 0.5, restitution: 0, sg: 1, fill: 5 / 0.03456 / 1000 } },
  fence:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  trunk:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  prop:    { extends: 'wood', phys: { friction: 0.6, restitution: 0.1 } },
  // art (bake renames, overview §5.4); vertex colours give the colour (D5)
  pet:     { extends: 'flesh', look: { roughness: 1, metalness: 0 }, ...dirty },
  gold:    { extends: 'steel', look: { color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' }, ...dirty },
  leaf:    { extends: 'grass', look: { roughness: 1 } },
  petal:   { extends: 'grass', look: { roughness: 1 } },
  crop:    { extends: 'grass', look: { roughness: 1 } },
  stone:   { extends: 'gravel', look: { roughness: 1 } },
});
