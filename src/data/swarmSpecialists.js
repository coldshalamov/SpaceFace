// Swarm-only counterplay tuning. Timings are 60 Hz simulation ticks.
export const SWARM_SPECIALIST_TUNING = Object.freeze({
  warden: Object.freeze({ linkRange: 300, linkMaxEnergy: 92, redirectFraction: 0.4,
    windupTicks: 30, activeTicks: 180, recoveryTicks: 90 }),
  jackal: Object.freeze({ windupTicks: 30, activeTicks: 70, recoveryTicks: 45,
    salvoCount: 3, salvoSpacingTicks: 18, salvoSpacingWU: 34, mineCap: 3, cooldownTicks: 360,
    armDelayTicks: 90, lifetimeTicks: 720, triggerRadius: 52, blastDamage: 34, mineHull: 24 }),
  anchor: Object.freeze({ windupTicks: 30, activeTicks: 180, recoveryTicks: 75,
    recoveryMaxTicks: 200, interruptDisplacement: 36, activeRadius: 220, activeStrength: 88 }),
});

export const SWARM_SPECIALIST_BRIEFS = Object.freeze({
  warden_escort: Object.freeze({
    name: 'Warden Escort',
    threat: 'A nearby ally is marked by a finite guard link; the warden can screen shots when it crosses their line.',
    counter: 'Shoot the warden, shove it out of range, or circle wide enough to keep it off the shot line.',
  }),
  mine_layer_jackal: Object.freeze({
    name: 'Mine-Layer Jackal',
    threat: 'After its wake flare, it lays three shootable mines along one side of the approach.',
    counter: 'Use the open flank, shoot the mines, or throw a mine back into the pack.',
  }),
  field_anchor_controller: Object.freeze({
    name: 'Anchor Controller',
    threat: 'A field spool precedes one short snare cycle; its field drops while the hull recovers.',
    counter: 'Displace the hull during its spool or active field, then attack while the field is down or stay outside the ring.',
  }),
});

export function isSwarmSpecialistRun(state) {
  const run = state?.run;
  return run?.kind === 'survival' && run.ruleset === 'swarm'
    && run.phase !== 'inactive' && run.phase !== 'ended';
}

export function swarmSpecialistKind(enemyId) {
  if (enemyId === 'warden_escort') return 'warden';
  if (enemyId === 'mine_layer_jackal') return 'jackal';
  if (enemyId === 'field_anchor_controller') return 'anchor';
  return null;
}

export function swarmSpecialistBriefForEnemy(enemyId) {
  const kind = swarmSpecialistKind(enemyId);
  const key = kind === 'warden' ? 'warden_escort'
    : kind === 'jackal' ? 'mine_layer_jackal'
      : kind === 'anchor' ? 'field_anchor_controller' : null;
  return key ? SWARM_SPECIALIST_BRIEFS[key] : null;
}

/** Freeze a mine-lane at the wake cue so later drops do not track a moving target. */
export function swarmMineWakeSalvoLayout(entity, count = SWARM_SPECIALIST_TUNING.jackal.salvoCount) {
  if (!entity?.pos || !Number.isInteger(count) || count <= 0) return [];
  const vx = Number.isFinite(entity.vel?.x) ? entity.vel.x : 0;
  const vz = Number.isFinite(entity.vel?.z) ? entity.vel.z : 0;
  const speed = Math.hypot(vx, vz);
  const dx = speed > 1 ? vx / speed : Math.cos(Number.isFinite(entity.rot) ? entity.rot : 0);
  const dz = speed > 1 ? vz / speed : Math.sin(Number.isFinite(entity.rot) ? entity.rot : 0);
  const side = -dz * (String(entity.id).length % 2 ? 1 : -1);
  const sideZ = dx * (String(entity.id).length % 2 ? 1 : -1);
  const standoff = Math.max(8, Number.isFinite(entity.radius) ? entity.radius + 10 : 18);
  const spacing = SWARM_SPECIALIST_TUNING.jackal.salvoSpacingWU;
  return Array.from({ length: count }, (_, index) => ({
    x: entity.pos.x - dx * (standoff + index * spacing) + side * 28,
    z: entity.pos.z - dz * (standoff + index * spacing) + sideZ * 28,
  }));
}
