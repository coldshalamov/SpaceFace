// Foundry's first three rooms: a small throwing court, a flanking yard, then an
// outer bank. This is placement, not a new encounter/reward/physics authority.
// Existing pebbles, lesson hull/well and the arena tier remain their owners' work.
const STATIONS = Object.freeze([
  // Near shoulders: nose/rear remain open; crosswise throws meet a bank.
  [150, -100, 'rock'], [150, 100, 'metal'],
  [-150, -100, 'cryo'], [-150, 100, 'debris'],
  [30, -210, 'crystal'], [30, 210, 'volatile'],
  [-80, -245, 'calcite'], [-80, 245, 'metal'],
  // Round two stretches the same court onto flanks rather than filling its exits.
  [225, -165, 'metal'], [225, 165, 'rock'], [-230, -170, 'debris'],
  // Round three's outer bank gives a longer throw somewhere to end.
  [-230, 170, 'crystal'], [100, -310, 'rock'], [100, 310, 'metal'],
].map(([x, z, material], index) => Object.freeze({ x, z, material, index })));

/** Other arenas, mutators and upgraded line tiers keep their existing layouts. */
export function swarmOpeningTerrainStage({ arenaId, wave, lineTier, altered = false } = {}) {
  if (arenaId !== 'helios_core' || altered || lineTier !== 0
    || !Number.isInteger(wave) || wave < 1 || wave > 3) return null;
  return Object.freeze({ id: `foundry-opening-${wave}`, count: [8, 11, 14][wave - 1] });
}

/** Authored empty slots only. Never move surviving furniture or force occupied
 * slots. The live owner still checks swept native hull clearance before spawning.
 * Keep a 96wu-wide straight escape lane on X, and stay inside tier-owned bounds.
 * Capacity includes the existing lesson/pocket bodies; these are not free extras.
 */
export function planSwarmOpeningTerrain({ stage, anchor, existing = [], want = 0, layout } = {}) {
  if (!stage || !anchor || !layout || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)
    || !Array.isArray(existing) || existing.length > 4096
    || existing.some(b => !Number.isFinite(b?.x) || !Number.isFinite(b?.z)
      || !Number.isFinite(b?.radius) || b.radius < 0)) return [];
  const radius = layout.sizeMaxWu;
  if (!(radius > 0) || !Number.isFinite(radius) || !Number.isFinite(want) || want <= 0) return [];
  const spots = [];
  for (const slot of STATIONS.slice(0, stage.count)) {
    if (spots.length >= Math.floor(want)) break;
    const distance = Math.hypot(slot.x, slot.z);
    if (distance < Math.max(layout.inner, layout.safeRadius + radius)
      || distance > layout.outer || Math.abs(slot.z) - radius < 48) continue;
    const spot = { ...slot, x: anchor.x + slot.x, z: anchor.z + slot.z, radius,
      openingTerrainSlot: slot.index, layoutId: stage.id };
    if (existing.concat(spots).some(b => Math.hypot(spot.x - b.x, spot.z - b.z)
      < radius + b.radius + Math.max(24, layout.separation || 0))) continue;
    spots.push(spot);
  }
  return spots;
}
