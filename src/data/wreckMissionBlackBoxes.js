// Plan 53 projection for the three named communicator-wreck recorders. Mining and Cargo retain
// physical custody; the persistent story-cargo ids below are only first-recovery receipts.

export const WRECK_MISSION_BLACK_BOX_SOURCE_KIND = 'wreck_mission_black_box';

function blackBox(id, cargoId, title, cargoName, logs, note) {
  return Object.freeze({
    id,
    cargoId,
    title,
    cargoName,
    logs: Object.freeze(logs.map((entry) => Object.freeze(entry))),
    note,
  });
}

export const WRECK_MISSION_BLACK_BOXES = Object.freeze([
  blackBox(
    'wm_blackbox_attacker',
    'codex_wreck_recorder:wm_blackbox_attacker',
    'Belt-Shadow Wreck — Attacker Record',
    'BELT-SHADOW FLIGHT RECORDER',
    [
      { stamp: 'CONTACT', text: 'They came out of the belt shadow with no transponder.' },
      { stamp: 'COLOR', text: 'Reach colors.' },
      { stamp: 'FIRE', text: 'The box retained who fired first.' },
      { stamp: 'RECOVERY', text: 'Attack vector sealed for station analysis.' },
    ],
    'Field note: an absent transponder is not an absent vector. Recover the communicator electronics before the wreck goes cold.',
  ),
  blackBox(
    'wm_pd_curtain_blackbox',
    'codex_wreck_recorder:wm_pd_curtain_blackbox',
    'Curtain Escort — Nine-Minute Record',
    'CURTAIN ESCORT FLIGHT RECORDER',
    [
      { stamp: 'CURTAIN', text: 'Point-defense held for nine minutes.' },
      { stamp: 'TRACK', text: 'Missiles died.' },
      { stamp: 'LOSS', text: 'The freighter did not.' },
      { stamp: 'CLAIM', text: 'Curtain timing retained for the insurers.' },
    ],
    'Field note: screen survival is not convoy survival. The nine-minute timing is the useful part of the claim.',
  ),
  blackBox(
    'wm_shaft_seven_blackbox',
    'codex_wreck_recorder:wm_shaft_seven_blackbox',
    'Shaft Seven — Moisture-Loss Column',
    'SHAFT SEVEN FLIGHT RECORDER',
    [
      { stamp: 'ACCEPT', text: 'Cargo reweighed: 11.2t.' },
      { stamp: 'DEPART', text: 'Cargo on departure: 9.4t. Two crew aboard.' },
      { stamp: 'FILING', text: 'The 1.8t is logged moisture loss. The two are filed as 0.7t.' },
      { stamp: 'COLUMN', text: 'The other 1.1t is in a column without their names.' },
    ],
    'Field note: the arithmetic is the witness. Two names were converted into mass before the box was recovered.',
  ),
]);

const BY_MISSION_ID = new Map(WRECK_MISSION_BLACK_BOXES.map((record) => [record.id, record]));

export function wreckMissionBlackBox(missionId) {
  return BY_MISSION_ID.get(String(missionId || '')) || null;
}

export function wreckMissionBlackBoxRecords(story = {}) {
  const cargo = new Set(Array.isArray(story && story.persistentCargo) ? story.persistentCargo : []);
  return WRECK_MISSION_BLACK_BOXES
    .filter((record) => cargo.has(record.cargoId))
    .map((record) => Object.freeze({
      missionId: record.id,
      cargoId: record.cargoId,
      title: record.title,
      logs: record.logs,
      note: record.note,
    }));
}
