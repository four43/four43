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
  paintwork: { extends: 'steel', phys: { friction: 0.4, restitution: 0 } },          // the tractor (mass from massProps, D3)
  // look-only model materials
  plumage:   { extends: 'fur', look: { fur: { length: 0.07, shells: 10, density: 34 } } }, // chicken shells (fur.js's len/density)
  pigHide:   { extends: 'pet', coverage: { mud: 1 } },                              // the pig crowd's skin: mud through COVERAGE_INSTANCED (Task 15)
  // the Nature Kit's factor-only materials (no palette texture): their Kenney colours live here, so the compiler draws them
  // (game.config.js renames Kenney's names to these ids; the colours are 2.1.0's, the factors read as sRGB bytes)
  leaf:      { extends: 'grass', look: { color: '#29c9ab' } },   // leafsGreen
  leafFall:  { extends: 'grass', look: { color: '#ff9241' } },   // leafsFall
  blade:     { extends: 'grass', look: { color: '#2cd8b8' } },   // grass
  petal:     { extends: 'grass', look: { color: '#feb147' } },   // colorYellow
  petalRed:  { extends: 'grass', look: { color: '#e04a50' } },   // colorRed
  crop:      { extends: 'grass', look: { color: '#f5bc64' } },   // corn
  woodLight: { extends: 'wood', look: { color: '#ff8e62' } },    // wood
  woodDark:  { extends: 'wood', look: { color: '#c46d4b' } },    // woodDark
  bark:      { extends: 'wood', look: { color: '#e28357' } },    // woodBark
  birch:     { extends: 'wood', look: { color: '#fff2de' } },    // woodBirch
  signFace:  { extends: 'wood', look: { color: '#ffffff' } },    // _defaultMat
  soil:      { extends: 'dirt', look: { color: '#e28357' } },    // dirt
  stone:     { extends: 'gravel', look: { color: '#b8e2e8' } },  // stone
  // the textured kits' palettes are baked into vertex colours (palette: 'vertex')
  hay:       { extends: 'grass' },
  produce:   { extends: 'flesh' },
  scenery:   { extends: 'grass', look: { roughness: 0.95, metalness: 0 } },          // one material for all instanced decor (draw-call parity)
});
