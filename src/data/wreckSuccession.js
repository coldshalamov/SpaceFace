// One wreck, three stages. A visit moves it forward. A cut moves it back.
// Nothing here watches the clock.

export const WRECK_SITE_ID = 'three_hull_garden';

export const WRECK_WARNED =
  'The bridges are thickening. Cut the lace before you close again, or one hull seals.';
export const WRECK_SEALED =
  'One hull has sealed. The other two stay open. A cut can still open the seal.';
export const WRECK_CUT_OPEN =
  'The lace is cut. The bridges stay open.';
export const WRECK_CUT_WARNED =
  'The seal is cut. The bridges are thickening again. Leave and close once more and a hull seals.';

const STAGES = ['open', 'warned', 'sealed'];

export function stepWreckSuccession(stage, event) {
  const current = STAGES.includes(stage) ? stage : 'open';
  if (event === 'enter') {
    if (current === 'open') return { stage: 'warned', text: WRECK_WARNED };
    if (current === 'warned') return { stage: 'sealed', text: WRECK_SEALED };
    return { stage: 'sealed', text: null };
  }
  if (event === 'cut') {
    if (current === 'sealed') return { stage: 'warned', text: WRECK_CUT_WARNED };
    if (current === 'warned') return { stage: 'open', text: WRECK_CUT_OPEN };
    return { stage: 'open', text: null };
  }
  return { stage: current, text: null };
}
