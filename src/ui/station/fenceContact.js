// fenceContact.js - THE WORLD REMEMBERS (U-B): a fence's face at the station bar.
//
// Pure read of the fence ledger (data/fences.js). The bar's contact engine (barContacts.js) asks
// `fenceBarContact(stationId, state)` for a contact and `fenceBarReply(...)` for its answers; the
// bar screen renders them like any other contact. The face is `localPortraitForContact(contact)`
// (role 'smuggler', the slot is picked by hash32 in the roster). The only action a contact can
// take is the scrub: the bar emits `ui:talkContact` (choiceId `fence_scrub`) and the fence desk
// answers it - this file never moves heat, credits or trust.
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

/** The contact for this station's fence, or null (no fence, or the pilot is neither WANTED nor trusted). */
export function fenceBarContact(stationId, state) {
  const fence = fenceForStation(stationId);
  if (!fence) return null;
  const row = fenceRowOf(state, fence.id);
  const wanted = isPlayerWanted(state);
  if (!wanted && row.trust < 1) return null;
  const level = heatLevelFor(state && state.player && state.player.heat);
  const choices = [
    { id: 'fence_work', label: 'Any work?' },
    { id: 'fence_word', label: 'What do you hear about me?' },
  ];
  if (fence.quirk.fixer && wanted) {
    choices.push({ id: 'fence_scrub', label: `Clean my record (${fenceScrubCostCr(level, row.trust)} cr)` });
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
    if (!isPlayerWanted(state)) return { text: 'Nothing for a clean hull. Come back hot.' };
    return { text: `${fence.quirk.summary} Dock hot with room in the hold and I will post something.` };
  }
  return { text: fenceLine(fence, situation) };
}
