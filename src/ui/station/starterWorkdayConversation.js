import { activeOwnedShip, starterJobForShip, starterJobStepsDone, shipCarriesModule } from '../../data/starterJobs.js';
import { contractSectorName, destStationName, objectiveText } from '../sim/missionRecap.js';

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

// Kessler may point back to a 47-A card only when the canonical active record still proves it.
// The book's intermediate Scale 4 step has no active mission, and old/finished tags are not
// promoted into a new story action. Keep the accepted book rows explicit so a stale save cannot
// make a similarly named career ticket look like the live campaign.
function isLive47ARecord(mission) {
  if (!mission || mission.status !== 'active'
      || typeof mission.id !== 'string' || !mission.id.trim()) return false;
  const p = mission.params || {};
  switch (mission.storyTag) {
    case 'campaign47a:b0:recovery':
      return mission.campaign47aBeat === 0
        && mission.type === 'salvage_retrieval'
        && p.contractId === '47-A'
        && mission.destStationId === 'station_helios'
        && mission.destSectorId === 'sector_helios_prime';
    case 'campaign47a:b1:alloy_run':
      return mission.campaign47aBeat === 1
        && mission.type === 'cargo_delivery'
        && p.bookScene === 'alloy_run'
        && mission.destStationId === 'station_tethys'
        && mission.destSectorId === 'sector_tethys_junction';
    case 'campaign47a:b1:infested':
      return mission.campaign47aBeat === 1
        && mission.type === 'patrol_clear'
        && p.bookScene === 'infested_hauler'
        && p.furnaceWorksiteVersion === 1
        && p.clearCount === 4
        && p.mitesNeeded === 4
        && p.furnaceFeedsNeeded === 3
        && mission.objectiveTarget === 4
        && mission.destStationId === 'station_ceres'
        && mission.destSectorId === 'sector_ceres_belt';
    default:
      return false;
  }
}

function live47AHandback(state) {
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  const current = active.filter(isLive47ARecord);
  // Multiple live campaign cards are ambiguous; do not choose an arbitrary route.
  if (current.length !== 1) return null;
  const mission = current[0];

  let objective;
  try { objective = objectiveText(mission); } catch { return null; }
  const title = typeof mission.title === 'string' && mission.title.trim() ? mission.title.trim() : 'Contract 47-A';
  const station = destStationName(mission.destStationId);
  const sector = contractSectorName(mission, '');
  if (station === 'destination' || !sector) return null;
  if (!objective) return null;

  return `47-A keeps its own account. The open card is “${title} — ${objective},” bound for ${station}, ${sector}. Track that card in Mission Log when you’re ready.`;
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
  if (done === job.steps.length) {
    const handback = live47AHandback(state);
    if (handback) return { text: `${memory} ${handback}` };
    return { text: `${memory} The local ticket book has no later step. The Contracts board has other work; 47-A keeps its own account.` };
  }
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
