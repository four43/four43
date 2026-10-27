// Pig Pens' materials (lion-hawk M-1..M-3, D4, D6). Physics: 2.1.0 set friction/restitution per collider with Rapier's
// default rules (friction Min for the animals, else Average; restitution Average). The engine uses √f with Multiply and
// restitution Max, so these values keep every animal-on-grass contact as it was (see test/materials.test.mjs and the
// phase 3k notes' table). Look-only ids name the baked models' materials (game.config.js renames Kenney's).
import { defineMaterials } from 'lion-hawk/sim';

export default defineMaterials({
  // ground and statics keep Rapier's default restitution 0, so Max with an animal gives the animal's own value
  pasture:   { extends: 'grass', phys: { friction: 0.8, restitution: 0 } },
  fencing:   { extends: 'wood', phys: { friction: 0.2, restitution: 0 } },          // fences, troughs, coop, hay, trees, barrels
  // animals are frictionless balls (was 0 with Min); restitution is half the old value, so the ground contact keeps Average(r, 0)
  pet:       { extends: 'flesh', phys: { friction: 0, restitution: 0.075 }, look: { roughness: 0.9 } }, // pigs, the dog; pig/dog/fox models
  petGrip:   { extends: 'pet', phys: { friction: 0.7 } },                            // grabbed or thrown pigs: √0.7·√0.8 ≈ 0.748 on grass
  bird:      { extends: 'flesh', phys: { friction: 0, restitution: 0.05 } },
  foxPelt:   { extends: 'flesh', phys: { friction: 0, restitution: 0 } },
  snack:     { extends: 'flesh', phys: { sg: 0.5, friction: 0.9, restitution: 0.175 } }, // 500 kg/m³, as 2.1.0's setDensity(500)
  // look-only model materials
  plumage:   { extends: 'fur', look: { fur: { length: 0.07, shells: 10, density: 34 } } }, // chicken shells (fur.js's len/density)
  // the pig crowd's skin: a short peach fuzz (shells) that mud and wet mat flat and shine (COVERAGE_INSTANCED, lion-hawk 0.15
  // COVERAGE_WET); it fluffs up again as the pig dries
  pigHide:   { extends: 'pet', look: { fur: { length: 0.05, shells: 8, density: 42, tint: '#fff2f4' } }, coverage: { mud: 1, wet: 1 } },
  // the baked models' own material ids (game.config.js renames Kenney's); their colours are baked into COLOR_0
  leaf:      { extends: 'grass' },
  petal:     { extends: 'grass' },
  crop:      { extends: 'grass' },
  stone:     { extends: 'gravel' },
  hay:       { extends: 'grass' },
  produce:   { extends: 'flesh' },
  scenery:   { extends: 'grass', look: { roughness: 0.95, metalness: 0 } },          // one material for all instanced decor (draw-call parity)
  mudPrint:  { extends: 'mud', look: { transparent: true, roughness: 0.6 } },         // muddy hoof prints (view/footprints.js): shape and fade are a patch
});
