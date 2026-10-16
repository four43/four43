// M-7, user decision 2026-10-13 (3l): tractors are solid; Rapier keeps them apart. A contact between this device's tractor and another
// player's honks (the view plays the boing and a short horn for `bump`) once per contact: it re-arms only after the two have been apart
// for BUMP.cool s of sim time, so a sustained push honks once. Only this device's own tractor counts: each involved device honks for itself.
import { DT } from './ground.js';
export const BUMP = { cool: 0.6 }; // s apart before a new contact honks again
export function createBumper(world) {
  const apart = new Map(); let touching = false;
  const seen = manifold => { if (manifold.numContacts() > 0) touching = true; };
  const touches = (a, b) => { touching = false; for (const ca of a.colliders) for (const cb of b.colliders) { world.rapier.contactPair(ca.collider, cb.collider, seen); if (touching) return true; } return false; };
  return {
    drive(game, events) {
      if (game.mode !== 'drive' || !world.rapier) return; // M-4: a tractor in its show stays in the barn
      const own = game.tractor.e, list = world.with('net');
      for (let i = 0; i < list.length; i++) {
        const e = list[i]; if (e.net !== 'train' || e === own || !e.remote || !e.colliders) continue;
        const was = apart.get(e.netId) ?? Infinity, now = touches(own, e);
        if (now) { if (was >= BUMP.cool) events.push({ type: 'bump', other: e.netId }); apart.set(e.netId, 0); }
        else apart.set(e.netId, was === Infinity ? Infinity : was + DT);
      }
    },
  };
}
