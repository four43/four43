// The scenery models (rally-spec R19-1; built by tools/scenery/*.model.mjs) per theme and placement kind. Shared by the
// bake config, the view and the tests. Each model holds nodes lod0, lod1 (and lod2 for trees) and draws as `scenery`.
export const SCENERY_MODELS = {
  summer: { pine: 'tree-pine', leafy: 'tree-leafy', bush: 'bush', 'rock-a': 'rock-a', 'rock-b': 'rock-b', fence: 'fence', post: 'fence-post' },
  winter: { pine: 'tree-pine-snow', leafy: 'tree-pine-snow', bush: 'bush', 'rock-a': 'rock-a-snow', 'rock-b': 'rock-b-snow', fence: 'fence-snow', post: 'fence-post' },
};
export const SCENERY_IDS = [...new Set(Object.values(SCENERY_MODELS).flatMap((m) => Object.values(m)))].sort();
