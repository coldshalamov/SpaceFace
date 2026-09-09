// check-wingmen.mjs — guards the player-wingman contract (goal P1-8).
//
// Before P1-8, fleet ships (state.automation.fleet) were passive ledger entries — they had hp/order
// but never spawned as live objects and couldn't be commanded in combat. This check pins the contract
// that wingmen are now LIVE flyable entities:
//   1. systems/wingmen.js exists + exports the system.
//   2. The system spawns live entities from the fleet ledger (team: 0 = player-aligned) on sector enter.
//   3. Live hull syncs back to the fleet ledger each tick; death routes through onHitAsset.
//   4. Order changes (ui:fleetOrder) update the live entity's AI archetype.
//   5. The system is registered in UPDATE_ORDER.
//   6. automation.serialize strips the transient _liveId so it doesn't leak into saves.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

assert.ok(existsSync(join(ROOT, 'src/data/wingOrders.js')),
  'src/data/wingOrders.js must define the deterministic four-order contract');

const {
  WING_ORDER,
  WING_ORDER_LIMITS,
  normalizePersistedWingOrder,
} = await import('../src/data/wingOrders.js');
const { automation } = await import('../src/systems/automation.js');
const { wingmen } = await import('../src/systems/wingmen.js');
const { ActivityKind, effectiveActivityForAI, overrideDirectiveForWingOrder } = await import('../src/ai/doctrine.js');
const { ContactKind, ObjectiveKind } = await import('../src/ai/contracts.js');
const { TacticalAIStack } = await import('../src/ai/stack.js');

// 1. The wingman system exists + exports correctly.
assert.ok(existsSync(join(ROOT, 'src/systems/wingmen.js')), 'src/systems/wingmen.js must exist (wingman spawn/lifecycle system)');
const wmSrc = read('src/systems/wingmen.js');
assert.match(wmSrc, /export const wingmen/, 'wingmen.js must export the wingmen system');
assert.match(wmSrc, /makeShipEntitySpec/, 'wingmen.js must build live entities via makeShipEntitySpec');
assert.match(wmSrc, /team: 0/, 'wingmen must spawn as team: 0 (player-aligned — AI auto-targets team-1 hostiles)');
assert.match(wmSrc, /_liveId/, 'wingmen must track the live entity id on the fleet entry (_liveId)');

// 2. Spawns on sector enter + hard-despawns on sector:exit (canonical world seam; continuous
// free-flight handoffs preserve live wingmen — see M2-C1 continuous handoff).
assert.match(wmSrc, /bus\.on\('sector:enter'/, 'wingmen must spawn on sector:enter');
assert.match(wmSrc, /bus\.on\('sector:exit'/, 'wingmen must hard-despawn on sector:exit (not dead sector:leave)');
assert.doesNotMatch(wmSrc, /bus\.on\('sector:leave'/, 'wingmen must not listen for dead sector:leave event');

// 3. Death routes through the existing onHitAsset path (ledger stays the source of truth).
assert.match(wmSrc, /combat:hitAsset/, 'wingman death must emit combat:hitAsset (so automation.onHitAsset removes the fleet entry)');

// 4. Order changes update the live entity's AI archetype (escort/guard/attack behave differently).
assert.match(wmSrc, /bus\.on\('ui:fleetOrder'/, 'wingmen must listen for ui:fleetOrder (order changes from the AutomationPanel)');
assert.match(wmSrc, /WINGMAN_ARCHETYPE_BY_ORDER/, 'wingmen must map orders → AI archetypes (escort/guard/attack)');

// 5. Registered in the registry (SYSTEMS + UPDATE_ORDER).
const regSrc = read('src/core/registry.js');
assert.match(regSrc, /import \{ wingmen \}/, 'registry must import wingmen');
assert.match(regSrc, /wingmen/, 'wingmen must appear in the SYSTEMS + UPDATE_ORDER lists');

// 6. automation.serialize strips the transient _liveId (doesn't leak into saves).
const autoSrc = read('src/systems/automation.js');
assert.match(autoSrc, /_liveId/, 'automation.serialize must strip the transient _liveId from fleet entries (per-session entity id)');

// 7. Four exact deterministic order semantics + scope batching.
assert.deepEqual(Object.values(WING_ORDER), ['attack', 'screen', 'hold', 'regroup']);
assert.deepEqual(WING_ORDER_LIMITS, {
  attackLeashWu: 1800,
  screenArcWu: 180,
  holdRadiusWu: 40,
  regroupRadiusWu: 80,
});
testAttackExactTargetAndFriendlyRejection();
testAllSelectedAndPartialBlockedRecipients();
testSpatialOrdersAndMoralePriority();
testTargetLossAndLeashConvertExactlyOnce();
testSaveLoadNormalization();
testDoctrineOverrideAndEndToEndTwentySeedIdentity();
testStationaryUpdatesReuseFleetAndDoctrineObjects();

const radialSrc = read('src/ui/wingmanRadial.js');
assert.equal((radialSrc.match(/pos: '(top|right|bottom|left)'/g) || []).length, 4,
  'Z radial retains exactly four wedges');
assert.match(radialSrc, /ui:wingOrder/, 'radial emits one batched ui:wingOrder command');
assert.match(radialSrc, /selectedWingmanId|selectedRecipientId/, 'radial exposes selected/all scope');
assert.match(radialSrc, /previousFocus/, 'radial records and restores the opener focus');
assert.match(radialSrc, /wedgeEls\[0\]\.disabled\s*=\s*!hasTarget/, 'Attack uses the real disabled property');
assert.match(radialSrc, /aria-disabled/, 'Attack exposes aria-disabled state');
assert.match(radialSrc, /\.focus\(/, 'radial places focus inside on open and restores on close');

const doctrineSrc = read('src/ai/doctrine.js');
const stackSrc = read('src/ai/stack.js');
assert.match(stackSrc, /overrideDirectiveForWingOrder/, 'SG-06 stack consumes wing-order directives');
const wingOrderHandlerSrc = autoSrc.slice(autoSrc.indexOf('  handleWingOrder('), autoSrc.indexOf('  assignProgram(', autoSrc.indexOf('  handleWingOrder(')));
assert.doesNotMatch(doctrineSrc + stackSrc + wmSrc + wingOrderHandlerSrc,
  /grantCredits|chargeCredits|addCargo|removeCargo|applyRep\(/,
  'wing-order path introduces no economy, cargo, or reputation authority');

console.log('Wingmen OK — deterministic Attack/Screen/Hold/Regroup batching, scope, AI priority, and save normalization green.');

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(type, fn) {
      const list = handlers.get(type) || [];
      list.push(fn);
      handlers.set(type, list);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
}

function entity(id, team, x, z, ai = {}) {
  return {
    id, type: 'ship', team, alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100,
    data: { ai: { ...ai }, combat: { targetId: null }, intent: { fire: false, fireGroup: null } },
  };
}

function boot(seed = 1, fleetRows = null) {
  const bus = makeBus();
  const voices = [];
  const player = entity(1, 0, 0, 0);
  const wingA = entity(11, 0, 100, 0, { archetype: 'brawler' });
  const wingB = entity(12, 0, -100, 0, { archetype: 'brawler' });
  const hostile = entity(91, 1, 600, 0, { archetype: 'pirate', spawnContext: 'encounter' });
  const friendly = entity(92, 0, 300, 0, { archetype: 'brawler' });
  const fleet = fleetRows || [
    { id: 'fleet_a', shipDefId: 'ship_wasp', order: 'escort', _liveId: wingA.id, hullPct: 1, hp: 1 },
    { id: 'fleet_b', shipDefId: 'ship_wasp', order: 'escort', _liveId: wingB.id, hullPct: 1, hp: 1 },
  ];
  const state = {
    tick: 600,
    simTime: 10,
    mode: 'flight',
    meta: { seed },
    playerId: player.id,
    player: { heat: 0, researchedNodes: [], ownedShips: [] },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player], [wingA.id, wingA], [wingB.id, wingB], [hostile.id, hostile], [friendly.id, friendly]]),
    entityList: [player, wingA, wingB, hostile, friendly],
    automation: {
      drones: [], traders: [], outposts: [], fleet, fleetCap: 4,
      balance: {}, accumulators: { creditBuffer: 0, upkeepDebt: 0 },
      meta: { rngSeed: seed, lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [] },
    },
  };
  const helpers = { voice: { say(payload) { voices.push(payload); return true; } } };
  const auto = Object.create(automation);
  auto.init({ state, bus, helpers, registry: null });
  const wm = Object.create(wingmen);
  wm.init({ state, bus, helpers });
  return { state, bus, voices, player, wingA, wingB, hostile, friendly, fleet, auto, wm };
}

function issue(t, order, extras = {}) {
  t.bus.emit('ui:wingOrder', {
    order,
    scope: extras.scope || 'all',
    selectedWingmanId: extras.selectedWingmanId || null,
    targetId: extras.targetId == null ? null : extras.targetId,
  });
  return t.bus.events.filter((event) => event.type === 'wingOrder:status').at(-1)?.payload;
}

function testAttackExactTargetAndFriendlyRejection() {
  const t = boot(10);
  const accepted = issue(t, 'attack', { targetId: t.hostile.id });
  assert.deepEqual(accepted.acceptedRecipientIds, ['fleet_a', 'fleet_b']);
  assert.deepEqual(accepted.blockedRecipients, []);
  assert.equal(t.fleet[0].wingOrder.targetId, t.hostile.id);
  assert.equal(t.fleet[1].wingOrder.targetId, t.hostile.id);
  assert.equal(t.voices.length, 1, 'one terse voice acknowledgement for the whole command');
  assert.equal(t.voices[0].text, 'ATTACK');

  const blocked = issue(t, 'attack', { targetId: t.friendly.id });
  assert.deepEqual(blocked.acceptedRecipientIds, []);
  assert.equal(blocked.blockedRecipients.length, 2);
  assert.ok(blocked.blockedRecipients.every((row) => row.reason === 'target_not_hostile'));
  assert.equal(t.voices.length, 2, 'blocked command still receives only one concise acknowledgement');
  assert.equal(t.voices[1].text, 'UNABLE', 'blocked acknowledgement reflects the actual result');
}

function testAllSelectedAndPartialBlockedRecipients() {
  const t = boot(11);
  t.fleet[1]._liveId = 9999;
  const partial = issue(t, 'screen');
  assert.deepEqual(partial.acceptedRecipientIds, ['fleet_a']);
  assert.deepEqual(partial.blockedRecipients, [{ recipientId: 'fleet_b', reason: 'not_deployed' }]);
  assert.equal(t.voices.at(-1).text, 'PARTIAL', 'partial acknowledgement reflects mixed recipients');
  const untouchedCommandId = t.fleet[1].wingOrder.commandId;
  const selected = issue(t, 'regroup', { scope: 'selected', selectedWingmanId: 'fleet_a' });
  assert.deepEqual(selected.acceptedRecipientIds, ['fleet_a']);
  assert.deepEqual(selected.blockedRecipients, []);
  assert.equal(t.fleet[1].wingOrder.kind, 'screen', 'selected scope leaves other recipient order untouched');
  assert.equal(t.fleet[1].wingOrder.commandId, untouchedCommandId);
}

function testSpatialOrdersAndMoralePriority() {
  const t = boot(12);
  t.wingA.data.intent.fire = true;
  t.wingA.data.intent.fireGroup = 1;
  issue(t, 'screen');
  assert.equal(t.wingA.data.intent.fire, false, 'Screen clears stale Attack fire on transition');
  assert.equal(t.wingA.data.intent.fireGroup, null);
  t.wm.update(1 / 60, t.state);
  for (const [index, wing] of [t.wingA, t.wingB].entries()) {
    const anchor = wing.data.ai.activity.anchor;
    assert.ok(Math.abs(Math.hypot(anchor.x - t.player.pos.x, anchor.z - t.player.pos.z) - 180) < 1e-6,
      `screen recipient ${index} stays on the 180-wu moving-player arc`);
    assert.equal(wing.data.ai.activity.kind, ActivityKind.SCREEN);
  }
  const before = { ...t.wingA.data.ai.activity.anchor };
  t.player.pos.x = 400;
  t.wm.update(1 / 60, t.state);
  assert.equal(t.wingA.data.ai.activity.anchor.x - before.x, 400, 'screen arc follows the moving player');

  issue(t, 'hold', { scope: 'selected', selectedWingmanId: 'fleet_a' });
  const hold = { ...t.fleet[0].wingOrder.anchor };
  t.wingA.pos.x += 500;
  t.player.pos.x += 200;
  t.wm.update(1 / 60, t.state);
  assert.deepEqual(t.wingA.data.ai.activity.anchor, hold, 'Hold retains the immutable recipient anchor');
  assert.equal(t.wingA.data.ai.activity.leashRadius, 40);

  t.wingA.data.intent.fire = true;
  t.wingA.data.combat.targetId = t.hostile.id;
  issue(t, 'regroup', { scope: 'selected', selectedWingmanId: 'fleet_a' });
  t.wm.update(1 / 60, t.state);
  assert.equal(t.wingA.data.intent.fire, false);
  assert.equal(t.wingA.data.combat.targetId, null);
  const regroupAnchor = t.wingA.data.ai.activity.anchor;
  assert.ok(Math.hypot(regroupAnchor.x - t.player.pos.x, regroupAnchor.z - t.player.pos.z) <= 80 + 1e-6);

  issue(t, 'attack', { scope: 'selected', selectedWingmanId: 'fleet_a', targetId: t.hostile.id });
  t.wingA.data.ai.forceFlee = true;
  t.wingA.data.ai.fsm = 'flee';
  t.wingA.data.intent.fire = true;
  t.wm.update(1 / 60, t.state);
  assert.equal(effectiveActivityForAI(t.wingA.data.ai).kind, ActivityKind.FLEE,
    'morale retreat outranks player Attack');
  assert.equal(t.wingA.data.intent.fire, false, 'retreat clears fire despite Attack order');
}

function testTargetLossAndLeashConvertExactlyOnce() {
  const t = boot(13);
  issue(t, 'attack', { scope: 'selected', selectedWingmanId: 'fleet_a', targetId: t.hostile.id });
  t.hostile.pos.x = 1901;
  t.wm.update(1 / 60, t.state);
  t.wm.update(1 / 60, t.state);
  assert.equal(t.fleet[0].wingOrder.kind, 'regroup');
  assert.equal(t.bus.events.filter((event) => event.type === 'wingOrder:converted').length, 1,
    'leash conversion emits exactly once');

  const stray = boot(131);
  issue(stray, 'attack', { scope: 'selected', selectedWingmanId: 'fleet_a', targetId: stray.hostile.id });
  stray.wingA.pos.x = 1801;
  stray.wm.update(1 / 60, stray.state);
  assert.equal(stray.fleet[0].wingOrder.kind, 'regroup', 'a wingman outside the player leash regroups');

  const lost = boot(14);
  issue(lost, 'attack', { scope: 'selected', selectedWingmanId: 'fleet_a', targetId: lost.hostile.id });
  lost.hostile.alive = false;
  lost.wm.update(1 / 60, lost.state);
  lost.wm.update(1 / 60, lost.state);
  assert.equal(lost.fleet[0].wingOrder.kind, 'regroup');
  assert.equal(lost.bus.events.filter((event) => event.type === 'wingOrder:converted').length, 1,
    'target-loss conversion emits exactly once');
}

function testSaveLoadNormalization() {
  const t = boot(15, [
    { id: 'screen', _liveId: 11, wingOrder: { kind: 'screen', commandId: 'a' } },
    { id: 'regroup', _liveId: 12, wingOrder: { kind: 'regroup', commandId: 'b' } },
    { id: 'hold_here', _liveId: 13, wingOrder: { kind: 'hold', commandId: 'c', anchor: { x: 4, z: 5 }, sectorId: 'sector_helios_prime' } },
    { id: 'hold_away', _liveId: 14, wingOrder: { kind: 'hold', commandId: 'd', anchor: { x: 4, z: 5 }, sectorId: 'sector_ceres' } },
    { id: 'attack', _liveId: 15, wingOrder: { kind: 'attack', commandId: 'e', targetId: 91 } },
  ]);
  const saved = t.auto.serialize();
  assert.deepEqual(saved.fleet.map((row) => row.wingOrder.kind), ['screen', 'regroup', 'hold', 'regroup', 'regroup']);
  assert.ok(saved.fleet.every((row) => row._liveId === undefined));

  const restored = boot(16, []);
  restored.auto.deserialize(saved);
  assert.deepEqual(restored.state.automation.fleet.map((row) => row.wingOrder.kind),
    ['screen', 'regroup', 'hold', 'regroup', 'regroup']);
  assert.equal(normalizePersistedWingOrder({ kind: 'attack', targetId: 91 }, 'sector_helios_prime').kind, 'regroup');
  for (const malformedSectorId of [null, '', 42, {}, []]) {
    assert.equal(normalizePersistedWingOrder({
      kind: 'hold', anchor: { x: 4, z: 5 }, sectorId: malformedSectorId,
    }, 'sector_helios_prime').kind, 'regroup', 'malformed persisted Hold sector fails safe');
  }
}

function testDoctrineOverrideAndEndToEndTwentySeedIdentity() {
  const base = {
    focusTargetId: 99,
    objective: { kind: ObjectiveKind.FOCUS, targetId: 99, reason: 'squad' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: false },
  };
  const perception = {
    self: { activity: { kind: ActivityKind.ATTACK_RUN, reason: 'wing_order:attack', targetId: 91, anchor: { x: 0, z: 0 }, leashRadius: 1800 } },
  };
  const overridden = overrideDirectiveForWingOrder(base, perception);
  assert.equal(overridden.focusTargetId, 91);
  assert.equal(overridden.objective.targetId, 91, 'Attack retains the exact selected target');
  const retreat = { ...base, objective: { kind: ObjectiveKind.RETREAT, targetId: null, reason: 'morale' } };
  assert.equal(overrideDirectiveForWingOrder(retreat, perception), retreat, 'morale retreat directive remains final');

  for (let seed = 1; seed <= 20; seed++) {
    const a = runEndToEndAttack(seed);
    const b = runEndToEndAttack(seed);
    assert.deepEqual(a, b, `seed ${seed} automation→wingmen→stack behavior is deterministic`);
    assert.equal(a.commandTargetId, 91, `seed ${seed} command retains exact low-threat target`);
    assert.equal(a.directiveTargetId, 91, `seed ${seed} doctrine cannot reselect high-threat hostile`);
    assert.equal(a.doctrineTargetId, 91, `seed ${seed} combat doctrine remains locked to explicit target`);
  }
}

function testStationaryUpdatesReuseFleetAndDoctrineObjects() {
  const t = boot(51);
  issue(t, 'screen');
  t.wm.update(1 / 60, t.state);
  const ordered = t.wm._orderedFleet;
  const activityA = t.wingA.data.ai.activity;
  const activityB = t.wingB.data.ai.activity;
  t.wm.update(1 / 60, t.state);
  assert.equal(t.wm._orderedFleet, ordered, 'stable membership reuses cached fleet ordering');
  assert.equal(t.wingA.data.ai.activity, activityA, 'stationary Screen reuses doctrine activity A');
  assert.equal(t.wingB.data.ai.activity, activityB, 'stationary Screen reuses doctrine activity B');
  t.player.pos.x += 5;
  t.wm.update(1 / 60, t.state);
  assert.notEqual(t.wingA.data.ai.activity, activityA, 'moving player performs the necessary Screen anchor rebuild');
  const movedActivity = t.wingA.data.ai.activity;
  t.wm.update(1 / 60, t.state);
  assert.equal(t.wingA.data.ai.activity, movedActivity, 'post-move stationary update reuses rebuilt activity');
}

function runEndToEndAttack(seed) {
  const t = boot(seed);
  const distractor = entity(93, 1, 500, 80, { archetype: 'pirate', spawnContext: 'encounter' });
  t.state.entities.set(distractor.id, distractor);
  t.state.entityList.push(distractor);
  t.wingA.data.ai.combatDoctrineId = 'interceptor_flyby';
  const status = issue(t, 'attack', {
    scope: 'selected', selectedWingmanId: 'fleet_a', targetId: t.hostile.id,
  });
  const maneuvers = [];
  const self = t.wingA;
  const contacts = [
    contactFor(t.hostile, 0.08),
    contactFor(distractor, 0.98),
  ];
  const actionPort = {
    list() { return []; },
    canStart() { return { ok: false, reason: 'none' }; },
    start() { throw new Error('no action should start in fixture'); },
    status() { return 'cancelled'; },
    interrupt() { return false; },
  };
  const stack = new TacticalAIStack({
    seed,
    ports: {
      sensors: {
        frameFor(_entityId, tick) {
          return {
            tick,
            self: {
              id: self.id, team: self.team, pos: { ...self.pos }, vel: { ...self.vel }, rot: 0,
              radius: 8, hullFraction: 1, energyFraction: 1, heatFraction: 0,
              disabled: false, tethered: false, capabilities: [], subsystemFractions: {},
              activity: self.data.ai.activity, roe: self.data.ai.roe,
              combatDoctrineId: self.data.ai.combatDoctrineId,
            },
            contacts,
            events: [],
          };
        },
      },
      actions: actionPort,
      maneuver: { request(request) { maneuvers.push(request); } },
      roster: {
        listSquads() {
          return [{
            id: 'player_wing', doctrine: 'balanced', faction: 'faction_scn', formation: 'wedge',
            formationSpacing: 72, formationBound: 170,
            members: [{ id: self.id, preferredRole: 'striker', capabilities: [], combatDoctrineId: 'interceptor_flyby' }],
          }];
        },
      },
    },
  });
  const result = stack.update(t.state.tick);
  const decision = result.decisions[0];
  return {
    commandId: status.commandId,
    commandTargetId: t.fleet[0].wingOrder.targetId,
    directiveTargetId: decision.directive.objective.targetId,
    doctrineTargetId: decision.combatDoctrine && decision.combatDoctrine.targetId,
    maneuverKind: maneuvers[0] && maneuvers[0].kind,
    maneuverTargetHeading: maneuvers[0] && maneuvers[0].targetHeading,
  };
}

function contactFor(target, threat) {
  return {
    id: target.id,
    kind: ContactKind.SHIP,
    team: target.team,
    classification: 'hostile_ship',
    pos: { ...target.pos },
    vel: { ...target.vel },
    radius: 8,
    alive: true,
    visible: true,
    confidence: 1,
    threat,
    hostile: true,
    mobilityBand: 'medium',
    operationalMassBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'good',
    tags: ['armed'],
  };
}
