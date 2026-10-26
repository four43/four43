// Tractor Pickup for the lion-hawk CLI (3l, overview §4.3). Node only. `lion-hawk bake` turns assets/models/*.glb (made by
// models.mjs from the Kenney pack, vertex-coloured) into baked/; `lion-hawk build --out <dir>` (or $TRACTOR_OUT) makes the page.
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'];
const CLIPS = ['static', 'idle', 'walk', 'run', 'eat', 'dance', 'gesture-positive', 'gesture-negative'];
const as = (from, to) => ({ rename: { materials: { [from]: to } } });
export default {
  id: 'tractor-pickup', outEnv: 'TRACTOR_OUT',
  bake: {
    src: 'assets/models', out: 'baked', materials: './src/defs/materials.js',
    palette: 'vertex', paint: { base: 'chassis' },
    rename: {
      materials: { colormap: 'pet', color: 'wood', woodBark: 'wood', woodDark: 'wood', woodInner: 'wood', leafsGreen: 'leaf', leafsFall: 'leaf',
        dirt: 'stone', _defaultMat: 'stone', corn: 'crop', colorRed: 'petal', colorYellow: 'petal' },
    },
    models: { // the hat empty is a socket on the pets only (3d: node renames are per model)
      ...Object.fromEntries(PETS.map(p => [p, { animTable: { fps: 30, clips: CLIPS }, sockets: ['hat'], rename: { nodes: { hat: 'sock-hat' } } }])),
      tractor: { rename: { materials: { colormap: 'chassis', tractor: 'chassis' } } },
      trailer: as('color', 'bed'), cone: as('color', 'plastic'), bale: as('color', 'crop'), hay: as('colormap', 'crop'),
      'hat-cowboy': as('color', 'fabric'), 'hat-party': as('color', 'fabric'), 'hat-straw': as('color', 'fabric'),
      sprinkler: as('color', 'steel'), wash: as('color', 'steel'), shrub: as('color', 'leaf'),
      barn: { static: true, keepTextures: true, rename: { materials: { planks: 'wood', shingles: 'wood' } } },
    },
    optimise: { meshopt: true, quantize: true, weld: true, prune: true, dedupe: true },
  },
  build: { out: '../../site/exp/tractor-pickup', entry: 'src/main.js', template: 'template.html', pwa: 'pwa', hooks: './build.hooks.js' },
};
