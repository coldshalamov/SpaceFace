import { furnaceDetailRead } from '../../missions/furnaceArrivalScene.js';
import { furnaceHandlingLine } from '../../missions/furnaceWorksite.js';

const PREFIX = 'furnace_detail:';
const STATION = 'station_ceres';

function currentRead(state, stationId, contact) {
  if (stationId !== STATION || contact?.id !== 'contact_station_ceres_0'
    || contact.role !== 'barkeep' || state?.ui?.docked !== true
    || state.ui.dockedStationId !== STATION || state.world?.currentSectorId !== 'sector_ceres_belt'
    || state.save?.restoring || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const read = furnaceDetailRead(state);
  return read?.active || read?.settled ? read : null;
}

export function furnaceDetailChoices(state, stationId, contact) {
  const read = currentRead(state, stationId, contact);
  if (!read) return [];
  const signature = encodeURIComponent(JSON.stringify([state.meta?.seed ?? null, read]));
  return [{ id: `${PREFIX}read:${signature}`, label: read.settled
    ? 'What did my Furnace Detail actually settle?' : read.handling.overclass
      ? `My Line is rated for ${read.handling.limitT} t. Those pods are ${read.handling.podMassT} t.` : 'The old refinery is my next job.' },
  { id: `${PREFIX}log:${signature}`, label: read.active ? 'Track the quarantine detail.' : 'Open my settled Furnace Detail.' }];
}

export function isFurnaceDetailChoice(id) { return typeof id === 'string' && id.startsWith(PREFIX); }

export function furnaceDetailReply(ctx, stationId, contact, choiceId) {
  if (typeof choiceId !== 'string' || !choiceId.startsWith(PREFIX)) return null;
  const read = currentRead(ctx?.state, stationId, contact);
  if (!read || !furnaceDetailChoices(ctx.state, stationId, contact).some(choice => choice.id === choiceId)) {
    return { furnaceDetailAnswer: true, text: 'The host checks the slip again. “That is not the current record. Ask me again.”' };
  }
  if (choiceId.startsWith(`${PREFIX}log:`)) {
    if (read.active) ctx.bus?.emit('ui:trackMission', { missionId: read.missionId });
    ctx.bus?.emit('ui:pushScreen', { id: 'missionLog', source: 'station-bar:ceres-furnace' });
    return { furnaceDetailAnswer: true, text: read.active ? '“The Mission Log has your quarantine worksite. This berth is the working refinery. The old hulk is outside.”'
      : '“Your completed detail is filed. Read the next contract before you sign. No one here has released the withheld 47-A payment.”' };
  }
  if (read.active) return { furnaceDetailAnswer: true, text: `“Not this refinery. The Closed Refinery was sealed mid-shift forty years ago. Jorah runs freight for the living yard; that abandoned hauler is not his ship. Your slip shows ${read.cleared}/4 marked mite sites clear, ${read.received}/3 pods received and ${read.lost} lost. The mites are repairing what is left. DMC ordered four sites cleared, not the whole population. Buy frag and Load it at Tethys or Helios if you need to rearm. ${furnaceHandlingLine(ctx.state)} Ceres has no Line Class upgrade for sale, and Jorah has not agreed to tow your quarantine cargo. Your measured Scale 4 freight is yours; only the three marked quarantine pods belong in this disposal account.”` };
  const result = read.lost === 0 ? 'All three original pods reached the mouth.'
    : read.received === 0 ? 'None of the three pods reached the mouth. All three were lost.'
      : `${read.received} of the three pods reached the mouth; ${read.lost} were lost outside it.`;
  const collateral = read.casketLosses ? `The site also records ${read.casketLosses} Casket ${read.casketLosses === 1 ? 'worm lost' : 'worms lost'}; that record does not say whose blast caused it.`
    : 'No Casket worm losses are recorded.';
  return { furnaceDetailAnswer: true, text: `The host turns the slip toward you. “${result} The contract recorded ${read.rewardCr} cr. Lost cargo is not a delivery. ${collateral} Four marked mite sites are cleared, but that does not reopen the Closed Refinery or make every creature there an enemy. The working yard keeps its own freight separate.”` };
}
