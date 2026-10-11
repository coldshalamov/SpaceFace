// Player-facing request object for a future Clips/Replay "export selected moment" action.
// No DOM. The live screens stay the owners of their own export buttons.

import { MOMENT_EXPORT_REQUEST_SCHEMA } from './contract.js';

export function exportSelectedMomentRequest(moment, format = 'webm') {
  if (!moment || typeof moment !== 'object') return null;
  const chosen = format === 'mp4' ? 'mp4' : 'webm';
  return {
    schema: MOMENT_EXPORT_REQUEST_SCHEMA,
    action: 'export-selected-moment',
    momentId: moment.id,
    shape: moment.shape,
    inTick: moment.inTick,
    outTick: moment.outTick,
    payoffTick: moment.payoffTick,
    format: chosen,
    overlay: false,
    replacesReplay: false,
    replacesLiveCamera: false,
  };
}
