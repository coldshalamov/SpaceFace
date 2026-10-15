// Read-only Orchard forecast facts. Source validation and field math are shared by
// main-lane HUD and worker projection; mirrored facts never grant custody.
import { ANVIL_ORCHARD_GUST_PROFILE, anvilOrchardGustGeometry } from '../data/environmentalMachinery.js';
import { fieldBodyProfile } from '../systems/fields.js';
import { normalizeField, sampleFieldAcceleration } from '../core/fields/fieldKernel.js';
import { ANVIL_ORCHARD, normalizeOrchardRecord, orchardHistoryFitsTick, orchardPhase } from '../data/anvilOrchard.js';
import { ORCHARD_GEOMETRY } from '../data/anvilOrchardBody.js';
import { isOrchardFrame } from '../data/anvilOrchardIdentity.js';

export function resolveOrchardForecast(state, scratch = {}) {
  if (!state || state.mode !== 'flight'
    || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || !Number.isSafeInteger(state.tick)) return null;
  const record = normalizeOrchardRecord(state.sites?.anvilOrchard);
  if (!record || record.frameStatus === 'destroyed' || !orchardHistoryFitsTick(record, state.tick)) return null;
  let frame = state.entities?.get?.(state.planet?.orchardFrameId);
  if (!frame || frame.alive === false || !isOrchardFrame(frame)) {
    frame = null;
    if (state.entities && typeof state.entities.values === 'function') {
      for (const candidate of state.entities.values()) {
        if (candidate?.alive !== false && isOrchardFrame(candidate)
          && candidate.data?.worldRecordId === ORCHARD_GEOMETRY.worldRecordId) {
          frame = candidate;
          break;
        }
      }
    }
  }
  const player = state.entities?.get?.(state.playerId);
  if (!frame || frame.alive === false || !player || player.alive === false) return null;
  const geometry = anvilOrchardGustGeometry(frame, scratch._orchardGeometry);
  if (!geometry || !player.pos || Math.hypot(player.pos.x - geometry.center.x, player.pos.z - geometry.center.z)
    > ANVIL_ORCHARD_GUST_PROFILE.observationRadius) return null;
  const phase = orchardPhase(record, state.tick, scratch._orchardPhaseOut);
  if (!phase) return null;
  scratch._orchardSampleFields ||= [null];
  scratch._orchardSampleOut ||= { ax: 0, az: 0 };
  scratch._orchardBodyProfile ||= {};
  // Predict only this local Orchard field, using the same kernel math and body profile as the
  // force owner. Forecast samples the prospective authored field; calm has no local effect.
  let sampled = null;
  const snapshot = state.fields?.snapshot;
  if (phase.phase === 'gust' && Array.isArray(snapshot)) {
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i]?.id === ANVIL_ORCHARD_GUST_PROFILE.id) { sampled = snapshot[i]; break; }
    }
  }
  if (!sampled && phase.phase === 'forecast') {
    sampled = normalizeField({ ...ANVIL_ORCHARD_GUST_PROFILE, center: geometry.center, dir: geometry.dir, createdAt: 0 });
  }
  let localStrength = 0, dir = geometry.dir;
  if (sampled && typeof fieldBodyProfile === 'function') {
    scratch._orchardSampleFields[0] = sampled;
    fieldBodyProfile(player, state, scratch._orchardBodyProfile);
    sampleFieldAcceleration(player.pos, player.vel, scratch._orchardSampleFields, state.simTime || 0,
      scratch._orchardBodyProfile, scratch._orchardSampleOut);
    localStrength = Math.hypot(scratch._orchardSampleOut.ax, scratch._orchardSampleOut.az);
    if (localStrength > 1e-9) dir = { x: scratch._orchardSampleOut.ax / localStrength, z: scratch._orchardSampleOut.az / localStrength };
  }
  const frameGeneration = frame.occupantGeneration, playerGeneration = player.occupantGeneration;
  if (![frameGeneration, playerGeneration].every(n => Number.isSafeInteger(n) && n > 0)) return null;
  return {
    observedTick: state.tick, sectorId: ANVIL_ORCHARD.sectorId,
    frameId: frame.id, frameGeneration, playerId: player.id, playerGeneration,
    kind: 'orchard-gust', phase: phase.phase, remainingTicks: phase.remainingTicks,
    dir, localStrength,
  };
}

export function validateMirroredOrchardForecast(state, value) {
  if (!value || state?.mode !== 'flight' || state.world?.currentSectorId !== ANVIL_ORCHARD.sectorId
    || value.sectorId !== ANVIL_ORCHARD.sectorId || !Number.isSafeInteger(state.tick)
    || value.observedTick !== state.tick || value.kind !== 'orchard-gust'
    || !['calm', 'forecast', 'gust'].includes(value.phase)
    || !Number.isSafeInteger(value.remainingTicks) || value.remainingTicks < 1
    || value.remainingTicks > ({ calm: 600, forecast: 120, gust: 300 })[value.phase]
    || !Number.isFinite(value.localStrength) || value.localStrength < 0
    || !Number.isFinite(value.dir?.x) || !Number.isFinite(value.dir?.z)
    || Math.hypot(value.dir.x, value.dir.z) > 1.000001
    || state.playerId !== value.playerId) return null;
  const frame = state.entities?.get?.(value.frameId), player = state.entities?.get?.(value.playerId);
  if (!frame || frame.alive === false || !player || player.alive === false
    || !Number.isSafeInteger(value.frameGeneration) || value.frameGeneration < 1
    || !Number.isSafeInteger(value.playerGeneration) || value.playerGeneration < 1
    || frame.occupantGeneration !== value.frameGeneration || player.occupantGeneration !== value.playerGeneration
    || frame.type !== 'wreck' || frame.data?.orchardId !== ANVIL_ORCHARD.id
    || frame.data?.worldRecordId !== ORCHARD_GEOMETRY.worldRecordId) return null;
  return value;
}
