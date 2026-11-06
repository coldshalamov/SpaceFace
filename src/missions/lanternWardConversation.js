// Sparse, optional local speech on the missions owner's existing simulation tick.
// The work record is read-only here. This journal remembers visits and spoken
// causal facts; it cannot install a lamp, assign work, mint cargo or grant credit.
import { selectLanternWardDialogue } from './lanternWardStory.js';
import { lanternWardDialogueFacts } from '../data/lanternWardHail.js';
import { LANTERN_WARD_SECTOR, lanternWardPoint } from '../data/lanternWardLayout.js';
import { lanternWardCanonicalAnchor, LANTERN_WARD_RECORD_IDS as IDS } from '../data/lanternWardHardware.js';

export function normalizeLanternWardConversation(value) {
  if (!value || value.version !== 1) return null;
  return { version: 1, visits: Math.max(0, Math.min(10000, Math.trunc(Number(value.visits) || 0))),
    inside: value.inside === true, lastSector: typeof value.lastSector === 'string' ? value.lastSector : null,
    nextSpeechAt: Number.isFinite(value.nextSpeechAt) ? Math.max(0, value.nextSpeechAt) : 0,
    spoken: Array.isArray(value.spoken) ? [...new Set(value.spoken.filter(x => typeof x === 'string' && x.length < 150))].slice(-40) : [],
    pendingHousehold: typeof value.pendingHousehold === 'string' ? value.pendingHousehold : null,
  };
}

export function stepLanternWardConversation(owner) {
  const state = owner.state, w = state.npcJobs?.lanternWard;
  if (state.mode !== 'flight' || w?.version !== 1 || !w.initialized) return;
  const m = state.missions;
  const memory = m.lanternWardConversation || (m.lanternWardConversation = {
    version: 1, visits: 0, inside: false, lastSector: null, nextSpeechAt: 0, spoken: [], pendingHousehold: null,
  });
  const sector = state.world?.currentSectorId;
  if (sector !== LANTERN_WARD_SECTOR) {
    memory.inside = false; memory.lastSector = sector; memory.pendingHousehold = null; return;
  }
  const player = state.entities?.get(state.playerId), anchor = lanternWardCanonicalAnchor();
  if (!player?.alive || !anchor) return;
  const work = lanternWardPoint(anchor, 'cradle');
  if (Math.hypot(player.pos.x - work.x, player.pos.z - work.z) > 240) return;
  if (!memory.inside) { memory.inside = true; memory.visits++; }
  memory.lastSector = sector;
  // Let architecture and work speak first. Hail remains available on demand.
  if (w.observedS < 40 || state.simTime < memory.nextSpeechAt) return;
  memory.nextSpeechAt = state.simTime + 2;
  const entities = state.entityList || [];
  const nessa = entities.find(e => e.alive !== false && e.data?.worldRecordId === IDS.tug);
  if (!nessa || Math.hypot(player.pos.x - nessa.pos.x, player.pos.z - nessa.pos.z) > 240) return;
  const status = lanternWardDialogueFacts(state), revisit = memory.visits > 1;
  if (memory.pendingHousehold) {
    const household = selectLanternWardDialogue(status, { speaker: 'household', revisit });
    // Re-read the physical result. Damage or theft between replies changes the line.
    owner.bus.emit('comms:popup', { sender: 'VENN HOUSEHOLD', text: household.text, category: 'personal', ttl: 7 });
    memory.pendingHousehold = null; memory.nextSpeechAt = state.simTime + 30;
    return;
  }
  const line = selectLanternWardDialogue(status, { revisit });
  if (memory.spoken.includes(line.id)) return;
  memory.spoken.push(line.id); memory.spoken = memory.spoken.slice(-40);
  memory.nextSpeechAt = state.simTime + 12;
  owner.bus.emit('comms:popup', { sender: 'NESSA VENN', text: line.text, category: 'personal', ttl: 7 });
  if (status?.installed || status?.cradleStolen || status?.history?.lampStolen) memory.pendingHousehold = line.id;
}
