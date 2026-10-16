// Tractor Pickup's materials (lion-hawk 3l, M-2, D6). Sim-pure data: the sim reads surfaces and colliders, the bake checks the renamed
// glTF materials, the view compiles the looks. Surfaces: the old SURFACE grip/vmul (sim/tractor.js) and DIRT per-second rates
// (sim/dirt.js) moved into the registry: grip/vmul in each surface's game block, dirt as a per-metre dirtRate (coverage kit); `surface` keeps the legacy name the view, the sounds and the events use;
// Colliders: today's literal frictions. The trailer's
// bed and tongue reproduce their setMass masses through `fill` (density × volume, M-6): 260 kg over 2.8 × 0.3 × 2 m, 5 kg over 1.8 × 0.12 × 0.16 m.
import { defineMaterials } from 'lion-hawk/sim';

// the tree gibs' bounce on the ground (the fx kit's particle bounce and ground friction, render/gibs.js): physical constants live here
export const GIB_GROUND = Object.freeze({ bounce: 0.35, friction: 0.65 });
export const SURFACE_IDS = Object.freeze(['route', 'meadow', 'mudhole']);
// dirt per metre (coverage kit, spec §3.2): 1.8's per-second rates at Medium speeds (vmax 9 m/s; mud's top speed 4.5 m/s) (3l Task 13b)
export const DIRT_RATES = Object.freeze({ route: 0.006 / 9, meadow: 0.004 / 9, mudhole: 0.6 / 4.5 });
const dirty = { coverage: { dirt: 1 } };
export default defineMaterials({
  // surfaces (materialAt)
  route:   { extends: 'gravel', dirtRate: DIRT_RATES.route, game: { surface: 'gravel', grip: 1, vmul: 1 } },
  meadow:  { extends: 'grass', dirtRate: DIRT_RATES.meadow, game: { surface: 'grass', grip: 0.8, vmul: 0.7 } },
  mudhole: { extends: 'mud', dirtRate: DIRT_RATES.mudhole, game: { surface: 'mud', grip: 0.55, vmul: 0.5 } },
  // colliders
  ground:  { extends: 'dirt', phys: { friction: 0.6, restitution: 0 } },
  pad:     { extends: 'gravel', phys: { friction: 0.9, restitution: 0 } },
  ramp:    { extends: 'wood', phys: { friction: 0.9, restitution: 0 }, look: { color: '#c9ad7f', roughness: 1 } },
  // no environment map in this game, so metalness 1 renders black: painted and steel parts read as 1.8's matte Lambert
  steel:   { look: { metalness: 0, roughness: 1 } },
  chassis: { extends: 'steel', phys: { friction: 0.2, restitution: 0 }, look: { metalness: 0, roughness: 1 }, ...dirty },
  bed:     { extends: 'wood', phys: { friction: 0.2, restitution: 0, sg: 1, fill: 260 / 1.68 / 1000 }, ...dirty },
  tongue:  { extends: 'steel', phys: { friction: 0.5, restitution: 0, sg: 1, fill: 5 / 0.03456 / 1000 } },
  fence:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  trunk:   { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  prop:    { extends: 'wood', phys: { friction: 0.6, restitution: 0.1 } },
  // art (bake renames, overview §5.4); vertex colours give the colour (D5)
  pet:     { extends: 'flesh', look: { roughness: 1, metalness: 0, subsurface: { strength: 0 } }, ...dirty }, // flesh's red subsurface tinted every animal pink
  gold:    { extends: 'steel', look: { color: '#ffd24a', metalness: 0.2, roughness: 0.45, emissive: '#6a4a00' }, ...dirty },
  leaf:    { extends: 'grass', look: { roughness: 1 } },
  petal:   { extends: 'grass', look: { roughness: 1 } },
  crop:    { extends: 'grass', look: { roughness: 1 } },
  stone:   { extends: 'gravel', look: { roughness: 1 } },
  // view looks (3l: the farm's 3D on the compiler; vertex colours or a texture give the colour, 1.8's Lambert as roughness 1)
  scenery: { extends: 'plastic', look: { roughness: 1, metalness: 0 } },          // vertex-coloured statics (trees, fences, rocks, props)
  paper:   { extends: 'plastic', look: { color: '#ffffff', roughness: 1, metalness: 0 } }, // textured ground and barn, fx and gib cubes
  pond:    { extends: 'water', look: { color: '#5fb4e0', roughness: 0.15, opacity: 1, transparent: false } },
  sand:    { extends: 'gravel', look: { color: '#d9c79c', roughness: 1 } },
});
