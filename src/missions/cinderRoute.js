// Book 2's finite Cinder squad. Missions remembers evidence/slots; aftermathWrecks alone
// owns hull pose, damage, custody, materialization and retirement. Never pin or mint a wreck.
import { ROOK_BOOTH } from '../data/rook.js';
import { rookPadPosition, rookDeliveryCheck, rookBoothEligible } from '../characters/rookRules.js';
import { sectorLocalToGlobalForSector, sectorMembershipAtGlobal } from '../data/sectorCoordinates.js';
import { zonesForSector } from '../data/sectorZones.js';

export const CINDER_TAG = 'campaign47a:b2:cinder';
export const CINDER_WASPS = Object.freeze(['Cinder One', 'Cinder Two', 'Cinder Three']);
export const authoredCinderRoute = m => m?.storyTag === CINDER_TAG && m.params?.cinderRouteVersion === 1;
const slotOk = n => Number.isInteger(n) && n >= 0 && n < 3;
const clone = value => JSON.parse(JSON.stringify(value));
export const cinderTargetOwner = m => authoredCinderRoute(m) ? m.params.cinderTargetOwnerId || m.id : m?.id;
const completed = m => new Set((m.completedTargetSlots || []).filter(slotOk));
const escaped = m => new Set((m.params?.cinderEscapedSlots || []).filter(slotOk));
const marks = m => Array.isArray(m.params?.cinderMarkedWrecks) ? m.params.cinderMarkedWrecks : [];
const rows = state => [...(state.missions?.active || []), ...(state.missions?._swarmParkedActive || []),
  ...(state.missions?.cinderRetry ? [state.missions.cinderRetry] : [])]
  .filter(m => authoredCinderRoute(m) && (m.status === 'active' || m.status === 'suspended'));
const markerList = state => Object.values(state.aftermathWrecks?.bySector || {}).flat().filter(Boolean);
const findMarker = (state, id) => markerList(state).find(row => row.markerId === id) || null;
function targetSlot(m, body) {
  const d = body?.data, ownerId = cinderTargetOwner(m);
  if (body?.type !== 'ship' || String(d?.missionId || d?.missionTag) !== String(ownerId)) return null;
  if (slotOk(d.missionTargetSlot)) return d.missionTargetSlot;
  // world.records preserves this canonical key even when optional target metadata is dropped.
  const prefix = `mission:${ownerId}:`, key = d.identityKey;
  if (typeof key !== 'string' || !key.startsWith(prefix)) return null;
  const tail = key.slice(prefix.length);
  return /^[0-2]$/.test(tail) ? Number(tail) : null;
}
function validEvidence(m) {
  const p = m.params || {}, refs = marks(m);
  return typeof p.cinderTargetOwnerId === 'string' && p.cinderTargetOwnerId.length > 0
    && Array.isArray(p.cinderIssuedSlots) && p.cinderIssuedSlots.every(slotOk)
    && Array.isArray(p.cinderMarkedWrecks) && refs.length <= 3
    && refs.every(r => slotOk(r?.slot) && typeof r.markerId === 'string' && r.markerId
      && (r.disposition == null || ['destroyed', 'stripped', 'delivered'].includes(r.disposition)))
    && new Set(refs.map(r => r.slot)).size === refs.length
    && new Set(refs.map(r => r.markerId)).size === refs.length
    && (p.cinderEscapedSlots === undefined
      || (Array.isArray(p.cinderEscapedSlots) && p.cinderEscapedSlots.every(slotOk)));
}

export function initializeCinderRoute(owner, m) {
  if (!authoredCinderRoute(m)) return false;
  const retry = owner.state.missions.cinderRetry;
  if (retry) {
    if (!authoredCinderRoute(retry) || !validEvidence(retry)) { m.params.cinderEvidenceInvalid = true; return true; }
    for (const key of ['cinderTargetOwnerId', 'cinderIssuedSlots', 'cinderMarkedWrecks', 'cinderDeliveredMarkerId', 'cinderEscapedSlots']) {
      if (retry.params[key] !== undefined) m.params[key] = clone(retry.params[key]);
    }
    m.completedTargetSlots = [...completed(retry)];
    m.objectiveProgress = m.completedTargetSlots.length;
    m.params.rookDeliveries = retry.params.cinderDeliveredMarkerId ? 1 : 0;
    delete owner.state.missions.cinderRetry;
  }
  m.params.cinderTargetOwnerId ||= String(m.id);
  m.params.cinderIssuedSlots ||= [];
  m.params.cinderMarkedWrecks ||= [];
  return true;
}

// Internal failure cleanup retains the same living squad in world.records and ordinary
// wrecks in aftermathWrecks. Public campaign abandon remains prohibited. This single
// optional snapshot holds no position, body or money ledger.
export function retainCinderRetry(owner, m) {
  if (!authoredCinderRoute(m)) return false;
  if (m.status === 'completed') { delete owner.state.missions.cinderRetry; return true; }
  if (m._cinderRetryRetained) return true;
  m._cinderRetryRetained = true;
  owner.state.missions.cinderRetry = {
    id: m.id, storyTag: CINDER_TAG, status: 'suspended', destSectorId: m.destSectorId,
    objectiveTarget: 3, objectiveProgress: completed(m).size, completedTargetSlots: [...completed(m)],
    params: { cinderRouteVersion: 1, cinderTargetOwnerId: cinderTargetOwner(m),
      cinderIssuedSlots: [...(m.params.cinderIssuedSlots || [])],
      cinderMarkedWrecks: clone(marks(m)),
      cinderEscapedSlots: [...(m.params.cinderEscapedSlots || [])],
      ...(m.params.cinderDeliveredMarkerId ? { cinderDeliveredMarkerId: m.params.cinderDeliveredMarkerId } : {}) },
  };
  m.targetEntityIds = [];
  return true;
}

export function cinderAvailableSlots(m, occupied) {
  if (!authoredCinderRoute(m)) return null;
  if (!validEvidence(m) || m.params.cinderEvidenceInvalid) return [];
  const issued = new Set(m.params.cinderIssuedSlots || []), done = completed(m);
  return [0, 1, 2].filter(slot => !occupied.has(slot) && !done.has(slot) && !issued.has(slot));
}
export function stampCinderWasp(m, body, slot) {
  if (!authoredCinderRoute(m) || !validEvidence(m) || !body || !slotOk(slot)) return;
  const p = m.params;
  if (!p.cinderIssuedSlots.includes(slot)) p.cinderIssuedSlots.push(slot);
  body.data.name = body.data.scanLabel = `${CINDER_WASPS[slot]} · marked Wasp`;
  body.data.storyTargetZoneId = 'zone_charon_ambush';
  body.data.missionStoryTag = CINDER_TAG;
  body.data.missionRouteVersion = 1;
  if (body.data.ai) body.data.ai.name = CINDER_WASPS[slot];
}
export function cinderApproachPosition() {
  const zone = zonesForSector(ROOK_BOOTH.sectorId).find(row => row.id === 'zone_charon_ambush');
  return zone?.center ? sectorLocalToGlobalForSector(zone.center, ROOK_BOOTH.sectorId) : null;
}
export function cinderWaspPosition(slot) {
  const center = cinderApproachPosition();
  // Three readable positions within the existing ambush lane, never a generic player ring.
  const offsets = [{ x: -150, z: -90 }, { x: 155, z: -80 }, { x: 0, z: 165 }];
  return center && slotOk(slot) ? { x: center.x + offsets[slot].x, z: center.z + offsets[slot].z } : null;
}

function canonicalCinderMarker(m, ref, marker) {
  const victim = marker?.victimMission;
  return !!(marker && marker.source === 'entity:killed' && marker.markerId === ref.markerId
    && victim?.id === cinderTargetOwner(m) && victim.slot === ref.slot
    && victim.storyTag === CINDER_TAG && victim.version === 1);
}

export function observeCinderMarker(owner, payload) {
  if (!payload?.markerId) return false;
  const marker = findMarker(owner.state, payload.markerId);
  if (!marker || marker.source !== 'entity:killed' || marker.victimId !== payload.victimId) return false;
  const body = owner.state.entities?.get(marker.victimId);
  if (!body || body.alive !== false) return false;
  for (const m of rows(owner.state)) {
    const slot = targetSlot(m, body);
    if (slot === null || !canonicalCinderMarker(m, { slot, markerId: marker.markerId }, marker)
      || marks(m).some(row => row.slot === slot)) continue;
    if (!m.params.cinderMarkedWrecks) m.params.cinderMarkedWrecks = [];
    m.params.cinderMarkedWrecks.push({ slot, markerId: marker.markerId });
    return true;
  }
  return false;
}

export function observeCinderKill(owner, payload) {
  if (!payload || payload.id == null) return false;
  const body = owner.state.entities?.get(payload.id);
  if (!body || body.alive !== false || (payload.entity && payload.entity !== body)) return false;
  let observed = false;
  for (const m of rows(owner.state)) {
    const slot = targetSlot(m, body);
    if (slot === null || completed(m).has(slot)) continue;
    // Record genuine death, including a rival/terrain kill, as clearance, never as a player kill.
    const done = completed(m); done.add(slot);
    m.completedTargetSlots = [...done].sort((a, b) => a - b);
    m.objectiveProgress = done.size;
    m.targetEntityIds = (m.targetEntityIds || []).filter(id => id !== body.id);
    observed = true;
    if (m.status === 'active' && owner.state.missions.active.includes(m)) {
      owner.bus.emit('mission:updated', { missionId: m.id });
      owner._sayStoryLine(`${CINDER_WASPS[slot]} down — lane clearances ${done.size}/3. Keep one marked hull intact for Rook.`, 5);
      driveCinderRoute(owner, m);
    }
  }
  return observed;
}

// A fleeing mark that keeps egress-level separation has answered the contract the only way a
// lane clearance measures: it left the lane. Drive-off counts as a clearance — not a kill, so
// no marker is minted; the slot's hull evidence resolves as lost through cinderAccounting's
// escaped side. The caller strips the body's contract identity so the ordinary egress bound
// retires it like any other escapee.
export function observeCinderEscape(owner, body) {
  if (!body || body.alive === false) return false;
  let observed = false;
  for (const m of rows(owner.state)) {
    const slot = targetSlot(m, body);
    if (slot === null || completed(m).has(slot) || escaped(m).has(slot)) continue;
    if (!m.params.cinderEscapedSlots) m.params.cinderEscapedSlots = [];
    m.params.cinderEscapedSlots.push(slot);
    const done = completed(m); done.add(slot);
    m.completedTargetSlots = [...done].sort((a, b) => a - b);
    m.objectiveProgress = done.size;
    m.targetEntityIds = (m.targetEntityIds || []).filter(id => id !== body.id);
    observed = true;
    if (m.status === 'active' && owner.state.missions.active.includes(m)) {
      owner.bus.emit('mission:updated', { missionId: m.id });
      owner._sayStoryLine(`${CINDER_WASPS[slot]} ran — lane clearances ${done.size}/3. Keep one marked hull intact for Rook.`, 5);
      driveCinderRoute(owner, m);
    }
  }
  return observed;
}

// These are observations of the existing owner's terminal events, not a wreck lifecycle ledger.
// The marker has already retired when either event is delivered; a still-present marker makes
// a synthetic/stale receipt fail closed. Budget eviction is NOT material loss.
export function observeCinderRetirement(owner, payload, signal) {
  if (!payload?.markerId || findMarker(owner.state, payload.markerId)) return false;
  const disposition = signal === 'aftermathWreck:completed' ? 'stripped'
    : signal === 'aftermathWreck:retired' && payload.reason === 'destroyed' ? 'destroyed' : null;
  if (!disposition) return false;
  let observed = false;
  for (const m of rows(owner.state)) {
    const ref = marks(m).find(r => r.markerId === payload.markerId);
    if (!ref || ref.disposition) continue;
    ref.disposition = m.params.cinderDeliveredMarkerId === payload.markerId ? 'delivered' : disposition;
    observed = true;
    if (m.status === 'active' && owner.state.missions.active.includes(m)) driveCinderRoute(owner, m);
  }
  return observed;
}

export function cinderAccounting(m, state) {
  if (!authoredCinderRoute(m) || !validEvidence(m) || m.params.cinderEvidenceInvalid) return { valid: false, delivered: false, exhausted: false };
  const refs = marks(m), delivered = typeof m.params.cinderDeliveredMarkerId === 'string'
    && refs.some(r => r.markerId === m.params.cinderDeliveredMarkerId);
  // Missing body OR marker is unknown, not loss (residency/load/cap pressure are not kills).
  // Only observed canonical terminal receipts, captured before save, exhaust a reference.
  const remaining = refs.filter(r => !['destroyed', 'stripped', 'delivered'].includes(r.disposition));
  // An escaped mark leaves no hull to tow: its slot resolves as hull-lost evidence, so
  // exhausted needs every slot accounted — delivered/stripped/destroyed or escaped.
  const resolved = new Set(refs.filter(r => r.disposition).map(r => r.slot));
  for (const slot of escaped(m)) resolved.add(slot);
  return { valid: true, delivered, remaining, exhausted: resolved.size === 3 };
}
export function cinderExtrasSatisfied(m, state) {
  const a = cinderAccounting(m, state);
  return a.valid && (a.delivered || a.exhausted);
}
export function acceptCinderRookReceipt(owner, m, p) {
  if (!authoredCinderRoute(m) || !validEvidence(m) || m.params.cinderDeliveredMarkerId) return false;
  const state = owner.state, e = state.entities?.get(p?.entityId), d = e?.data;
  if (p?.source !== 'rook:booth' || p.sectorId !== ROOK_BOOTH.sectorId
    || state.world?.currentSectorId !== ROOK_BOOTH.sectorId || !marks(m).some(r => r.markerId === p.markerId)
    || !e || e.alive === false || e.type !== 'wreck' || d?.rookClaimed !== true
    || d.persistenceOwner !== 'aftermathWrecks' || d.markerId !== p.markerId
    || !rookBoothEligible({ ...e, data: { ...d, rookClaimed: false } })
    || !canonicalCinderMarker(m, marks(m).find(r => r.markerId === p.markerId), findMarker(state, p.markerId))
    || !rookDeliveryCheck(e).arrived
    || p.pos?.x !== e.pos.x || p.pos?.z !== e.pos.z
    || owner.registry?.get('aftermathWrecks')?._resolveBoundWreck(p.markerId) !== e) return false;
  // This receipt is delivered before salvage retirement. Record it synchronously so retirement
  // cannot turn a real matching sale into a loss. The booth owns payment and disposal.
  m.params.cinderDeliveredMarkerId = p.markerId;
  m.params.rookDeliveries = 1;
  m.params.completionMethod = completed(m).size === 3 ? 'clear_and_tow' : 'tow_under_fire';
  return true;
}

function markBody(state, markerId) {
  return (state.entityList || []).find(e => e?.alive !== false && e.type === 'wreck'
    && e.data?.persistenceOwner === 'aftermathWrecks' && e.data.markerId === markerId) || null;
}
const held = (state, e) => e && (e.flags?.tethered || state.player?.tether?.targetId === e.id);
export function cinderRouteFocus(m, state) {
  if (!authoredCinderRoute(m)) return null;
  const account = cinderAccounting(m, state);
  const remaining = account.remaining || [], candidates = remaining.map(row => ({ row, body: markBody(state, row.markerId) }));
  const towing = candidates.find(({ body }) => held(state, body));
  if (towing && !account.delivered) return { label: "Rook's pad — brake the marked hull inside the ring", reason: 'Hull inside the 100-WU ring at no more than 8 WU/s. Clearance and tow can finish in either order.',
    pos: rookPadPosition(), sectorId: ROOK_BOOTH.sectorId, targetEntityId: null };
  const target = (m.targetEntityIds || []).map(id => state.entities?.get(id)).find(e => e?.alive !== false && targetSlot(m, e) !== null);
  if (completed(m).size < 3) return { label: `Cinder Wasps — ${completed(m).size}/3 cleared`,
    reason: 'Three marked Wasps hold the Ashfall approach. Leave one real hull intact; ordinary unrelated wrecks do not count.',
    pos: target?.pos ? { ...target.pos } : cinderApproachPosition(), sectorId: target?.pos ? sectorMembershipAtGlobal(target.pos) : ROOK_BOOTH.sectorId, targetEntityId: target?.id ?? null };
  const currentSector = state.world?.currentSectorId;
  const local = ({ row, body }) => {
    const pos = body?.pos || findMarker(state, row.markerId)?.pos;
    return pos && sectorMembershipAtGlobal(pos) === currentSector;
  };
  // On Continue, prefer the recoverable hull already brought here over a distant live sibling.
  const pick = candidates.find(candidate => candidate.body && local(candidate))
    || candidates.find(local) || candidates.find(({ body }) => body) || candidates[0];
  const marker = pick && findMarker(state, pick.row.markerId);
  const pos = pick?.body?.pos || marker?.pos;
  // The incident bucket is historical; a towed hull's current physical sector follows its global pose.
  const markerSector = marker?.pos ? sectorMembershipAtGlobal(marker.pos) : null;
  if (marker && !pick?.body && state.world?.currentSectorId === markerSector) return {
    label: 'Marked Cinder hull — recovery pending',
    reason: 'The real hull is recorded here, not lost. If protected recoveries fill the field capacity, finish one and return. No replacement hull or loss credit is created.',
    pos: { ...marker.pos }, sectorId: markerSector, targetEntityId: null };
  return { label: account.delivered ? 'Cinder lane — receipt filed' : pick ? 'Recover a marked Cinder Wasp hull' : 'Cinder wreck evidence pending',
    reason: pick ? 'Latch the marked hull and tow it to Rook. After Continue, reattach the Line; the hull keeps its real position. Stripped or destroyed hulls earn no tow credit.' : 'No replacement hull will be invented. Canonical aftermath must finish accounting for the marked material.',
    pos: pos ? { ...pos } : cinderApproachPosition(), sectorId: pos ? sectorMembershipAtGlobal(pos) : ROOK_BOOTH.sectorId,
    targetEntityId: pick?.body?.id ?? null };
}
export function driveCinderRoute(owner, m) {
  if (!authoredCinderRoute(m) || m.status !== 'active' || !owner.state.missions.active.includes(m)) return false;
  const a = cinderAccounting(m, owner.state);
  if (completed(m).size === 3 && a.valid && (a.delivered || a.exhausted)) {
    m.params.cinderOutcome = a.delivered ? 'clear_and_delivered' : 'clearance_only_hulls_lost';
    if (!a.delivered) {
      m.reward_cr = 0;
      m.params.rookDeliveries = 0;
      m.params.completionMethod = 'clearance_only';
      m.title = 'Cinder lane cleared — all marked hulls lost (no contract pay)';
      owner._sayStoryLine('Three Wasps cleared; every marked hull was lost or stripped. No Rook delivery and no contract pay. Next: the Compost Run.', 8);
    }
    owner._completeMission(m, owner.state.missions.active.indexOf(m));
    return true;
  }
  owner._refreshTrackedMissionNav(m);
  return true;
}

// A read-only priority request to the existing aftermath owner, not a new pin/record owner.
// Select one unresolved route, maximum three canonical marker identities, including the
// incoming real target death before rememberMarker emits its recorded event.
export function cinderRetentionIds(state, incomingMarker = null, canonicalMarkers = null) {
  const candidates = canonicalMarkers || markerList(state);
  const byId = new Map(candidates.filter(Boolean).map(marker => [marker.markerId, marker]));
  if (incomingMarker) byId.set(incomingMarker.markerId, incomingMarker);
  for (const m of rows(state)) {
    if (!validEvidence(m) || m.params.cinderEvidenceInvalid) continue;
    const ids = new Set();
    for (const ref of marks(m)) {
      if (!ref.disposition && ids.size < 3 && canonicalCinderMarker(m, ref, byId.get(ref.markerId))) ids.add(ref.markerId);
    }
    const body = incomingMarker && state.entities?.get(incomingMarker.victimId);
    const slot = body && targetSlot(m, body);
    if (ids.size < 3 && body?.alive === false && slot !== null
      && canonicalCinderMarker(m, { slot, markerId: incomingMarker.markerId }, incomingMarker)) ids.add(incomingMarker.markerId);
    if (ids.size) return ids; // one legitimate unresolved worksite, never three per arbitrary row
  }
  return new Set();
}

// Join actual victim identity to the one accepted route when world.records restored only its
// canonical identityKey. This is observed victim provenance, never a pin or sale exemption.
export function cinderVictimMission(state, body) {
  for (const m of rows(state)) {
    if (!validEvidence(m) || m.params.cinderEvidenceInvalid) continue;
    const slot = targetSlot(m, body);
    if (slot !== null && m.params.cinderIssuedSlots.includes(slot)) return {
      id: String(cinderTargetOwner(m)), slot, storyTag: CINDER_TAG, version: 1,
    };
  }
  return null;
}
