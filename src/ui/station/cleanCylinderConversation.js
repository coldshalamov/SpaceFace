import { CLEAN_CYLINDER } from '../../data/cleanCylinder.js';
import { promotedPilotIdentity } from '../../data/pilotCallsigns.js';

export const CYLINDER_MESSAGE_ID = 'contact_expanse_shepherd_message';
const OUTCOMES = new Set(['clean_delivery', 'contaminated_delivery', 'retreated']);
function receiptFor(state, stationId) {
  if (stationId !== CLEAN_CYLINDER.stationId) return null;
  return (state?.missions?.receipts || []).findLast(r => r?.source === 'cleanCylinder'
    && r.sourceOfferId === CLEAN_CYLINDER.id && r.type === 'escort' && r.outcome === 'completed'
    && r.missionId && OUTCOMES.has(r.storyOutcome)) || null;
}

export function cleanCylinderContact(state, stationId) {
  const receipt = receiptFor(state, stationId);
  if (!receipt) return null;
  return {
    id: CYLINDER_MESSAGE_ID, canonicalKey: 'shepherd_message',
    name: promotedPilotIdentity(0, receipt.missionId).name, role: 'pilot',
    roleLabel: 'Shepherd pilot · recorded message', factionId: 'faction_dmc',
    line: receipt.storyOutcome === 'retreated'
      ? 'You turned back before I did. I have been thinking about that.'
      : receipt.storyOutcome === 'contaminated_delivery'
        ? 'The quarantine lamp is on. My engines are finally off.'
        : 'The cylinder is off my ship. I can stop watching the gauge.',
    choices: [
      { id: 'cylinder_after', label: 'How did you leave things?' },
      { id: 'cylinder_receipt', label: 'What did the desk file?' },
      { id: 'cylinder_bye', label: 'Safe flying.' },
    ],
  };
}

export function cleanCylinderReply(state, stationId, contact, choiceId) {
  if (contact?.id !== CYLINDER_MESSAGE_ID) return null;
  const receipt = receiptFor(state, stationId);
  if (!receipt) return { text: 'There is no settled Shepherd run on this desk.' };
  if (choiceId === 'cylinder_receipt') {
    const outcome = receipt.storyOutcome === 'retreated' ? 'Return to refuge. Crossing unfinished'
      : receipt.storyOutcome === 'contaminated_delivery' ? 'Contaminated delivery accepted by quarantine'
        : 'Clean cylinder delivered';
    return { text: `${outcome}. ${Math.max(0, Number(receipt.rewardCr) || 0).toLocaleString('en-US')} cr paid on the filed receipt. That is this run, not another settlement.` };
  }
  if (choiceId === 'cylinder_after') return { text: receipt.storyOutcome === 'retreated'
    ? 'Back at the entry refuge, both hulls. The job is still on the far side. I would rather tell the next watch why we turned than leave them guessing where we went.'
    : receipt.storyOutcome === 'contaminated_delivery'
      ? 'Quarantine took the cylinder. Half the fee, and a longer wait for the receiving crew. We got it here; I will not call it clean.'
      : 'Receiving has the clean cylinder. For a while out there I was watching your thrusters instead of the warning lamp. Thanks for staying.' };
  return { text: 'You too. I will recognize that engine note.' };
}
