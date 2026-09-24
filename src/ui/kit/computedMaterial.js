// Printed surfaces for screens that paint themselves with inline style pins.
//
// WHY THIS EXISTS. Seven screens -- codex, crucible, help, newGame, range, saveLoad, techTree -- pin
// their surfaces inline rather than through classes, because the kit's component sheet
// (assets/ui/kit/kit/fh.css) is injected by stationApp.ensureStylesheet() and so is absent until the
// player first docks. That is worth fixing separately; until then a pin is how these surfaces get
// painted, and this module is the one place the paint is decided.
//
// HISTORY, because it is the lesson. These pins were nine-sliced PNGs (a 240x56 key upsampled 2x on
// every HiDPI display -- the owner's "smudges"), then COMPUTED caps (a lit top rule, a dark sill and a
// seat shadow standing in for a moulded key), and on 2026-09-22 the owner ruled that CSS pretending
// to be a physical material looks awful (design/frontend/ONE_PHOTOGRAPH.md sections 0 and 9). They are
// now PRINTED: a flat field, the cut corner on anything pressable (painted by the fill, so the pin
// needs no clip-path), a lamp bar for selection, a rail under a field you type into.
//
// THE GEOMETRY RULE. A nine-slice painted INTO the border box, so the old border widths are real
// spacing the layout depends on. Every recipe keeps the border at its original width, transparent,
// and paints border-box. Same box model, same content position, nothing moves.
//
// The module keeps its name because seven screens import it.

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

/** The cut corner as a fill: the field in `colour` with its top-right chamfer left open. */
const cut = (colour) => `linear-gradient(225deg, transparent calc(var(--dp-cut, 10px) * .7071), ${colour} 0)`;
const LIT_CUT = 'var(--dp-cut-lit)';
const BRACKET = 'var(--dp-bracket)';
const LAMP_EDGE = 'linear-gradient(90deg, var(--dp-lamp, #f2b950) 2px, transparent 0)';
const LAMP_UNDER = 'linear-gradient(0deg, var(--dp-lamp, #f2b950) 2px, transparent 0)';
const RAIL = (colour, px = 2) => `linear-gradient(0deg, ${colour} ${px}px, transparent 0)`;
const FIELD = 'var(--dp-field, rgb(10 12 16 / .84))';
const INK = 'var(--dp-field-ink, rgb(232 226 212 / .08))';
const INK_HI = 'var(--dp-field-ink-hi, rgb(232 226 212 / .14))';

// A secondary key: a ghost field with the cut; hover lights the cut, focus adds the bone bracket.
const CAP = {
  rest: { bg: cut(INK), sh: 'none' },
  hover: { bg: `${LIT_CUT}, ${cut(INK_HI)}`, sh: 'none' },
  focus: { bg: `${LIT_CUT}, ${BRACKET}, ${cut(INK_HI)}`, sh: 'none' },
  pressed: { bg: cut('rgb(232 226 212 / .05)'), sh: 'none' },
  disabled: { bg: cut('rgb(232 226 212 / .04)'), sh: 'none' },
};
// The one consequential verb: the field IS the lamp. Its focus is the global bone outline (no clip).
const CAP_LIVE = {
  rest: { bg: cut('var(--dp-lamp, #f2b950)'), sh: 'none' },
  hover: { bg: cut('var(--dp-lamp-hot, #ffd98c)'), sh: 'var(--dp-lamp-glow)' },
  focus: { bg: cut('var(--dp-lamp-hot, #ffd98c)'), sh: 'var(--dp-lamp-glow)' },
  pressed: { bg: cut('var(--dp-lamp-dim, #8a6b3a)'), sh: 'none' },
  disabled: { bg: RAIL('var(--dp-lamp-dim, #8a6b3a)', 1), sh: 'none' },
};
// A LEGEND IS NOT A KEY (section 4.2): a filter or a tab changes what you are looking at, never the
// world, so it carries no field and no cut -- just a word that lights, with one bar under it.
const LEGEND = {
  rest: { bg: 'none', sh: 'none' },
  hover: { bg: RAIL('rgb(232 226 212 / .45)'), sh: 'none' },
  focus: { bg: BRACKET, sh: 'none' },
  pressed: { bg: LAMP_UNDER, sh: 'none' },
  lit: { bg: LAMP_UNDER, sh: 'none' },
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
  const bg = kind === 'hazard' && state !== 'hover' && state !== 'focus'
    ? `${RAIL('var(--dp-danger, #ff5038)')}, ${face.bg}`
    : kind === 'hazard'
      ? cut('var(--dp-danger, #ff5038)')
      : face.bg;
  const pins = { ...box(width), 'background-image': bg, 'box-shadow': face.sh };
  // Ink follows the field: on the lamp (and on a red hazard under the hand) the legend is dark, or
  // it measures ~1.4:1 on the composited frame (scripts/ui-contrast.mjs caught it on save/load).
  if (kind === 'primary') pins.color = state === 'disabled' ? 'var(--dp-ink-mute, #b0aea6)' : 'var(--dp-metal-0, #0b0d10)';
  else if (kind === 'hazard' && (state === 'hover' || state === 'focus')) pins.color = 'var(--dp-metal-0, #0b0d10)';
  return pins;
}

/** A plate: a printed field whatever its old variant (raised, sunk, edge). */
export function platePins(variant = 'sunk', width = '24px') {
  void variant;
  return { ...box(width), 'background-image': `linear-gradient(${FIELD} 0 0)`, 'box-shadow': 'none' };
}

/** A pane: the printed field; the viewport (the chosen pane) carries the lamp on its leading edge. */
export function panePins(variant = 'glass', width = '20px') {
  const bg = variant === 'viewport'
    ? `${LAMP_EDGE}, linear-gradient(${FIELD} 0 0)`
    : variant === 'deep'
      ? 'linear-gradient(rgb(5 7 10 / .92) 0 0)'
      : `linear-gradient(${FIELD} 0 0)`;
  return { ...box(width), 'background-image': bg, 'box-shadow': 'none' };
}

/** A field you type into: a rail under the words; focus lights it, an error drives it red. */
export function channelPins(state = 'rest', width = '12px') {
  const bg = state === 'focus'
    ? RAIL('var(--dp-lamp, #f2b950)')
    : state === 'error'
      ? RAIL('var(--dp-danger, #ff5038)')
      : state === 'disabled'
        ? RAIL('var(--dp-rule, rgb(232 226 212 / .10))')
        : RAIL('var(--dp-rule-hi, rgb(232 226 212 / .22))');
  return { ...box(width), 'background-image': bg, 'box-shadow': 'none' };
}

/** A selected row: the lamp on its leading edge over a faint ink field. */
export function rowPins(width = '8px 16px') {
  return { ...box(width), 'background-image': `${LAMP_EDGE}, linear-gradient(${INK} 0 0)`, 'box-shadow': 'none' };
}

/** Where a number or a thumb sits: a rail beneath it, not a recess. */
export function wellPins(width = '10px') {
  return { ...box(width), 'background-image': RAIL('var(--dp-rule-hi, rgb(232 226 212 / .22))'), 'box-shadow': 'none' };
}
