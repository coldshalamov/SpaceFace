import test from 'node:test';
import assert from 'node:assert/strict';

import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { authorizeAIEngagement, isHostileForAI } from '../src/ai/engagementAuthority.js';
import { normalizeFactionBehaviorProfile } from '../src/ai/factionBehavior.js';
import { SquadCommander } from '../src/ai/squad.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { sampleFactionBehavior } from '../src/data/factionDoctrines.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { aiPorts, clearIneligibleAIFiringIntents } from '../src/systems/aiPorts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const K1_FACTIONS = [
  'faction_understory',
  'faction_fulfillment',
  'faction_archive',
  'faction_pitborn',
  'faction_verge_layers',
];

test('faction behavior normalization reuses only immutable canonical inputs', () => {
  const sampled = sampleFactionBehavior('faction_pitborn', 0x47a, 1)[0];
  const frozenRaw = Object.freeze({
    ...sampled,
    firstFireAgainst: Object.freeze([...(sampled.firstFireAgainst || [])]),
  });
  const frozenNormalized = normalizeFactionBehaviorProfile(frozenRaw);
  assert.equal(normalizeFactionBehaviorProfile(frozenRaw), frozenNormalized,
    'a deeply immutable authored profile should reuse its normalized result');
  assert.equal(normalizeFactionBehaviorProfile(frozenNormalized), frozenNormalized,
    'an already-normalized profile should be identity-stable');

  const mutable = {
    ...sampled,
    firstFireAgainst: [...(sampled.firstFireAgainst || [])],
  };
  const before = normalizeFactionBehaviorProfile(mutable);
  mutable.preferredRange += 25;
  mutable.firstFireAgainst.push('fixture_new_target');
  const after = normalizeFactionBehaviorProfile(mutable);
  assert.notEqual(after, before, 'mutable raw profiles must never be memoized');
  assert.equal(after.preferredRange, mutable.preferredRange);
  assert.deepEqual(after.firstFireAgainst, mutable.firstFireAgainst);
  assert.equal(normalizeFactionBehaviorProfile(Object.freeze({ pursuitCommitment: 0.5 })), null);
});

test('all five K1 distributions expose deterministic, distinct live tactical fields', () => {
  const first = K1_FACTIONS.map((factionId) => sampleFactionBehavior(factionId, 0x47a, 4));
  const replay = K1_FACTIONS.map((factionId) => sampleFactionBehavior(factionId, 0x47a, 4));
  assert.deepEqual(first, replay);

  const signatures = new Set();
  for (let factionIndex = 0; factionIndex < K1_FACTIONS.length; factionIndex++) {
    const rows = first[factionIndex];
    assert.equal(rows.length, 4);
    for (const row of rows) {
      const normalized = normalizeFactionBehaviorProfile(row);
      assert.ok(normalized, `${K1_FACTIONS[factionIndex]} must produce a complete live profile`);
      assert.equal(Number.isFinite(normalized.pursuitCommitment), true);
      assert.equal(Number.isFinite(normalized.preferredRange), true);
      assert.ok(['line', 'ring', 'wedge'].includes(normalized.liveFormation));
      assert.equal(Number.isFinite(normalized.retreatHullFraction), true);
      assert.ok(['interceptor_flyby', 'ranged_disengager', 'tether_control_raider'].includes(normalized.combatDoctrineId));
      assert.equal(typeof normalized.firstFire, 'boolean');
      assert.equal(Array.isArray(normalized.firstFireAgainst), true);
      assert.equal(Number.isFinite(normalized.stationDefenseAggression), true);
      assert.equal(Number.isFinite(normalized.disableChance), true);
      assert.equal(typeof normalized.destroyTarget, 'boolean');
      assert.equal(typeof normalized.fixedRoute, 'boolean');
    }
    signatures.add(JSON.stringify(rows.map((row) => ({
      pursuitCommitment: row.pursuitCommitment,
      preferredRange: row.preferredRange,
      liveFormation: row.liveFormation,
      retreatHullFraction: row.retreatHullFraction,
      combatDoctrineId: row.combatDoctrineId,
      disableThenRun: row.disableThenRun,
      firstFire: row.firstFire,
      firstFireAgainst: row.firstFireAgainst,
      stationDefenseAggression: row.stationDefenseAggression,
      disableChance: row.disableChance,
      destroyTarget: row.destroyTarget,
      fixedRoute: row.fixedRoute,
    }))));
  }
  assert.equal(signatures.size, K1_FACTIONS.length, 'each faction must have a distinct sampled behavior distribution');
  assert.equal(normalizeFactionBehaviorProfile({ pursuitCommitment: 0.5 }), null,
    'partial profiles fail closed instead of receiving combat defaults');
});

test('production K1 spawn keeps Pitborn allied to the player while authorizing a real Concord target', () => {
  const h = presenceHarness('sector_ashfall_reach');
  const pitborn = h.spawned.find((entity) => entity.factionId === 'faction_pitborn');
  assert.ok(pitborn, 'Ashfall must materialize the Pitborn yard tender');
  assert.equal(pitborn.team, 3, 'Pitborn uses its own combat team so authorized Concord shots are not friendly-fire rejected');
  assert.equal(pitborn.data.ai.passive, false);
  assert.ok(normalizeFactionBehaviorProfile(pitborn.data.ai.factionPresenceDoctrine));
  assert.equal(isHostileForAI(h.state, pitborn, h.player), false,
    'ordinary Pitborn yard presence recognizes the player as allied, not a spawn target');

  const concord = entityFrom(makeEnemySpawnSpec('patrol_lawman', 3, {
    x: pitborn.pos.x + 540, z: pitborn.pos.z,
  }), 77);
  const secondConcord = entityFrom(makeEnemySpawnSpec('patrol_lawman', 3, {
    x: pitborn.pos.x + 620, z: pitborn.pos.z + 80,
  }), 78);
  assert.equal(concord.team, 1, 'production Concord combat ships use the shared hostile/patrol team');
  assert.equal(concord.factionId, 'faction_scn');
  h.state.entities.set(concord.id, concord);
  h.state.entityList.push(concord);
  h.bus.emit('entity:spawned', { id: concord.id, entity: concord });
  h.state.entities.set(secondConcord.id, secondConcord);
  h.state.entityList.push(secondConcord);
  h.bus.emit('entity:spawned', { id: secondConcord.id, entity: secondConcord });
  assert.equal(isHostileForAI(h.state, pitborn, concord), true,
    'Pitborn doctrine may engage a real Concord ship through canonical team authority');
  assert.equal(isHostileForAI(h.state, pitborn, secondConcord), true,
    'Pitborn first-fire authority is faction-wide, not narrowed to one selected Concord id');
  assert.equal(pitborn.data.ai.retaliationTargetId, concord.id,
    'stable-id target binding selects the first live Concord actor');
  concord.alive = false;
  h.bus.emit('entity:killed', { id: concord.id, factionId: concord.factionId, killerId: pitborn.id });
  h.presence.update();
  assert.equal(pitborn.data.ai.retaliationTargetId, secondConcord.id,
    'the next production presence tick deterministically promotes the next live Concord target');
  assert.equal(isHostileForAI(h.state, pitborn, h.player), false,
    'target promotion never widens Pitborn hostility to the player');

  const roster = h.helpers.aiRoster.listSquads(h.state.tick);
  const squad = roster.find((row) => row.faction === 'faction_pitborn');
  assert.ok(squad, 'active Pitborn presence must enter the production tactical roster');
  assert.deepEqual(squad.factionBehavior, pitborn.data.ai.factionPresenceDoctrine);
  assert.equal(squad.formation, pitborn.data.ai.factionPresenceDoctrine.liveFormation);
  const member = squad.members.find((row) => row.id === pitborn.id);
  assert.ok(member);
  assert.equal(member.combatDoctrineId, pitborn.data.ai.factionPresenceDoctrine.combatDoctrineId);
  const frame = h.helpers.aiSensors.frameFor(pitborn.id, h.state.tick);
  assert.deepEqual(frame.self.factionBehavior, pitborn.data.ai.factionPresenceDoctrine);

  const reason = `combat_doctrine:${member.combatDoctrineId}:strike`;
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: pitborn,
    target: secondConcord,
    tick: pitborn.data.ai.activity.startedTick + 59,
    objectiveReason: reason,
  }), { ok: false, reason: 'response_window' });
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: pitborn,
    target: secondConcord,
    tick: pitborn.data.ai.activity.startedTick + 60,
    objectiveReason: reason,
  }), { ok: true, reason: 'authorized' });
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: pitborn,
    target: h.player,
    tick: pitborn.data.ai.activity.startedTick + 600,
    objectiveReason: reason,
  }), { ok: false, reason: 'target_not_hostile' });

  const passive = presenceHarness('sector_tethys_junction');
  const fulfillment = passive.spawned.find((entity) => entity.factionId === 'faction_fulfillment');
  assert.ok(fulfillment);
  assert.equal(fulfillment.team, 2);
  assert.equal(fulfillment.data.ai.passive, true);
  assert.equal(isHostileForAI(passive.state, fulfillment, passive.player), false);
  const passiveRoster = passive.helpers.aiRoster.listSquads(passive.state.tick);
  const fulfillmentSquad = passiveRoster.find((row) => row.faction === 'faction_fulfillment');
  assert.ok(fulfillmentSquad, 'passive fixed-route ships still enter the maneuver-only tactical path');
  assert.equal(fulfillmentSquad.members.length, 3, 'formation count remains three-ship content metadata');
  assert.equal(fulfillmentSquad.formationSpacing, 52);
  assert.equal(fulfillmentSquad.formationBound, 170,
    'formation count must not leak into the tactical distance bound');
  assert.equal(passive.spawned
    .filter((entity) => entity.factionId === 'faction_fulfillment')
    .every((entity) => entity.data.factionPresence.formationCount === 3), true);

  const originalProfile = fulfillment.data.ai.factionPresenceDoctrine;
  const originalSignature = fulfillmentSquad.__spacefaceRosterSignature;
  fulfillment.data.ai.factionPresenceDoctrine = Object.freeze({
    ...originalProfile,
    disableChance: originalProfile.disableChance < 0.5 ? 0.9 : 0.1,
    destroyTarget: !originalProfile.destroyTarget,
  });
  const updatedSquad = passive.helpers.aiRoster.listSquads(passive.state.tick)
    .find((row) => row.faction === 'faction_fulfillment');
  assert.notEqual(updatedSquad.__spacefaceRosterSignature, originalSignature,
    'every normalized behavior field must invalidate the tactical roster cache');
  assert.equal(updatedSquad.members.find((entry) => entry.id === fulfillment.id)
    .factionBehavior.disableChance, fulfillment.data.ai.factionPresenceDoctrine.disableChance);
  assert.equal(updatedSquad.members.find((entry) => entry.id === fulfillment.id)
    .factionBehavior.destroyTarget, fulfillment.data.ai.factionPresenceDoctrine.destroyTarget);
  assert.deepEqual(authorizeAIEngagement({
    state: passive.state,
    self: fulfillment,
    target: passive.player,
    tick: passive.state.tick + 600,
    objectiveReason: 'combat_doctrine:ranged_disengager:fire_window',
  }), { ok: false, reason: 'passive' });
});

test('every K1 presence that can enter combat carries a usable production fitting and truthful ports capabilities', () => {
  const fixtures = [
    ['faction_understory', 'sector_charon_expanse', (state) => {
      const loss = {
        lossId: 'loss_k1_armed_presence', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule',
        factionId: 'faction_dmc', kind: 'ship', source: 'entity:killed', t: 0,
      };
      state.lossLedger = { entries: [loss], bySector: { sector_charon_expanse: [loss] } };
    }],
    ['faction_fulfillment', 'sector_tethys_junction', null],
    ['faction_archive', 'sector_pallas_drift', null],
    ['faction_pitborn', 'sector_ashfall_reach', null],
    ['faction_verge_layers', 'sector_veil_nebula', (state) => {
      state.story.verge = {
        revealed: true, awake: true, valeGatesRevoked: true, playerUsedClosureProtocol: true,
        revocations: [{ evidenceId: 'vale_gate_revocation_file' }],
      };
    }],
  ];
  for (const [factionId, sectorId, configure] of fixtures) {
    const h = presenceHarness(sectorId, configure);
    const actors = h.spawned.filter((entity) => entity.factionId === factionId);
    assert(actors.length > 0, `${factionId} must materialize`);
    for (const actor of actors) {
      assert(actor.data.weapons.length > 0, `${factionId} ${actor.data.defId} must not be maneuver-only`);
      const profile = normalizeFactionBehaviorProfile(actor.data.ai.factionPresenceDoctrine);
      const weaponEnvelope = Math.max(...actor.data.weapons.map((weapon) => Number(weapon.range) || 0));
      assert(profile.preferredRange <= weaponEnvelope,
        `${factionId} preferred range ${profile.preferredRange} must remain inside ${actor.data.defId}'s ${weaponEnvelope}-WU fitting envelope`);
      const frame = h.helpers.aiSensors.frameFor(actor.id, h.state.tick);
      assert(frame.self.capabilities.includes('ranged'), `${factionId} fitting must expose ranged capability`);
      if (actor.data.weapons.some((weapon) => weapon.damageType === 'emp')) {
        assert(frame.self.capabilities.includes('disable'), `${factionId} EMP fitting must expose disable capability`);
        if (profile.combatDoctrineId === 'ranged_disengager') {
          const empFacings = new Set(actor.data.weapons
            .filter((weapon) => weapon.damageType === 'emp')
            .map((weapon) => weapon.facing));
          if (actor.data.weapons.some((weapon) => weapon.facing === 'turret')) {
            assert(empFacings.has('turret'),
              `${factionId} ranged disengager must put EMP on its omni turret`);
          } else {
            assert(empFacings.has('front'),
              `${factionId} ranged disengager must cover its target-bearing front arc with EMP`);
            if (actor.data.weapons.some((weapon) => weapon.facing === 'rear')) {
              assert(empFacings.has('rear'),
                `${factionId} ranged disengager must keep its non-lethal EMP available through a retreat turn`);
            }
          }
        }
      }
    }
  }
});

test('non-lethal K1 actors clear a stale fire bit as soon as the live target drive is disabled', () => {
  const h = presenceHarness('sector_pallas_drift');
  const actor = h.spawned.find((entity) => entity.factionId === 'faction_archive');
  assert.ok(actor);
  actor.team = 1;
  actor.data.ai.passive = false;
  actor.data.ai.roe = 'weapons_free';
  actor.data.ai.activity = {
    kind: 'attack_run', reason: 'archive_redaction', startedTick: h.state.tick, targetId: h.player.id,
  };
  actor.data.intent = { fire: true, fireGroup: 0 };
  actor.data.combat.targetId = h.player.id;
  h.state.combat = h.state.combat || {};
  h.state.combat.entities = h.state.combat.entities || {};
  h.state.combat.entities[String(h.player.id)] = {
    capabilities: { drive: false, weapon: true, sensor: true },
  };

  assert.equal(clearIneligibleAIFiringIntents(h.state), 1);
  assert.equal(actor.data.intent.fire, false);
  assert.equal(actor.data.intent.fireGroup, null);
  assert.equal(actor.data.intent.fireBlockReason, 'target_disabled_nonlethal');
});

test('direct retaliation activation supplies every final engagement-authority field', () => {
  const h = presenceHarness('sector_charon_expanse', (state) => {
    const loss = {
      lossId: 'loss_k1_retaliation_authority', sectorId: 'sector_charon_expanse',
      shipDefId: 'ship_mule', factionId: 'faction_dmc', kind: 'ship', source: 'lossLedger', t: 0,
    };
    state.lossLedger = { entries: [loss], bySector: { sector_charon_expanse: [loss] } };
  });
  const actor = h.spawned.find((entity) => entity.factionId === 'faction_understory');
  assert.ok(actor);
  h.bus.emit('combat:damage', { attackerId: h.player.id, targetId: actor.id, applied: 1 });
  assert.equal(actor.data.ai.zoneId, 'sector_charon_expanse');
  assert.equal(actor.data.ai.approachTelegraph, 'understory_afterwake_focus');
  assert.equal(actor.data.ai.activity.targetId, h.player.id);
});

test('Verge gate-closer hostility is live while the evidence-only observer path remains neutral', () => {
  const gateCloser = presenceHarness('sector_veil_nebula', (state) => {
    state.story.verge = {
      revealed: true, awake: true, valeGatesRevoked: true, playerUsedClosureProtocol: true,
      revocations: [{ evidenceId: 'vale_gate_revocation_file' }],
    };
  });
  const active = gateCloser.spawned.filter((entity) => entity.factionId === 'faction_verge_layers');
  assert(active.length > 0);
  assert.equal(active.every((entity) => entity.data.ai.passive === false), true);
  assert.equal(active.every((entity) => entity.data.ai.retaliationTargetId === gateCloser.player.id), true,
    'confirmed gate-closing player is the explicit live Verge response target');
  assert.equal(active.every((entity) => isHostileForAI(gateCloser.state, entity, gateCloser.player)), true);
  assert.equal(active.every((entity) => entity.data.weapons.some((weapon) => weapon.damageType === 'emp')), true,
    'awake surveyors carry the existing disable-only EMP through a compatible existing hull');

  const observer = presenceHarness('sector_veil_nebula', (state) => {
    state.story.verge = {
      revealed: true, awake: true, valeGatesRevoked: true, playerUsedClosureProtocol: false,
      revocations: [{ evidenceId: 'vale_gate_revocation_file' }],
    };
  });
  const neutral = observer.spawned.filter((entity) => entity.factionId === 'faction_verge_layers');
  assert(neutral.length > 0);
  assert.equal(neutral.every((entity) => entity.data.ai.passive === true), true);
  assert.equal(neutral.every((entity) => entity.data.ai.retaliationTargetId == null), true);
  assert.equal(neutral.every((entity) => !isHostileForAI(observer.state, entity, observer.player)), true,
    'Vale revocation evidence alone materializes observers without inventing player hostility');
});

test('SquadCommander consumes pursuit, formation, and retreat threshold without bypassing the tactical stack', () => {
  const profile = sampleFactionBehavior('faction_pitborn', 0x47a, 1)[0];
  const commander = new SquadCommander({ seed: 0x47a });
  commander.registerSquad({
    id: 'k1_pitborn_live',
    doctrine: 'balanced',
    faction: 'faction_pitborn',
    formation: 'line',
    factionBehavior: profile,
    members: [{ id: 7, capabilities: ['drive', 'weapon', 'sensor', 'disable'], combatDoctrineId: profile.combatDoctrineId }],
  });
  const highHull = new Map([[7, tacticalPerception(profile, 0.95)]]);
  const first = commander.update('k1_pitborn_live', 10, highHull);
  const firstDirective = first.directives.get(7);
  assert.equal(firstDirective.formation.kind, profile.liveFormation);
  assert.equal(first.tactic, 'contain_and_disable');

  const lowHull = new Map([[7, tacticalPerception(profile, Math.max(0, profile.retreatHullFraction - 0.01))]]);
  const second = commander.update('k1_pitborn_live', 11, lowHull);
  assert.equal(second.tactic, 'fighting_retreat', 'sampled retreat threshold must override ordinary tactic dwell');
  assert.equal(second.directives.get(7).objective.kind, 'retreat');
});

test('CombatDoctrineRuntime consumes sampled range and egresses when disable-then-run succeeds', () => {
  const profile = sampleFactionBehavior('faction_pitborn', 0x47a, 1)[0];
  const runtime = new CombatDoctrineRuntime({ seed: 0x47a });
  const initial = runtime.update({
    tick: 100,
    entityId: 7,
    doctrineId: profile.combatDoctrineId,
    perception: tacticalPerception(profile, 1),
    directive: tacticalDirective(profile),
  });
  assert.equal(initial.preferredRange, profile.preferredRange);

  const disabledTarget = tacticalPerception(profile, 1);
  disabledTarget.contacts[0].disabled = true;
  const egress = runtime.update({
    tick: 101,
    entityId: 7,
    doctrineId: profile.combatDoctrineId,
    perception: disabledTarget,
    directive: tacticalDirective(profile),
  });
  assert.equal(egress.phase, 'breakaway');
  assert.equal(egress.outcome, 'target_disabled');
  assert.equal(egress.fireWindow, false);
  assert.equal(egress.maneuverTargetId, null);
});

test('every K1 no-destroy doctrine fail-closes its fire window after a live target is disabled', () => {
  for (const factionId of K1_FACTIONS) {
    const profile = sampleFactionBehavior(factionId, 0x47a, 1)[0];
    assert.equal(profile.destroyTarget, false);
    const runtime = new CombatDoctrineRuntime({ seed: 0x47a });
    const perception = tacticalPerception(profile, 1);
    perception.contacts[0].disabled = true;
    const egress = runtime.update({
      tick: 180,
      entityId: 7,
      doctrineId: profile.combatDoctrineId,
      perception,
      directive: tacticalDirective(profile),
    });
    assert.ok(['breakaway', 'escape', 'retreat'].includes(egress.phase), `${factionId} must enter egress`);
    assert.equal(egress.outcome, 'target_disabled');
    assert.equal(egress.fireWindow, false);
    assert.equal(egress.allowedActionId, null);
  }
});

function presenceHarness(sectorId, configure = null) {
  const state = createGameState(0x47a);
  state.tick = 100;
  state.simTime = 700;
  state.world.currentSectorId = sectorId;
  state.entityIndex = null;
  const bus = createBus();
  const player = entityFrom(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    team: 0,
    pos: { x: 0, z: 0 },
  }), 1);
  state.playerId = player.id;
  state.entities.set(player.id, player);
  state.entityList.push(player);
  if (typeof configure === 'function') configure(state);
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = entityFrom(spec, state.nextEntityId++ + 20);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers, registry: { get() { return null; } } });
  const presence = Object.create(factionPresence);
  presence.init({ state, bus, helpers, registry: { get() { return null; } } });
  bus.emit('sector:enter', { sectorId });
  return { state, bus, helpers, player, spawned, ports, presence };
}

function entityFrom(spec, id) {
  return {
    ...spec,
    id,
    alive: true,
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
  };
}

function tacticalPerception(profile, hullFraction) {
  return {
    self: {
      id: 7,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'weapon', 'sensor', 'disable'],
      activity: { kind: 'attack_run', reason: 'pitborn_disable_and_run', startedTick: 0, preferredRange: profile.preferredRange },
      roe: 'weapons_free',
      combatDoctrineId: profile.combatDoctrineId,
      factionBehavior: profile,
    },
    contacts: [{
      id: 1,
      kind: 'ship',
      team: 0,
      classification: 'ship',
      pos: { x: 700, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 12,
      alive: true,
      valid: true,
      visible: true,
      confidence: 1,
      threat: 0.9,
      hostile: true,
      tethered: false,
      disabled: false,
      operationalMassBand: 'medium',
      mobilityBand: 'medium',
      cargoBand: 'valuable',
      tetherabilityBand: 'good',
      tags: [],
    }],
    events: [],
  };
}

function tacticalDirective(profile) {
  return {
    tick: 100,
    squadId: 'k1_pitborn_live',
    memberId: 7,
    combatDoctrineId: profile.combatDoctrineId,
    objective: { kind: 'engage', targetId: 1, reason: 'disable_assignment' },
    formation: {
      kind: profile.liveFormation,
      slot: { x: 0, z: 0 },
      velocity: { x: 0, z: 0 },
      bound: 170,
      breakFormation: false,
      breakReason: null,
    },
  };
}
