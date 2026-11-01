// Scenery visuals (rally-spec R19-4, R19-6, R20): trees, bushes and rocks through lion-hawk's createScatter (cells refilled
// as the camera moves, zooms or turns, culled to the view cone), fence sections and posts through createLodInstances,
// posed from their bodies each frame. Every model (tools/scenery/*.model.mjs) holds nodes lod0, lod1 (and lod2) at one
// origin; the engine merges each level, fades between levels with a GPU dither band (LOD_FADE, shadows too) and scales
// the distances by the camera's field of view (lion-hawk A-12–A-18).
import { createScatter, createLodInstances } from 'lion-hawk/view';
import { SCENERY } from '../gen/scenery.js';
import { SCENERY_MODELS } from '../defs/scenery.js';

// LOD switch distances (m, camera to the instance, at the reference fov): lodN up to d[N], hidden past the last; band: half
// the fade band.
const LOD = {
  pine: { d: [70, 230, 720], band: 14 }, leafy: { d: [70, 230, 720], band: 14 }, bush: { d: [45, 160], band: 10 },
  'rock-a': { d: [60, 320], band: 12 }, 'rock-b': { d: [60, 320], band: 12 }, fence: { d: [90, 400], band: 10 }, post: { d: [90, 400], band: 10 },
};
const PROPS = ['fence', 'post'];

export class SceneryView {
  constructor(root, world, kit) {
    const track = world.track, S = track.scenery, theme = track.theme === 'winter' ? 'winter' : 'summer';
    const models = SCENERY_MODELS[theme], compiler = kit.mc, byKind = {};
    for (const t of S ? [...S.trees, ...S.bushes, ...S.rocks] : []) (byKind[t.kind] ??= []).push(t);
    this.scatters = Object.entries(byKind).map(([kind, list]) => {
      // Sunk SCENERY.sink m (rocks × scale), as TrackWorld's colliders stand.
      const items = list.map((t) => ({ p: [t.x, t.y - SCENERY.sink * (kind.startsWith('rock') ? t.scale : 1), t.z], yaw: t.yaw, s: t.scale }));
      const sc = createScatter({ asset: kit.assets.get(models[kind]), items, distances: LOD[kind].d, band: LOD[kind].band, compiler });
      root.add(sc.object);
      return sc;
    });
    this.props = (world.props || []).filter((p) => PROPS.includes(p.kind));
    this.lods = {};
    for (const kind of PROPS) {
      const max = this.props.filter((p) => p.kind === kind).length;
      if (!max) continue;
      this.lods[kind] = createLodInstances({ asset: kit.assets.get(models[kind]), distances: LOD[kind].d, band: LOD[kind].band, compiler, max });
      root.add(this.lods[kind].object);
    }
    this.sc = { x: 1, y: 1, z: 1 };
  }

  // camera: the render camera (the engine measures from it, zoom included).
  update(camera) {
    for (const sc of this.scatters) sc.update(camera);
    if (!this.props.length) return;
    for (const kind in this.lods) this.lods[kind].begin(camera);
    for (const pr of this.props) {
      const xf = pr.e.xf;
      this.sc.z = pr.kind === 'fence' ? pr.home.len / 3 : 1;
      this.lods[pr.kind].add(xf.p, xf.q, this.sc);
    }
    for (const kind in this.lods) this.lods[kind].commit();
  }

  triangles() {
    let t = 0;
    for (const lv of [...this.scatters, ...Object.values(this.lods)]) for (const list of lv.levels) for (const im of list) t += im.mesh.count * im.mesh.geometry.index.count / 3;
    return t;
  }

  dispose() { for (const lv of [...this.scatters, ...Object.values(this.lods)]) lv.dispose(); }
}
