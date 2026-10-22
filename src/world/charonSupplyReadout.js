// Pure-data presentation and original-actor identity view. Never imports
// physical cargo owners; scanner may import Hail before the runtime is composed.
import { activityPocketById } from '../data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
export const CHARON_SUPPLY = Object.freeze({
  sectorId: 'sector_charon_expanse',
  pocketId: 'charon_colony_barge',
  sourceId: 'charon_colony_air_pod',
  hauler: 'charon_colony_hauler',
  salvor: 'charon_colony_salvor',
  commodityId: 'cmdty_consumer_goods',
  quantity: 6,
  schema: 1
});
const C=CHARON_SUPPLY;
const actorLives=new WeakMap();
export const charonSupplyLive=(s,e)=>e?.alive===true&&s.entities.get(e.id)===e;
export const charonSupplyBook=s=>s.traffic?.charonSalvageSupply;
export const charonSupplyQuantity=(b,field)=>b.pods.reduce((n,r)=>n+r[field],0);
const live=charonSupplyLive,book=charonSupplyBook,quantity=charonSupplyQuantity;
export function charonSupplyActorLife(b,slot){return actorLives.get(b)?.get(slot);}
function actor(s, slot, recordId = null) {
  const rows = s.entityList.filter(e => live(s, e) && e.data?.activityActorSlotId === slot && (!recordId || e.data.worldRecordId === recordId));
  if (rows.length !== 1 || s.entityList.filter(e => live(s, e) && e.data?.worldRecordId === rows[0].data.worldRecordId).length !== 1) return null;
  const e = rows[0],
    b = book(s);
  if (b && !b.blocked) {
    let lives = actorLives.get(b);
    if (!lives) {
      lives = new Map();
      actorLives.set(b, lives);
    }
    const old = lives.get(slot);
    if (old && (old.entity !== e || old.life !== e.occupantGeneration)) {
      // The world owner may rematerialize a shelved hull. Rebind only its durable,
      // alive original record after the previous healthy incarnation left canon.
      const rec = s.world?.records?.byId?.[recordId || e.data.worldRecordId],
        prior = old.entity,
        key = `charon:activity:${slot}`;
      if (prior === e || prior.alive || s.entities.get(prior.id) === prior || !(prior.hull > 0) || !e.data.durable || e.data.identityKey !== key || prior.data?.identityKey !== key || rec?.recordId !== e.data.worldRecordId || rec.identityKey !== key || rec.alive !== true || rec.outcome !== 'active' || rec.homeSectorId !== C.sectorId) return null;
      lives.set(slot, {
        entity: e,
        life: e.occupantGeneration
      });
    } else if (!old) lives.set(slot, {
      entity: e,
      life: e.occupantGeneration
    });
  }
  return e;
}
function carrier(s) {
  const b = book(s);
  return b && actor(s, C.hauler, b.haulerId);
}
function recipient(s) {
  const b = book(s);
  return b && actor(s, C.salvor, b.salvorId);
}
export function charonSupplyHailLines(s, e) {
  const b = book(s);
  if (!b || b.blocked || !live(s, e) || ![[C.hauler, b.haulerId], [C.salvor, b.salvorId]].some(([slot, id]) => e.data?.activityActorSlotId === slot && e.data.worldRecordId === id)) return null;
  const h = carrier(s),
    r = recipient(s),
    loose = quantity(b, 'loose'),
    aboard = quantity(b, 'aboard');
  // Guidance follows current custody, not the source pod's first-arrival state.
  // The physical owner requires slow contact with the hauler for collection,
  // then a complete reserve and slow hauler/cutter proximity for handoff.
  const guidance = loose > 0
    ? 'Bring the original loose supply pod within reach of the original hauler, slow it and release your tether.'
    : aboard === C.quantity
      ? 'The full reserve is aboard the original hauler; handoff requires it to reach the original cutter at low relative speed. No loose reserve remains to recover.'
      : 'No loose reserve remains to recover.';
  return ['Visiting salvage crew. The colony was evacuated. We are recovering its abandoned sealed air-system supplies; the barge is a landmark, not a cargo receiver.', b.phase === 'working' ? r ? `Recovered scrubber kits used by ${r.data?.name || 'the original cutter'} to start its next cutting round.` : 'The scrubber reserve reached the original cutter, which is no longer present.' : b.phase === 'delivered' ? 'Air-system supplies are physically aboard the cutter, awaiting next-round admission.' : b.phase === 'awaiting_round' ? b.haulerReady && b.salvorReady ? 'Waiting to recover sealed scrubber kits before our first cutting round.' : 'We are finishing our current jobs before recovering the next round’s air-system supplies.' : b.phase === 'shortfall' ? 'The next cutting round is cancelled: part of the original scrubber reserve was taken or lost. Remaining stock stays where it is; no replacement is being issued.' : !h || !r ? 'The original supply crew is missing. No replacement load has been issued.' : `Cutter waiting to start its next round: ${aboard} aboard ${h.data?.name || 'the original hauler'}, ${loose} loose, ${quantity(b, 'player')} recovered by you, ${quantity(b, 'other')} taken by another collector, ${quantity(b, 'lost')} lost. ${guidance}`];
}
export function charonSupplyFacts(s) {
  const b = book(s);
  if (!b || b.blocked) return null;
  return {
    phase: b.phase,
    original: b.original,
    ...Object.fromEntries(['loose', 'aboard', 'delivered', 'consumed', 'player', 'other', 'lost'].map(k => [k, quantity(b, k)])),
    haulerId: carrier(s)?.id ?? null,
    salvorId: recipient(s)?.id ?? null
  };
}

export {actor as charonSupplyActor,carrier as charonSupplyCarrier,recipient as charonSupplyRecipient};

// Read-only contact presentation. Bind the selected hull through the same original-life
// view as custody; a reused slot/name must not inherit this crew's story or choices.
// Compact rows stay short; the existing chosen ROUTE surface owns wrapped guidance.
export function charonSupplyPresentation(s, e, { detailed = true } = {}) {
  const b = s && book(s);
  if (!b || b.blocked || !e || !live(s, e)
    || ![[C.hauler, b.haulerId], [C.salvor, b.salvorId]].some(([slot, id]) =>
      e.data?.activityActorSlotId === slot && e.data.worldRecordId === id)) return null;
  const h = carrier(s), r = recipient(s);
  if (e !== h && e !== r) return null;
  const loose = quantity(b, 'loose'), aboard = quantity(b, 'aboard');
  // Custody can become incomplete while the old jobs still own their round.
  // Report that fact without advancing the deferred physical phase.
  const pendingShortfall = ['awaiting_round', 'collect'].includes(b.phase)
    && quantity(b, 'player') + quantity(b, 'other') + quantity(b, 'lost') > 0;
  let status;
  if (b.phase === 'working') status = 'RESERVE USED · ROUND STARTED';
  else if (b.phase === 'shortfall') status = 'RESERVE SHORT · ROUND CANCELLED';
  else if (pendingShortfall) status = 'RESERVE SHORT · ROUND BLOCKED';
  else if (b.phase === 'lost') status = quantity(b, 'lost') === C.quantity
    ? 'RESERVE LOST · NO REPLACEMENT' : 'RECOVERY STOPPED · NO REFILL';
  else if (!h || !r) status = 'CREW MISSING · NO REPLACEMENT';
  else if (b.phase === 'delivered') status = 'KITS AT CUTTER · ROUND PENDING';
  else if (b.phase === 'awaiting_round' && !(b.haulerReady && b.salvorReady)) status = 'FINISHING CURRENT JOBS';
  else if (aboard) status = `${aboard} KITS ABOARD HAULER`;
  else status = `${loose} KITS LOOSE · ROUND WAITING`;
  const compact = {
    status: `SUPPLY · ${status}`,
    compact: ['VISITING SALVAGE · NO RESIDENTS', status],
  };
  // Target locks and compact Hail rows need no route prose or repeated actor resolution.
  // Keep the full original-life and duplicate checks above on every read, including restore.
  if (!detailed) return compact;
  const lines = charonSupplyHailLines(s, e);
  if (!lines) return null;
  const choices = !pendingShortfall && loose > 0 && ['awaiting_round', 'collect'].includes(b.phase) && h && r
    ? ' Leave the reserve for this crew, or recover it yourself. Taking any cancels their next cutting round.' : '';
  return {
    ...compact,
    route: [lines[0] + choices, b.phase === 'lost'
      ? `Recovery stopped: ${loose} kits loose, ${aboard} aboard the original hauler, ${quantity(b, 'delivered')} at the original cutter, ${quantity(b, 'player')} recovered by you, ${quantity(b, 'other')} taken by another collector, ${quantity(b, 'lost')} lost. No replacement load is being issued.`
      : pendingShortfall
        ? `Scrubber reserve incomplete: ${loose} kits loose, ${aboard} aboard the original hauler, ${quantity(b, 'player')} recovered by you, ${quantity(b, 'other')} taken by another collector, ${quantity(b, 'lost')} lost. The next cutting round cannot start with this shortfall. Existing jobs keep their current round; no replacement load is being issued.`
      : (!h || !r) && !['working', 'shortfall'].includes(b.phase)
        ? 'The original supply crew is missing. No replacement load has been issued.' : lines[1]],
  };
}

// Restrict discovery to the ordinary original civilian work channels. Other
// Hail specialties (tolls, ghosts, patrols) must never inherit this instruction.
function charonApproachHailable(s, e) {
  const d = e.data || {}, role = d.trafficRole || d.role || e.role;
  if (e.team !== 2 || !['hauler', 'salvor'].includes(role) || d.ai?.lawful) return false;
  if (!(d.jobPhase || role === 'salvor' && d.jobId || role === 'hauler' && d.ai?.passive === true)) return false;
  return !Object.values(s.pirateParley?.squads || {}).some(r => r && !r.resolved
    && r.phase === 'demand' && r.demand && r.deadlineAt > s.simTime
    && (r.hailerId === e.id || Array.isArray(r.memberIds) && r.memberIds.includes(e.id)));
}

export function charonApproachCenter() {
  return sectorLocalToGlobalForSector(activityPocketById(C.pocketId).activityAnchor.localPos, C.sectorId);
}

// Match traffic's ordinary-flight exclusions without importing registered owners.
export function charonApproachFlight(s) {
  return s?.mode === 'flight' && !s.ui?.docked
    && !(s.run?.kind === 'survival' && s.run.phase !== 'inactive')
    && !(Array.isArray(s.missions?.active) ? s.missions.active : []).some(m => m?.status === 'active'
      && m.params?.racingContractId && m.params.raceLease === true
      && (!m.params.sectionMission || ['grid', 'chase'].includes(m.params.phase)));
}

// Optional discovery, not a new service or a durable acknowledgement. Resolve the
// same original lives as SUPPLY ROUTE and never direct a player to an absent hull.
export function charonSupplyApproachCue(s) {
  const b = s && book(s), player = s?.entities?.get(s.playerId);
  if (!b || b.blocked || !live(s, player)) return null;
  const h = carrier(s), r = recipient(s);
  const available = e => e && charonApproachHailable(s, e) && e.hull > 0 && ['ship', 'drone'].includes(e.type)
    && !['isGhost', 'ghost', 'unresolved'].some(k => e.data?.[k]) && e.data?.kind !== 'unknown'
    && [e.pos?.x, e.pos?.z, player.pos?.x, player.pos?.z].every(Number.isFinite)
    && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= 900;
  const e = [h, r].find(available);
  if (!e) return null;
  const view = charonSupplyPresentation(s, e, { detailed: false });
  if (!view) return null;
  const name = String(e.data?.callsign || e.data?.name || (e === h ? 'the original hauler' : 'the original cutter'));
  return {
    text: approachText(view.compact[1], name),
    status: view.compact[1], actorRecordId: e.data.worldRecordId, actorSlot: e.data.activityActorSlotId,
    actorId: e.id, actorGeneration: e.occupantGeneration,
  };
}

const approachStatuses = new Set([
  'RESERVE USED · ROUND STARTED', 'RESERVE SHORT · ROUND CANCELLED',
  'RESERVE SHORT · ROUND BLOCKED', 'RESERVE LOST · NO REPLACEMENT',
  'RECOVERY STOPPED · NO REFILL', 'CREW MISSING · NO REPLACEMENT',
  'KITS AT CUTTER · ROUND PENDING', 'FINISHING CURRENT JOBS',
  ...Array.from({ length: 7 }, (_, n) => `${n} KITS LOOSE · ROUND WAITING`),
  ...Array.from({ length: 6 }, (_, n) => `${n + 1} KITS ABOARD HAULER`),
]);
const approachText = (status, name) => `Charon evacuated colony. Last crew report: ${status.toLowerCase()}. Select ${name}: Hail → SUPPLY ROUTE for current status.`;

// The UI has no custody book. Validate a short-lived authoritative observation,
// not a claim that the phase is still current. No actor-life binding or writes.
export function validCharonApproachReceipt(s, payload) {
  const m = payload?.charonApproach;
  if (!m || !s || !charonApproachFlight(s) || s.world?.currentSectorId !== C.sectorId
    || !approachStatuses.has(m.status) || !Number.isFinite(m.simTime)
    || !Number.isFinite(s.simTime) || s.simTime < m.simTime || s.simTime - m.simTime > 1
    || !Array.isArray(s.entityList) || typeof m.actorRecordId !== 'string' || !m.actorRecordId
    || ![C.hauler, C.salvor].includes(m.actorSlot)) return false;
  const center = charonApproachCenter();
  if (m.centerX !== center.x || m.centerZ !== center.z) return false;
  const p = s.entities?.get?.(m.playerId), e = s.entities?.get?.(m.actorId);
  if (s.playerId !== m.playerId || !p || !e || !live(s, p) || !live(s, e)
    || !Number.isSafeInteger(m.playerGeneration) || !Number.isSafeInteger(m.actorGeneration)
    || p.occupantGeneration !== m.playerGeneration || e.occupantGeneration !== m.actorGeneration
    || !charonApproachHailable(s, e) || !(e.hull > 0) || !(p.hull > 0) || !['ship', 'drone'].includes(e.type)
    || e.data?.activityActorSlotId !== m.actorSlot || e.data?.worldRecordId !== m.actorRecordId
    || !e.data?.durable || e.data?.identityKey !== `charon:activity:${m.actorSlot}`
    || ['isGhost', 'ghost', 'unresolved'].some(k => e.data?.[k]) || e.data?.kind === 'unknown'
    || !Number.isFinite(m.centerX) || !Number.isFinite(m.centerZ)
    || ![p.pos?.x, p.pos?.z, e.pos?.x, e.pos?.z].every(Number.isFinite)
    || !(Math.hypot(p.pos.x - m.centerX, p.pos.z - m.centerZ) <= 500)
    || !(Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) <= 900)) return false;
  const matches = s.entityList.filter(x => live(s, x)
    && (x.data?.worldRecordId === m.actorRecordId || x.data?.activityActorSlotId === m.actorSlot));
  if (matches.length !== 1 || matches[0] !== e) return false;
  const name = String(e.data?.callsign || e.data?.name || (m.actorSlot === C.hauler ? 'the original hauler' : 'the original cutter'));
  return payload.text === approachText(m.status, name);
}
