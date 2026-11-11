// Book 4's finite masked cast. Missions still owns all kills, completion and rewards.
// This helper observes physical geometry; faction_helix owns the actual flag change.
import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../ai/doctrine.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

export const WEIGHING_WORKSITE = Object.freeze({
  version: 1, sectorId: 'sector_charon_expanse', archetype: 'wasp_swarmer',
  // East approach to the charted Star Marker, not inside its physical center.
  center: Object.freeze({ x: -1700, z: -800 }),
  slots: Object.freeze([Object.freeze({ dx: 120, dz: 0 }),
    Object.freeze({ dx: -60, dz: 105 }), Object.freeze({ dx: -60, dz: -105 })]),
  arrivalRange: 850, breakWu: 70,
});
export const WEIGHING_OPENING = 'Star Marker weir, Charon: three 16t hulls. Pull one out of formation with the Line before firing to expose their flags. Then clear all three. Shooting first can destroy the evidence.';
const HOLD = 'weighing_masked_hold';
const finitePos = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
export function isWeighingOperation(m) {
  return !!m && m.storyTag === 'campaign47a:b4:operation'
    && (m.storyBranch ?? m.branch) === 'patrol' && m.type === 'patrol_clear'
    && m.destSectorId === WEIGHING_WORKSITE.sectorId && m.destStationId === 'station_expanse'
    && m.params?.weighingVersion === 1 && m.params.bookScene === 'too_perfect_pack'
    && m.params.packUnmask === true && m.params.clearCount === 3;
}
const packId = m => `weighing:${m.id}`;
export function weighingSpawnPosition(m, slot) {
  if (!isWeighingOperation(m) || !Number.isInteger(slot) || slot < 0 || slot >= 3) return null;
  const s = WEIGHING_WORKSITE.slots[slot], c = WEIGHING_WORKSITE.center;
  return sectorLocalToGlobalForSector({ x: c.x + s.dx, z: c.z + s.dz }, m.destSectorId);
}
function targetSlot(m, e) {
  const explicit = e?.data?.missionTargetSlot;
  if (explicit != null) return explicit;
  for (let slot = 0; slot < 3; slot++)
    if (e?.data?.identityKey === `mission:${m?.id}:${slot}`) return slot;
  return null;
}
function exactWeighingBody(state, m, e, slot = targetSlot(m, e)) {
  if (!isWeighingOperation(m) || !m.id || !Number.isInteger(slot) || slot < 0 || slot >= 3
    || !e || e.type !== 'ship' || !finitePos(e.pos)
    || state.entities?.get(e.id) !== e || !e.data?.ai) return false;
  const d = e.data, key = `mission:${m.id}:${slot}`;
  return d.missionId === m.id && d.missionTag === m.id && (d.missionTargetSlot == null || d.missionTargetSlot === slot)
    && d.identityKey === key && d.worldRecordId === stableRecordId(state.meta?.seed || 1,
      m.destSectorId, RECORD_KIND.MISSION_TARGET, key)
    && e.homeSectorId === m.destSectorId && d.homeSectorId === m.destSectorId
    && (d.sectorId == null || d.sectorId === m.destSectorId)
    && !(m.completedTargetSlots || []).includes(slot);
}
export function isWeighingTarget(state, m, e, slot = targetSlot(m, e)) {
  return !!e && e.alive !== false && exactWeighingBody(state, m, e, slot);
}
// Only the current, genuinely dead contract body can enter the existing mission
// settlement owner. This predicate neither credits a kill nor revives an actor.
export function isWeighingCasualty(state, m, event) {
  if (!isWeighingOperation(m) || m.status !== 'active' || event?.id == null
    || !Array.isArray(m.targetEntityIds) || !m.targetEntityIds.includes(event.id)) return false;
  const body = state.entities?.get(event.id);
  return !!body && body.alive === false && (!event.entity || event.entity === body)
    && exactWeighingBody(state, m, body);
}

function scene(m) {
  let r = m.params.weighingScene;
  if (r == null) r = m.params.weighingScene = {
    version: 1, phase: 'holding', baselines: {}, arrivalSaid: false };
  // Corrupt save state must never manufacture a fresh quiet/evidence opportunity.
  if (typeof r !== 'object' || Array.isArray(r) || r.version !== 1
    || !['holding', 'reveal_pending', 'combat'].includes(r.phase)
    || !r.baselines || typeof r.baselines !== 'object' || Array.isArray(r.baselines)
    || Object.entries(r.baselines).some(([slot, b]) => !['0', '1', '2'].includes(slot)
      || !b || typeof b !== 'object' || Array.isArray(b)
      || !['hull', 'shield'].every(key => b[key] === null || Number.isFinite(b[key])))) {
    r = m.params.weighingScene = { version: 1, phase: 'combat', baselines: {}, arrivalSaid: false };
  }
  return r;
}
function armedMapping(state, m, r, members, receipt) {
  const cast = r.armedCast;
  if (!Array.isArray(cast) || cast.length !== 3 || !Number.isFinite(r.armedAt)
    || !Array.isArray(receipt?.memberIds) || receipt.memberIds.length !== 3
    || new Set(receipt.memberIds).size !== 3 || !Number.isFinite(receipt.t)
    || receipt.t < r.armedAt || !receipt.memberIds.includes(receipt.breakerId)) return false;
  const mappedIds = new Set(), originalIds = new Set();
  for (let slot = 0; slot < 3; slot++) {
    const saved = cast.find(row => row?.slot === slot);
    const e = members.find(row => targetSlot(m, row) === slot);
    if (!saved || !e || !isWeighingTarget(state, m, e, slot)
      || saved.worldRecordId !== e.data.worldRecordId || saved.entityId == null
      || originalIds.has(saved.entityId)) return false;
    originalIds.add(saved.entityId);
    const matches = receipt.memberIds.filter(id => id === saved.entityId || id === e.id);
    if (matches.length !== 1 || mappedIds.has(matches[0])) return false;
    mappedIds.add(matches[0]);
  }
  return mappedIds.size === 3;
}
function canonicalHull(e) {
  return e.factionId === 'faction_helix'
    && (e.data.falseFlagDropped === true || e.data.ai?.maskBroken === true);
}

function say(owner, m, key, text) {
  owner.bus?.emit('comms:popup', { id: `weighing_${key}_${m.id}`, sender: 'CONCORD WEIR',
    category: 'story', text, ttl: 12, persist: true });
}
function hold(state, e) {
  const ai = e.data.ai;
  ai.passive = true; ai.allowPassiveManeuver = false; ai.roe = RulesOfEngagement.HOLD_FIRE;
  ai.activity = normalizeActivity({ kind: ActivityKind.HAIL_HOLD, reason: HOLD,
    anchor: e.pos, leashRadius: 600, startedTick: state.tick || 0, targetId: null });
  ai.postureBaseActivity = null;
  if (e.data.combat) e.data.combat.targetId = null;
}
function release(state, e) {
  const ai = e.data.ai;
  ai.passive = false; ai.allowPassiveManeuver = false; ai.roe = RulesOfEngagement.WEAPONS_FREE;
  ai.activity = normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'accepted_combat_contract',
    anchor: e.pos, leashRadius: 2200, startedTick: state.tick || 0, targetId: state.playerId });
  ai.postureBaseActivity = null;
}
export function stampWeighingTarget(state, m, e, slot = targetSlot(m, e)) {
  if (m?.status !== 'active' || !isWeighingTarget(state, m, e, slot)) return false;
  const r = scene(m), d = e.data;
  d.missionTargetSlot = slot; // Repair only after exact durable identity authentication.
  d.helixPack = packId(m); d.helixSlot = { ...WEIGHING_WORKSITE.slots[slot] };
  // Never reverse a canonical flag drop on a Continue/adoption pass.
  const exposed = !!weighingEvidence(m) || canonicalHull(e);
  if (!exposed) {
    e.factionId = 'faction_reach'; d.maskedAs = 'faction_reach';
    d.scanLabel = `WEIR ${slot + 1} — REACH / MATCHED TRANSPONDER`;
  } else {
    e.factionId = 'faction_helix'; d.falseFlagDropped = true;
    d.scanLabel = 'HELIX ADJUDICATOR — LAWFUL INTERDICTION';
  }
  // Wait for the complete authenticated cast and an observed break before arming the
  // Helix centroid detector. Partial-budget arrivals must not expose themselves.
  d.helixFalseFlag = !exposed && r.phase === 'reveal_pending';
  if (!r.baselines[slot]) r.baselines[slot] = {
    hull: Number.isFinite(e.hull) ? e.hull : null,
    shield: Number.isFinite(e.shield) ? e.shield : null,
  };
  if (r.phase === 'holding' || r.phase === 'reveal_pending') hold(state, e);
  else release(state, e);
  return true;
}
export function weighingEvidence(m) {
  const e = m?.params?.weighingScene?.evidence;
  return isWeighingOperation(m) && e?.kind === 'unmasked' && e.packId === packId(m)
    && Number.isFinite(e.at) && e.maskFactionId === 'faction_reach'
    && Array.isArray(e.slots) && e.slots.length === 3 && e.slots.every((slot, i) => slot === i) ? e : null;
}
export function weighingReadout(m) {
  if (!isWeighingOperation(m)) return null;
  if (weighingEvidence(m)) return m.status === 'completed'
    ? 'Lane cleared. The full pack’s Helix transponder evidence is on file.'
    : 'Helix transponders exposed. Clear all three marked hulls to finish the Weighing.';
  if (m.status === 'completed') return 'Lane cleared. The masked pack was destroyed without verified Helix transponder evidence.';
  if (m.params.weighingScene?.phase === 'combat') return 'The formation is lost. Clear the remaining marked hulls; their true registry is unverified.';
  return 'Three matching hulls hold the Star Marker weir. Pull one out of formation with the Line before firing to test their transponders, or clear them with guns.';
}
// Called only at the arming boundary and while a canonical receipt is pending.
// No full-world allocation or scan runs during quiet holding or settled combat.
function quarantineDuplicates(state, m, r) {
  const owned = [], seen = new Set();
  let duplicate = false;
  for (const e of state.entities?.values() || []) {
    if (!isWeighingTarget(state, m, e)) continue;
    const slot = targetSlot(m, e);
    if (seen.has(slot)) duplicate = true;
    seen.add(slot); owned.push(e);
  }
  if (!duplicate) return false;
  r.phase = 'combat';
  for (const e of owned) { e.data.helixFalseFlag = false; release(state, e); }
  return true;
}
export function observeWeighingScene(owner, m, state = owner.state) {
  if (!isWeighingOperation(m) || m.status !== 'active' || state.mode !== 'flight' || state.ui?.docked
    || state.world?.currentSectorId !== m.destSectorId) return false;
  const r = scene(m), ids = Array.isArray(m.targetEntityIds) ? m.targetEntityIds : [];
  const members = [], slots = new Set();
  for (const id of ids) {
    const e = state.entities?.get(id);
    if (!isWeighingTarget(state, m, e) || slots.has(targetSlot(m, e))) continue;
    slots.add(targetSlot(m, e)); members.push(e);
  }
  if (r.phase === 'combat') return false;
  const all = members.length === 3 && ids.length === 3 && new Set(ids).size === 3;
  const player = state.entities?.get(state.playerId), center = sectorLocalToGlobalForSector(WEIGHING_WORKSITE.center, m.destSectorId);
  if (!r.arrivalSaid && members.length && player?.alive !== false && finitePos(player?.pos)
    && Math.hypot(player.pos.x - center.x, player.pos.z - center.z) <= WEIGHING_WORKSITE.arrivalRange) {
    r.arrivalSaid = true; say(owner, m, 'arrival', WEIGHING_OPENING);
  }
  // Only an exact, full-cast canonical receipt can support the reveal claim. Cached
  // entity ids alone, a foreign pack, or a two-survivor centroid are not evidence.
  if (r.phase === 'reveal_pending' && quarantineDuplicates(state, m, r)) return false;
  const receipt = state.helix?.droppedPacks?.[packId(m)];
  if (r.phase === 'reveal_pending' && all && armedMapping(state, m, r, members, receipt)
    && members.every(canonicalHull)) {
    r.evidence = { kind: 'unmasked', packId: packId(m), at: receipt.t,
      slots: [0, 1, 2], maskFactionId: 'faction_reach' };
    r.phase = 'combat';
    say(owner, m, 'exposed', 'The triangle broke. All three live transponders resolved to Helix. They are arming now. Clear the three marked hulls; the registry evidence is recorded.');
    for (const e of members) { e.data.helixFalseFlag = false; release(state, e); }
    return true;
  }
  if (r.phase === 'combat') return false;
  const damaged = members.some(e => {
    const b = r.baselines[targetSlot(m, e)];
    return b && ((Number.isFinite(b.hull) && Number.isFinite(e.hull) && e.hull < b.hull)
      || (Number.isFinite(b.shield) && Number.isFinite(e.shield) && e.shield < b.shield));
  });
  // A partial initial budget is harmless; losing a previously assembled slot, or a
  // canonical cleared slot, ends the quiet tell without manufacturing exposure.
  if (damaged || (r.assembled && !all) || (m.completedTargetSlots || []).length || m.objectiveProgress > 0) {
    r.phase = 'combat';
    for (const e of members) { e.data.helixFalseFlag = false; release(state, e); }
    say(owner, m, 'broken', 'The quiet formation is gone. The surviving hulls are arming. Clear the lane; no full-pack registry exposure was verified.');
    return true;
  }
  if (!all) return false;
  r.assembled = true;
  if (r.phase === 'reveal_pending') return false;
  const cx = members.reduce((v, e) => v + e.pos.x, 0) / 3;
  const cz = members.reduce((v, e) => v + e.pos.z, 0) / 3;
  const broken = members.some(e => {
    const s = WEIGHING_WORKSITE.slots[targetSlot(m, e)];
    return Math.hypot(e.pos.x - cx - s.dx, e.pos.z - cz - s.dz) > WEIGHING_WORKSITE.breakWu;
  });
  if (!broken) return false;
  if (quarantineDuplicates(state, m, r)) return false;
  r.phase = 'reveal_pending';
  r.armedAt = Number.isFinite(state.simTime) ? state.simTime : 0;
  r.armedCast = members.map(e => ({ slot: targetSlot(m, e),
    entityId: e.id, worldRecordId: e.data.worldRecordId })).sort((a, b) => a.slot - b.slot);
  for (const e of members) { e.data.helixFalseFlag = true; e.data.helixPack = packId(m);
    e.data.helixSlot = { ...WEIGHING_WORKSITE.slots[targetSlot(m, e)] }; }
  return true;
}
