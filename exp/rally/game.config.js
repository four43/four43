// Rally's lion-hawk CLI config (Node only; overview §4.3, §5.4). The Kenney Car Kit GLBs carry one textured material,
// `colormap`: the bake samples it into vertex colours (palette: 'vertex', as the retired bake.mjs did) and renames it per model.
// Rally's car colliders are inline (the vehicle builds them) and the track is procedural, so the sidecars only feed
// checks.materials. The engine's default optimise (weld on) applies: dropping the UVs lets weld merge vertices, so the
// parity test compares triangle counts (3d note (a)).
import { CAR_IDS } from './src/cars.js';

// The real cars (rally-spec R16-1): their paint slots bake to car-body. The colour is the vertex colour either way; a paint
// slot would cost its own shader program (the PAINT feature) for a per-entity repaint Rally doesn't use.
const CAR_PAINT = { rename: { materials: { 'paint-body': 'car-body', 'paint-livery': 'car-body' } } };

export default {
  id: 'rally', outEnv: 'RALLY_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',
    palette: 'vertex',
    models: {
      'wheel-racing': { rename: { materials: { colormap: 'tyre' } } },
      cone: { rename: { materials: { colormap: 'cone' } } },
      ...Object.fromEntries(CAR_IDS.map(id => [id, CAR_PAINT])),
    },
  },
  build: { out: '../../site/exp/rally', entry: 'src/main.js', template: 'index.template.html', pwa: 'pwa' },
};
