// W-1: die-cut stickers (3l Task 17; was a hand-made render target, crop and border). The animal in the sticker's pose (one frame of
// a clip) and camera angle, through the engine's snapshot: the studio lights and yaw/pitch framing are 1.8's sticker rig, crop:
// true cuts to the animal, outline the thick white border that follows its shape. Each look is rendered once, then cached.
import * as THREE from 'three';
import { snapshot } from 'lion-hawk/view';
import { petKind, posePart, hasClip } from '../view/pets.js';
import { MODEL } from '../render/animals3d.js';

// pose -> [clip, the moment in it as a part of its length]: a frame where the pose reads clearly
export const POSE_FRAME = { idle: ['idle', 0.2], walk: ['walk', 0.25], run: ['run', 0.3], dance: ['dance', 0.35], eat: ['eat', 0.5], shake: ['gesture-negative', 0.4] };
// view -> the animal turned by yaw (0 faces the camera) and the camera raised by pitch (rad)
export const VIEW_ANGLES = [{ yaw: -0.55, pitch: 0.22 }, { yaw: 0.55, pitch: 0.22 }, { yaw: -1.05, pitch: 0.3 }, { yaw: 1.05, pitch: 0.3 }, { yaw: -0.3, pitch: 0.55 }];
const N = 384, BORDER = 11; // render size and white border (px)

export function createStickerArt(renderer, assets, compiler) {
  const mat = compiler.get('pet', { vertexColors: true }), gold = compiler.get('gold'), cache = new Map(), info = {};
  function render({ type, golden, pose, view }) {
    const k = petKind(assets, MODEL[type]), [clip, at] = POSE_FRAME[pose] || POSE_FRAME.idle, name = hasClip(k, clip) ? clip : 'idle', v = VIEW_ANGLES[view] || VIEW_ANGLES[0];
    const g = new THREE.Group(), t = at * k.table.clips[name].dur;
    for (const p of k.parts) { const m = new THREE.Mesh(p.geometry, golden ? gold : mat); m.matrixAutoUpdate = false; posePart(k, name, t, p.index, m.matrix); g.add(m); }
    const src = snapshot(renderer, g, { size: N, yaw: v.yaw, pitch: v.pitch, crop: true, outline: { px: BORDER, color: '#ffffff' }, out: info });
    return src ? { src, w: info.w, h: info.h } : { src: '', w: 1, h: 1 }; // nothing drawn: 1.8's empty sticker
  }
  return {
    // { src (PNG data URL), w, h } for a sticker { type, golden, pose, view }
    get(s) { const key = `${s.type}|${!!s.golden}|${s.pose}|${s.view}`; if (!cache.has(key)) cache.set(key, render(s)); return cache.get(key); },
  };
}
