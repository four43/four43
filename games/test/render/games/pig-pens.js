// Pig Pens' adapter for the model sheet (browser): the render options from pigPensView's defineView, with the shading main.js
// boots by default ('lambert'; ?shading= picks another tier) and the game's registry. The tilt-shift post pass is not drawn.
import { pigPensView } from '../../../pig-pens/src/game.view.js';
import registry from '../../../pig-pens/src/defs/materials.js';

export default { id: 'pig-pens', registry, render: () => pigPensView({ tilt: false, shading: 'lambert' }).render };
