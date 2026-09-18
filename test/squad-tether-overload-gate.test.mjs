import assert from 'node:assert/strict';
import test from 'node:test';

import { SquadCommander } from '../src/ai/squad.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { aiPorts } from '../src/systems/aiPorts.js';

// A tethered member must only be diverted into COUNTER_TETHER_OVERLOAD when the line holding it
// can actually be snapped by ship thrust. The standard player Massline (and the legacy massline
// def) use an extreme-load-only break policy, so the overload objective can never resolve there —
// tethering a hostile must not permanently disarm it.

test('a member tethered by an unbreakable line stays on ordinary combat orders', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'held_wing',
    doctrine: 'scavenger',
    members: [{
      id: 11,
      preferredRole: 'leader',
      capabilities: ['drive', 'sensor', 'weapon', 'counter_tether_overload'],
      combatDoctrineId: 'interceptor_flyby',
    }],
  });

  // The hostile tether contact carries no 'overloadable' tag: production sensors strip it when
  // the attachment def's break policy cannot yield to ship thrust (tether_standard).
  const perception = memberPerception(11, {
    tethered: true,
    contacts: [hostileShipContact(1), tetherContact('att_hold', { ownerId: 1, targetId: 11, overloadable: false })],
  });
  const result = commander.update('held_wing', 60, new Map([[11, perception]]));

  assert.notEqual(result.tactic, 'overload_and_break',
    'a line that cannot be overloaded must not hijack the squad tactic');
  const directive = result.directives.get(11);
  assert.ok(directive);
  assert.notEqual(directive.objective.kind, ObjectiveKind.COUNTER_TETHER_OVERLOAD,
    'the tethered member keeps a combat objective instead of a futile overload order');
  assert.equal(directive.objective.kind, ObjectiveKind.FOCUS);
  assert.equal(directive.objective.targetId, 1);
});

test('a member tethered by a snappable line still counter-tethers', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'snared_wing',
    doctrine: 'scavenger',
    members: [{
      id: 11,
      preferredRole: 'leader',
      capabilities: ['drive', 'sensor', 'weapon', 'counter_tether_overload'],
      combatDoctrineId: 'interceptor_flyby',
    }],
  });

  const perception = memberPerception(11, {
    tethered: true,
    contacts: [hostileShipContact(1), tetherContact('att_snare', { ownerId: 1, targetId: 11, overloadable: true })],
  });
  const result = commander.update('snared_wing', 60, new Map([[11, perception]]));

  assert.equal(result.tactic, 'overload_and_break');
  const directive = result.directives.get(11);
  assert.equal(directive.objective.kind, ObjectiveKind.COUNTER_TETHER_OVERLOAD);
  assert.equal(directive.objective.targetId, 'att_snare');
});

test('a mixed squad counter-tethers the breakable line but lets the immune member fight', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'mixed_wing',
    doctrine: 'scavenger',
    members: [
      {
        id: 11,
        preferredRole: 'leader',
        capabilities: ['drive', 'sensor', 'weapon', 'counter_tether_overload'],
        combatDoctrineId: 'interceptor_flyby',
      },
      {
        id: 12,
        preferredRole: 'striker',
        capabilities: ['drive', 'sensor', 'weapon', 'counter_tether_overload'],
        combatDoctrineId: 'interceptor_flyby',
      },
    ],
  });

  // Member 11 is held by a breakable snare; member 12 is held by the unbreakable standard line.
  // The merged contact picture must still send the overload to 11 while 12 keeps fighting.
  const perceptions = new Map([
    [11, memberPerception(11, {
      tethered: true,
      contacts: [
        hostileShipContact(1),
        tetherContact('att_snare', { ownerId: 1, targetId: 11, overloadable: true }),
        tetherContact('att_hold', { ownerId: 1, targetId: 12, overloadable: false }),
      ],
    })],
    [12, memberPerception(12, {
      tethered: true,
      contacts: [
        hostileShipContact(1),
        tetherContact('att_hold', { ownerId: 1, targetId: 12, overloadable: false }),
      ],
    })],
  ]);
  const result = commander.update('mixed_wing', 60, perceptions);

  assert.equal(result.tactic, 'overload_and_break',
    'one breakable member line keeps the squad response available');
  assert.equal(result.directives.get(11).objective.kind, ObjectiveKind.COUNTER_TETHER_OVERLOAD);
  const held = result.directives.get(12).objective;
  assert.notEqual(held.kind, ObjectiveKind.COUNTER_TETHER_OVERLOAD,
    'the member on the unbreakable line must not shelve its combat orders');
  assert.notEqual(held.kind, ObjectiveKind.SCREEN,
    'the member on the unbreakable line stays offensive rather than idling on screen duty');
});

test('production sensors stamp breakability from the attachment def break policy', () => {
  const state = createGameState(47);
  state.tick = 60;
  state.mode = 'flight';
  const bus = createBus();
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers: {}, registry: { get() { return null; } } });

  const player = ship(1, 0, 0, 0);
  const held = ship(11, 1, 40, 0);
  const snared = ship(12, 1, 60, 0);
  state.playerId = player.id;
  state.entities = new Map([[1, player], [11, held], [12, snared]]);
  state.entityList = [player, held, snared];
  state.combat = { attachments: { byId: {}, nextId: 0 }, trace: { events: [] } };
  state.combat.attachments.byId.att_hold = {
    id: 'att_hold', defId: 'tether_standard', ownerId: 1, targetId: 11, state: 'active',
    sourceSocketId: 'socket_tether_spool', targetSocketId: 'socket_tether',
  };
  state.combat.attachments.byId.att_snare = {
    id: 'att_snare', defId: 'attachment_transverse_snare', ownerId: 1, targetId: 12, state: 'active',
    sourceSocketId: 'socket_tether_spool', targetSocketId: 'socket_tether',
  };

  const heldFrame = ports._sensorFrameFor(11, 60);
  const heldLine = heldFrame.contacts.find((contact) => contact.kind === ContactKind.TETHER && contact.id === 'att_hold');
  assert.ok(heldLine, 'the tethered member sees its own endpoint line');
  assert.equal(heldLine.tags.includes('overloadable'), false,
    'the standard player Massline must not advertise an escape it cannot deliver');

  const snareFrame = ports._sensorFrameFor(12, 60);
  const snareLine = snareFrame.contacts.find((contact) => contact.kind === ContactKind.TETHER && contact.id === 'att_snare');
  assert.ok(snareLine);
  assert.equal(snareLine.tags.includes('overloadable'), true,
    'an expendable snare still advertises overload counterplay');
});

function memberPerception(selfId, { tethered = false, contacts = [] } = {}) {
  return {
    tick: 60,
    self: {
      id: selfId,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      hullFraction: 1,
      disabled: false,
      tethered,
      capabilities: ['drive', 'sensor', 'weapon', 'counter_tether_overload'],
      factionBehavior: null,
    },
    contacts,
    events: [],
  };
}

function hostileShipContact(id) {
  return {
    id,
    kind: ContactKind.SHIP,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.8,
    pos: { x: 120, z: 0 },
    vel: { x: 0, z: 0 },
    tethered: false,
    operationalMassBand: 'light',
    mobilityBand: 'medium',
    cargoBand: 'empty',
    tetherabilityBand: 'poor',
    tags: [],
  };
}

function tetherContact(id, { ownerId, targetId, overloadable }) {
  return {
    id,
    attachmentId: id,
    kind: ContactKind.TETHER,
    alive: true,
    valid: true,
    visible: true,
    hostile: true,
    confidence: 1,
    threat: 0.85,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    ownerId,
    targetId,
    exposed: false,
    ownedBySelf: false,
    tethered: true,
    tags: overloadable ? ['hostile', 'massline', 'overloadable'] : ['hostile', 'massline'],
  };
}

function ship(id, team, x, z) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    mass: 40,
    hull: 100,
    hullMax: 100,
    shield: 50,
    shieldMax: 50,
    data: {
      ai: team === 1 ? { hostileTeams: [0], roe: 'weapons_free' } : {},
      intent: {},
      combat: {},
    },
  };
}
