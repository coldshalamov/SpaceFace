import { consumeLatchCleanArrival } from '../core/latchNineArrivalEvidence.js';
// SF20-01 behavior packet. Imported service adapter, NOT a registered/spawned character.
// Range is shared with physics.updateDockRange; refusal is shared with ui/input.doDock.
// Neither a dock:attempt nor dockingCorridor.phase is permission. No renderer, voice,
// player input, physics, economy or law writes live here.
import { resolveDockRange } from '../core/dockRange.js';
import { resolveDockDeny } from '../core/dockAccess.js';
import { resolveAutopilotTarget } from './flightV3.js';

export const LATCH_NINE_STATION_ID = 'station_tethys';
export const LATCH_NINE_SECTOR_ID = 'sector_tethys_junction';
export const LATCH_NINE_GUIDANCE_RANGE = 600;
export const LATCH_NINE_HAIL_RANGE = 360;
export const LATCH_NINE_SAMPLE_S = 0.1;
export const LATCH_NINE_ACK_S = 0.8;

export function normalizeLatchNineSave(data) {
  return {
    met: data?.met === true,
    cleanArrivals: Math.min(100000, Math.max(0, Math.floor(Number.isFinite(data?.cleanArrivals) ? data.cleanArrivals : 0))),
    incidentIds: [...new Set((Array.isArray(data?.incidentIds) ? data.incidentIds : [])
      .filter(id => typeof id === 'string' && id.length > 0).map(id => id.slice(0, 160)))].slice(-16),
    destroyed: data?.destroyed === true,
  };
}

function liveStation(state) {
  const list = state.entityIndex?.stations || state.entityList || [];
  return list.find(e => e?.alive && e.type === 'station'
    && e.data?.stationId === LATCH_NINE_STATION_ID
    && state.entities.get(e.id) === e) || null;
}

function dockedAtLatch(state) {
  return state.ui?.docked === true && state.ui.dockedStationId === LATCH_NINE_STATION_ID;
}

// Mirrors the non-geometric doDock command fences. This does not authorize or emit docking.
function flightFence(state, player) {
  if (!player?.alive || state.mode !== 'flight' || state.ui?.docked || player.flags?.docked) return 'not_in_flight';
  if (state.ui?.fulfillmentBlackoutActive) return 'transition';
  if (state.jump?.state === 'CHARGING' || state.jump?.state === 'JUMPING') return 'jump';
  return null;
}

/**
 * One instance per staffed station, owned by its future normal-route integration.
 * update runs every sim tick AFTER physics. Readout publication is capped at
 * 10 Hz; range/access safety is checked every call, so a revocation never waits for a pose.
 * recovering comes from the traffic/physics service-path owner, never an animation result.
 * The adapter does not turn a dynamic tender kinematic, set its transform, or return it itself.
 */
export function createLatchNineService(saved = null) {
  let memory = normalizeLatchNineSave(saved);
  const rangeScratch = {};
  let binding = null;
  let arrivalArmed = false;
  let wasDocked = true; // the first observation/Continue can never be a new arrival
  let ackUntil = -Infinity;
  let nextSampleAt = -Infinity;
  let dismissed = false;
  let revoked = false;
  let revision = 0;
  let readout = Object.freeze({ phase: 'OFF_DUTY', clearance: 'NOT_READY', dockReady: false, guidance: null, reason: 'unbound', revision });

  function resetTransient() {
    binding = null;
    arrivalArmed = false;
    wasDocked = true;
    ackUntil = -Infinity;
    nextSampleAt = -Infinity;
    revoked = false;
    readout = Object.freeze({ phase: 'OFF_DUTY', clearance: 'NOT_READY', dockReady: false, guidance: null, reason: 'unbound', revision: ++revision });
  }

  return {
    // Copy only the dossier's bounded semantic fields. No clearance, entity ID, pending event,
    // model/animation handle or acknowledgement survives a Save/Continue boundary.
    serialize: () => normalizeLatchNineSave(memory),
    recordCleanArrival(certificate) { if(!consumeLatchCleanArrival(certificate))return false;memory.cleanArrivals=Math.min(100000,memory.cleanArrivals+1);return true; },
    recordIncident(id) { if(typeof id!=='string'||!id||memory.incidentIds.includes(id))return false;memory.incidentIds=[...memory.incidentIds,id].slice(-16);return true; },
    deserialize(data) { memory = normalizeLatchNineSave(data); resetTransient(); },
    resetSession() { dismissed = false; resetTransient(); },
    invalidate() { resetTransient(); },
    finishAcknowledgement() { ackUntil = -Infinity; },
    markDestroyed() { memory.destroyed = true; resetTransient(); },
    dismiss() { dismissed = true; arrivalArmed = false; ackUntil = -Infinity; },
    // Wire only to dock:denied for this station. The next update re-queries the authoritative
    // selector; an event never grants permission. Explicit revocation also cancels an ACK.
    revoke(stationId) {
      if (stationId !== LATCH_NINE_STATION_ID) return;
      revoked = true;
      arrivalArmed = false;
      ackUntil = -Infinity;
    },
    get readout() { return readout; },

    update(state, { enabled = true, recovering = false } = {}) {
      const now = Number.isFinite(state?.simTime) ? state.simTime : 0;
      const player = state?.entities?.get(state.playerId);
      const station = state?.entities && liveStation(state);
      const sectorId = state?.world?.currentSectorId || null;
      const inSector = sectorId === LATCH_NINE_SECTOR_ID;
      const identityChanged = !binding || binding.player !== player || binding.station !== station || binding.sectorId !== sectorId
        || binding.playerLife !== player?.occupantGeneration || binding.stationLife !== station?.occupantGeneration;
      const docked = dockedAtLatch(state || {});
      if (identityChanged) {
        binding = { player, station, sectorId, playerLife: player?.occupantGeneration, stationLife: station?.occupantGeneration };
        arrivalArmed = false;
        wasDocked = docked;
        ackUntil = -Infinity;
        nextSampleAt = -Infinity;
      }
      const distance = player?.pos && station?.pos
        ? Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z) : Infinity;
      const active = enabled && !dismissed && !memory.destroyed && inSector
        && player?.alive === true && station?.alive === true
        && station.data?.dockless !== true && distance <= LATCH_NINE_GUIDANCE_RANGE;
      const denial = active ? resolveDockDeny(state, station) : null;
      const range = active && !docked && !denial ? resolveDockRange(state, rangeScratch) : null;
      const fence = flightFence(state || {}, player);
      const clear = active && !denial && !fence && range?.station === station;
      const revokedThisTick = revoked;
      revoked = false;
      if (!active || denial || revokedThisTick) {
        arrivalArmed = false;
        ackUntil = -Infinity;
      }
      // uiRoot's actual docked-state edge confirms arrival. A bare/replayed dock:docked
      // receipt, dock:attempt or an already-docked save cannot produce an acknowledgement.
      if (active && !denial && !revokedThisTick && docked && !wasDocked && arrivalArmed) {
        ackUntil = now + LATCH_NINE_ACK_S;
        arrivalArmed = false;
      } else if (!docked) {
        arrivalArmed = !!clear && !revokedThisTick;
        ackUntil = -Infinity;
      }
      wasDocked = docked;
      const ack = active && !denial && docked && now < ackUntil;
      const phase = !active ? 'OFF_DUTY'
        : denial || revokedThisTick ? 'HOLD'
          : recovering ? 'RECOVER'
            : ack ? 'ACKNOWLEDGE' : clear ? 'GUIDE' : fence ? 'HOLD' : 'APPROACH';
      const reason = !active ? 'off_duty' : denial?.reason || (revokedThisTick ? 'revoked'
        : recovering ? 'recovering' : ack ? 'arrival' : clear ? 'dock_ready' : fence || 'approach');
      // Recovery is a body state. Ordinary docking remains the core/UI owner's decision.
      const clearance = ack ? 'DOCKED' : clear && !revokedThisTick ? 'CLEAR'
        : denial || fence || revokedThisTick ? 'HOLD' : 'NOT_READY';
      const changed = phase !== readout.phase || clearance !== readout.clearance || reason !== readout.reason;
      if (identityChanged || changed || (active && now >= nextSampleAt)) {
        // Read the default flight owner's pure staged target query. This does not turn on
        // autopilot: it supplies direction/alignment while the pilot retains every input.
        // APPROACH is deliberately separate from permission; HOLD must not trap a pilot
        // outside the berth that they must approach before the range gate can become true.
        const target = active && !denial && !fence && !revokedThisTick
          ? resolveAutopilotTarget(state, { targetEntityId: station.id }) : null;
        const speed = Math.hypot(player?.vel?.x || 0, player?.vel?.z || 0);
        const guidance = target ? Object.freeze({
          stage: target.dockingStage || 'station',
          anchorKind: target.dockAnchorKind || 'legacy-radius',
          target: Object.freeze({ x: target.x, z: target.z }),
          hint: clear ? 'dock_ready' : Number.isFinite(target.dockSpeedGate) && speed > target.dockSpeedGate
            ? 'slow_and_align' : 'align',
        }) : null;
        readout = Object.freeze({
          phase, clearance, dockReady: clear && !revokedThisTick, guidance, reason, stationId: active ? LATCH_NINE_STATION_ID : null,
          shipId: active ? state.playerId : null, hailAvailable: active && distance <= LATCH_NINE_HAIL_RANGE,
          revision: ++revision,
        });
        nextSampleAt = now + LATCH_NINE_SAMPLE_S;
      }
      if (active && !fence) memory.met = true;
      // cleanArrivals/incidentIds stay unchanged until the incident owner supplies verified
      // facts in the integration packet. No claim of a clean approach from silence alone.
      return readout;
    },
  };
}
