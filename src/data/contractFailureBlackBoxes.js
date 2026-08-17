// Plan 53 projection for the seven physical recorder recoveries authored by Plan 51 failures.
// Missions owns the causal follow-up and physical pod; these rows only name the persistent receipt.

export const CONTRACT_FAILURE_BLACK_BOX_SOURCE_KIND = 'contract_failure_black_box';

function blackBox(id, causeTag, cargoId, title, cargoName, logs, note) {
  return Object.freeze({
    id,
    causeTag,
    cargoId,
    title,
    cargoName,
    logs: Object.freeze(logs.map((entry) => Object.freeze(entry))),
    note,
  });
}

export const CONTRACT_FAILURE_BLACK_BOXES = Object.freeze([
  blackBox(
    'disable_dont_kill',
    'capture_target_destroyed',
    'codex_contract_recorder:disable_dont_kill',
    'Forbidden Kill — Quarry Recorder',
    'QUARRY CUSTODY RECORDER',
    [
      { stamp: 'ORDER', text: 'Disable the quarry. Do not kill.' },
      { stamp: 'LOSS', text: 'Hull loss erased the live-custody objective.' },
      { stamp: 'STATE', text: 'The recorder retained the last ordered state.' },
      { stamp: 'RECOVERY', text: 'Recorder separated into the moving debris.' },
    ],
    'Field note: a kill can close a bounty. It cannot satisfy a custody order.',
  ),
  blackBox(
    'wreck_tow',
    'wreck_tow_stripped',
    'codex_contract_recorder:wreck_tow',
    'Stripped Tow — Recovery Recorder',
    'STRIPPED TOW RECORDER',
    [
      { stamp: 'DISABLE', text: 'Drive offline. Recovery tow authorized.' },
      { stamp: 'CONTACT', text: 'Scavenger contact crossed the marked hull.' },
      { stamp: 'STRIP', text: 'Recoverable systems disappeared from the tow.' },
      { stamp: 'RECOVERY', text: 'Recorder remained in the outbound wreckage.' },
    ],
    'Field note: disablement preserves a tow only while the physical hull survives the route.',
  ),
  blackBox(
    'rock_diversion',
    'rock_diversion_impact',
    'codex_contract_recorder:rock_diversion',
    'Rock Impact — Station Recorder',
    'ROCK IMPACT RECORDER',
    [
      { stamp: 'ALERT', text: 'Station burn line projected.' },
      { stamp: 'VECTOR', text: 'Diversion solution remained outside tolerance.' },
      { stamp: 'IMPACT', text: 'Station contact recorded.' },
      { stamp: 'RECOVERY', text: 'Entry vector survived in the impact field.' },
    ],
    'Field note: charges, mass-driver fire, and a tow-burn all change the same physical vector.',
  ),
  blackBox(
    'atmosphere_rescue',
    'atmosphere_rescue_burn_up',
    'codex_contract_recorder:atmosphere_rescue',
    'Burn Line — Rescue Recorder',
    'BURN-LINE RESCUE RECORDER',
    [
      { stamp: 'PLUNGE', text: 'Atmospheric loss threshold crossed.' },
      { stamp: 'TUMBLE', text: 'Attitude recovery unavailable.' },
      { stamp: 'BURN', text: 'Hull lost below the rescue line.' },
      { stamp: 'RECOVERY', text: 'Recorder cleared the aftermath on a separate track.' },
    ],
    'Field note: the atmosphere is the clock. A Massline pull must move the hull, not the timer.',
  ),
  blackBox(
    'loud_delivery',
    'loud_delivery_burned',
    'codex_contract_recorder:loud_delivery',
    'Burned Drop — Customs Recorder',
    'BURNED DROP RECORDER',
    [
      { stamp: 'SCAN', text: 'Customs net acquired a hot contraband manifest.' },
      { stamp: 'SUBMIT', text: 'The ship submitted inside the live scan lattice.' },
      { stamp: 'BURN', text: 'Contract cargo was destroyed during seizure.' },
      { stamp: 'RECOVERY', text: 'Recorder broke clear of the patrol wake.' },
    ],
    'Field note: cold running, an ion storm, or a physical decoy can clear the same scan net.',
  ),
  blackBox(
    'salvage_race',
    'salvage_race_lost',
    'codex_contract_recorder:salvage_race',
    'Lost Cut — Salvage Recorder',
    'LOST-CUT SALVAGE RECORDER',
    [
      { stamp: 'CLAIM', text: 'Two cutter crews arrived on one wreck.' },
      { stamp: 'WORK', text: 'Rival extraction completed first.' },
      { stamp: 'WAKE', text: 'The salvor wake carried one recorder clear of the cut.' },
      { stamp: 'RECOVERY', text: 'Recorder remained loose behind the cutter.' },
    ],
    'Field note: the competing cutter is the clock. The wreck does not wait for a mission timer.',
  ),
  blackBox(
    'escort_the_idiot',
    'escort_the_idiot_lost',
    'codex_contract_recorder:escort_the_idiot',
    'Scenic Liner — Final Route Record',
    'SCENIC LINER FLIGHT RECORDER',
    [
      { stamp: 'ROUTE', text: 'Scenic course entered the live raid zone.' },
      { stamp: 'FARE', text: 'Passenger collateral remained tied to hull survival.' },
      { stamp: 'LOSS', text: 'The liner was destroyed before berth.' },
      { stamp: 'RECOVERY', text: 'Flight recorder separated from the dead liner.' },
    ],
    'Field note: the fare is collateral. Keeping the liner intact is the entire contract.',
  ),
]);

const BY_ID = new Map(CONTRACT_FAILURE_BLACK_BOXES.map((record) => [record.id, record]));
const BY_CAUSE_TAG = new Map(CONTRACT_FAILURE_BLACK_BOXES.map((record) => [record.causeTag, record]));

export function contractFailureBlackBox(recordId) {
  return BY_ID.get(String(recordId || '')) || null;
}

export function contractFailureBlackBoxForCauseTag(causeTag) {
  return BY_CAUSE_TAG.get(String(causeTag || '')) || null;
}

export function contractFailureBlackBoxLotSource(record, sourceMissionId, recoveryOfferId) {
  const definition = typeof record === 'string' ? contractFailureBlackBox(record) : record;
  const sourceId = String(sourceMissionId || '');
  const offerId = String(recoveryOfferId || '');
  if (!definition || !sourceId || !offerId) return null;
  return Object.freeze({
    provenanceId: `contract-failure-recorder:${definition.id}:${sourceId}`,
    sourceKind: CONTRACT_FAILURE_BLACK_BOX_SOURCE_KIND,
    recordId: definition.id,
    cargoId: definition.cargoId,
    causeTag: definition.causeTag,
    sourceMissionId: sourceId,
    recoveryOfferId: offerId,
  });
}

export function contractFailureBlackBoxRecords(story = {}) {
  const cargo = new Set(Array.isArray(story && story.persistentCargo) ? story.persistentCargo : []);
  return CONTRACT_FAILURE_BLACK_BOXES
    .filter((record) => cargo.has(record.cargoId))
    .map((record) => Object.freeze({
      recordId: record.id,
      cargoId: record.cargoId,
      title: record.title,
      logs: record.logs,
      note: record.note,
    }));
}
