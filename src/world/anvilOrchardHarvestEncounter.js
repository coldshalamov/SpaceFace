// Optional, receipt-driven help for the existing finite harvest. This observer
// never releases a socket, acquires cargo, grants ownership or changes a reward.
import { ANVIL_ORCHARD, normalizeOrchardRecord, orchardPhase } from '../data/anvilOrchard.js';
import { isOrchardFrame, isOrchardPod } from '../data/anvilOrchardIdentity.js';
import { stableEntityKey } from '../data/interactionDescriptorCatalog.js';
import { resolveActionLabel } from '../systems/input.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { COMMODITIES } from '../data/commodities.js';
import { hasBodyAttachment, orchardTowLease } from './anvilOrchardTowAssist.js';

const KEY = 'anvilOrchardHarvest';
const VOLUME = COMMODITIES.find(row => row.id === ANVIL_ORCHARD.commodityId).volPerU;
const live = (state, entity) => entity?.alive === true && entity.hull > 0 && state.entities?.get(entity.id) === entity;
function memory(state) {
  const hints = state.player.hints ||= {};
  const old = hints[KEY];
  const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
  const receipt = old?.collected;
  if (plain(old) && old.version === 1 && Object.keys(old).length === 3 && plain(old.heard)
    && Object.entries(old.heard).every(([key, value]) => ['select', 'release', 'pickup', 'collected'].includes(key) && typeof value === 'boolean')
    && (receipt === null || plain(receipt) && Object.keys(receipt).length === 2
      && /^anvil_storm_orchard:[0-2]:[1-4]$/.test(receipt.lotId || '')
      && Number.isInteger(receipt.units) && receipt.units >= 1 && receipt.units <= 4)) return old;
  return hints[KEY] = { version: 1, heard: {}, collected: null };
}
export function createOrchardHarvestEncounter(ctx) {
  let state = ctx.state, pending = null, decisionTick = null;
  const cancel = () => { if (pending) ctx.helpers?.voice?.cancel?.(pending.id); pending = null; };
  const reset = () => { cancel(); decisionTick = null; };
  const collected = payload => {
    // Cargo is initialized before the encounter director. Its synchronous receipt
    // and delivered finite ledger must agree; an attempted or NPC pickup is not help.
    if (state.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
      || payload?.collectorId !== state.playerId || !['cargo', 'ore'].includes(payload.kind)
      || payload.commodityId !== ANVIL_ORCHARD.commodityId || payload.rejectedAmount !== 0) return;
    const pod = state.entities?.get(payload.pickupId);
    const row = normalizeOrchardRecord(state.sites?.anvilOrchard);
    const lot = row?.lots.find(item => item.id === pod?.data?.worldRecordId);
    // Native collection retires the body before downstream observers run.
    if (!pod || pod.type !== 'payload' || pod.data?.orchardId !== ANVIL_ORCHARD.id
      || pod.data.orchardKind !== 'pod' || !lot || lot.outcome !== 'delivered'
      || payload.acceptedAmount !== lot.units || payload.amount !== lot.units
      || (state.player.cargo?.items?.[ANVIL_ORCHARD.commodityId] || 0) < lot.units) return;
    const m = memory(state);
    if (!m.collected) m.collected = { lotId: lot.id, units: lot.units };
  };
  const surface = receipt => {
    if (!pending || receipt?.id !== pending.id || receipt.kind !== 'anvil-orchard-harvest' || !pending.valid()) return;
    memory(state).heard[pending.kind] = true;
    const alin = state.player.hints.anvilOrchardAlin;
    if (alin) alin.lastSpokeAt = state.simTime;
  };
  ctx.bus?.on?.('pickup:collected', collected);
  ctx.bus?.on?.('voice:surface', surface);
  ctx.bus?.on?.('save:loaded', reset);
  return {
    update(nextState) {
      state = nextState || state;
      if (pending && !pending.valid()) cancel();
      if (state.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId) { reset(); return; }
      if (decisionTick !== null && state.tick >= decisionTick && state.tick - decisionTick < 30) return;
      decisionTick = state.tick;
      if (pending && state.simTime < pending.until) return;
      cancel();
      const alin = state.player?.hints?.anvilOrchardAlin;
      if (!alin?.heard?.intro || !Number.isFinite(alin.lastSpokeAt) || state.simTime - alin.lastSpokeAt < 8) return;
      const player = state.entities?.get(state.playerId);
      const frame = state.entities?.get(state.planet?.orchardFrameId);
      const row = normalizeOrchardRecord(state.sites?.anvilOrchard);
      const phase = orchardPhase(row, state.tick);
      if (!live(state, player) || !live(state, frame) || !isOrchardFrame(frame)
        || !row || row.frameStatus !== 'intact' || phase?.phase !== 'calm' || phase.remainingTicks < 360
        || Math.hypot(player.pos.x - frame.pos.x, player.pos.z - frame.pos.z) > 300) return;
      const m = memory(state);
      let kind, text, lot, pod, selected, physics, taughtBeam;
      const receipt = m.collected;
      if (!m.heard.collected && receipt && row.lots.some(l => l.id === receipt.lotId && l.units === receipt.units && l.outcome === 'delivered')) {
        kind = 'collected'; text = `${receipt.units} units of hydrogen accepted into your hold. Dock at Tethys to check the market buy price.`;
      } else {
        // Three sockets / twelve lots are the authored bound, not an open objective list.
        const selectedId = state.ui?.componentSelection?.targetId === frame.id
          && state.ui.componentSelection.stableKey === stableEntityKey(frame)
          ? state.ui.componentSelection.componentId : null;
        const socket = row.sockets.find(s => s.lotId && ['stowed', 'releasing'].includes(s.status)
          && selectedId === `orchard_socket_${s.socket}`)
          || row.sockets.find(s => s.lotId && ['stowed', 'releasing'].includes(s.status));
        lot = socket && row.lots.find(l => l.id === socket.lotId && l.outcome === 'retained');
        selected = !!(lot && state.player.targetId === frame.id && selectedId === `orchard_socket_${socket.socket}`);
        if (lot && !m.heard[selected ? 'release' : 'select']) {
          kind = selected ? 'release' : 'select';
          const beam = taughtBeam = resolveActionLabel(state, 'siteBeam');
          text = selected
            ? `Socket ${socket.socket + 1}: ${lot.units} units. Hold ${beam ? `${beam} (World Site beam)` : 'the World Site beam'} during calm until the collar opens. Stay clear.`
            : `Socket ${socket.socket + 1} holds ${lot.units} units of hydrogen. Target the Orchard, then use its component readout to select that socket.`;
        } else if (!m.heard.pickup) {
          lot = row.lots.find(l => l.outcome === 'retained' && row.sockets[l.socket].lotId === l.id
            && row.sockets[l.socket].status === 'drifting' && row.sockets[l.socket].handoff === 'ready');
          if (lot) {
            const index = state.entityIndex;
            pod = index?.ready && index.byWorldRecordIdCount?.get(lot.id) === 1
              ? index.byWorldRecordId?.get(lot.id) : null;
            physics = ctx.registry?.get?.('physics');
            if (pod && isOrchardPod(pod) && !hasBodyAttachment(state, pod) && !orchardTowLease(state, pod)
              && physics?.readOrchardPodReady?.(pod)) {
              kind = 'pickup'; text = `Released pod: ${lot.units} units, ${lot.units * VOLUME} hold volume. Stay outside the hot band; approach slowly to collect the whole pod.`;
            }
          }
        }
      }
      if (!text) return;
      const sourcePlayer = state.player, sourceRow = state.sites.anvilOrchard, world = state.world;
      const playerLife = player.occupantGeneration, frameLife = frame.occupantGeneration;
      const frameData = frame.data, frameBody = frame.physicsBody, frameRevision = frameBody.revision;
      const podLife = pod?.occupantGeneration, podData = pod?.data, podBody = pod?.physicsBody;
      const owner = physics?._sg02, nativeWorld = owner?.world;
      const nativeRecord = owner?.records?.get(pod?.id), nativeBody = nativeRecord?.body;
      const podRevision = podBody?.revision, nativeRevision = nativeRecord?.revision;
      const valid = () => {
        const currentRow = normalizeOrchardRecord(state.sites?.anvilOrchard);
        if (!currentRow || currentRow.phaseAnchorTick !== sourceRow.phaseAnchorTick || state.player !== sourcePlayer || state.world !== world
          || state.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
          || state.playerId !== player.id || !live(state, player) || !live(state, frame)
          || player.occupantGeneration !== playerLife || frame.occupantGeneration !== frameLife
          || frame.data !== frameData || frame.physicsBody !== frameBody || frameBody.revision !== frameRevision
          || currentRow.frameStatus !== 'intact' || orchardPhase(currentRow, state.tick)?.phase !== 'calm'
          || Math.hypot(player.pos.x - frame.pos.x, player.pos.z - frame.pos.z) > 300) return false;
        const current = currentRow.lots.find(l => l.id === (lot?.id || receipt?.lotId));
        if (kind === 'collected') return memory(state).collected === receipt && current?.outcome === 'delivered' && current.units === receipt.units;
        if (current?.outcome !== 'retained' || current.units !== lot.units) return false;
        const slot = currentRow.sockets[lot.socket];
        if (slot.lotId !== lot.id) return false;
        if (kind === 'pickup') return slot.status === 'drifting' && slot.handoff === 'ready'
          && live(state, pod) && pod.occupantGeneration === podLife && pod.data === podData
          && pod.physicsBody === podBody && podBody.revision === podRevision && physicsBodyNativeReady(pod)
          && physics.state === state && ctx.registry?.get?.('physics') === physics
          && state.settings?.gameplay?.physicsBackend === 'rapier-dynamic' && physics?._sg02 === owner && owner?.world === nativeWorld
          && owner?.records?.get(pod.id) === nativeRecord && nativeRecord?.body === nativeBody
          && nativeRecord.revision === nativeRevision && nativeBody?.isValid() && nativeBody.isEnabled()
          && physics._diag?.sg02Ready === true && !physics._nativeRestorePending && !physics._nativeRestoreDeferred
          && !owner?._pendingNativeRebuilds?.size && owner?.orchardAuthorityAvailable?.() === true
          && state.entityIndex?.byWorldRecordIdCount?.get(lot.id) === 1
          && !hasBodyAttachment(state, pod) && !orchardTowLease(state, pod);
        const selection = state.ui?.componentSelection;
        const nowSelected = state.player.targetId === frame.id && selection?.targetId === frame.id
          && selection.stableKey === stableEntityKey(frame) && selection.componentId === `orchard_socket_${lot.socket}`;
        return ['stowed', 'releasing'].includes(slot.status) && selected === nowSelected
          && (kind !== 'release' || resolveActionLabel(state, 'siteBeam') === taughtBeam);
      };
      const id = `alin:harvest:${kind}:${lot?.id || receipt.lotId}`;
      pending = { id, kind, valid, until: state.simTime + 7 };
      if (!ctx.helpers?.voice?.say?.({ id, channel: 'bark', priority: 49, kind: 'anvil-orchard-harvest', text: `Foreman Alin: ${text}`, ttl: 6, valid })) pending = null;
    },
    reset,
    destroy() { reset(); ctx.bus?.off?.('pickup:collected', collected); ctx.bus?.off?.('voice:surface', surface); ctx.bus?.off?.('save:loaded', reset); },
  };
}
