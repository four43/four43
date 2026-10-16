// Tractor Pickup's adapter for the model sheet (browser): the render options from the game's own view factory (tractorView's
// defineView({ render: RENDER })), the registry its bake and compiler use, and the paint a new player's train has (START_PAINT,
// as trainViews paints it through the compiler's paint slots).
import { tractorView } from '../../../tractor-pickup/src/game.view.js';
import registry from '../../../tractor-pickup/src/defs/materials.js';
import { paintValues } from '../../../tractor-pickup/src/view/vehicles.js';
import { START_PAINT } from '../../../tractor-pickup/src/net/players.js';

export default {
  id: 'tractor-pickup', registry,
  render: () => tractorView().render,
  cloneOpts: key => key === 'tractor' ? { paint: paintValues(START_PAINT) } : {},
};
