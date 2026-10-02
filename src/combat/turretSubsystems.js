// FB-020 — per-mount turret subsystems for heavy hulls.
//
// A capital that authors `subsystems.turretHp` on its enemy row carries each turret mount as a
// first-class destructible subsystem: `subsystem_turret_<i>` per mount, keyed to the mount's
// `subsystemId` so the ordinary weaponBankReadiness gate silences a dead mount and the ordinary
// damage router (selectHitSubsystem -> damageSubsystem) wounds it. The mount ring is laid out
// deterministically along the hull's port/starboard rails in normalized space — the same space
// SUBSYSTEM_DEFS volumes use — so a shot that lands on a rail hits the gun sitting there, and a
// health-bar phase can never stand in for physical damage.
//
// The per-mount def rides on the runtime row (`subsystem.def`) rather than the static catalog:
// the catalog is one shared table, while a mount's hit volume and health are per-entity. The
// three def lookup sites (geometry hit-pick, damage, modifier recompute) fall back to the row's
// own def, so nothing else in the combat kernel had to learn about turrets.

export const TURRET_SUBSYSTEM_PREFIX = 'subsystem_turret_';

// Mounts sit on the two broadside rails, fore to aft, alternating port/starboard. The
// fore-most pair straddles the bow; the last pair guards the stern quarters. Everything is
// radius-normalized ([0..1] of the entity's collision radius), matching SUBSYSTEM_DEFS.
const RAIL_Z = 0.52;
const RAIL_X_FORE = 0.72;
const RAIL_X_AFT = -0.72;
const MOUNT_RADIUS = 0.15;

export function turretMountLayout(count) {
  const n = Math.max(0, Math.floor(count) || 0);
  const rows = Math.ceil(n / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const x = rows > 1 ? RAIL_X_FORE + (RAIL_X_AFT - RAIL_X_FORE) * (row / (rows - 1)) : RAIL_X_FORE;
    const z = (i % 2 === 0 ? 1 : -1) * RAIL_Z;
    out.push({ center: [x, z], radius: MOUNT_RADIUS });
  }
  return out;
}

export function isTurretSubsystemId(id) {
  return typeof id === 'string' && id.startsWith(TURRET_SUBSYSTEM_PREFIX);
}

/** Turret mount ordinals keyed to `subsystem_turret_<i>` on the entity's weapons, in mount order. */
export function turretMountsOf(entity) {
  const weapons = entity && entity.data && entity.data.weapons;
  if (!Array.isArray(weapons)) return [];
  const out = [];
  for (const w of weapons) {
    if (w && isTurretSubsystemId(w.subsystemId)) {
      out.push({ index: Number(w.subsystemId.slice(TURRET_SUBSYSTEM_PREFIX.length)), mount: w });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** Authored turret-subsystem block on an entity (`data.subsystems`), or null. */
export function turretSubsystemAuthoring(entity) {
  const bag = entity && entity.data && entity.data.subsystems;
  if (!bag || typeof bag !== 'object') return null;
  if (!(Number(bag.turretHp) > 0)) return null;
  return bag;
}

/**
 * Register one destructible subsystem per turret mount. Called from createCombatantRuntime after
 * the profile pass; preserves health fraction + destroyed flags across runtime rebuilds the same
 * way the profile loop does.
 */
export function registerTurretSubsystems(entity, runtime, previous = null) {
  const authored = turretSubsystemAuthoring(entity);
  if (!authored || !runtime || !runtime.subsystems) return 0;
  const mounts = turretMountsOf(entity);
  if (!mounts.length) return 0;
  const hp = Math.max(1, Number(authored.turretHp) || 0);
  const layout = turretMountLayout(mounts.length);
  let added = 0;
  for (let i = 0; i < mounts.length; i++) {
    const id = `${TURRET_SUBSYSTEM_PREFIX}${i}`;
    const spot = layout[i];
    const def = Object.freeze({
      id, version: 1, tags: ['weapon', 'turret'],
      volume: Object.freeze({ shape: 'circle', space: 'normalized', center: spot.center, radius: spot.radius }),
      health: hp,
      armor: { flat: 1, multipliers: { kinetic: 1.0, thermal: 1.0, ion: 1.1, plasma: 1.0, phase: 1.0 } },
      // The mount sits under the battery bus the way an ordinary mount does: a killed
      // `subsystem_weapon` (or, through it, the power bus) effective-disables every mount until
      // the bus repairs — the same temporary disarm any banked weapon has — while only a torn
      // mount stays dead. Killing one mount never disarms the rest.
      dependencies: ['subsystem_weapon'],
      disabledBehavior: null,
      // Torn-off mounts stay torn off in the field; a dockyard can rebuild them.
      repair: { fieldRatePerTick: 0, dockRatePerTick: 2 },
      cueId: 'combat.subsystem.weapon.disabled',
    });
    const old = previous && previous.subsystems && previous.subsystems[id];
    const oldFraction = old && old.maxHealth > 0 ? Math.min(1, Math.max(0, old.health / old.maxHealth)) : 1;
    const pendingTransition = old && old.pendingTransition ? { ...old.pendingTransition } : null;
    if (pendingTransition) runtime.pendingSubsystemTransitionCount += 1;
    runtime.subsystems[id] = {
      id,
      health: hp * oldFraction,
      maxHealth: hp,
      destroyed: old ? !!old.destroyed : false,
      effectiveDisabled: old ? !!old.effectiveDisabled : false,
      pendingTransition,
      lastDamageTick: old && Number.isInteger(old.lastDamageTick) ? old.lastDamageTick : -1,
      def,
    };
    added++;
  }
  return added;
}

/** How many registered turret mounts are destroyed. */
export function turretLossCount(runtime) {
  const subsystems = runtime && runtime.subsystems;
  if (!subsystems) return 0;
  let lost = 0;
  for (const id of Object.keys(subsystems)) {
    if (isTurretSubsystemId(id) && subsystems[id] && subsystems[id].destroyed === true) lost++;
  }
  return lost;
}

/** The authored turret-loss phase edges (sorted ascending), or []. */
export function turretPhaseEdges(entity) {
  const authored = turretSubsystemAuthoring(entity);
  const list = authored && authored.phaseAtTurretsLost;
  if (!Array.isArray(list) || !list.length) return [];
  return list.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
}

/** How many authored edges a loss count has crossed: 0 → none, 1 → first edge, … */
export function turretEdgeLevel(turretsLost, edges) {
  let level = 0;
  for (const edge of edges || []) if (turretsLost >= edge) level++;
  return level;
}
