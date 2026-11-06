// Read-only contact copy. Scanner authenticates the live request; jobs performs
// repairs; missions remembers conversation. No action here moves cargo or money.
import { selectLanternWardDialogue } from '../missions/lanternWardStory.js';
import { LANTERN_WARD_ID, LANTERN_WARD_SECTOR } from './lanternWardLayout.js';
import { LANTERN_WARD_RECORD_IDS as IDS } from './lanternWardHardware.js';
import { lanternWardWorkGuidance } from './lanternWardGuidance.js';

export const LANTERN_WARD_REPAIR_ACTION = 'lantern_repair';

export function isLanternWardNessa(state, entity) {
  return state?.world?.currentSectorId === LANTERN_WARD_SECTOR
    && entity?.type === 'ship' && entity.alive !== false && entity.hull > 0
    && state.entities?.get(entity.id) === entity
    && entity.data?.worldRecordId === IDS.tug
    && entity.data.lanternWardId === LANTERN_WARD_ID
    && entity.data.lanternWardActor === 'tug';
}

export function lanternWardDialogueFacts(state) {
  const w = state?.npcJobs?.lanternWard;
  if (w?.version !== 1) return null;
  const h = w.history || {};
  const missingLamp = w.lampMissing === true || w.objects?.lamp?.lost === true;
  const missingReceiver = w.objects?.receiver?.lost === true;
  return { districtId: LANTERN_WARD_ID, phase: w.phase === 'installed' && w.needsReinstall ? 'displaced' : w.phase, blocked: w.blocked === true,
    installed: w.phase === 'installed' && !missingLamp && !missingReceiver && !w.needsReinstall,
    damaged: w.phase === 'damaged' && !missingLamp, missingLamp,
    cradleMissing: w.objects?.cradle?.lost === true || w.cradleAway === true,
    missingReceiver,
    cradleStolen: h.cradleStolen === true, playerHelped: h.playerCleared || h.playerCarried || h.repaired,
    ignored: h.ignored === true, repaired: h.repaired === true, history: h,
  };
}

export function lanternWardHailOffer(state, availability, requestId, expiresAt) {
  if (!isLanternWardNessa(state, availability?.entity)) return null;
  const status = lanternWardDialogueFacts(state);
  const revisit = (state.missions?.lanternWardConversation?.visits || 0) > 1;
  const line = selectLanternWardDialogue(status, { revisit });
  return { requestId, targetId: availability.targetId, kind: 'worker', expiresAt,
    lanternWardHail: true, worldRecordId: IDS.tug,
    // The scanner intentionally transports two lines; keep the live briefing in its body.
    lines: ['NESSA VENN · LAST WATCH ELECTRICAL', `${line.text} ${lanternWardWorkGuidance(state).status}.`],
    actions: [{ id: 'status', label: 'HOW IS THE WORK?' }, { id: 'route', label: 'NEXT STEP / DIRECTIONS' },
      ...(status?.damaged ? [{ id: LANTERN_WARD_REPAIR_ACTION, label: 'FIT CONTACTS · 1 ELECTRONICS' }] : [])],
  };
}

export function lanternWardHailResponse(state, offer, choice, repairResult = null) {
  const target = state?.entities?.get(offer?.targetId), id = String(choice || '').toLowerCase();
  if (offer?.lanternWardHail !== true || offer.worldRecordId !== IDS.tug
      || !isLanternWardNessa(state, target) || !offer.actions?.some(action => action.id === id)) return null;
  const status = lanternWardDialogueFacts(state);
  let line;
  if (id === LANTERN_WARD_REPAIR_ACTION) {
    line = repairResult?.ok ? "Contacts fitted to the original lamp. Bring it to the three brass marks; I'll stay with the connection."
      : repairResult?.reason === 'one_electronics_required'
        ? 'One electronics unit from trade or salvage. Bring it in your hold; the damaged lamp stays here.'
        : 'Bring the damaged original alongside my launch and match speed. I need the lamp, the spare contacts and room to work.';
  } else if (id === 'route') {
    return { requestId: offer.requestId, targetId: offer.targetId, kind: 'worker', choice: id,
      expiresAt: (state.simTime || 0) + 12, lines: lanternWardWorkGuidance(state).lines };
  } else if (id === 'status') {
    line = selectLanternWardDialogue(status, {
      revisit: (state.missions?.lanternWardConversation?.visits || 0) > 1,
    }).text;
    return { requestId: offer.requestId, targetId: offer.targetId, kind: 'worker', choice: id,
      expiresAt: (state.simTime || 0) + 7, lines: [line, lanternWardWorkGuidance(state).status] };
  }
  return line ? { requestId: offer.requestId, targetId: offer.targetId, kind: 'worker', choice: id,
    expiresAt: (state.simTime || 0) + 7, lines: [line] } : null;
}
