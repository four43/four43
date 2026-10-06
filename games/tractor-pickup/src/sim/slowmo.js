// B-7: the game runs at half speed for 0.3 s at the top of a launch arc. Counted in sim seconds; never stacks.
export const SLOW = { scale: 0.5, time: 0.3 };
export function createSlowMo() {
  let wait = -1, left = 0; // sim seconds until the arc top (-1: none waiting), sim seconds of slow motion left
  return {
    onLaunch(dur) { if (wait < 0 && left <= 0) wait = dur / 2; }, // the top of this flight's arc
    scale: () => left > 0 ? SLOW.scale : 1,
    step(dt) {
      if (wait >= 0) { wait -= dt; if (wait <= 0) { left = SLOW.time + wait; wait = -1; } }
      else if (left > 0) left -= dt;
    },
  };
}
