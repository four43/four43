// X-11: the size of the game view (the canvas), for screen-space layout (ui/show.js, view/hud.js). The drive half copies
// view.gfx.size here each frame (the engine renderer owns the canvas size, overview §4.6).
export const VIEW = { w: globalThis.innerWidth || 1, h: globalThis.innerHeight || 1 };
