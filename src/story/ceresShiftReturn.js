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
  working: '“Brace completed. Four hundred credits.” You wait. He turns the slip over. “No completed lift on the other side yet. Your support gave them a way to start. It did not put the plate in the cradle.”',
  secured: 'Kessler turns the slip over before reading it. “The yard recorded the original long plate secured in the cradle. Your brace paid four hundred credits. The crew carried and seated the load.” He leaves both sides visible.',
  unbraced: '“Seam cut before the brace. No brace payment.” Kessler lays the uncompleted line between you. “That support cannot catch a plate already freed. I have no completed crew lift to put beside it.”',
  lost: '“The long plate is gone.” Kessler stops there before looking at the payment column. “A wage line cannot put it back.”',
  custody: '“The crew stopped when someone took custody of the plate or equipment.” Kessler does not add a receiving entry. “A change of custody does not tell me where the original plate is safe now.”',
  aftercare: '“The original plate reached the cradle. The equipment stopped afterward.” Kessler puts the receiving entry beside the later stop. “The completed lift happened. This is not an assurance that the yard is safe now.”',
  stopped: '“The lift stopped. Disabled equipment or a load outside the safe handling path.” Kessler turns the slip toward you. “Your brace is on here. A completed lift is not.”',
});
const crew = Object.freeze({
  working: '“They still have the heavy part.” Kessler puts a finger on the empty receiving line. “The cutter, the carrier, the people clearing its path. You can be paid and their shift can still be unfinished.”',
  secured: '“They got it in.” Kessler says it without looking at the payment column. “That is what the receiving entry tells us. It does not tell us everyone went home, or what the next foreman made of their hours.” He pushes the slip back. “They got the plate there. Let them have that.”',
  unbraced: '“They cannot do this lift by pretending the brace happened.” Kessler does not reach for another form. “It says nothing here about an injury. I will not invent one. It does say they cannot finish the job they were waiting to start.”',
  lost: '“They cannot finish this lift with a plate that is gone.” Kessler keeps the old payment line visible. “That tells me about the load, not whether anybody was hurt. I cannot give you the rest from this slip.”',
  custody: '“They stood off rather than fight another claim with the work equipment.” Kessler squares the two edges of the slip. “That is a custody claim, not a delivery receipt. Your paid brace does not settle whose hands the load should be in now.”',
  aftercare: '“The crew finished the lift; that does not make the next problem disappear.” Kessler keeps both entries. “I cannot read the earlier success as a promise that the equipment is still fit to work. Nor will I cross out what they did finish.”',
  stopped: '“Somebody has to make the equipment and the handling path safe before there is more work.” Kessler lets the pencil rest. “I cannot turn a stopped lift into a finished shift because your part was paid.”',
});

export function ceresReturnReply(state, stationId, choice) {
  if (!choice?.startsWith('ceres_return_')) return null;
  if (!atCeresReturnDesk(state, stationId)) return { text: 'Speak to Kessler at the Helios desk about the yard slip.' };
  if (!ceresReturnChoiceAllowed(state, choice, stationId)) return { text: 'Kessler keeps the slip open. “Read the current entry with me first. The job may have changed since we last spoke.”' };
  const outcome = ceresShiftOutcome(state);
  if (choice === id('read', outcome)) {
    const braced = !!state.sites.worldById[C.siteId].completedOperations.brace_long_plate;
    const current = outcome === 'working' && memory(state).ceres_crew_matters
      ? '“The crew still has an unfinished lift.” Kessler puts the receiving side toward you first. “Your completed brace was paid four hundred credits. The original plate has not been secured in the cradle.”' : status[outcome];
    return { text: current + (outcome === 'lost'
      ? braced ? ' “The completed brace was paid. That part of your work still happened.”' : ' “No brace was completed, so no brace wage was earned.”' : '') };
  }
  if (choice === id('crew', outcome)) {
    const delivered = state.sites.worldById[C.siteId].payloads?.long_plate?.retained?.receiverWorldRecordId === C.identities.cradle;
    if (delivered && outcome === 'lost') return { text: '“They finished the lift before the plate was lost.” Kessler keeps the receiving entry beside the loss. “The original is gone now. That does not make their earlier work disappear, and it does not tell us whether anyone was hurt.”' };
    if (delivered && outcome === 'custody') return { text: '“The crew got the plate into the cradle before this claim stopped the work.” Kessler keeps the receiving entry. “That completed lift still happened. The claim concerns the plate or equipment now; it is not another delivery.”' };
    return { text: crew[outcome] };
  }
  if (choice === id('remember', outcome)) return { text: '“All right. The crew before the credits.” Kessler turns the slip so the receiving line is uppermost. “Ask me when you come back. I can read you what the yard has actually done. I will not promise a good ending.”' };
  return { text: '“Your part, then.” Kessler folds the slip along the payment column. “You do not owe me a speech about the rest. The yard entry will still be here if you ask.”' };
}
