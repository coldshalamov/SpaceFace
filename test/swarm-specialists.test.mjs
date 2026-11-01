import assert from 'node:assert/strict';
import test from 'node:test';

import { applyMineLayerVerb } from '../src/ai/mineLayerVerb.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import { hintTextFor } from '../src/systems/survivalAnnounce.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { combat } from '../src/systems/combat.js';
import { fields } from '../src/systems/fields.js';
import { mines } from '../src/systems/mines.js';

function swarmRun(wave) {
  return { kind: 'survival', ruleset: 'swarm', phase: 'active', wave, arenaId: 'helios_core' };
}

test('the authored first-appearance previews teach each specialist counter', () => {
  assert.equal(swarmRoundPreview({ arenaId: 'helios_core', wave: 6, seed: 73311 })
    .specialistBrief.name, 'Mine-Layer Jackal');
  assert.equal(swarmRoundPreview({ arenaId: 'helios_core', wave: 9, seed: 73311 })
    .specialistBrief.name, 'Warden Escort');
  assert.equal(swarmRoundPreview({ arenaId: 'helios_core', wave: 22, seed: 73311 })
    .specialistBrief.name, 'Anchor Controller');
  assert.equal(swarmRoundPreview({ arenaId: 'helios_core', wave: 7, seed: 73311 })
    .specialistBrief, null);
  assert.match(hintTextFor('mine_layer_jackal', { run: swarmRun(6) }), /open flank, shoot the mines, or throw/i);
  assert.match(hintTextFor('warden_escort', { run: swarmRun(9) }), /shove it out of range/i);
  assert.match(hintTextFor('field_anchor_controller', { run: swarmRun(22) }), /displace the hull during its spool/i);
});

test('Warden screens a same-wave ally with finite damage share and breaks under direct fire', () => {
  const sim = createSimulation({ seed: 77601, systems: [combat] });
  sim.registry.init();
  const { state } = sim;
  state.mode = 'flight';
  state.run = swarmRun(9);
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -100, z: 0 }, hull: 500, hullMax: 500, data: {} });
  state.playerId = player.id;
  const ally = sim.spawn({ type: 'ship', team: 1, pos: { x: 120, z: 0 }, hull: 500, hullMax: 500, armorHp: 0, shield: 0,
    data: { runCohort: 'survival', runWave: 9, enemyTypeId: 'wasp_swarmer' } });
  const warden = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, hull: 500, hullMax: 500, armorHp: 0, shield: 0,
    data: { runCohort: 'survival', runWave: 9, enemyTypeId: 'warden_escort',
      swarmSpecialist: { kind: 'warden', phase: 'active', targetId: ally.id,
        linkEnergy: 92, linkMaxEnergy: 92 } } });
  const kernel = sim.registry.get('combat').ensureKernel();
  noteSwarmPilotAction(state);
  const beforeAlly = ally.hull;
  const beforeWarden = warden.hull;
  const hit = () => kernel.routeDamage({ attackerId: player.id, targetId: ally.id,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', pos: ally.pos }),
    origin: { kind: 'weapon', id: 'swarm-specialist-test' } });
  const result = hit();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(warden.data.swarmSpecialist.linkEnergy, 52);
  assert.equal(ally.hull, beforeAlly - 39, 'the 60% remainder follows the canonical hull armor law');
  assert.equal(warden.hull, beforeWarden - 40, 'the 40% guard share is routed to the warden');

  kernel.routeDamage({ attackerId: player.id, targetId: warden.id,
    packet: scalarHitToDamagePacket({ damage: 8, damageType: 'kinetic', pos: warden.pos }),
    origin: { kind: 'weapon', id: 'direct-fire' } });
  assert.equal(warden.data.swarmSpecialist.phase, 'recovery');
  assert.equal(warden.data.swarmSpecialist.linkEnergy, 0);
});

test('Jackal freezes a three-mine wake at its telegraph and uses physical mine lifetime', () => {
  const sim = createSimulation({ seed: 77602, systems: [mines] });
  sim.registry.init();
  const { state } = sim;
  state.mode = 'flight';
  state.run = swarmRun(6);
  const jackal = sim.spawn({ type: 'ship', team: 1, pos: { x: 500, z: 0 }, vel: { x: 40, z: 0 },
    radius: 18, data: { runCohort: 'survival', runWave: 6, enemyTypeId: 'mine_layer_jackal' } });
  const owner = sim.registry.get('mines');
  const points = [];
  const placeMine = (opts) => {
    points.push({ ...opts.pos });
    return owner.placeMine(opts);
  };

  applyMineLayerVerb({ state, entity: jackal, doctrinePhase: 'wake_cue', tick: 100,
    doctrineStartedTick: 100, placeMine });
  jackal.pos.x = 700;
  const drops = [100, 118, 136].map((tick) => applyMineLayerVerb({ state, entity: jackal,
    doctrinePhase: 'mine_drop', tick, doctrineStartedTick: 100, placeMine }));
  assert.equal(drops.filter(Boolean).length, 3);
  assert.equal(new Set(points.map(({ x, z }) => `${x.toFixed(1)},${z.toFixed(1)}`)).size, 3);
  for (const mine of drops) {
    assert.equal(mine.data.swarmSpecialistMine, true);
    assert.equal(mine.data.swarmWave, 6);
    assert.equal(mine.data.triggerRadius, SWARM_SPECIALIST_TUNING.jackal.triggerRadius);
    assert.equal(mine.data.blastDamage, SWARM_SPECIALIST_TUNING.jackal.blastDamage);
    assert.ok(mine.pos.x < 600, 'drops use the frozen wake, not the later hull position');
  }
  assert.equal(drops[0].data.armedAt, state.simTime + SWARM_SPECIALIST_TUNING.jackal.armDelayTicks / 60);
  state.simTime = Math.max(...drops.map((mine) => mine.data.expiresAt)) + 0.01;
  owner.update(1 / 60, state);
  assert.ok(drops.every((mine) => mine.alive === false), 'expired physical mines leave the world');

  const adventure = { tick: 200, mode: 'flight', entityList: [], entities: new Map() };
  const ordinary = { id: 90, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { enemyTypeId: 'mine_layer_jackal' } };
  const ordinaryDrops = [];
  const placeOrdinary = (opts) => { ordinaryDrops.push(opts); return opts; };
  applyMineLayerVerb({ state: adventure, entity: ordinary, doctrinePhase: 'mine_drop', tick: 200,
    placeMine: placeOrdinary });
  assert.equal(ordinaryDrops.length, 1, 'Adventure retains its existing single-drop verb');
  assert.equal(ordinaryDrops[0].swarmSpecialistMine, undefined);
});

test('Swarm Anchor begins disarmed, interrupts on displacement, and releases at wave end', () => {
  const prior = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const bus = createBus();
  const anchor = { id: 71, type: 'ship', alive: true, team: 1, pos: { x: 300, z: 0 },
    data: { runCohort: 'survival', runWave: 22, enemyTypeId: 'field_anchor_controller',
      fieldAnchor: { defKey: 'anchorSnare', spinupTicks: 45, radius: 235, strength: 185 } } };
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 } };
  const state = { tick: 1000, simTime: 20, mode: 'flight', playerId: 1, run: swarmRun(22),
    entities: new Map([[player.id, player], [anchor.id, anchor]]), entityList: [player, anchor] };
  fields.init({ state, bus, helpers: {}, registry: null });
  try {
    const fieldId = fields._registerAnchoredField(anchor);
    const record = state.fields.anchored[fieldId];
    assert.equal(record.armed, false);
    assert.equal(record.radius, SWARM_SPECIALIST_TUNING.anchor.activeRadius);
    assert.equal(fields._kernel.get(fieldId).strength, 0);

    applySpecialistCounterplay({ state, specialist: anchor, enemyId: 'field_anchor_controller',
      doctrinePhase: 'field_spool', doctrine: { phaseStartedTick: 1000 }, tick: 1000, fields });
    const active = applySpecialistCounterplay({ state, specialist: anchor, enemyId: 'field_anchor_controller',
      doctrinePhase: 'anchor_hold', doctrine: { phaseStartedTick: 1030 }, tick: 1030, fields });
    assert.equal(active.active, true);
    state.tick = 1030;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(fields._kernel.get(fieldId).strength, SWARM_SPECIALIST_TUNING.anchor.activeStrength);

    anchor.pos.x += SWARM_SPECIALIST_TUNING.anchor.interruptDisplacement;
    const interrupted = applySpecialistCounterplay({ state, specialist: anchor, enemyId: 'field_anchor_controller',
      doctrinePhase: 'anchor_hold', doctrine: { phaseStartedTick: 1030 }, tick: 1031, fields });
    assert.equal(interrupted.active, false);
    state.tick = 1031;
    fields._syncAnchoredFields(state, state.fields);
    assert.equal(anchor.data.swarmSpecialist.phase, 'recovery');
    assert.equal(fields._kernel.get(fieldId).strength, 0);

    bus.emit('run:waveCleared', { wave: 22 });
    assert.equal(fields._kernel.has(fieldId), false);

    const expiring = { id: 72, type: 'ship', alive: true, team: 1, pos: { x: 420, z: 0 },
      data: { runCohort: 'survival', runWave: 22, enemyTypeId: 'field_anchor_controller',
        fieldAnchor: { defKey: 'anchorSnare', spinupTicks: 45, radius: 235, strength: 185 } } };
    state.entities.set(expiring.id, expiring);
    state.entityList.push(expiring);
    const expiringFieldId = fields._registerAnchoredField(expiring);
    applySpecialistCounterplay({ state, specialist: expiring, enemyId: 'field_anchor_controller',
      doctrinePhase: 'field_spool', doctrine: { phaseStartedTick: 2000 }, tick: 2000, fields });
    const expiringActive = applySpecialistCounterplay({ state, specialist: expiring,
      enemyId: 'field_anchor_controller', doctrinePhase: 'anchor_hold',
      doctrine: { phaseStartedTick: 2030 }, tick: 2030, fields });
    assert.equal(expiringActive.active, true);
    const expired = applySpecialistCounterplay({ state, specialist: expiring,
      enemyId: 'field_anchor_controller', doctrinePhase: 'anchor_hold',
      doctrine: { phaseStartedTick: 2030 },
      tick: 2030 + SWARM_SPECIALIST_TUNING.anchor.activeTicks, fields });
    assert.equal(expired.active, false);
    assert.equal(expiring.data.swarmSpecialist.phase, 'recovery');
    assert.equal(fields._kernel.get(expiringFieldId).strength, 0);
  } finally {
    for (const off of fields._lifecycleUnsubs || []) if (typeof off === 'function') off();
    fields._lifecycleUnsubs = [];
    FIELD_FLAGS.enabled = prior;
  }
});
