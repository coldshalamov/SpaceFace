// Computed material for surfaces that paint themselves with inline style pins.
//
// WHY THIS EXISTS. Seven screens — codex, crucible, help, newGame, range, saveLoad, techTree —
// each carry their own copy of the same paintPlate / paintKey / paintInput helpers, and each copy
// pinned a nine-sliced PNG inline:
//
//     'border-image-source': 'url("' + fhUrl('keys/' + spec.file + '.' + state + '.png') + '")',
//     'border-image-slice': '18 fill', 'border-image-repeat': 'stretch', ...
//
// `keys/key.primary.rest.png` is 240x56. A 480x112 @2x sits beside it on disk and nothing
// references it, so on the Electron app at devicePixelRatio 2 every one of these controls was a
// bitmap upsampled 2x. ONE_PHOTOGRAPH.md §4.11 retires raster nine-slices as UI material.
//
// These screens pin inline rather than using classes because the kit's component sheet
// (assets/ui/kit/kit/fh.css) is injected by stationApp.ensureStylesheet() and so is absent until
// the player first docks. That is worth fixing separately; until then a pin is how these surfaces
// get a material, and this module makes the pin computed instead of raster.
//
// THE GEOMETRY RULE. A nine-slice paints INTO the border box, so `border-width: 18px` is real
// spacing the layout depends on. Every recipe here keeps the border at its original width and
// makes it transparent, painting the face `border-box`. Same box model, same content position,
// nothing moves.
//
// WHAT MAKES A CAP READ AS A CAP: a 1px lit top rule, a 1px dark sill, a seat shadow. Those three
// hairlines are the whole illusion and they are exactly one device pixel at any scale — the one
// thing a stretched slice can never be. The values live in Deckplate's tokens (--dp-cap-*), so a
// pin here and a class in a stylesheet resolve to the same material.

/** Shared by every recipe: keep the box, hide the border, paint across the whole of it. */
function box(width) {
  return {
    'border-style': 'solid',
    'border-width': width,
    'border-color': 'transparent',
    'border-image-source': 'none',
    'background-origin': 'border-box',
    'background-clip': 'border-box',
    'box-sizing': 'border-box',
  };
}

const CAP = {
  rest: { bg: 'var(--dp-cap-rest)', sh: 'var(--dp-cap-lift)' },
  hover: { bg: 'var(--dp-cap-hover)', sh: 'var(--dp-cap-lift)' },
  focus: { bg: 'var(--dp-cap-hover)', sh: 'inset 0 0 0 2px var(--dp-ink, #e2e8f0), var(--dp-cap-lift)' },
  pressed: { bg: 'var(--dp-cap-press)', sh: 'var(--dp-cap-sink)' },
  disabled: { bg: 'var(--dp-cap-off)', sh: 'var(--dp-cap-off-edge)' },
};
const CAP_LIVE = {
  rest: { bg: 'var(--dp-cap-live)', sh: 'var(--dp-cap-live-lift)' },
  hover: { bg: 'var(--dp-cap-live-hover)', sh: 'var(--dp-cap-live-lift)' },
  focus: { bg: 'var(--dp-cap-live-hover)', sh: 'inset 0 0 0 2px rgb(255 249 235 / .9), var(--dp-cap-live-lift)' },
  pressed: { bg: 'var(--dp-cap-press)', sh: 'var(--dp-cap-sink)' },
  disabled: { bg: 'var(--dp-cap-off)', sh: 'var(--dp-cap-off-edge)' },
};
// A LEGEND IS NOT A KEY (§4.2): a filter or a tab changes what you are looking at, never the world,
// so it carries no cap — just a word that lights, with one bar under it.
const LEGEND = {
  rest: { bg: 'none', sh: 'none' },
  hover: { bg: 'none', sh: 'inset 0 -2px 0 0 rgb(226 232 240 / .45)' },
  focus: { bg: 'none', sh: 'inset 0 -2px 0 0 var(--dp-ink, #e2e8f0)' },
  pressed: { bg: 'none', sh: 'inset 0 -2px 0 0 var(--dp-lamp-hot, #f2b950)' },
  lit: { bg: 'none', sh: 'inset 0 -2px 0 0 var(--dp-lamp-hot, #f2b950)' },
  disabled: { bg: 'none', sh: 'none' },
};

/**
 * A key's face. `kind` is primary | legend | small | secondary | hazard; `state` is
 * rest | hover | focus | pressed | disabled | lit.
 * @returns {Record<string,string>} style pins, spread straight into pin()
 */
export function capPins(kind, state = 'rest', width = '14px') {
  const table = kind === 'primary' ? CAP_LIVE : kind === 'legend' ? LEGEND : CAP;
  const face = table[state] || table.rest;
  return { ...box(width), 'background-image': face.bg, 'box-shadow': face.sh };
}

/** A plate: `raised` is a cap of stock, `sunk` is a recess, `edge` is thin stock. */
export function platePins(variant = 'sunk', width = '24px') {
  const face = variant === 'raised'
    ? { bg: 'var(--dp-cap-rest)', sh: 'var(--dp-cap-lift)' }
    : variant === 'edge'
      ? { bg: 'var(--dp-stock-face)', sh: 'var(--dp-stock-edge)' }
      : { bg: 'var(--dp-well-face)', sh: 'var(--dp-well-sink)' };
  return { ...box(width), 'background-image': face.bg, 'box-shadow': face.sh };
}

/** Smoked glass. The specular is PLACED as a fraction of the box, never stretched. */
export function panePins(variant = 'glass', width = '20px') {
  const face = variant === 'viewport'
    ? { bg: 'var(--dp-pane-live-face)', sh: 'var(--dp-pane-live-edge)' }
    : variant === 'deep'
      ? { bg: 'linear-gradient(176deg, rgb(5 7 10 / .90), rgb(3 4 7 / .96))', sh: 'var(--dp-pane-edge)' }
      : { bg: 'var(--dp-pane-face)', sh: 'var(--dp-pane-edge)' };
  return { ...box(width), 'background-image': face.bg, 'box-shadow': face.sh };
}

/** An input's underline: a machined channel, not a border. */
export function channelPins(state = 'rest', width = '12px') {
  const bg = state === 'focus'
    ? 'var(--dp-chan-live)'
    : state === 'error'
      ? 'linear-gradient(180deg, rgb(0 0 0 / .5) 0 1px, #d65a46 1px 2px)'
      : state === 'disabled'
        ? 'linear-gradient(180deg, rgb(0 0 0 / .4) 0 1px, rgb(226 232 240 / .04) 1px 2px)'
        : 'var(--dp-chan-rest)';
  return { ...box(width), 'background-image': bg, 'box-shadow': 'none' };
}

/** A selected row: the lamp reaches it from the left edge (§5 P2), never a fill. */
export function rowPins(width = '8px 16px') {
  return {
    ...box(width),
    'background-image': 'linear-gradient(90deg, rgb(242 185 80 / .14), rgb(242 185 80 / 0) 62%)',
    'box-shadow': 'inset 2px 0 0 0 var(--dp-lamp-hot, #f2b950)',
  };
}

/** A recess a number or a thumb sits in. */
export function wellPins(width = '10px') {
  return { ...box(width), 'background-image': 'var(--dp-well-face)', 'box-shadow': 'var(--dp-well-sink)' };
}
