// fenceContact.js - THE WORLD REMEMBERS (U-B): a fence's face at the station bar.
//
// Pure read of the fence ledger (data/fences.js). The bar's contact engine (barContacts.js) asks
// `fenceBarContact(stationId, state)` for a contact and `fenceBarReply(...)` for its answers; the
// bar screen renders them like any other contact. The face is `localPortraitForContact(contact)`
// (role 'smuggler', the slot is picked by hash32 in the roster). The scrub is owned by
// the fence desk through `ui:talkContact`; explicit chart choices open the map in barContacts.
// This file never moves heat, credits, trust or discovery.
import { clinicFreightReadout } from '../../data/clinicFreightReadout.js';
import { SECTORS } from '../../data/sectors.js';
import { deniableBoardEpoch } from '../../data/deniableAftermath.js';
import {
  FENCE_BY_ID, FENCE_ROUTE_LEGS, fenceContactId, fenceForStation, fenceLine, fenceRowOf,
  fenceScrubCostCr, fenceSituation,
} from '../../data/fences.js';
import { heatLevelFor, isPlayerWanted } from '../../systems/heat.js';

const STATION_NAME = new Map();
for (const sec of SECTORS) for (const st of (sec.stations || [])) STATION_NAME.set(st.id, st.name || st.id);

const SCRUB_REFUSALS = Object.freeze({
  clean: 'There is nothing on your record to scrub.',
  burned: 'Not after that set-up. Not yet.',
  cooldown: 'One clean per stretch. Come back when the ledger has had time to settle.',
  credits: 'Come back with the credits. A scrub is not a favor.',
  nets_floor: 'I cannot touch a live net. Break the checkpoint yourself, then we talk.',
  impound: 'Impound is not paper. You have to take your hull back.',
  wrong_station: 'Not here.',
  not_a_fixer: 'I move cargo, not records.',
});

/** The contact for this station's fence, or null (no fence, or a non-clinic pilot is neither WANTED nor trusted). */
export function fenceBarContact(stationId, state) {
  const fence = fenceForStation(stationId);
  if (!fence) return null;
  const row = fenceRowOf(state, fence.id);
  const wanted = isPlayerWanted(state);
  if (!wanted && row.trust < 1 && fence.id !== 'fence_hesper_quill') return null;
  const level = heatLevelFor(state && state.player && state.player.heat);
  const choices = [
    { id: 'fence_work', label: 'Any work?' },
    { id: 'fence_word', label: 'What do you hear about me?' },
  ];
  if (fence.id === PROTEUS_FENCE) {
    choices.push({ id: 'proteus_sounding', label: 'About the well sounding' });
    if (proteusFindingMapOffer(state, stationId, { id: fenceContactId(fence), fenceId: fence.id })) {
      choices.push({ id: 'proteus_sounding_map', label: 'Open the sounding on the system map' });
    }
  }
  if (fence.id === 'fence_hesper_quill') choices.push({ id: 'clinic_freight_report', label: 'Did the supplies arrive?' });
  if (fence.quirk.fixer && wanted) {
    // The scrub cools ONE wanted band per fence per cooldown (heat.js SCRUB_COOL_LEVELS), priced
    // per current level — never the whole record in one ask, and a live net or impound hold is
    // refused outright. "Clean my record" promised a full clear the desk never offered; the
    // label says the deal the fixer actually sells.
    choices.push({ id: 'fence_scrub', label: `Cool the record one notch (${fenceScrubCostCr(level, row.trust)} cr)` });
  }
  choices.push({ id: 'fence_bye', label: 'Keep it quiet.' });
  return {
    id: fenceContactId(fence),
    name: fence.name,
    role: 'smuggler',
    roleLabel: fence.title,
    factionId: fence.factionId,
    line: fenceLine(fence, fenceSituation(row, deniableBoardEpoch(state))),
    fenceId: fence.id,
    choices,
  };
}


const PROTEUS_STATION = 'station_proteus';
const PROTEUS_SECTOR = 'sector_proteus_well';
const PROTEUS_POI = 'poi_proteus_stash';
const PROTEUS_FENCE = 'fence_pyrrha_rivet';

/** Only the existing scanner-owned investigation is evidence, never a proximity return. */
export function proteusFindingKnown(state) {
  return state?.world?.discovery?.[PROTEUS_SECTOR]?.pois?.[PROTEUS_POI]?.investigated === true;
}

function proteusConversationAvailable(state, stationId, contact) {
  const fence = FENCE_BY_ID.get(PROTEUS_FENCE);
  return stationId === PROTEUS_STATION && contact?.fenceId === PROTEUS_FENCE
    && contact.id === fenceContactId(fence)
    && state?.ui?.docked === true && state.ui.dockedStationId === PROTEUS_STATION
    && state?.world?.currentSectorId === PROTEUS_SECTOR
    && (isPlayerWanted(state) || fenceRowOf(state, PROTEUS_FENCE).trust >= 1);
}

/** Re-read the resident marker on every click. No hidden-site coordinates before investigation. */
export function proteusFindingMapOffer(state, stationId, contact) {
  if (!proteusConversationAvailable(state, stationId, contact) || !proteusFindingKnown(state)) return null;
  const active = state.world.activeSector;
  if (active?.id !== PROTEUS_SECTOR) return null;
  const poi = Array.isArray(active.pois)
    ? active.pois.find((row) => row?.poiId === PROTEUS_POI) : null;
  if (!poi) return null;
  const entity = state.entities?.get?.(poi.id);
  if (entity?.alive === false) return null;
  const pos = entity?.pos || poi.pos;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  return { sectorId: PROTEUS_SECTOR, pos: { x: pos.x, z: pos.z },
    label: 'Below-Deck Cache', source: 'station-bar:proteus-sounding' };
}

function boardJobFor(state, stationId) {
  const board = state && state.missions && state.missions.boards && state.missions.boards[stationId];
  const slots = board && Array.isArray(board.slots) ? board.slots : [];
  return slots.find((o) => o && o.cause && (o.cause.tag === 'wanted_deniable' || o.cause.tag === 'fence_route')) || null;
}

/** { text, missionOffer? } for one of the fence contact's choices. */
export function fenceBarReply(contact, choiceId, state, stationId) {
  const fence = contact && FENCE_BY_ID.get(contact.fenceId);
  if (!fence) return { text: 'They shrug.' };
  const row = fenceRowOf(state, fence.id);
  const epoch = deniableBoardEpoch(state);
  const situation = fenceSituation(row, epoch);

  if (choiceId === 'proteus_sounding' && fence.id === PROTEUS_FENCE) {
    if (!proteusConversationAvailable(state, stationId, contact)) return { text: 'That conversation is not available here.' };
    return { text: proteusFindingKnown(state)
      ? 'That return under the Funnel is the Below-Deck Cache. It is in your survey record now. I do not buy pings, love; cartography pays for charts. Want it on your map?'
      : 'The Funnel floor returns more mass than that hull explains. Put an active scan on it and look properly before you call it a find. I trade parts and freight, not hunches.' };
  }
  if (choiceId === 'clinic_freight_report' && fence.id === 'fence_hesper_quill') {
    return { text: clinicFreightReadout(state).text };
  }
  if (choiceId === 'fence_scrub') {
    const ask = row.lastAsk;
    if (ask && ask.kind === 'scrub' && ask.ok) {
      return { text: `Done. Your hull is a little colder than it was. ${fenceLine(fence, 'thanks')}` };
    }
    return { text: (ask && SCRUB_REFUSALS[ask.reason]) || 'Not today.' };
  }
  if (choiceId === 'fence_word') {
    const record = row.jobsDone || row.jobsLost
      ? ` Jobs run for me: ${row.jobsDone}. Lost: ${row.jobsLost}.` : '';
    return { text: `${fenceLine(fence, situation)}${record}` };
  }
  if (choiceId === 'fence_work') {
    if (situation === 'burned') return { text: 'Nothing posted for you. Not while the set-up is still fresh.' };
    if (row.route && row.route.status === 'running') return { text: 'You are already on my route. Finish the drop you carry.' };
    if (row.route && row.route.status === 'pending') {
      const where = STATION_NAME.get(row.route.pendingStationId) || 'the last drop';
      return { text: `Your next drop is waiting at ${where}. Dock there and it is on the board.` };
    }
    const job = boardJobFor(state, stationId);
    if (job) {
      const route = job.cause.tag === 'fence_route';
      return {
        text: route
          ? `I have a run for you: ${FENCE_ROUTE_LEGS} drops, each unlocks the next, and ${fence.route.reward.label} at the end.`
          : `${fence.quirk.summary} It is on the board.`,
        missionOffer: job,
      };
    }
    if (fence.id === 'fence_hesper_quill') return { text: 'Clean or wanted, the clinic needs food and medicine. Leave room in your hold and check the board; normal berth, cargo and law checks still apply.' };
    if (!isPlayerWanted(state)) return { text: 'Nothing for a clean hull. Come back hot.' };
    return { text: `${fence.quirk.summary} Dock hot with room in the hold and I will post something.` };
  }
  return { text: fenceLine(fence, situation) };
}
