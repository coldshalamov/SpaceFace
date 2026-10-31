import { activeOwnedShip, starterJobForShip, starterJobStepsDone, shipCarriesModule } from '../../data/starterJobs.js';

const STATION = 'station_helios';
const CHOICE = 'helios_local_work';
const WORK = Object.freeze({
  starter_hitch: { name: 'Hitch', purpose: 'The berth crews need iron, not a story about iron.', tool: 'Drill Amp' },
  starter_pelican: { name: 'Pelican', purpose: 'Those loose lane buoys are somebody’s next bad approach.', tool: 'Heavy-Duty Winch' },
  starter_wasp: { name: 'Wasp', purpose: 'The gate runners have names. The writ names the one we need.', tool: 'Ram Plate' },
});

function atDesk(state, stationId) {
  return stationId === STATION && state?.ui?.docked === true && state.ui.dockedStationId === STATION;
}

export function kesslerStarterWorkChoice(state, stationId) {
  return atDesk(state, stationId) ? { id: CHOICE, label: 'Any local work for my ship?' } : null;
}

// Presentation only: the existing settlement counter is the receipt, not cargo, a kill,
// a completed objective or a conversation. No new memory/save/reward writer lives here.
export function kesslerStarterWorkReply(state, stationId, choiceId) {
  if (choiceId !== CHOICE) return null;
  if (!atDesk(state, stationId)) return { text: 'Come back to the Helios desk. I need the current board in front of us.' };
  const ship = activeOwnedShip(state);
  const job = ship && starterJobForShip(ship.defId);
  const active = (Array.isArray(state.missions?.active) ? state.missions.active : []).find(m =>
    m?.status === 'active' && Object.hasOwn(WORK, m.params?.starterJobId));
  if (active && active.params.starterJobId !== job?.id) return { text: `You still have a ${WORK[active.params.starterJobId].name} ticket open. Changing hulls does not settle it. Check that ticket and its required fit in the Mission Log before taking more local work.` };
  if (!job) return { text: 'No starter ticket for this hull. Check the Contracts board for work your current fit can take.' };
  const voice = WORK[job.id];
  const done = starterJobStepsDone(state, job.id);
  // Reject an impossible saved count rather than inventing a completed workday.
  if (done > job.steps.length) return { text: 'That work record does not match my ticket book. Check the Mission Log before signing another.' };
  const memory = done ? `Your ${voice.name} ticket ${done} is settled. I kept the entry.` : `No settled ${voice.name} ticket beside your name yet.`;
  if (active) return { text: `${memory} You already have a local ticket open. Track it in the Mission Log and follow that ticket’s instructions. An open ticket is not a settlement.` };
  if (done === job.steps.length) return { text: `${memory} The local ticket book has no later step. The Contracts board has other work; 47-A keeps its own account.` };
  if (!shipCarriesModule(ship, job.requiredModule)) return { text: `${memory} This work needs your ${voice.tool} fitted. Check the ship’s fittings before taking another ticket.` };
  const step = job.steps[done];
  const slots = state.missions?.boards?.[STATION]?.slots;
  const offer = (Array.isArray(slots) ? slots : []).find(m => m?.source === 'starterJob'
    && m.params?.starterJobId === job.id && m.params.starterStep === step.step
    && m.params.requiredModule === job.requiredModule && m.type === step.type
    && m.destStationId === STATION && m.destSectorId === 'sector_helios_prime'
    && typeof m.id === 'string' && m.id);
  if (!offer) return { text: `${memory} I do not have the next ticket on this board yet. Open Contracts to check the current posting. An unfinished or lost job is not a settled one.` };
  const title = typeof offer.title === 'string' && offer.title.trim() ? offer.title : step.title;
  const instructions = typeof offer.brief === 'string' && offer.brief.trim()
    ? offer.brief : 'Follow this ticket’s instructions in the Mission Log.';
  return {
    text: `${memory} ${voice.purpose} Next: “${title}.” Accept + Track if you want it. ${instructions}`,
    missionOffer: offer,
  };
}
