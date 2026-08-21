// One per-tick activity authority. Physics, AI, and presentation consume this
// frame; they do not rebuild membership themselves.

export {
  ensureActivityClassified,
  entityNeedsAiThink,
  entityNeedsPhysics,
  physicsReachWuFromState,
} from '../world/activityRuntime.js';

import { ensureActivityClassified as classify } from '../world/activityRuntime.js';

export function publishActivityFrame(state) {
  return classify(state);
}

export function getActivityFrame(state) {
  const runtime = classify(state);
  if (!runtime) return null;
  return {
    exactIds: runtime.exactIds,
    nearIds: runtime.nearIds,
    abstractIds: runtime.abstractIds,
    dormantIds: runtime.dormantIds,
    renderGlassIds: runtime.glassIds,
    renderRunwayIds: runtime.runwayIds,
    exactDynamicEntities: runtime.physicsDynamics,
    exactStaticCells: runtime.physicsStatics,
    physicsReachWu: runtime.physicsReachWu,
    counts: runtime.counts,
  };
}
