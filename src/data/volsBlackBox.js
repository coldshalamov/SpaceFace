// Plan 53 projection for Captain Vols's already-physical Tessera recorder route. The encounter's
// persistent story cargo is the sole recovery receipt; Codex supplies only the immutable account.

export const VOLS_BLACK_BOX_CARGO_ID = 'depth_vols_black_box';
export const VOLS_BLACK_BOX_SHAPE_ID = 'depth_h1_distress_from_inside';

export const VOLS_BLACK_BOX = Object.freeze({
  title: 'Tessera — Captain Vols Recorder',
  logs: Object.freeze([
    Object.freeze({ stamp: 'MANIFEST', text: 'Waypoint 9. Five crew aboard when Tessera was boarded.' }),
    Object.freeze({ stamp: 'DRIVE', text: 'Tessera drive gone. Four souls.' }),
    Object.freeze({ stamp: 'MAYDAY', text: 'Anyone receiving. We already vented. Keep the engines warm.' }),
    Object.freeze({ stamp: 'RECOVERY', text: 'Black box recovered — fourteen months late.' }),
  ]),
  note: 'Incident 7741 lists no survivors. Five on the manifest, four on the mayday: the mismatch is part of the record.',
});

export function volsBlackBoxRecord(story = {}) {
  const cargo = Array.isArray(story && story.persistentCargo) ? story.persistentCargo : [];
  if (!cargo.includes(VOLS_BLACK_BOX_CARGO_ID)) return null;

  const completion = story && story.depthProgramEncounters
    && story.depthProgramEncounters.completed
    && story.depthProgramEncounters.completed[VOLS_BLACK_BOX_SHAPE_ID];
  const boarded = completion && completion.outcome === 'boarded' ? completion : null;
  return Object.freeze({
    cargoId: VOLS_BLACK_BOX_CARGO_ID,
    shapeId: VOLS_BLACK_BOX_SHAPE_ID,
    encounterId: boarded && boarded.encounterId || null,
    sectorId: boarded && boarded.sectorId || 'sector_helios_prime',
    recoveredAt: boarded && Number.isFinite(Number(boarded.at)) ? Number(boarded.at) : null,
    title: VOLS_BLACK_BOX.title,
    logs: VOLS_BLACK_BOX.logs,
    note: VOLS_BLACK_BOX.note,
  });
}
