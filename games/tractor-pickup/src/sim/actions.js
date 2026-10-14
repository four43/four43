// The game's actions (moved from game.sim.js so the net kinds can name them without a cycle). #81: goX/goZ are the wanted direction in
// the world frame (length = stick distance), merged across devices as one vector (I-1); goBack: the stick is in the reverse cone (C-8).
// DRIVE: what a train replicates as its input (N-13): the pilot's output, so a raw-driven test train and a stick-driven one look alike to the others.
import { actions, axis, button } from 'lion-hawk/sim';
export const ACTIONS = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button(), horn: button() });
export const DRIVE = actions({ thr: axis(), steer: axis(), turn: axis() });
