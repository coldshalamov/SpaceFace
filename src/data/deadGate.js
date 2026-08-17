// Plan 25 — immutable identity and bounded recovery contract for the Dione Dead Gate.
// World owns discovery/materialization, Scanner owns the physical investigation, and Cargo owns
// accepting the recovered material. This module stays pure so save/load can normalize the one
// durable discovery record without inventing another inventory or reward writer.

export const DEAD_GATE = Object.freeze({
  schemaVersion: 1,
  sectorId: 'sector_dione_lane',
  poiId: 'poi_dione_dead_gate',
  signalId: 'signal:poi:poi_dione_dead_gate',
  sourceStationId: 'station_dione',
  rumorId: 'frontier-rumor:station_dione:dead-gate',
  fixedLocalPos: Object.freeze({ x: 1720, z: -1240 }),
  storyTitle: 'The Gate That Refused',
  storyBody: 'The ring still holds a destination solution, but every transit term resolves to the same coordinate: here. Someone stripped the drive choir and left its diagnostic cradle powered for a ship that never arrived.',
  rumorText: 'Dione tug crews say the dead ring still answers every fifteenth carrier pulse. The chart position is exact; the story about it opening is not.',
  rewards: Object.freeze([
    Object.freeze({
      slotId: 'dead-gate:diagnostic-electronics',
      commodityId: 'cmdty_salvage_electronics',
      amount: 3,
      name: 'Gate Diagnostic Electronics',
      offset: Object.freeze({ x: -18, z: -8 }),
    }),
    Object.freeze({
      slotId: 'dead-gate:phase-core',
      commodityId: 'cmdty_quantum_cores',
      amount: 1,
      name: 'Inert Gate Phase Core',
      offset: Object.freeze({ x: 16, z: 11 }),
    }),
  ]),
});

export function freshDeadGateState() {
  return {
    schemaVersion: DEAD_GATE.schemaVersion,
    phase: 'sealed',
    recoveredAt: null,
    rewards: DEAD_GATE.rewards.map((reward) => ({
      slotId: reward.slotId,
      commodityId: reward.commodityId,
      totalQty: reward.amount,
      collectedQty: 0,
      remainingQty: reward.amount,
    })),
  };
}

export function normalizeDeadGateState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const out = freshDeadGateState();
  const recoveredAt = Number(source.recoveredAt);
  const recovered = source.phase === 'recovered' || source.phase === 'exhausted';
  if (!recovered || !Number.isFinite(recoveredAt) || recoveredAt < 0) return out;
  out.phase = source.phase;
  out.recoveredAt = recoveredAt;
  const sourceRewards = Array.isArray(source.rewards) ? source.rewards : [];
  for (const reward of out.rewards) {
    const prior = sourceRewards.find((row) => row && row.slotId === reward.slotId
      && row.commodityId === reward.commodityId);
    const collected = Math.max(0, Math.min(reward.totalQty,
      Math.floor(Number(prior && prior.collectedQty) || 0)));
    reward.collectedQty = collected;
    reward.remainingQty = reward.totalQty - collected;
  }
  out.phase = out.rewards.every((reward) => reward.remainingQty === 0) ? 'exhausted' : 'recovered';
  return out;
}
