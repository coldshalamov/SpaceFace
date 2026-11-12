// Player-facing words for why a contract failed. One map, two readers: the failure toast
// (systems/missions.js `_failMission`) and the mission log's settled receipts
// (ui/screens/missionLog.js). Both say the same thing about the same failure.
//
// NXI-149: a plainly settled failure names the condition that actually failed — the title alone
// is not a reason. Unknown reasons fall back to null (the title still carries the name).
import { missionConditionById } from './missionConditions.js';

export const FAIL_REASON_WORD = Object.freeze({
  abandoned: 'the job was abandoned',
  escort_abandoned: 'the convoy was left behind',
  escortee_lost: 'the convoy lead went down',
  pods_lost: 'the load went down with the run',
  core_lost: 'the core broke up in transit',
  ship_lost: 'your ship went down with the manifest',
  deadline: 'the window lapsed',
  seed_asset_lost: 'the seed asset was lost',
  target_lost: 'the mark is gone',
  failed_external: 'the objective went down to someone else',
  busted: 'the lot was seized',
  heist_failed: 'the job fell apart',
  failed: 'the contract could not be completed',
  wake_missed: 'the hauler left the lane',
  wake_unmatched: 'the crate was taken off the wake',
  wake_refused: 'the hold refused the crate',
  // Race DNFs name the cause: jumping the lane, calling the run off (abort or menu), the hull.
  race_left_course: 'you left the course',
  race_aborted: 'the run was called off',
  race_pilot_lost: 'your ship went down mid-run',
  race_bad_phase: 'the course record could not be read',
  race_bad_course: 'the course record could not be read',
  race_wake_incomplete: 'you did not hold the wake long enough',
  speed_payload_lost: 'the payload did not survive the run',
  payload_destroyed: 'the payload was destroyed',
  hull_destroyed: 'the hull was destroyed',
  all_lots_lost: 'every lot was lost',
  passenger_transport_destroyed: 'the transport was destroyed',
  target_unavailable: 'the mark could not be found',
  obligation_already_settled: 'the obligation was already settled',
  receiver_refused: 'the receiver refused the delivery',
});

/** The lower-case clause for a failure reason id, or null when no words are known. */
export function failReasonWord(reason) {
  const text = reason == null ? '' : String(reason);
  if (Object.prototype.hasOwnProperty.call(FAIL_REASON_WORD, text)) return FAIL_REASON_WORD[text];
  if (text.startsWith('clause_broken:') || text.startsWith('condition_broken:')) {
    // Name the term the board printed, not a generic clause line.
    const id = text.slice(text.indexOf(':') + 1);
    const def = id ? missionConditionById(id) : null;
    const label = def && def.label ? String(def.label).trim() : '';
    return label ? `the contract term "${label}" was broken` : 'a contract clause was broken';
  }
  return null;
}
