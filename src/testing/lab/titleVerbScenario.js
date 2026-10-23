// Offline attract scenario. Initial conditions + tick commands only: the production
// attachment solver, field kernel and Rapier authority own every resulting pose.
// This is a focused fixture, not public-input certification. Never imported at boot.
import { createSimulation, SIM_DT } from '../../core/sim.js';
import { physics } from '../../core/physics.js';
import { combat } from '../../systems/combat.js';
import { fields } from '../../systems/fields.js';
import { FIELD_FLAGS } from '../../data/fields.js';
import { COMBAT_FLAGS } from '../../data/featureFlags.js';
import { weapons } from '../../systems/weapons.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';

export const TITLE_VERB_SCENARIO = Object.freeze({
  id: 'title.catch-swing-release-impact', seed: 0x51e7a1e, ticks: 3600,
  catchTick: 45, releaseTick: 270, fieldTick: 570,
  evidenceClass: 'focused-fixture', physicsBackend: 'rapier-dynamic',
});

export async function createTitleVerbScenario(options = {}) {
  const recipe = TITLE_VERB_SCENARIO;
  const sim = createSimulation({ seed: options.seed || recipe.seed, systems: [weapons, fields, physics, combat] });
  const { state } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = {};
  const authority = sim.registry.get('physics');
  if (!await authority.prepareBackend(state)) throw new Error('title scenario requires Rapier');
  const ship = (visual, team, x, z, vx, vz, mass, radius, dynamic = true) => sim.spawn({
    type: 'ship', team, pos: { x, z }, vel: { x: vx, z: vz }, rot: 0,
    radius, collides: true, hull: 10000, hullMax: 10000,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius * radius,
      dynamic, ccd: true, material: 'ship', revision: 0 },
    data: { defId: visual, combatProfileId: 'combat_profile_standard_ship', ai: false },
  });
  let player, payload, victim, fieldBody;
  function openChapter() {
    for (const e of [...state.entityList]) sim.helpers.removeEntity(e.id);
    player = ship('ship_kestrel', 0, 0, 0, 0, 0, 4000, 8);
    payload = ship('ship_kestrel', 1, 85, -35, 0, 42, 22, 7);
    victim = ship('ship_kestrel', 2, -150, 42, 0, 0, 180, 20, false);
    fieldBody = ship('ship_kestrel', 1, 180, -110, -10, 6, 8, 6);
    state.playerId = player.id;
    const spec = makeEnemySpawnSpec('wasp_swarmer', 2, { x: 150, z: 100 });
    spec.data.ai = false; spec.data.intent = { fire: false, aimAngle: Math.PI };
    spec.hull = spec.hullMax = 10000;
    const gunner = sim.spawn(spec);
    gunner.data.intent = { fire: false, aimAngle: Math.PI };
    return gunner;
  }
  let gunner = openChapter();
  const events = [], record = (kind, detail = {}) => events.push({ tick: state.tick, kind, ...detail });
  sim.bus.on('physics:impact', (p) => record('impact', { a: p.aId, b: p.bId, impulse: p.impulse, x: p.pos.x, z: p.pos.z }));
  let attachment = null, releasedVelocity = null;
  function step() {
    const tick = state.tick % 900;
    if (state.tick > 0 && tick === 0) { gunner = openChapter(); attachment = null; }
    gunner.data.intent.fire = tick >= 690 && tick < 840;
    const kernel = sim.registry.get('combat').kernel;
    if (tick === recipe.catchTick) {
      const made = kernel.attachments.create({ defId: 'tether_standard', ownerId: player.id, targetId: payload.id });
      if (!made.ok) throw new Error(`title catch: ${made.reason}`);
      attachment = made.attachment;
      record('catch', { attachmentId: attachment.id });
    }
    if (tick === recipe.releaseTick) {
      releasedVelocity = { x: payload.vel.x, z: payload.vel.z };
      if (!attachment || !kernel.attachments.cut(attachment.id, player.id, 'manual')) throw new Error('title release failed');
      record('release', { velocity: releasedVelocity });
    }
    if (tick === recipe.fieldTick) {
      sim.registry.get('fields').plantField(state, { id: 'title-redirection', kind: 'repulsor',
        center: { x: 80, z: -80 }, radius: 100, strength: 80, durationS: 2, emitter: false,
        ownerId: player.id, team: 0, tag: 'environmental' });
      record('field', { before: { x: fieldBody.vel.x, z: fieldBody.vel.z } });
    }
    const prior = FIELD_FLAGS.enabled, impactPrior = COMBAT_FLAGS.weaponImpulseConsequences;
    FIELD_FLAGS.enabled = true;
    COMBAT_FLAGS.weaponImpulseConsequences = true;
    const vx = payload.vel.x, vz = payload.vel.z;
    try { sim.step(SIM_DT); } finally { FIELD_FLAGS.enabled = prior; COMBAT_FLAGS.weaponImpulseConsequences = impactPrior; }
    // Observe the solver's contact response. Rapier's static-body contact does not
    // publish a physics:impact receipt on this focused host, so preserve the measured
    // near-contact velocity discontinuity without emitting a fabricated game event.
    const separation = Math.hypot(payload.pos.x - victim.pos.x, payload.pos.z - victim.pos.z);
    const deltaV = Math.hypot(payload.vel.x - vx, payload.vel.z - vz);
    if (tick > recipe.releaseTick && separation < payload.radius + victim.radius + 2 && deltaV > 5) {
      record('impact', { a: payload.id, b: victim.id, deltaV, separation,
        x: (payload.pos.x + victim.pos.x) / 2, z: (payload.pos.z + victim.pos.z) / 2 });
    }
  }
  return { sim, state, get player() { return player; }, get payload() { return payload; },
    get victim() { return victim; }, get fieldBody() { return fieldBody; }, events, step,
    dispose() {
      for (const system of sim.registry.systems) system.destroy?.();
      authority._disableSg02DynamicAuthority?.(); sim.dispose();
    } };
}
