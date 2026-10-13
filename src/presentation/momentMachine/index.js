// Moment Machine read model. Selection and shot plans only — encoding lives in tools/moment-machine.

export {
  MOMENT_STREAM_SCHEMA,
  MOMENT_SELECTION_SCHEMA,
  MOMENT_PLAN_SCHEMA,
  MOMENT_LEASE_SCHEMA,
  MOMENT_CAPTION_SCHEMA,
  MOMENT_EXPORT_REQUEST_SCHEMA,
  TICK_RATE,
  CLIP_MIN_S,
  CLIP_MAX_S,
  CLIP_TARGET_S,
  PRE_ROLL_S,
  POST_ROLL_S,
  CLIP_MIN_TICKS,
  CLIP_MAX_TICKS,
  CLIP_TARGET_TICKS,
  PRE_ROLL_TICKS,
  POST_ROLL_TICKS,
  SCORE_THRESHOLD,
  SHAPE_IDS,
  EVENT_KINDS,
  LOGGED_SOURCES,
} from './contract.js';

export {
  ingestStream,
  fromAdventureTape,
  fromChronicleFact,
  fromChronicleMemory,
  fromKillcamTape,
  fromClipList,
} from './ingest.js';

export { matchGrammar, SHAPE_LABELS } from './grammar.js';

export { selectMoments, serializeSelection, restoreSelection } from './select.js';

export {
  planShot,
  createOfflineCameraLease,
  recordedSpan,
  assessFootage,
  clipWindow,
  poseAt,
  playRecordedPoses,
} from './shotPlan.js';

export { captionSidecar, captionVtt } from './captions.js';

export { exportSelectedMomentRequest } from './hook.js';

import { selectMoments } from './select.js';
import { planShot } from './shotPlan.js';
import { captionSidecar } from './captions.js';
import { exportSelectedMomentRequest } from './hook.js';

/** Selection, one plan per ranked moment, captions, and the UI request for the top moment. */
export function analyzeMomentStream(input) {
  const selection = selectMoments(input);
  if (!selection.ok) return selection;
  const plans = [];
  const captions = [];
  for (let i = 0; i < selection.ranked.length; i += 1) {
    const plan = planShot(selection.stream, selection.ranked[i]);
    plans.push(plan);
    captions.push(captionSidecar(selection.ranked[i], plan));
  }
  const top = selection.ranked[0] || null;
  return {
    ok: true,
    selection,
    plans,
    captions,
    exportRequest: top ? exportSelectedMomentRequest(top, 'webm') : null,
  };
}
