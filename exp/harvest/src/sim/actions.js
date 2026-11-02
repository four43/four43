// Harvest's actions (H-C1, after Tractor Pickup's): goX/goZ are the wanted direction in the world frame (length = stick distance),
// merged across devices as one vector; goBack says the stick is in the reverse cone. The combine replicates these as its input.
import { actions, axis, button } from 'lion-hawk/sim';
export const ACTIONS = actions({ goX: axis({ pair: 'goZ' }), goZ: axis(), goBack: button(), horn: button() });
