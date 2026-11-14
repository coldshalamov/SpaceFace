// The Ceres bar host reads the worksite's own slip — never a written-for-the-bar account.
// Two real replies, one line each; a stale choice is caught by the record signature baked
// into the choice id, so a superseded record can never be "answered" as current.
import { furnaceDetailRead } from '../../missions/furnaceArrivalScene.js';

const PREFIX = 'furnace_detail:';
const STATION = 'station_ceres';
const HOST_ID = 'contact_station_ceres_0';

function currentRead(state, stationId, contact) {
  if (stationId !== STATION || contact?.id !== HOST_ID
    || contact.role !== 'barkeep' || state?.ui?.docked !== true
    || state.ui.dockedStationId !== STATION || state.world?.currentSectorId !== 'sector_ceres_belt'
    || state.save?.restoring || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const read = furnaceDetailRead(state);
  return read?.active || read?.settled ? read : null;
}

export function furnaceDetailChoices(state, stationId, contact) {
  const read = currentRead(state, stationId, contact);
  if (!read) return [];
  const signature = encodeURIComponent(JSON.stringify([state.meta?.seed ?? null, read.missionId,
    read.received, read.lost, read.pending, read.cleared, read.active, read.settled, read.rewardCr]));
  return [
    { id: `${PREFIX}read:${signature}`, label: read.settled
      ? 'What did the quarantine detail settle?' : 'The sealed refinery is my next job.' },
    { id: `${PREFIX}log:${signature}`, label: read.active
      ? 'Track the quarantine detail.' : 'Open my settled detail.' },
  ];
}

export function isFurnaceDetailChoice(id) {
  return typeof id === 'string' && id.startsWith(PREFIX);
}

export function furnaceDetailReply(ctx, stationId, contact, choiceId) {
  if (!isFurnaceDetailChoice(choiceId)) return null;
  const read = currentRead(ctx?.state, stationId, contact);
  if (!read || !furnaceDetailChoices(ctx.state, stationId, contact)
    .some(choice => choice.id === choiceId)) {
    return { furnaceDetailAnswer: true,
      text: 'The host checks the slip again. That is not the current record.' };
  }
  if (choiceId.startsWith(`${PREFIX}log:`)) {
    if (read.active) ctx.bus?.emit('ui:trackMission', { missionId: read.missionId });
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:ceres-furnace' });
    return { furnaceDetailAnswer: true, text: read.active
      ? 'Your worksite is on the Mission Log.' : 'The settled detail is filed in your log.' };
  }
  return { furnaceDetailAnswer: true, text: read.active
    ? `Not this refinery — the sealed one. Jorah runs our freight; your slip reads ${read.cleared}/4 sites, ${read.received}/3 pods, ${read.lost} lost.`
    : `The slip reads ${read.received}/3 received, ${read.lost} lost, ${read.rewardCr} cr — losses are not deliveries.` };
}
