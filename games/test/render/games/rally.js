// Rally's adapter for the model sheet (browser): the render options from rallyView's defineView (RENDER plus the baked assets)
// and the game's registry.
import { rallyView } from '../../../rally/src/game.view.js';
import registry from '../../../rally/src/defs/materials.js';

export default { id: 'rally', registry, render: () => rallyView().render };
