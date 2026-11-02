// Harvest's materials (lion-hawk material registry). Sim-pure data: the colliders' physics, the bake's renamed model materials and
// the view's looks. Colours come from the models' vertex colours (palette 'vertex'), so most looks only set roughness. No
// environment map here, so metalness stays 0 (metal reads black without one).
import { defineMaterials } from 'lion-hawk/sim';

export default defineMaterials({
  // colliders
  ground:   { extends: 'dirt', phys: { friction: 0.7, restitution: 0 } },
  chassis:  { extends: 'steel', phys: { friction: 0.2, restitution: 0 }, look: { metalness: 0, roughness: 0.9 } },
  building: { extends: 'wood', phys: { friction: 0.3, restitution: 0 } },
  fence:    { extends: 'wood', phys: { friction: 0.1, restitution: 0 } },
  // the models' materials (game.config.js renames the GLBs' own names to these)
  paint:    { extends: 'chassis' },                                         // the combine's and carts' body colour
  steel:    { look: { metalness: 0, roughness: 0.85 } },
  tyre:     { extends: 'rubber', look: { roughness: 1 } },
  glass:    { look: { metalness: 0, roughness: 0.2 } },
  grain:    { extends: 'grass', look: { roughness: 1 } },
  crop:     { extends: 'grass', look: { roughness: 1 } },
  leaf:     { extends: 'grass', look: { roughness: 1 } },
  wood:     { look: { roughness: 1 } },
  stone:    { extends: 'gravel', look: { roughness: 1 } },
  scenery:  { extends: 'plastic', look: { roughness: 1, metalness: 0 } },
  // the view's own surfaces
  soil:     { extends: 'dirt', look: { color: '#ffffff', roughness: 1 } },  // the field and yard ground (a canvas texture gives the colour)
  paper:    { extends: 'plastic', look: { color: '#ffffff', roughness: 1, metalness: 0 } },
});
