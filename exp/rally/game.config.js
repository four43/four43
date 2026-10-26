// Rally's lion-hawk CLI config (Node only; overview §4.3, §5.4). The Kenney Car Kit GLBs carry one textured material,
// `colormap`: the bake samples it into vertex colours (palette: 'vertex', as the retired bake.mjs did) and renames it per model.
// Rally's car colliders are inline (the vehicle builds them) and the track is procedural, so the sidecars only feed
// checks.materials. The engine's default optimise (weld on) applies: dropping the UVs lets weld merge vertices, so the
// parity test compares triangle counts (3d note (a)).
export default {
  id: 'rally', outEnv: 'RALLY_OUT',
  bake: {
    src: 'assets/models', out: 'baked',
    materials: './src/defs/materials.js',
    palette: 'vertex',
    models: {
      'hatchback-sports': { rename: { materials: { colormap: 'car-body' } } },
      'sedan-sports': { rename: { materials: { colormap: 'car-body' } } },
      'wheel-racing': { rename: { materials: { colormap: 'tyre' } } },
      cone: { rename: { materials: { colormap: 'cone' } } },
    },
  },
  build: { out: '../../site/exp/rally', entry: 'src/main.js', template: 'index.template.html', pwa: 'pwa' },
};
