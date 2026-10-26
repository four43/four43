// The game's actions (moved from game.sim.js so the net kinds can name them without a cycle). #81: goX/goZ are the wanted direction in
// the world frame (length = stick distance), merged across devices as one vector (I-1); goBack: the stick is in the reverse cone (C-8).
// The train replicates these actions as its input (plan 5): every peer runs the pilot on them.
import { actions, axis, button } from 'lion-hawk/sim';
export const ACTIONS = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button(), horn: button() });
