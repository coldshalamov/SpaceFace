// The dock's view of the shared work-attention read model (src/missions/missionAttention.js).
// The board recommender is screen code, so it is bound here; simulation-side readers call the
// shared model directly and never import this file.
import { missionDockAttention as sharedMissionAttention } from '../../missions/missionAttention.js';
import { recommendMissionBoardOffer } from './stationMissionModel.js';

export function missionDockAttention(state, stationId, options = {}) {
  return sharedMissionAttention(state, stationId, { recommend: recommendMissionBoardOffer, ...options });
}

export default missionDockAttention;
