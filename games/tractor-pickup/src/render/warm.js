// B-2 (X-4): compile every shader program while the farm loads, not the first time a mesh comes into view mid-drive (on an iPad a
// compile through ANGLE to Metal can take 50-400 ms). three.js compiles only visible objects, so hidden ones (hats, sparkle frames,
// a golden animal far away) are shown for the synchronous part of compileAsync and hidden again before any frame draws.
export function warmShaders(renderer, scene, camera) {
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  let done;
  try { done = renderer.compileAsync(scene, camera); } finally { for (const o of hidden) o.visible = false; }
  return done;
}
