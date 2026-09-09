// One per-tick activity authority. Physics, AI, and presentation consume this
// frame; they do not rebuild membership themselves.

export {
  ensureActivityClassified,
  entityNeedsAiThink,
  entityNeedsPhysics,
  getActivityOwnerEntities,
  getActivityTransitionEntities,
  getActivityInitialInactiveEntities,
  getActivityWakeEvents,
  physicsReachWuFromState,
} from '../world/activityRuntime.js';

import { ensureActivityClassified as classify } from '../world/activityRuntime.js';

export function publishActivityFrame(state) {
  return classify(state);
}

export function getActivityFrame(state) {
  const runtime = classify(state);
  if (!runtime) return null;
  const frame = runtime.frame || (runtime.frame = {
    exactIds: runtime.exactIds,
    nearIds: runtime.nearIds,
    abstractIds: runtime.abstractIds,
    dormantIds: runtime.dormantIds,
    activeAiEntities: runtime.activeAiEntities,
    activeTrafficEntities: runtime.activeTrafficEntities,
    activityTransitionAiEntities: runtime.activityTransitionAiEntities,
    renderGlassIds: runtime.glassIds,
    renderRunwayIds: runtime.runwayIds,
    exactDynamicEntities: runtime.physicsDynamics,
    exactStaticCells: runtime.physicsStatics,
    physicsReachWu: runtime.physicsReachWu,
    counts: runtime.counts,
    reasonsById: runtime.reasonsById,
    changedIds: runtime.changedIds,
    wakeEventsById: runtime.wakeEventsById,
    wakeTokensById: runtime.wakeTokensById,
  });
  frame.exactIds = runtime.exactIds;
  frame.nearIds = runtime.nearIds;
  frame.abstractIds = runtime.abstractIds;
  frame.dormantIds = runtime.dormantIds;
  frame.activeAiEntities = runtime.activeAiEntities;
  frame.activeTrafficEntities = runtime.activeTrafficEntities;
  frame.activityTransitionAiEntities = runtime.activityTransitionAiEntities;
  frame.renderGlassIds = runtime.glassIds;
  frame.renderRunwayIds = runtime.runwayIds;
  frame.exactDynamicEntities = runtime.physicsDynamics;
  frame.exactStaticCells = runtime.physicsStatics;
  frame.physicsReachWu = runtime.physicsReachWu;
  frame.counts = runtime.counts;
  frame.reasonsById = runtime.reasonsById;
  frame.changedIds = runtime.changedIds;
  frame.wakeEventsById = runtime.wakeEventsById;
  frame.wakeTokensById = runtime.wakeTokensById;
  return frame;
}
