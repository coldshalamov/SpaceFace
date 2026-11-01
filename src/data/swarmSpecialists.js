// Stable Swarm specialist vocabulary. All timings are integer ticks at 60 Hz.
export const SWARM_SPECIALIST_ENEMY_IDS = Object.freeze({
  WARDEN: 'warden_escort', JACKAL: 'mine_layer_jackal', ANCHOR: 'field_anchor_controller',
});

export const SWARM_SPECIALIST_TUNING = Object.freeze({
  warden: Object.freeze({ linkRange: 300, linkMaxEnergy: 92, redirectFraction: 0.4,
    windupTicks: 30, activeTicks: 180, recoveryTicks: 90 }),
  jackal: Object.freeze({ windupTicks: 30, activeTicks: 70, recoveryTicks: 45,
    salvoCount: 3, salvoSpacingTicks: 18, mineCap: 3, cooldownTicks: 360,
    armDelayTicks: 90, lifetimeTicks: 720, triggerRadius: 52, blastDamage: 34, mineHull: 24 }),
  anchor: Object.freeze({ windupTicks: 30, activeTicks: 180, recoveryTicks: 75,
    recoveryMaxTicks: 200, interruptDisplacement: 36, activeRadius: 220, activeStrength: 88 }),
});

export const SWARM_SPECIALIST_PHASES = Object.freeze(new Set(['idle', 'windup', 'active', 'recovery']));
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
    counter: 'Displace the hull during its spool or while the field is active, then fight while it is down or stay outside the ring.',
  }),
});

export function isSwarmSpecialistRun(state) {
  const run = state?.run;
  return !!(run?.kind === 'survival' && run.ruleset === 'swarm'
    && run.phase !== 'inactive' && run.phase !== 'ended');
}

export function swarmSpecialistKind(enemyId) {
  if (enemyId === SWARM_SPECIALIST_ENEMY_IDS.WARDEN) return 'warden';
  if (enemyId === SWARM_SPECIALIST_ENEMY_IDS.JACKAL) return 'jackal';
  if (enemyId === SWARM_SPECIALIST_ENEMY_IDS.ANCHOR) return 'anchor';
  return null;
}
