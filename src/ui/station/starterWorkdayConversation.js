import { firstBuoyReceivingReceipt } from '../../missions/starterBuoyAftermath.js';
import {
  activeOwnedShip,
  shipCarriesModule,
  starterJobForShip,
  starterJobStepsDone,
} from '../../data/starterJobs.js';

const STATION = 'station_helios';
const SECTOR = 'sector_helios_prime';
const CHOICE = 'helios_local_work';
const WORK = Object.freeze({
  starter_hitch: Object.freeze({ name: 'Hitch', tool: 'Drill Amp' }),
  starter_pelican: Object.freeze({ name: 'Pelican', tool: 'Heavy-Duty Winch' }),
  starter_wasp: Object.freeze({ name: 'Wasp', tool: 'Ram Plate' }),
});

function atDesk(state, stationId) {
  return stationId === STATION
    && state?.ui?.docked === true
    && state.ui.dockedStationId === STATION;
}

function starterTickets(state) {
  const active = Array.isArray(state?.missions?.active) ? state.missions.active : [];
  return active.filter((mission) => mission?.status === 'active'
    && Object.prototype.hasOwnProperty.call(WORK, mission?.params?.starterJobId));
}

function currentPosting(state, job, step) {
  const slots = state?.missions?.boards?.[STATION]?.slots;
  if (!Array.isArray(slots)) return null;
  const exact = slots.filter((mission) => mission
    && mission.source === 'starterJob'
    && mission.params?.starterJobId === job.id
    && mission.params?.starterStep === step.step
    && mission.params?.requiredModule === job.requiredModule
    && mission.type === step.type
    && mission.destStationId === STATION
    && mission.destSectorId === SECTOR
    && typeof mission.id === 'string'
    && mission.id.trim()
    && typeof mission.title === 'string'
    && mission.title.trim()
    && typeof mission.brief === 'string'
    && mission.brief.trim());
  // A dialogue must not choose between duplicate or stale board rows.
  return exact.length === 1 ? exact[0] : null;
}

export function kesslerStarterWorkChoice(state, stationId) {
  return atDesk(state, stationId)
    ? { id: CHOICE, label: 'Any local work for my ship?' }
    : null;
}

// Read-only presentation of the active hull's already-posted Helios ticket. The mission board,
// mission acceptance, and mission settlement owners remain authoritative for posting, fitting,
// payment, progress, and the per-hull counter.
export function kesslerStarterWorkReply(state, stationId, choiceId) {
  if (choiceId !== CHOICE) return null;
  if (!atDesk(state, stationId)) {
    return { text: 'Come back to the Helios desk. I need the current board in front of us.' };
  }

  const ship = activeOwnedShip(state);
  const job = ship && starterJobForShip(ship.defId);
  const tickets = starterTickets(state);
  if (tickets.length > 1) {
    return { text: 'More than one local ticket is still open. Check the Mission Log before signing another.' };
  }
  const active = tickets[0] || null;
  if (active && active.params.starterJobId !== (job && job.id)) {
    const other = WORK[active.params.starterJobId];
    return { text: `You still have a ${other.name} ticket open. Changing hulls does not settle it. Check that ticket in the Mission Log before taking more local work.` };
  }
  if (!job) {
    return { text: 'No local starter ticket is assigned to this hull. Check Contracts for work your current fit can take.' };
  }

  const voice = WORK[job.id];
  const done = starterJobStepsDone(state, job.id);
  if (done > job.steps.length) {
    return { text: 'That work record does not match my ticket book. Check the Mission Log before signing another.' };
  }
  const receiving = job.id === 'starter_pelican'
    ? firstBuoyReceivingReceipt(state, state.simTime) : null;
  const buoy = receiving?.starterBuoyRecovery;
  // Read the same accepted, time-bounded receipt as the station's receiving scene. A legacy
  // step counter alone cannot invent a physical handback, nor can an older ticket speak for
  // the current book. This is dialogue only: no new receipt, scene, payment or progress.
  const handback = buoy?.step === done
    ? `Kessler turns the receiving slip toward you. “${['44-C', 'Claim-rim', 'Outer-yard'][done - 1]} buoy. ${buoy.completionMethod === 'sling_in' ? 'Sling-in' : 'Tow-in'} accepted. The berth has it now.” `
    : '';
  const memory = handback + (done
    ? `Your ${voice.name} ticket ${done} is settled. I kept the entry.`
    : `No settled ${voice.name} ticket beside your name yet.`);

  if (active) {
    return { text: `${memory} You already have a local ticket open. Track it in the Mission Log and follow that ticket’s instructions. An open ticket is not a settlement.` };
  }
  if (done === job.steps.length) {
    return { text: `${memory} The local ticket book has no later step. Other postings stay on the Contracts board.` };
  }
  if (!shipCarriesModule(ship, job.requiredModule)) {
    return { text: `${memory} This work needs your ${voice.tool} fitted. Check the ship’s fittings before taking another ticket.` };
  }

  const step = job.steps[done];
  const offer = currentPosting(state, job, step);
  if (!offer) {
    return { text: `${memory} I do not have one current next-step ticket on this board yet. Open Contracts to check the posting; an unfinished job is not a settled one.` };
  }

  return {
    text: `${memory} The Helios board has this ${voice.name} ticket: “${offer.title.trim()}.” ${offer.brief.trim()} Accept + Track if you want the posted job; the Mission Log carries its route and progress.`,
    missionOffer: offer,
  };
}

