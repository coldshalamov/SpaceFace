// Authored Charon receiver. Initial ecology is not player cargo, run credit, or payment.
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';
import { UNDERSTORY_GARDENS, UNDERSTORY_GARDEN_STAGES } from './factions/understory.js';

// Numerical comparison tolerance only; all authored thresholds and accumulated quantities stay unchanged.
export const UNDERSTORY_MASS_EPSILON = 1e-9;

export const UNDERSTORY_RECEIVER = Object.freeze({
  gardenId: 'understory:charon:rook-receiver:v1',
  sectorId: 'sector_charon_expanse',
  name: 'Rookside Receiving Garden',
  localPos: Object.freeze({ x: 2900, z: -750 }),
  // 600 WU toward Rook: outside the mature 437-WU mouth, with room for pilot and tow.
  approachOffset: Object.freeze({ x: -596.212, z: 67.314 }),
  initialBiomass: 52,
  hullDrawRadius: 72,
  // Released dead-hulk length55.200022; its adopted24-capsule skin is normalized to42.
  // This is the skin's reference scale, NOT a109.6-WU solid circle around the hull.
  hullPhysicsReferenceRadius: 42 * 144 / 55.200022,
});

export function receiverPosition() {
  return sectorLocalToGlobalForSector(UNDERSTORY_RECEIVER.localPos, UNDERSTORY_RECEIVER.sectorId);
}

export function receiverApproach() {
  const p = receiverPosition();
  return { x: p.x + UNDERSTORY_RECEIVER.approachOffset.x,
    z: p.z + UNDERSTORY_RECEIVER.approachOffset.z };
}

/** The living intake is wider than its solid reclaimed hull. Ordinary gardens keep old radii. */
export function gardenGrowthRadius(entity) {
  if (entity?.data?.authoredUnderstoryReceiver === true) {
    const stage = UNDERSTORY_GARDEN_STAGES[(entity.data.gardenStage | 0) - 1];
    return stage ? stage.radius : UNDERSTORY_GARDEN_STAGES[0].radius;
  }
  return Math.max(0, Number(entity?.radius) || 0);
}

// Keep the actual bounded visual-owner identity gate and new growth evidence aligned.
export function hasUnderstoryGardenVisualIdentity(entity) {
  const data = entity?.data;
  return entity?.type === 'garden' && entity.factionId === 'faction_understory'
    && data?.understoryGarden === true && data.placeId === 'place_dead_hulk'
    && !data.archetypeGlb && !data.landmarkGlb && !data.assetId && !data.assetRef
    && !data.packagedPropFile && !data.claimSpecId && !data.claimOwned && !data.storyPropKind;
}

export function receiverStatus(state) {
  const garden = (state?.entityList || []).find(e => e?.alive !== false && e.type === 'garden' && e.factionId === 'faction_understory' && state?.entities?.get(e.id) === e
    && e.data?.understoryGarden === true && e.data.gardenId === UNDERSTORY_RECEIVER.gardenId);
  if (garden && garden.hull > 0 && garden.data.gardenDestroyed !== true) return { status: 'live', garden };
  const status = state?.understory?.authoredReceiver?.status;
  return { status: status === 'destroyed' ? 'destroyed'
    : status === 'live' || status === 'unavailable' ? 'unavailable' : 'unseen', garden: null };
}

function validGrowth(row, gardenId) {
  if (!row || row.version !== 1 || typeof gardenId !== 'string' || !gardenId || row.gardenId !== gardenId || row.byPlayer !== true) return false;
  if (![row.fedMass, row.gained, row.biomass, row.tick].every(Number.isFinite)
    || row.fedMass <= 0 || row.gained <= 0 || row.tick < 0) return false;
  if (!Number.isInteger(row.fromStage) || !Number.isInteger(row.stage)
    || row.fromStage < 1 || row.stage <= row.fromStage || row.stage > UNDERSTORY_GARDEN_STAGES.length) return false;
  const from = UNDERSTORY_GARDEN_STAGES[row.fromStage - 1], to = UNDERSTORY_GARDEN_STAGES[row.stage - 1];
  const before = row.biomass - row.gained;
  return Math.abs(row.gained - row.fedMass * UNDERSTORY_GARDENS.digestionYield) < 1e-6
    && before >= from.massFloor - UNDERSTORY_MASS_EPSILON && before < UNDERSTORY_GARDEN_STAGES[row.fromStage].massFloor - UNDERSTORY_MASS_EPSILON
    && row.biomass >= to.massFloor - UNDERSTORY_MASS_EPSILON
    && (row.stage === UNDERSTORY_GARDEN_STAGES.length || row.biomass < UNDERSTORY_GARDEN_STAGES[row.stage].massFloor - UNDERSTORY_MASS_EPSILON)
    && Number.isSafeInteger(row.eatenId) && row.eatenId >= 0 && Number.isSafeInteger(row.tick)
    && Number.isSafeInteger(row.entityId) && row.entityId >= 0;
}

export function normalizePlayerGardenGrowth(row, gardenId) {
  if (!validGrowth(row, gardenId)) return null;
  return Object.fromEntries(['version', 'gardenId', 'entityId', 'eatenId', 'fromStage', 'stage',
    'fedMass', 'gained', 'biomass', 'byPlayer', 'tick'].map(key => [key, row[key]]));
}

/** Resolve evidence from its real persistent garden, never from an event's claimed authority. */
export function firstPlayerGardenGrowth(state, payload = null) {
  if (state?.run?.kind && state.run.kind !== 'adventure') return null;
  const matches = (row, entityId) => {
    if (!validGrowth(row, row?.gardenId)) return null;
    const result = { ...row, entityId };
    if (payload && ['gardenId', 'entityId', 'fromStage', 'stage', 'fedMass', 'gained', 'biomass', 'byPlayer', 'tick', 'eatenId']
      .some(key => payload[key] !== result[key])) return null;
    return result;
  };
  for (const e of state?.entityList || []) {
    if (e?.alive === false || e?.type !== 'garden' || e.factionId !== 'faction_understory' || state?.entities?.get(e.id) !== e
      || !hasUnderstoryGardenVisualIdentity(e) || e.data.gardenDestroyed === true
      || !(e.hull > 0) || e.flags?.persistent !== true) continue;
    const row = e.data.gardenFirstPlayerGrowth;
    if (row?.gardenId !== e.data.gardenId || !Number.isFinite(e.data.gardenBiomass)
      || !Number.isFinite(e.data.gardenFedByPlayer)
      || (e.data.gardenRegrowth !== true && e.data.gardenBiomass < row.biomass)
      || e.data.gardenFedByPlayer < row.fedMass) continue;
    const receipt = matches(row, e.id);
    if (receipt) return receipt;
  }
  // A real first growth remains history even if the authored receiver was subsequently killed.
  // This terminal snapshot is written by the garden owner, not by generic entity disappearance.
  const terminal = state?.understory?.authoredReceiver;
  if (terminal?.status === 'destroyed' && terminal.firstPlayerGrowth?.gardenId === UNDERSTORY_RECEIVER.gardenId
    && Number.isFinite(terminal.terminalGardenData?.gardenFedByPlayer)
    && terminal.terminalGardenData.gardenFedByPlayer >= terminal.firstPlayerGrowth.fedMass
    && terminal.terminalGardenData.gardenFedMass >= terminal.terminalGardenData.gardenFedByPlayer) {
    return matches(terminal.firstPlayerGrowth, terminal.firstPlayerGrowth.entityId);
  }
  return null;
}
