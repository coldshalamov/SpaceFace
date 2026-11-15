import { CLEAN_CYLINDER } from '../../data/cleanCylinder.js';
import { promotedPilotIdentity } from '../../data/pilotCallsigns.js';

export const CYLINDER_MESSAGE_ID = 'contact_expanse_shepherd_message';
const OUTCOMES = new Set(['clean_delivery', 'contaminated_delivery', 'retreated']);

// The settled run is the only evidence the message answers. missions is the writer;
// this conversation only reads its receipt — no replayed reward, no rewritten history.
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
      ? 'You turned back before I did. Still thinking about that.'
      : receipt.storyOutcome === 'contaminated_delivery'
        ? 'The quarantine lamp is on. My engines are finally off.'
        : 'The cylinder is off my ship. The gauge can rest.',
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
    return { text: `${outcome}. ${Math.max(0, Number(receipt.rewardCr) || 0).toLocaleString('en-US')} cr paid on the filed receipt.` };
  }
  if (choiceId === 'cylinder_after') return { text: receipt.storyOutcome === 'retreated'
    ? 'Both hulls home. The crossing is still out there.'
    : receipt.storyOutcome === 'contaminated_delivery'
      ? 'Quarantine took it. Half fee. I will not call it clean.'
      : 'Receiving has the clean cylinder. I watched your thrusters, not the lamp.' };
  return { text: 'You too. I will recognize that engine note.' };
}
