// Human explanation of existing work. Combat, traffic and economy remain the only
// repair/custody/outcome writers; this companion retains only bounded conversation memory.
import { anvilWorkerRecordId, anvilReceiverWorkStatus, ANVIL_WORK } from '../systems/anvilWork.js';
import { isCanonicalOrchardDamageActor, orchardDamageUnavailable, orchardSavedDriveOffline } from '../combat/orchardWorkDamage.js';
import { PLANET_SITE } from '../data/planets.js';
import { LATCH_REPAIR_TAUT_RATIO } from '../combat/latchRepair.js';

const KEY = 'anvilOrchardShift';
const RANGE = 560;
const live = (s, e) => e && e.alive === true && e.hull > 0 && s.entities?.get(e.id) === e;
export function orchardShiftReceiver(state) {
  if (state?.mode !== 'flight' || state.world?.currentSectorId !== PLANET_SITE.sectorId) return null;
  const id = anvilWorkerRecordId(state, 'receiver');
  // Ordinary Orchard pod visits need no new population walk when the durable
  // traffic owner has never admitted its original receiving tender.
  if (!state.world?.records?.byId?.[id]) return null;
  let found = null;
  for (const e of state.entities?.values() || []) {
    if (e.data?.worldRecordId !== id || !live(state, e)) continue;
    if (found) return null;
    found = e;
  }
  return found && isCanonicalOrchardDamageActor(state, found) ? found : null;
}
export function orchardReceiverRepairFacts(state, entity) {
  return orchardShiftReceiver(state) === entity ? receiverFacts(state, entity) : null;
}
function receiverFacts(state, entity) {
  const status = anvilReceiverWorkStatus(state, entity);
  if (!status) return null;
  if (orchardDamageUnavailable(state, entity)) return { status, unavailable: true, disabled: false, repairable: false };
  const runtime = state.combat?.entities?.[entity.id];
  if (runtime?.orchardDamageUnresolved === true) return { status: 'STORMSHIFT · DAMAGE RECORD UNAVAILABLE · WORK HOLD',
    unavailable: true, disabled: false, repairable: false };
  const drive = runtime?.subsystems?.subsystem_drive;
  const disabled = runtime ? runtime.capabilities?.drive === false || drive?.destroyed === true || drive?.effectiveDisabled === true
    : orchardSavedDriveOffline(state, entity);
  // Latch repair restores a drive, not a destroyed power plant. Unknown cold
  // component state never licenses a promise of successful propulsion repair.
  const repairable = !!(runtime && drive && disabled && runtime.subsystems?.subsystem_power?.destroyed !== true);
  return { status, unavailable: runtime?.orchardDamageUnresolved === true, disabled, repairable };
}
export function orchardReceiverRepairGuidance(state, entity) {
  const f = orchardReceiverRepairFacts(state, entity);
  if (!f) return null;
  if (f.unavailable) return 'Damage record unavailable. Work remains on hold; repair requirements cannot be verified.';
  if (!f.disabled) return null;
  if (!f.repairable) return 'Drive unavailable. A taut repair line can patch the hull, but propulsion recovery is not verified; other damage may still block thrust.';
  return 'Aim at this tender and attach Massline. Brake to keep the line taut; if slack, hold Massline + Reel In gently. Keep the line until the hull is whole and the drive returns. Release the hold to keep the line; tap Massline separately to cut. The existing load stays aboard.';
}
function memory(state) {
  const row = state.player?.hints?.[KEY];
  if (!row || row.version !== 1 || row.recordId !== anvilWorkerRecordId(state, 'receiver')
    || !Number.isSafeInteger(row.sequence) || row.sequence < 0 || !Number.isSafeInteger(row.repairedTick)
    || row.repairedTick < 0 || row.repairedTick > state.tick
    || !['version', 'recordId', 'sequence', 'repairedTick', 'heardRepair', 'heardDelivery'].every(k => Object.hasOwn(row, k))
    || Object.keys(row).length !== 6 || typeof row.heardRepair !== 'boolean' || typeof row.heardDelivery !== 'boolean') return null;
  return row;
}
function delivery(state, receiver, row) {
  if (!row || !receiver || receiver.data.itinerary.sequence <= row.sequence) return null;
  // One relevant bounded key, not a scan of the economy journal. The first
  // post-repair trip is the promised outcome even if the player returns much later.
  const id = `anvil-delivery:${row.recordId}:${row.sequence}`;
  const committed = state.economy?.committedIntents?.[`freight:${id}`];
  const r = committed?.receipt;
  if (committed?.result?.ok !== true || !r || r.receiptId !== id || r.source !== 'anvil_work'
    || r.stationId !== ANVIL_WORK.buyerId || r.commodityId !== PLANET_SITE.harvest.commodityShallow
    || !Number.isSafeInteger(r.qty) || r.qty <= 0 || r.qty > ANVIL_WORK.receiverCapacity
    || committed.result.qty !== r.qty) return null;
  return r;
}
function playerLine(state, receiver) {
  const player = state.entities?.get(state.playerId), tether = state.player?.tether;
  if (!live(state, player) || !tether?.active) return null;
  const a = state.combat?.attachments?.byId?.[tether.attachmentId];
  if (!a || a.id !== tether.attachmentId || a.state !== 'active' || a.ownerId !== player.id || a.targetId !== receiver.id
    || a.ownerGeneration !== player.occupantGeneration || a.targetGeneration !== receiver.occupantGeneration
    || tether.targetId !== receiver.id) return null;
  const taut = ['capture', 'loaded', 'overload'].includes(tether.phase)
    || (Number.isFinite(a.restLength) && a.restLength > 0
      && Math.hypot(player.pos.x - receiver.pos.x, player.pos.z - receiver.pos.z) >= a.restLength * LATCH_REPAIR_TAUT_RATIO);
  return taut ? { player, attachment: a } : null;
}
export function createOrchardShiftEncounter(ctx) {
  let state = ctx.state, pending = null, observed = null, troubleHeard = false;
  let cached = null, decisionTick = null;
  const cancel = () => { if (pending) ctx.helpers?.voice?.cancel?.(pending.id); pending = null; };
  const reset = () => { cancel(); observed = null; troubleHeard = false; cached = null; decisionTick = null; };
  const observe = receiver => {
    const player = state.entities?.get(state.playerId);
    observed = live(state, player) ? { receiver, generation: receiver.occupantGeneration, player,
      playerGeneration: player.occupantGeneration, disabled: true, sequence: receiver.data.itinerary.sequence } : null;
  };
  const disabled = p => {
    if (p?.subsystemId !== 'subsystem_drive'
      || state.entities?.get(p.targetId)?.data?.worldRecordId !== anvilWorkerRecordId(state, 'receiver')) return;
    const receiver = orchardShiftReceiver(state);
    if (!receiver || p.targetId !== receiver.id) return;
    const f = receiverFacts(state, receiver);
    if (f?.disabled && !f.unavailable) { cached = receiver; observe(receiver); }
  };
  const enabled = p => {
    if (p?.subsystemId !== 'subsystem_drive' || p.source !== 'latch_repair'
      || p.repairedBy !== state.playerId || p.dependencyDisabled !== false
      || state.entities?.get(p.targetId)?.data?.worldRecordId !== anvilWorkerRecordId(state, 'receiver')) return;
    const receiver = orchardShiftReceiver(state), f = receiver && receiverFacts(state, receiver);
    if (!receiver || !f || f.unavailable || f.disabled || p?.targetId !== receiver.id
      || p.subsystemId !== 'subsystem_drive' || p.source !== 'latch_repair' || p.repairedBy !== state.playerId
      || p.dependencyDisabled !== false || receiver.hull < receiver.hullMax - 0.05) return;
    const runtime = state.combat?.entities?.[receiver.id];
    if (!runtime?.subsystems?.subsystem_drive || runtime.capabilities?.drive !== true) return;
    const line = playerLine(state, receiver);
    // Observe the actual disabled incarnation before the authoritative repair event.
    // A healthy hull plus a forged event, or a stale event after Continue, is not help.
    if (!line || observed?.receiver !== receiver || observed.generation !== receiver.occupantGeneration
      || observed.player !== line.player || observed.playerGeneration !== line.player.occupantGeneration
      || !observed.disabled || observed.sequence !== receiver.data.itinerary.sequence) return;
    observed = null;
    const old = memory(state);
    if (old) return; // One recognition for this original tender, never a farmable reward.
    const sequence = receiver.data.itinerary.sequence;
    if (!Number.isSafeInteger(sequence) || sequence < 0 || !Number.isSafeInteger(state.tick)) return;
    const hints = state.player.hints ||= {};
    hints[KEY] = { version: 1, recordId: receiver.data.worldRecordId, sequence, repairedTick: state.tick,
      heardRepair: false, heardDelivery: false };
  };
  const surface = p => {
    if (!pending || p?.id !== pending.id || p.kind !== 'anvil-orchard-shift' || !pending.valid()) return;
    if (pending.kind === 'trouble') troubleHeard = true;
    else {
      const row = memory(state);
      if (row) {
        row[pending.kind === 'repair' ? 'heardRepair' : 'heardDelivery'] = true;
      }
    }
    pending.surfaced = true;
  };
  ctx.bus?.on?.('combat:subsystemEnabled', enabled);
  ctx.bus?.on?.('combat:subsystemDisabled', disabled);
  ctx.bus?.on?.('voice:surface', surface);
  ctx.bus?.on?.('save:loaded', reset);
  return {
    update(nextState) {
      state = nextState || state;
      const player = state.entities?.get(state.playerId);
      if (state.mode !== 'flight' || state.world?.currentSectorId !== PLANET_SITE.sectorId || !live(state, player)) { reset(); return; }
      if (pending && !pending.valid()) cancel();
      // No stale disabled witness survives an observed healthy tick. The actual
      // synchronous latch repair event arrives before this subsequent update.
      if (observed && (!live(state, observed.receiver) || observed.player !== player
        || observed.generation !== observed.receiver.occupantGeneration
        || observed.playerGeneration !== player.occupantGeneration
        || state.combat?.entities?.[observed.receiver.id]?.capabilities?.drive === true)) observed = null;
      if (decisionTick !== null && state.tick >= decisionTick && state.tick - decisionTick < 30) return;
      decisionTick = state.tick;
      const receiver = cached && live(state, cached) && cached.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver')
        ? cached : orchardShiftReceiver(state);
      cached = receiver;
      const near = receiver && Math.hypot(player.pos.x - receiver.pos.x, player.pos.z - receiver.pos.z) <= RANGE;
      if (!near) { cancel(); return; }
      const f = orchardShiftReceiver(state) === receiver ? receiverFacts(state, receiver) : null;
      if (f?.disabled && !f.unavailable) observe(receiver); else observed = null;
      if (!f || f.unavailable) { cancel(); return; }
      if (pending && pending.valid() && state.simTime < pending.until) return;
      cancel();
      const saved = memory(state);
      const row = saved && saved.sequence <= receiver.data.itinerary.sequence ? saved : null;
      const receipt = delivery(state, receiver, row);
      let kind, text;
      if (f.disabled && !troubleHeard) {
        kind = 'trouble'; text = 'The collector brings shallow gas here. This tender takes it to Tethys. Its drive is down. Hail it for the repair readout.';
      } else if (!f.disabled && receipt && !row.heardDelivery) {
        kind = 'delivery'; text = `Tethys signed for ${receipt.qty} units. Good work on that drive.`;
      } else if (!f.disabled && row && !row.heardRepair && !row.heardDelivery) {
        kind = 'repair'; text = 'Drive’s back. Thanks for the hand. We’ve still got work to do.';
      }
      if (!text) return;
      const generation = receiver.occupantGeneration, playerGeneration = player.occupantGeneration;
      const playerState = state.player, world = state.world, data = receiver.data, route = data.itinerary;
      const runtime = state.combat?.entities?.[receiver.id];
      const savedDamage = state.world?.records?.byId?.[data.worldRecordId]?.extra?.orchardSubsystemDamage;
      const valid = () => {
        if (state.player !== playerState || state.world !== world || state.entities.get(state.playerId) !== player
          || !live(state, player) || player.occupantGeneration !== playerGeneration
          || state.mode !== 'flight' || state.world?.currentSectorId !== PLANET_SITE.sectorId
          || !live(state, receiver) || receiver.data !== data || data.itinerary !== route || data.jobId
          || receiver.occupantGeneration !== generation
          || Math.hypot(player.pos.x - receiver.pos.x, player.pos.z - receiver.pos.z) > RANGE) return false;
        // Arbiter validity is O(1), not another entity census on every voice poll.
        // Full canonical/damage validation runs at the encounter decision cadence.
        const index = state.entityIndex;
        if (index?.ready && index.byWorldRecordIdCount instanceof Map
          && index.byWorldRecordIdCount.get(data.worldRecordId) !== 1) return false;
        if (state.combat?.entities?.[receiver.id] !== runtime || runtime?.orchardDamageUnresolved
          || state.world?.records?.byId?.[data.worldRecordId]?.extra?.orchardSubsystemDamage !== savedDamage) return false;
        const disabled = runtime ? runtime.capabilities?.drive === false || runtime.subsystems?.subsystem_drive?.destroyed === true
          || runtime.subsystems?.subsystem_drive?.effectiveDisabled === true : f.disabled;
        if (kind === 'trouble') return disabled;
        if (disabled || memory(state) !== row) return false;
        return kind !== 'delivery' || delivery(state, receiver, row) === receipt;
      };
      const id = `alin:shift:${kind}:${receiver.data.worldRecordId}:${row?.sequence ?? receiver.data.itinerary.sequence}`;
      pending = { id, kind, valid, until: state.simTime + 7 };
      if (!ctx.helpers?.voice?.say?.({ id, channel: 'bark', kind: 'anvil-orchard-shift', text: `Foreman Alin: ${text}`, ttl: 5, valid })) pending = null;
    },
    reset,
    destroy() { reset(); ctx.bus?.off?.('combat:subsystemEnabled', enabled); ctx.bus?.off?.('combat:subsystemDisabled', disabled); ctx.bus?.off?.('voice:surface', surface); ctx.bus?.off?.('save:loaded', reset); },
  };
}
