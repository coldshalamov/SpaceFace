// The Helios desk remembers a conversation, not a second yard ledger. All work
// outcomes are read from the original site and its existing finite crew job.
import { stationContactMemoryFor } from '../data/stationContacts.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../data/ceresWorkfleet.js';

export const CERES_RETURN_CONTACT = 'contact_station_helios_kessler';
export const CERES_RETURN_STATION = 'station_helios';
const memory = state => stationContactMemoryFor(state, CERES_RETURN_CONTACT)?.flags || {};
const heard = (state, id) => memory(state)[`choice_${id}`] === true;
const id = (verb, outcome) => `ceres_return_${verb}_${outcome}`;

export function atCeresReturnDesk(state, stationId) {
  return stationId === CERES_RETURN_STATION && state?.ui?.docked === true
    && state.ui.dockedStationId === CERES_RETURN_STATION
    && state.world?.currentSectorId === 'sector_helios_prime' && !state.save?.restoring
    && !state.physicsVenue?.active && (!state.run?.kind || ['adventure', 'campaign'].includes(state.run.kind));
}

export function ceresShiftOutcome(state) {
  const site = state?.sites?.worldById?.[C.siteId];
  const braced = !!site?.completedOperations?.brace_long_plate;
  const cut = !!site?.completedOperations?.cut_long_plate_seam;
  if (!braced && !cut) return null;
  const plate = site?.payloads?.long_plate, phase = state.npcJobs?.ceresWorkfleet?.phase;
  if (plate?.destroyed || phase === 'section-destroyed') return 'lost';
  if (!braced) return 'unbraced';
  if (phase === 'player-retained') return 'custody';
  if (plate?.retained?.receiverWorldRecordId === C.identities.cradle) {
    return ['worker-disabled', 'head-disabled', 'recovery-interrupted'].includes(phase) ? 'aftercare' : 'secured';
  }
  if (['worker-disabled', 'head-disabled', 'recovery-interrupted'].includes(phase)) return 'stopped';
  return 'working';
}

export function ceresReturnChoices(state, stationId) {
  const outcome = ceresShiftOutcome(state);
  if (!outcome || !atCeresReturnDesk(state, stationId)) return [];
  const read = id('read', outcome), crew = id('crew', outcome);
  if (!heard(state, read)) return [{ id: read, label: memory(state).ceres_crew_matters
    ? 'You remember the crew. How did their lift go?' : 'Read my Second Measure shift back to me.' }];
  if (!heard(state, crew)) return [{ id: read, label: 'Read the current yard slip again.' },
    { id: crew, label: 'And the people doing the rest of that shift?' }];
  return [{ id: read, label: 'How is Second Measure now?' },
    { id: id('remember', outcome), label: memory(state).ceres_crew_matters
      ? 'I still want to hear about the crew.' : 'Next time, start with the crew.' },
    { id: id('leave', outcome), label: 'Leave it at my part of the job.' }];
}

export function ceresReturnChoiceAllowed(state, choice, stationId) {
  const outcome = ceresShiftOutcome(state);
  if (!outcome || !atCeresReturnDesk(state, stationId)) return false;
  if (choice === id('read', outcome)) return true;
  if (!heard(state, id('read', outcome))) return false;
  if (choice === id('crew', outcome)) return true;
  return heard(state, id('crew', outcome))
    && [id('remember', outcome), id('leave', outcome)].includes(choice);
}

const status = Object.freeze({
  working: '“Brace logged. Paid. No lift yet.”',
  secured: '“Braced first. Plate seated. Lift done.”',
  unbraced: '“Unbraced cut. It shows on the slip.”',
  lost: '“Plate is gone. No wage undoes that.”',
  custody: '“Custody claim. No delivery on record.”',
  aftercare: '“Lift landed. Equipment stopped after.”',
  stopped: '“Lift stopped. Your brace stands alone.”',
});
const crew = Object.freeze({
  working: '“Still heavy work. Cutter and hands.”',
  secured: '“They put it in. That counts.”',
  unbraced: '“Cannot lift what was never braced.”',
  lost: '“No plate, no lift. The slip says it.”',
  custody: '“Stood off. Custody claim, not delivery.”',
  aftercare: '“Lift done. Their trouble came after.”',
  stopped: '“Stopped is stopped. Paid is not finished.”',
});

export function ceresReturnReply(state, stationId, choice) {
  if (!choice?.startsWith('ceres_return_')) return null;
  if (!atCeresReturnDesk(state, stationId)) return { text: 'Helios desk, with the slip.' };
  if (!ceresReturnChoiceAllowed(state, choice, stationId))
    return { text: '“Read the current slip with me first.”' };
  const outcome = ceresShiftOutcome(state);
  if (choice === id('read', outcome)) {
    const braced = !!state.sites.worldById[C.siteId].completedOperations.brace_long_plate;
    const current = outcome === 'working' && memory(state).ceres_crew_matters
      ? '“Crew first, then. Brace paid; lift open.”' : status[outcome];
    return { text: current + (outcome === 'lost'
      ? braced ? ' “Your brace still paid.”' : ' “No brace logged. Nothing owed.”' : '') };
  }
  if (choice === id('crew', outcome)) {
    const delivered = state.sites.worldById[C.siteId].payloads?.long_plate
      ?.retained?.receiverWorldRecordId === C.identities.cradle;
    if (delivered && outcome === 'lost') return { text: '“They seated it before the loss. Both true.”' };
    if (delivered && outcome === 'custody') return { text: '“Plate reached the cradle before the claim.”' };
    return { text: crew[outcome] };
  }
  if (choice === id('remember', outcome)) return { text: '“Crew first. Ask when you are back.”' };
  return { text: '“Your part stands. The slip keeps.”' };
}
