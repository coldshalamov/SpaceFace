// Build-only Deckplate stylesheet composition. Product runtime loads the generated CSS sidecar;
// keeping these authored fragments out of index.js prevents the source UI graph from parsing them
// as JavaScript before the CSS is needed.
import { DECKPLATE_TOKENS_CSS } from './tokens.js';
import { DECKPLATE_MATERIALS_CSS } from './materials.js';
import { DECKPLATE_COMPONENTS_CSS, DECKPLATE_COMPONENTS_FORCED_CSS } from './components.js';
import { DECKPLATE_HARDWARE_CSS } from './hardware.js';
import { DECKPLATE_LAYOUT_CSS } from './layout.js';
import { DECKPLATE_LIGHT_CSS } from './light.js';
import { DECKPLATE_TRANSITION_CSS } from './transition.js';
import { DECKPLATE_SCREENS_CSS } from './screens.js';

/** Exact combined stylesheet formerly injected by deckplate/index.js. */
export const DECKPLATE_CSS =
  DECKPLATE_TOKENS_CSS + '\n' +
  DECKPLATE_MATERIALS_CSS + '\n' +
  DECKPLATE_COMPONENTS_CSS + '\n' +
  DECKPLATE_HARDWARE_CSS + '\n' +
  DECKPLATE_LAYOUT_CSS + '\n' +
  // The second substance. It comes after the machine so a veil can sit over a plate, and before
  // the placement layer so a screen can still position what the light layer defines.
  DECKPLATE_LIGHT_CSS + '\n' +
  DECKPLATE_TRANSITION_CSS + '\n' +
  DECKPLATE_SCREENS_CSS + '\n' +
  DECKPLATE_COMPONENTS_FORCED_CSS;
