// Pig Pens for the lion-hawk CLI (overview §4.3, D1, D2). Node only. Sources: assets/models/<kit>/ (vendored Kenney,
// Task 1); bake output: baked/ (committed). Model ids are the ones the game has always used (bake.mjs's table).
const nature = f => ({ file: `nature-kit/${f}.glb` });
const kit = (k, f, material) => ({ file: `${k}/${f}.glb`, rename: { materials: { colormap: material } } });
const PET_CLIPS = ['idle', 'walk', 'run', 'eat', 'dance', 'gesture-negative'];
// our own buildings (tools/models/*.model.mjs, glb-author): plain colour factors baked to COLOR_0, every material drawn as wood
const custom = (f, mats) => ({ file: `custom/${f}.glb`, rename: { materials: Object.fromEntries(mats.map(m => [m, 'wood'])) } });
// the clinic's furniture (Kenney Furniture Kit: factor colours, no texture); all of it draws as wood (no metal: no env map)
const FURNITURE = ['desk', 'chairDesk', 'computerScreen', 'bedSingle', 'pillow', 'kitchenCabinet', 'kitchenSink', 'kitchenFridgeSmall',
  'kitchenCoffeeMachine', 'rugRounded', 'pottedPlant', 'lampRoundFloor', 'bookcaseOpenLow', 'trashcan', 'coatRackStanding',
  'bookcaseClosedWide', 'shower', 'toilet', 'bathroomSink', 'table', 'chair'];
const FURN_MATS = ['wood', 'woodDark', 'metal', 'metalLight', 'metalMedium', 'metalDark', 'glass', 'plant', 'carpet', 'carpetWhite', 'carpetDarker', 'lamp', '_defaultMat'];
export const furnId = f => `furn_${f}`;

export default {
  id: 'pig-pens', outEnv: 'PIGPENS_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',
    // Kenney's Nature Kit names → registry ids (A-2: renames apply before the checks)
    rename: { materials: { woodDark: 'wood', woodBark: 'wood', woodBirch: 'wood', leafsGreen: 'leaf', leafsFall: 'leaf',
      colorYellow: 'petal', colorRed: 'petal', corn: 'crop', _defaultMat: 'wood' } },
    palette: 'vertex',          // palette texels × base factors (or the factor alone) → COLOR_0, as bake.mjs did (Tractor Pickup's tools/glb.mjs logic)
    models: {
      fence: nature('fence_simple'), gate: nature('fence_gate'), planks: nature('fence_planks'), post: nature('fence_corner'),
      oak: nature('tree_oak'), tree: nature('tree_default'), treeFat: nature('tree_fat'), treeFall: nature('tree_default_fall'),
      bush: nature('plant_bushLarge'), bushS: nature('plant_bush'), flowerY: nature('flower_yellowB'), flowerR: nature('flower_redA'),
      rock: nature('rock_smallC'), pumpkin: nature('crop_pumpkin'), corn: nature('crops_cornStageD'), grass: nature('grass_large'),
      grassS: nature('grass'), wheat: nature('crops_wheatStageA'), sign: nature('sign'),
      hay: kit('graveyard-kit', 'hay-bale', 'hay'), hayB: kit('graveyard-kit', 'hay-bale-bundled', 'hay'),
      apple: kit('food-kit', 'apple', 'produce'), carrot: kit('food-kit', 'carrot', 'produce'), cabbage: kit('food-kit', 'cabbage', 'produce'),
      cob: kit('food-kit', 'corn', 'produce'), egg: kit('food-kit', 'egg', 'produce'), barrel: kit('food-kit', 'barrel', 'wood'),
      sack: kit('food-kit', 'bag', 'fabric'),
      bread: kit('food-kit', 'bread', 'produce'), banana: kit('food-kit', 'banana', 'produce'), cupTea: kit('food-kit', 'cup-tea', 'produce'),
      pig: { ...kit('cube-pets', 'animal-pig', 'pet'), animTable: { fps: 30, clips: PET_CLIPS } },
      chick: { ...kit('cube-pets', 'animal-chick', 'plumage'), animTable: { fps: 30, clips: PET_CLIPS } },
      dog: kit('cube-pets', 'animal-dog', 'pet'), fox: kit('cube-pets', 'animal-fox', 'pet'),
      // our own (tools/models/dog-house.model.mjs, glb-author): plain colour factors, baked to COLOR_0 like the Nature Kit
      dogHouse: { file: 'custom/dog-house.glb', rename: { materials: { houseRed: 'wood', roofDark: 'wood', trim: 'wood', doorDark: 'wood' } } },
      // v3 buildings (src/defs/buildings.js), their furniture, the vet and her cat
      coop: custom('coop', ['wood', 'wall', 'trim', 'roof', 'plank', 'straw']),
      barn: custom('barn', ['barnRed', 'trim', 'roofGrey', 'straw', 'wood', 'lampGlow']),
      clinic: custom('clinic', ['wall', 'trim', 'slate', 'mint', 'pale', 'wood', 'dark']),
      doctorBag: custom('doctor-bag', ['leather', 'brass', 'dark', 'white', 'red']), laptop: custom('laptop', ['shell', 'dark', 'screen', 'logo']),
      vetTools: custom('vet-tools', ['white', 'metal', 'teal', 'red', 'pink', 'yellow', 'glass', 'dark']),
      ...Object.fromEntries(FURNITURE.map(f => [furnId(f), { file: `furniture-kit/${f}.glb`, rename: { materials: Object.fromEntries(FURN_MATS.map(m => [m, 'wood'])) } }])),
      vet: kit('mini-characters', 'character-female-f', 'pet'),
      cat: kit('cube-pets', 'animal-cat', 'pet'),
    },
    optimise: { meshopt: true, quantize: false, weld: false, prune: true, dedupe: true },
  },
  build: { out: '../../site/exp/piggie-game', entry: 'src/main.js', template: 'template.html', pwa: 'pwa' },
};
