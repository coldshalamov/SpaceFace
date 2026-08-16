// Plan 53: the Double Wreck's paired recorders. Runtime persists only which physical box was
// recovered; this immutable catalog supplies the authored text when Codex projects that receipt.

export const DOUBLE_WRECK_SHAPE_ID = 'rare_double_wreck';

export const DOUBLE_WRECK_BLACK_BOXES = Object.freeze([
  Object.freeze({
    side: 'a',
    role: 'double_wreck_a',
    storyPropKind: 'rare_double_wreck_a',
    cargoPrefix: 'rare_black_box:double-a:',
    title: 'Box A — MTS Courier Recorder',
    shortTitle: 'Box A',
    logs: Object.freeze([
      Object.freeze({ sequence: 1, stamp: 'T-00:41', text: 'Priority freight, eastbound. Interceptor ahead is showing green.' }),
      Object.freeze({ sequence: 3, stamp: 'T-00:18', text: 'Control says hold course. Sealed cargo has lane priority.' }),
      Object.freeze({ sequence: 5, stamp: 'T-00:07', text: 'They flashed starboard. I answered starboard. That settles it.' }),
      Object.freeze({ sequence: 7, stamp: 'T-00:01', text: 'Impact warning. I held course.' }),
    ]),
  }),
  Object.freeze({
    side: 'b',
    role: 'double_wreck_b',
    storyPropKind: 'rare_double_wreck_b',
    cargoPrefix: 'rare_black_box:double-b:',
    title: 'Box B — Patrol Interceptor Recorder',
    shortTitle: 'Box B',
    logs: Object.freeze([
      Object.freeze({ sequence: 2, stamp: 'T-00:39', text: 'Lane watch. Courier is over slot and still accelerating.' }),
      Object.freeze({ sequence: 4, stamp: 'T-00:16', text: 'Control says make them yield. Patrol mass has right of way.' }),
      Object.freeze({ sequence: 6, stamp: 'T-00:06', text: 'Courier copied my turn light and called it compliance.' }),
      Object.freeze({ sequence: 8, stamp: 'T-00:01', text: 'Impact warning. So did I.' }),
    ]),
  }),
]);

const BOX_BY_SIDE = new Map(DOUBLE_WRECK_BLACK_BOXES.map((box) => [box.side, box]));

export function doubleWreckBlackBox(side) {
  return BOX_BY_SIDE.get(String(side || '').toLowerCase()) || null;
}
