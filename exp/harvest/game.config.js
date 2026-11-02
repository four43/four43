// Harvest for the lion-hawk CLI. Node only. Sources: assets/models/custom/ (our own, tools/models/*.model.mjs, glb-author) and
// assets/models/nature-kit/ (vendored Kenney, CC0). The bake reads each GLB's material colours into vertex colours (palette
// 'vertex') and renames the materials to registry ids (src/defs/materials.js). `lion-hawk bake` → baked/; `lion-hawk build` → the page.
// Our models' material names → registry ids. The colour is the vertex colour either way; the id picks the look and the physics.
const MATS = {
  paint: 'paint', trim: 'paint', metal: 'steel', galv: 'steel', tyre: 'tyre', glass: 'glass', light: 'glass', grain: 'grain',
  crop: 'crop', head: 'crop', petal: 'crop', seed: 'crop', cob: 'crop', tassel: 'crop',
  red: 'wood', white: 'wood', roof: 'wood', wood: 'wood', board: 'wood', sign: 'wood', concrete: 'stone',
  // the backyard: the mower's driver and seat, the farmhouse, compost bins, kennel and flower bed
  seat: 'scenery', skin: 'scenery', shirt: 'scenery', jeans: 'scenery', hat: 'scenery',
  wall: 'wood', dark: 'wood', brick: 'stone', soil: 'stone', flower: 'crop',
  // the meadow: the tractor's and bale trailer's yellow wheel rims
  rim: 'paint',
};
const custom = f => ({ file: `custom/${f}.glb`, rename: { materials: MATS } });
const nature = f => ({ file: `nature-kit/${f}.glb` });

export default {
  id: 'harvest', outEnv: 'HARVEST_OUT',
  bake: {
    src: 'assets/models', out: 'baked', materials: './src/defs/materials.js',
    // Kenney's Nature Kit names → registry ids
    rename: { materials: { woodDark: 'wood', woodBark: 'wood', leafsGreen: 'leaf', leafsFall: 'leaf', stone: 'stone', dirt: 'stone', colorYellow: 'leaf', colorRed: 'leaf', _defaultMat: 'wood' } },
    palette: 'vertex',
    models: {
      combine: custom('combine'), header: custom('header'), cart: custom('cart'),
      wheat: custom('wheat'), corn: custom('corn'), sunflower: custom('sunflower'),
      silo: { ...custom('silo'), static: true }, shed: { ...custom('shed'), static: true }, sign: custom('sign'),
      mower: custom('mower'), tipcart: custom('tipcart'),
      lawn: custom('lawn'), longgrass: custom('longgrass'), clover: custom('clover'),
      farmhouse: { ...custom('farmhouse'), static: true }, compost: { ...custom('compost'), static: true },
      doghouse: { ...custom('doghouse'), static: true }, flowerbed: { ...custom('flowerbed'), static: true }, gate: custom('gate'), workbench: { ...custom('workbench'), static: true },
      tractor: custom('tractor'), baletrailer: custom('baletrailer'), bale: custom('bale'), haybarn: { ...custom('haybarn'), static: true },
      hay: custom('hay'), alfalfa: custom('alfalfa'), wildflowers: custom('wildflowers'),
      fence: nature('fence_simple'), oak: nature('tree_oak'), tree: nature('tree_default'), treeFat: nature('tree_fat'),
      bush: nature('plant_bush'), bushL: nature('plant_bushLarge'), rock: nature('rock_smallC'),
    },
    optimise: { meshopt: true, quantize: false, weld: false, prune: true, dedupe: true },
  },
  // the installed app opens full screen; the manifest is the engine's (build.manifest), the icons and the service worker are in pwa/
  build: {
    out: '../../site/exp/harvest', entry: 'src/main.js', template: 'template.html', pwa: 'pwa',
    manifest: { name: 'Harvest', themeColor: '#bfe6f5', backgroundColor: '#bfe6f5', icon: 'pwa/icon.svg', display: 'fullscreen' },
  },
};
