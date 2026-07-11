import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { PerceptionMemory } from '../src/ai/perception.js';
import { createSG03ActionPort } from '../src/ai/sg03ActionPort.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ENCOUNTERS, NAMED_CAPTAINS } from '../src/data/encounters.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

let doctrineModule = null;
try {
  doctrineModule = await import('../src/ai/combatDoctrine.js');
} catch (_) {
  // The first RED is an assertion, not an opaque module-loader crash.
}
assert(doctrineModule, 'combatDoctrine.js must exist as the pure M1.5 doctrine owner');

const {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
  applyCombatDoctrineToSelection,
  normalizeCombatDoctrineId,
  overrideDirectiveForCombatDoctrine,
  selectDoctrineTarget,
} = doctrineModule;

assert(Object.isFrozen(CombatDoctrineId), 'combat doctrine ids are an immutable typed vocabulary');
assert.deepEqual(Object.values(CombatDoctrineId).sort(), [
  'interceptor_flyby',
  'ranged_disengager',
  'tether_control_raider',
]);
assert.equal(DOCTRINE_TELEGRAPH_TICKS, 30, 'every attack telegraph lasts at least 30 fixed ticks');
assert.equal(normalizeCombatDoctrineId('unknown'), null, 'unknown doctrine ids fail closed');

{
  const geometryForSide = (side) => {
    const selection = applyCombatDoctrineToSelection({
      actionId: null,
      targetId: null,
      targetContact: null,
      maneuver: {
        kind: ManeuverKind.INTERCEPT,
        targetId: 1,
        preferredRange: 150,
        formationSlot: { x: 0, z: 0 },
        formationVelocity: { x: 0, z: 0 },
        formationBound: 170,
        breakFormation: true,
        reason: 'fixture',
      },
    }, {
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      phase: 'ingress',
      targetId: 1,
      actionTargetId: 1,
      maneuverKind: ManeuverKind.INTERCEPT,
      preferredRange: 150,
      allowedActionId: null,
      side,
    });
    return new ManeuverPlanner({ seed: 47 }).plan({
      tick: 0,
      entityId: `side_${side}`,
      perception: perception([shipContact(1, { x: 300, z: 0 })]),
      behavior: { maneuver: selection.maneuver },
      directive: baseDirective(),
    });
  };
  const left = geometryForSide(-1);
  const right = geometryForSide(1);
  assert(left.targetHeading * right.targetHeading < 0,
    `doctrine side must produce mirrored approach headings; left=${left.targetHeading} right=${right.targetHeading}`);
  assert(Math.abs(left.targetHeading - right.targetHeading) > 0.2, 'doctrine side must visibly alter maneuver geometry');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 17 });
  const peacefulDirective = baseDirective();
  const idleDoctrine = runtime.update({
    tick: 0, entityId: 'lawful_idle', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { hostile: false })]), directive: peacefulDirective,
  });
  assert.equal(idleDoctrine.targetId, null);
  assert.strictEqual(overrideDirectiveForCombatDoctrine(peacefulDirective, idleDoctrine), peacefulDirective,
    'a doctrine with no legal hostile target cannot break a lawful/peaceful squad directive');
}

const contacts = [
  shipContact(9, { threat: 0.9, mobilityBand: 'low', operationalMassBand: 'heavy', cargoBand: 'valuable', tetherabilityBand: 'good' }),
  shipContact(4, { threat: 0.9, mobilityBand: 'high', operationalMassBand: 'light', cargoBand: 'empty', tetherabilityBand: 'poor' }),
  shipContact(7, { threat: 0.6, mobilityBand: 'medium', operationalMassBand: 'capital', cargoBand: 'rich', tetherabilityBand: 'excellent' }),
];
assert.equal(selectDoctrineTarget(CombatDoctrineId.INTERCEPTOR_FLYBY, perception(contacts)).id, 4,
  'interceptor prioritizes mobile high-threat contacts');
assert.equal(selectDoctrineTarget(CombatDoctrineId.TETHER_CONTROL_RAIDER, perception(contacts)).id, 7,
  'tether raider prioritizes untethered high-mass/value tetherable contacts');
assert.equal(selectDoctrineTarget(CombatDoctrineId.TETHER_CONTROL_RAIDER, perception([
  shipContact(21, { threat: 0.5, operationalMassBand: 'light', cargoBand: 'empty', tetherabilityBand: 'good' }),
  shipContact(22, { threat: 0.5, operationalMassBand: 'capital', cargoBand: 'empty', tetherabilityBand: 'good' }),
])).id, 22, 'tether raider consumes the live operationalMassBand contract');
assert.equal(selectDoctrineTarget(CombatDoctrineId.RANGED_DISENGAGER, perception(contacts)).id, 9,
  'ranged doctrine prioritizes low-mobility high-threat contacts');
assert.equal(selectDoctrineTarget(CombatDoctrineId.RANGED_DISENGAGER, perception([
  shipContact(12, { threat: 0.5, mobilityBand: 'low' }),
  shipContact(11, { threat: 0.5, mobilityBand: 'low' }),
])).id, 11, 'target ties resolve by stable id');
for (const [label, values] of [
  ['dead', { alive: false }],
  ['invalid', { valid: false }],
  ['remembered', { visible: false, ageTicks: 1 }],
  ['weakly sensed', { confidence: 0.54 }],
]) {
  assert.equal(selectDoctrineTarget(CombatDoctrineId.INTERCEPTOR_FLYBY, perception([
    shipContact(`ineligible_${label}`, values),
  ])), null, `${label} contacts cannot become doctrine attack targets`);
}

{
  const memory = new PerceptionMemory({ freezeResults: true });
  const snapshot = memory.observe(2, stackSensorFrame(2, 0, [stackTargetContact()]), 0);
  assert.equal(selectDoctrineTarget(CombatDoctrineId.INTERCEPTOR_FLYBY, snapshot)?.id, 99,
    'frozen perception snapshots preserve live hostile/valid/visible doctrine target fields');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 43 });
  runtime.update({
    tick: 0, entityId: 'visibility_guard', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 190 })]), directive: baseDirective(),
  });
  const result = runtime.update({
    tick: 30, entityId: 'visibility_guard', doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 190, visible: false, ageTicks: 30 })]), directive: baseDirective(),
  });
  assert.equal(result.targetId, null, 'a remembered contact cannot advance a telegraph into attack');
  assert.equal(result.phase, 'ingress');
  assert.equal(result.fireWindow, false);
}

const directive = baseDirective();

for (const [label, selfOverrides, contactOverrides] of [
  ['defensive screen', { activity: ActivityKind.SCREEN, roe: RulesOfEngagement.DEFENSIVE }, {}],
  ['flee', { activity: ActivityKind.FLEE, roe: RulesOfEngagement.WEAPONS_FREE }, {}],
  ['passive loiter', { activity: ActivityKind.LOITER, roe: RulesOfEngagement.HOLD_FIRE }, {}],
  ['trader transit', { activity: ActivityKind.TRANSIT, roe: RulesOfEngagement.HOLD_FIRE }, {}],
  ['lawful clean patrol', { activity: ActivityKind.PATROL_ROUTE, roe: RulesOfEngagement.LAWFUL_WANTED_ONLY }, { hostile: false }],
]) {
  const runtime = new CombatDoctrineRuntime({ seed: 31 });
  const result = runtime.update({
    tick: 0,
    entityId: `inactive_${label}`,
    doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 190, ...contactOverrides })], selfOverrides),
    directive,
  });
  assert.equal(result, null, `${label} skips doctrine ownership entirely`);
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 47 });
  let result = runtime.update({
    tick: 0, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 620, mobilityBand: 'high', threat: 0.9 })]), directive,
  });
  assert.equal(result.phase, 'ingress');
  assert.equal(result.fireWindow, false);
  assert.equal(result.maneuverKind, ManeuverKind.INTERCEPT);

  result = runtime.update({
    tick: 5, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 210, mobilityBand: 'high', threat: 0.9 })]), directive,
  });
  assert.equal(result.phase, 'engine_flare');
  assert.equal(result.telegraphStarted, true);
  assert.deepEqual(result.telegraph, { kind: 'engine_flare', durationTicks: 30, startedTick: 5 });
  assert.equal(result.fireWindow, false);

  result = runtime.update({
    tick: 34, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 180, mobilityBand: 'high', threat: 0.9 })]), directive,
  });
  assert.equal(result.fireWindow, false, 'fire remains impossible for the whole telegraph');
  result = runtime.update({
    tick: 35, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 160, mobilityBand: 'high', threat: 0.9 })]), directive,
  });
  assert.equal(result.phase, 'strike');
  assert.equal(result.fireWindow, true);
  result = runtime.update({
    tick: 53, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 120, mobilityBand: 'high', threat: 0.9 })]), directive,
  });
  assert.equal(result.phase, 'extend');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT, 'interceptor extends instead of orbiting forever');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 109 });
  let result = runtime.update({
    tick: 0, entityId: 'raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 300, operationalMassBand: 'heavy', cargoBand: 'rich', tetherabilityBand: 'excellent' })]), directive,
  });
  assert.equal(result.phase, 'flank');
  result = runtime.update({
    tick: 10, entityId: 'raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 120, operationalMassBand: 'heavy', cargoBand: 'rich', tetherabilityBand: 'excellent' })]), directive,
  });
  assert.equal(result.phase, 'spool_cue');
  assert.equal(result.telegraph.durationTicks, 30);
  assert.equal(result.fireWindow, false);
  result = runtime.update({
    tick: 40, entityId: 'raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 110, operationalMassBand: 'heavy', cargoBand: 'rich', tetherabilityBand: 'excellent' })]), directive,
  });
  assert.equal(result.phase, 'attach_window');
  assert.equal(result.allowedActionId, 'action_attach', 'raider uses the canonical SG-03 attach verb');
  const attachDirective = overrideDirectiveForCombatDoctrine(directive, result);
  assert.equal(attachDirective.objective.kind, ObjectiveKind.TUG);
  assert.equal(attachDirective.objective.targetId, 1);

  const tether = tetherContact('att_1', { ownerId: 'raider', targetId: 1 });
  result = runtime.update({
    tick: 41, entityId: 'raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 112, tethered: true }), tether]), directive,
  });
  assert.equal(result.phase, 'control');
  assert.equal(result.allowedActionId, 'action_reel');
  assert.equal(result.actionTargetId, 'att_1');
  result = runtime.update({
    tick: 44, entityId: 'raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 130, tethered: false })]), directive,
  });
  assert.equal(result.phase, 'reposition');
  assert.equal(result.outcome, 'line_lost', 'cut/overload/lost line changes the raider outcome');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 113 });
  const target = shipContact(1, { x: 110, operationalMassBand: 'heavy', cargoBand: 'rich', tetherabilityBand: 'excellent' });
  runtime.update({
    tick: 0, entityId: 'slack_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([target]), directive,
  });
  runtime.update({
    tick: 30, entityId: 'slack_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([target]), directive,
  });
  runtime.update({
    tick: 31, entityId: 'slack_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 112, tethered: true }), tetherContact('att_slack', {
      ownerId: 'slack_raider', targetId: 1,
    })]), directive,
  });
  const result = runtime.update({
    tick: 32, entityId: 'slack_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 105, tethered: true }), tetherContact('att_slack', {
      ownerId: 'slack_raider', targetId: 1, tags: ['massline', 'owned_by_self', 'slack'],
    })]), directive,
  });
  assert.equal(result.phase, 'reposition');
  assert.equal(result.outcome, 'slack_line', 'a slack cable changes control outcome instead of reeling forever');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 127 });
  const openTarget = shipContact(1, {
    x: 110, operationalMassBand: 'heavy', cargoBand: 'rich', tetherabilityBand: 'excellent',
  });
  runtime.update({
    tick: 0, entityId: 'contested_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([openTarget]), directive,
  });
  runtime.update({
    tick: 30, entityId: 'contested_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([openTarget]), directive,
  });
  const foreignTether = tetherContact('att_foreign', { ownerId: 'rival_raider', targetId: 1 });
  let result = runtime.update({
    tick: 31, entityId: 'contested_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 112, tethered: true }), foreignTether]), directive,
  });
  assert.equal(result.phase, 'reposition', 'a foreign tether makes the target contested instead of entering control');
  assert.equal(result.outcome, 'target_contested');
  assert.equal(result.allowedActionId, null, 'a raider never sends action_reel for another owner tether');
  result = runtime.update({
    tick: 61, entityId: 'contested_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 112, tethered: true }), foreignTether]), directive,
  });
  assert.equal(result.phase, 'flank', 'contested target deterministically resets to seek another attach cycle');
  result = runtime.update({
    tick: 62, entityId: 'contested_raider', doctrineId: CombatDoctrineId.TETHER_CONTROL_RAIDER,
    perception: perception([shipContact(1, { x: 112, tethered: true }), foreignTether]), directive,
  });
  assert.equal(result.phase, 'spool_cue');
  assert.equal(result.telegraphStarted, true, 'the next owned attach attempt receives a fresh readable cue');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 211 });
  let result = runtime.update({
    tick: 0, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: perception([shipContact(1, { x: 640, mobilityBand: 'low', threat: 0.95 })]), directive,
  });
  assert.equal(result.phase, 'charge_cue');
  assert.equal(result.telegraph.durationTicks, 30);
  result = runtime.update({
    tick: 29, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: perception([shipContact(1, { x: 620, mobilityBand: 'low', threat: 0.95 })]), directive,
  });
  assert.equal(result.fireWindow, false);
  result = runtime.update({
    tick: 30, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: perception([shipContact(1, { x: 610, mobilityBand: 'low', threat: 0.95 })]), directive,
  });
  assert.equal(result.phase, 'fire_window');
  assert.equal(result.fireWindow, true);

  result = runtime.update({
    tick: 31, entityId: 'sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: perception([shipContact(1, { x: 180, vx: -90, mobilityBand: 'low', threat: 0.95 })]), directive,
  });
  assert.equal(result.phase, 'retreat');
  assert.equal(result.fireWindow, false, 'closing inside the inner band interrupts ranged aim');
  assert.equal(result.maneuverKind, ManeuverKind.RETREAT);
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 223 });
  const frame = () => perception([shipContact(1, { x: 620, mobilityBand: 'low', threat: 0.95 })]);
  runtime.update({
    tick: 0, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  runtime.update({
    tick: 30, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  let result = runtime.update({
    tick: 48, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'reset', 'ranged doctrine enters an explicit post-shot dwell');
  assert.equal(result.fireWindow, false);
  result = runtime.update({
    tick: 65, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'reset', 'post-shot dwell lasts the full authored 18 ticks');
  result = runtime.update({
    tick: 66, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'charge_cue');
  assert.equal(result.telegraphStarted, true, 'every repeated ranged shot receives a fresh 30-tick warning');
  result = runtime.update({
    tick: 95, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(result.fireWindow, false);
  result = runtime.update({
    tick: 96, entityId: 'patient_sniper', doctrineId: CombatDoctrineId.RANGED_DISENGAGER,
    perception: frame(), directive,
  });
  assert.equal(result.phase, 'fire_window');
  assert.equal(result.fireWindow, true);
}

{
  const run = () => {
    const runtime = new CombatDoctrineRuntime({ seed: 31337 });
    const trace = [];
    for (let tick = 0; tick <= 90; tick += 3) {
      trace.push(runtime.update({
        tick, entityId: 77, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
        perception: perception([shipContact(1, { x: tick < 9 ? 500 : 180, mobilityBand: 'high', threat: 0.8 })]), directive,
      }));
    }
    return trace;
  };
  assert.deepEqual(run(), run(), 'same seed and sensor frames produce identical doctrine traces');
}

{
  const runtime = new CombatDoctrineRuntime({ seed: 99 });
  const first = runtime.update({
    tick: 0, entityId: 7, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 500 })]), directive,
  });
  assert(Object.isFrozen(first));
  assert.equal(runtime.inspect(7).cycle, 0);
  runtime.forget(7);
  assert.equal(runtime.inspect(7), null, 'roster removal clears transient doctrine state');
  const reset = runtime.update({
    tick: 100, entityId: 7, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception([shipContact(1, { x: 500 })]), directive,
  });
  assert.equal(reset.cycle, 0, 'returning roster members start a fresh deterministic cycle');
  runtime.reset();
  assert.equal(runtime.inspect(7), null, 'new/load reset clears every transient doctrine record');
}

for (const def of ENEMY_TYPES.filter((entry) => entry.id !== 'mule_trader')) {
  assert(Object.values(CombatDoctrineId).includes(def.combatDoctrineId), `${def.id} has a typed combatDoctrineId`);
  const spec = makeEnemySpawnSpec(def.id, def.levelRange?.[0] || 1, { x: 20, z: -5 });
  assert.equal(spec.data.ai.combatDoctrineId, def.combatDoctrineId, `${def.id} live spawn preserves combat doctrine`);
}
const mule = ENEMY_TYPES.find((entry) => entry.id === 'mule_trader');
assert.equal(mule.combatDoctrineId, null, 'noncombat trader archetype has no combat doctrine assignment');
assert.equal(makeEnemySpawnSpec(mule.id, 1, { x: 20, z: -5 }).data.ai.combatDoctrineId, null,
  'noncombat trader spawn skips doctrine gating entirely');
const sable = NAMED_CAPTAINS.find((captain) => captain.id === 'cap_sable_iask');
assert.equal(sable.combatDoctrineId, CombatDoctrineId.RANGED_DISENGAGER, 'Sable Iask stages as the ranged doctrine');
const ambush = planEncounterShape(ENCOUNTERS.ambush_snare, {
  id: 'zone_ambush', name: 'Snare', type: 'ambush_lane', center: { x: 100, z: 20 }, radius: 240, danger: 0.4,
}, 'sector_helios', 1, 1, seeded([0.2, 0.8, 0.3, 0.4, 0.6, 0.1, 0.7, 0.5]));
assert(ambush.ships.length >= 2);
for (const ship of ambush.ships) {
  assert(Object.values(CombatDoctrineId).includes(ship.combatDoctrineId), 'ambush plan carries typed doctrine staging');
}

{
  const sensorCalls = [];
  const maneuvers = [];
  const starts = [];
  let hideDoctrineTarget = false;
  const actorIds = [1, 2, 3, 4, 5];
  const state = {
    tick: 0,
    playerId: 99,
    player: { heat: 0 },
    meta: { seed: 47 },
    combat: { trace: { events: [] } },
    entities: new Map(),
  };
  for (const id of actorIds) state.entities.set(id, stackActor(id, id === 2));
  state.entities.set(99, {
    id: 99, type: 'ship', alive: true, team: 2,
    pos: { x: 190, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  const tactical = createTacticalAISystem({
    seed: 47,
    config: { trace: { enabled: false } },
    sensors: {
      frameFor(entityId, tick) {
        sensorCalls.push(`${tick}:${entityId}`);
        return stackSensorFrame(entityId, tick,
          entityId === 2 && (tick === 3 || hideDoctrineTarget) ? [] : [stackTargetContact()]);
      },
    },
    roster: {
      listSquads() {
        return [{
          id: 'five_ship_default_batch', doctrine: 'scavenger', faction: 'fixture', formation: 'wedge',
          members: actorIds.map((id) => ({
            id,
            capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
            combatDoctrineId: id === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
          })),
        }];
      },
    },
    maneuver: { request(request) { maneuvers.push(request); return true; } },
    actionPortFactory: () => stackActionPort(starts),
  });
  tactical.init({ state, bus: null, helpers: {} });
  tactical.update(1 / 60, state);
  let doctrineDecision = tactical.stack.lastResult.decisions.find((entry) => entry.entityId === 2);
  assert.equal(doctrineDecision.combatDoctrine.phase, 'engine_flare',
    'default-stack doctrine actor starts from a current live sensor frame');

  state.tick = 3;
  tactical.update(1 / 60, state);
  doctrineDecision = tactical.stack.lastResult.decisions.find((entry) => entry.entityId === 2);
  assert(sensorCalls.includes('3:2'), 'non-active doctrine member receives a fresh current-tick sensor frame');
  assert.equal(sensorCalls.includes('3:3'), false, 'non-doctrine non-active member preserves ordinary batching');
  assert.equal(doctrineDecision.combatDoctrine.targetId, null,
    'fresh negative perception clears the non-active doctrine target instead of advancing stale memory');
  assert.equal(doctrineDecision.combatDoctrine.fireWindow, false);
  assert.equal(state.entities.get(2).data.intent.fire, false);
  assert(maneuvers.length >= actorIds.length * 2, 'N>=4 fixture exercises active and non-active maneuver decisions');
  for (let tick = 6; tick <= 36; tick += 3) {
    state.tick = tick;
    tactical.update(1 / 60, state);
  }
  const doctrineStarts = starts.filter((entry) => entry.entityId === 2 && entry.actionId === 'action_burst');
  assert.equal(doctrineStarts[0]?.startedTick, 36,
    'default decision cadence and executor settings preserve the restarted 30-tick telegraph before action start');
  hideDoctrineTarget = true;
  state.tick = 39;
  tactical.update(1 / 60, state);
  doctrineDecision = tactical.stack.lastResult.decisions.find((entry) => entry.entityId === 2);
  assert.equal(doctrineDecision.combatDoctrine.targetId, null);
  assert.equal(doctrineDecision.action.actionId, null,
    'losing current visibility hard-stops an in-flight doctrine attack despite default min-commit');
  assert.equal(state.entities.get(2).data.intent.fire, false);
}

// Real SG-03 cancellation regression is kept separate from the lightweight stack fixture.
{
  const actor = realPortShip(701, 1, 0);
  const target = realPortShip(702, 2, 100);
  const state = { tick: 0, entities: new Map([[actor.id, actor], [target.id, target]]) };
  const ctx = { state, bus: null, helpers: {} };
  const kernel = getCombatKernel(ctx);
  assert.equal(kernel.catalog.actions.get('action_burst').cancelWindows.length, 0,
    'real cancellation fixture uses an action with no authored cancel window');
  const port = createSG03ActionPort(ctx, { controllerId: 'doctrine_cancel_test' });
  const handle = port.start(actor.id, 'action_burst', {
    tick: 0, targetId: target.id,
    target: { id: target.id, kind: ContactKind.SHIP, pos: target.pos },
    squadId: 'real_port_fixture', objective: ObjectiveKind.FOCUS,
  });
  assert(handle, 'real SG-03 port queues the non-cancel-window burst action');
  kernel.actions.advance();
  assert.equal(state.combat.actions.activeByActor[String(actor.id)]?.actionId, 'action_burst');
  const interrupted = port.interrupt(actor.id, handle, {
    tick: 0, reason: 'doctrine_target_invalid', source: 'ai', nextActionId: null, nextTargetId: null,
  });
  assert.equal(interrupted, true, 'real SG-03 port directly cancels an invalid-target action into hold');
  assert.equal(state.combat.actions.activeByActor[String(actor.id)], undefined,
    'invalid-target cancellation removes the active burst immediately');
  assert(state.combat.trace.events.some((event) => event.kind === 'action.cancelled' &&
    event.actorId === actor.id && event.reason === 'doctrine_target_invalid'));
}
const source = readFileSync(new URL('../src/ai/combatDoctrine.js', import.meta.url), 'utf8');
for (const forbidden of ['Math.random', 'Date.now', 'performance.now', 'GameState', 'state.']) {
  assert.equal(source.includes(forbidden), false, `pure doctrine source cannot reference ${forbidden}`);
}
const stackSource = readFileSync(new URL('../src/ai/stack.js', import.meta.url), 'utf8');
assert(stackSource.includes('!doctrineId'), 'authored doctrine ships must bypass cached member-batch decisions so phase/fire gates advance every tick');
const squadSource = readFileSync(new URL('../src/ai/squad.js', import.meta.url), 'utf8');
assert(squadSource.includes('combatDoctrineId: member.combatDoctrineId'),
  'squad directives must carry the normalized doctrine identity into the live decision stack');

console.log('Combat doctrine unit checks OK');

function perception(contactsValue, selfOverrides = {}) {
  return {
    self: {
      id: selfOverrides.id ?? 2,
      team: 1,
      pos: { x: selfOverrides.x ?? 0, z: selfOverrides.z ?? 0 },
      vel: { x: selfOverrides.vx ?? 0, z: selfOverrides.vz ?? 0 },
      rot: 0,
      combatDoctrineId: selfOverrides.combatDoctrineId || null,
      activity: {
        kind: selfOverrides.activity || ActivityKind.ATTACK_RUN,
        reason: 'combat_doctrine_test',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: selfOverrides.roe || RulesOfEngagement.WEAPONS_FREE,
    },
    contacts: contactsValue,
    events: [],
  };
}

function shipContact(id, values = {}) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: values.alive ?? true,
    valid: values.valid ?? true,
    visible: values.visible ?? true,
    ageTicks: values.ageTicks ?? 0,
    hostile: values.hostile ?? true,
    confidence: values.confidence ?? 1,
    threat: values.threat ?? 0.7,
    pos: { x: values.x ?? 400, z: values.z ?? 0 },
    vel: { x: values.vx ?? 0, z: values.vz ?? 0 },
    tethered: values.tethered ?? false,
    operationalMassBand: values.operationalMassBand || 'medium',
    mobilityBand: values.mobilityBand || 'medium',
    cargoBand: values.cargoBand || 'empty',
    tetherabilityBand: values.tetherabilityBand || 'good',
    tags: values.tags || [],
  };
}

function tetherContact(id, values = {}) {
  return {
    id,
    attachmentId: id,
    kind: ContactKind.TETHER,
    ownerId: values.ownerId,
    targetId: values.targetId,
    hostile: true,
    confidence: 1,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    tags: values.tags || ['massline', 'owned_by_self'],
  };
}

function baseDirective() {
  return Object.freeze({
    tick: 0,
    squadId: 'fixture',
    memberId: 2,
    role: 'striker',
    tactic: 'standoff_focus',
    focusTargetId: 1,
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({
      kind: 'wedge', slot: Object.freeze({ x: 0, z: 0 }), velocity: Object.freeze({ x: 0, z: 0 }),
      bound: 170, breakFormation: false, breakReason: null,
    }),
  });
}

function seeded(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function stackActor(id, doctrineActor) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: id * 12 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    data: {
      ai: {
        combatDoctrineId: doctrineActor ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
        activity: {
          kind: ActivityKind.ATTACK_RUN,
          reason: 'default_batch_fixture',
          anchor: { x: 0, z: 0 },
          leashRadius: 2600,
          preferredRange: 180,
          startedTick: 0,
        },
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
      intent: {},
      weapons: [{ projSpeed: 420 }],
    },
  };
}

function stackSensorFrame(entityId, tick, contacts) {
  return {
    tick,
    self: {
      id: entityId,
      team: 1,
      pos: { x: 0, z: entityId * 12 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      subsystemFractions: {},
      activity: {
        kind: ActivityKind.ATTACK_RUN,
        reason: 'default_batch_fixture',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 180,
        startedTick: 0,
      },
      roe: RulesOfEngagement.WEAPONS_FREE,
      combatDoctrineId: entityId === 2 ? CombatDoctrineId.INTERCEPTOR_FLYBY : null,
    },
    contacts,
    events: [],
  };
}

function stackTargetContact() {
  return {
    id: 99,
    kind: ContactKind.SHIP,
    team: 2,
    classification: 'live_hostile',
    pos: { x: 190, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 12,
    confidence: 1,
    threat: 0.9,
    hostile: true,
    alive: true,
    valid: true,
    visible: true,
    tags: ['armed'],
  };
}

function stackActionPort(starts) {
  return {
    list() {
      return [{
        id: 'action_burst', tags: ['attack'], range: 700, preferredRange: 220,
        targetKinds: [ContactKind.SHIP],
      }];
    },
    canStart() { return { ok: true, reason: 'fixture_ok' }; },
    start(entityId, actionId, request) {
      const handle = { entityId, actionId, startedTick: request.tick };
      starts.push(handle);
      return handle;
    },
    status() { return 'running'; },
    interrupt() { return true; },
  };
}

function realPortShip(id, team, x) {
  return {
    id, type: 'ship', alive: true, team,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    hull: 200, hullMax: 200, armorHp: 40, armorMax: 40,
    shield: 50, shieldMax: 50, cap: 100, capMax: 100,
    data: {},
  };
}
