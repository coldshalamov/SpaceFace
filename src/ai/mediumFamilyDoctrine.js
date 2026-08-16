// Plan 13 medium-family setup grammar. Pure, deterministic reads only: the live sensor port
// supplies authored identity plus physical/status facts, and CombatDoctrineRuntime decides when a
// prepared counter has genuinely broken a setup. Damage, forces, status mutation, and presentation
// remain with their existing owners.

export const MediumSetupKind = Object.freeze({
  MARAUDER: 'marauder_brawler',
  LANCER: 'lancer_sniper',
  INTERCEPTOR: 'hostile_interceptor',
});

const SETUP_KIND_BY_CAPABILITY = Object.freeze({
  close_shotgun_pressure: MediumSetupKind.MARAUDER,
  rail_reposition: MediumSetupKind.LANCER,
  escape_lane_cutoff: MediumSetupKind.INTERCEPTOR,
});

const COUNTER_PHASE_BY_KIND = Object.freeze({
  [MediumSetupKind.MARAUDER]: 'setup_drift',
  [MediumSetupKind.LANCER]: 'setup_overrun',
  [MediumSetupKind.INTERCEPTOR]: 'setup_frame_inherited',
});

const CLOSE_UNDER_TURN_RANGE_WU = 260;
const CLOSE_UNDER_TURN_SPEED = 48;
const CLOSE_UNDER_TURN_BEARING_RAD = 0.52;

export function mediumSetupKind(self) {
  const capability = String(self && self.mediumSetup && self.mediumSetup.capability || '');
  const byCapability = SETUP_KIND_BY_CAPABILITY[capability] || null;
  if (!byCapability) return null;
  return String(self && self.combatRoleId || '') === byCapability ? byCapability : null;
}

export function mediumFlightProfile(self, fallback) {
  const kind = mediumSetupKind(self);
  return kind ? `medium_${kind}` : fallback;
}

/**
 * Return the real prepared-counter window, or null while the medium can still correct normally.
 * These are observations of shipped systems, never substitute damage or synthetic status flags:
 * - Marauder: RCS physics-control loss, destroyed drive, or canonical tumble.
 * - Lancer: a real Well pin / momentum bind, or a fast close that reaches its blind turn sector.
 * - Interceptor: Momentum Sink or canonical tumble makes its cutoff inherit another frame.
 */
export function mediumCounterWindow(self, target) {
  const kind = mediumSetupKind(self);
  if (!kind) return null;
  const state = self && self.mediumSetup && self.mediumSetup.counterState || {};
  let reason = null;
  if (kind === MediumSetupKind.MARAUDER) {
    if (state.rcsDisrupted === true) reason = 'rcs_disrupted';
    else if (state.driveDisabled === true) reason = 'drive_disabled';
    else if (state.tumbling === true) reason = 'tumbling';
  } else if (kind === MediumSetupKind.LANCER) {
    if (state.wellPinned === true) reason = 'well_pinned';
    else if (state.momentumSunk === true) reason = 'momentum_sunk';
    else if (closedUnderTurnRate(self, target)) reason = 'closed_under_turn_rate';
  } else if (kind === MediumSetupKind.INTERCEPTOR) {
    if (state.momentumSunk === true) reason = 'momentum_sunk';
    else if (state.tumbling === true) reason = 'tumbling';
  }
  return reason ? Object.freeze({ kind, reason, phase: COUNTER_PHASE_BY_KIND[kind] }) : null;
}

export function visibleMediumRetreat(self) {
  // Retreat is the common family contract, so any authored medium row carrying both handoffs is
  // admitted here. Entry-specific setup logic above remains intentionally limited to the trio this
  // packet owns; Bulwark/Corsair/Torcher get the shared 30% exit without stealing their later verbs.
  const setupKind = String(self && self.combatRoleId || '');
  const setup = self && self.mediumSetup;
  const authored = self && self.visibleRetreat;
  if (!setupKind || !setup || !String(setup.capability || '') || !authored) return null;
  const threshold = clamp01(authored.hullFraction, 0.3);
  const hullFraction = clamp01(self && self.hullFraction, 1);
  if (hullFraction > threshold) return null;
  return Object.freeze({
    setupKind,
    threshold,
    hullFraction,
    smokeCue: text(authored.smokeCue),
    dumpCue: text(authored.dumpCue),
    bark: text(authored.bark),
    runtime: 'combat_doctrine',
  });
}

function closedUnderTurnRate(self, target) {
  if (!self || !self.pos || !target || !target.pos) return false;
  const dx = finite(target.pos.x) - finite(self.pos.x);
  const dz = finite(target.pos.z) - finite(self.pos.z);
  const distance = Math.hypot(dx, dz);
  if (distance > CLOSE_UNDER_TURN_RANGE_WU || distance <= 1e-6) return false;
  const rvx = finite(target.vel && target.vel.x) - finite(self.vel && self.vel.x);
  const rvz = finite(target.vel && target.vel.z) - finite(self.vel && self.vel.z);
  const closing = -(rvx * dx + rvz * dz) / distance;
  if (closing < CLOSE_UNDER_TURN_SPEED) return false;
  const bearing = Math.atan2(dz, dx);
  return Math.abs(wrap(bearing - finite(self.rot))) >= CLOSE_UNDER_TURN_BEARING_RAD;
}

function wrap(value) {
  let angle = value;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp01(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function text(value) {
  return typeof value === 'string' ? value : '';
}
