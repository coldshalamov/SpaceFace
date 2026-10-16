// SFQ-B111 — a collision names direct, indirect, accidental, or stale, and the law card says which.
// Seed 4242. The classifier is pure; the live adjudication is the law system the card reads.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPULSE_PROVENANCE_MAX_AGE_TICKS,
  clearImpulseProvenance,
  holdImpulseProvenance,
  recordImpulseProvenance,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';
import { contactImpulseProvenance } from '../src/systems/collisionConsequences.js';
import {
  classifyImpactResponsibility,
  impactLinkFromPresentation,
} from '../src/combat/killCausality.js';
import { buildKillPresentationReceipt } from '../src/systems/combat.js';
import { buildCollisionPresentationProvenance } from '../src/systems/collisionConsequences.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { collisionResponsibilityLine } from '../src/ui/sectorLawPresenter.js';
import { createSimulation } from '../src/core/sim.js';

const PLAYER = 'pilot';
const WINDOW = IMPULSE_PROVENANCE_MAX_AGE_TICKS;

test('the same collision facts always name one of the four classes', () => {
  const directFacts = {
    playerId: PLAYER, actorId: PLAYER, tag: 'direct_contact',
    appliedTick: 10, impactTick: 12, holdUntilTick: null,
  };
  const direct = classifyImpactResponsibility(directFacts);
  assert.equal(direct.class, 'direct');
  assert.equal(direct.responsible, true);
  assert.match(direct.line, /Your hull hit them/);
  assert.equal(classifyImpactResponsibility(directFacts).class, 'direct');

  const indirect = classifyImpactResponsibility({
    playerId: PLAYER, actorId: PLAYER, tag: 'massline_throw',
    appliedTick: 10,
    impactTick: 10 + WINDOW + 40,
    holdUntilTick: 10 + WINDOW + 80,
  });
  assert.equal(indirect.class, 'indirect');
  assert.equal(indirect.responsible, true);
  assert.match(indirect.line, /threw what hit them/);

  const stale = classifyImpactResponsibility({
    playerId: PLAYER, actorId: PLAYER, tag: 'massline_throw',
    appliedTick: 10,
    impactTick: 10 + WINDOW + 1,
    holdUntilTick: 10 + WINDOW,
  });
  assert.equal(stale.class, 'stale');
  assert.equal(stale.responsible, false);
  assert.match(stale.line, /stale/);

  const accidental = classifyImpactResponsibility({
    playerId: PLAYER, actorId: 'other-hull', tag: 'direct_contact',
    appliedTick: 10, impactTick: 12,
  });
  assert.equal(accidental.class, 'accidental');
  assert.equal(accidental.responsible, false);
  assert.match(accidental.line, /Not your cause/);
});

test('the law card speaks the class and keeps a charge only when the pilot is responsible', () => {
  const staleLine = collisionResponsibilityLine({
    cause: 'ship_collision',
    playerCaused: true,
    outcome: 'charged',
    kind: 'reckless_kill',
    sustainedAssault: false,
    impactLink: {
      playerId: PLAYER, actorId: PLAYER, tag: 'massline_throw',
      appliedTick: 0, impactTick: WINDOW + 5, holdUntilTick: null,
    },
  });
  assert.match(staleLine, /stale/);
  assert.doesNotMatch(staleLine, /Charged reckless/);

  const directLine = collisionResponsibilityLine({
    cause: 'terrain_collision',
    playerCaused: true,
    outcome: 'charged',
    kind: 'reckless_kill',
    sustainedAssault: false,
    impactLink: {
      playerId: PLAYER, actorId: PLAYER, tag: 'ram_plate',
      appliedTick: 10, impactTick: 12, holdUntilTick: null,
    },
  });
  assert.match(directLine, /Your hull hit them/);
  assert.match(directLine, /Charged reckless/);

  assert.equal(
    collisionResponsibilityLine({ cause: 'kinetic', playerCaused: true, outcome: 'charged' }),
    null,
  );
});

test('a held throw past the impulse window stays indirect on the live collision receipt', () => {
  const appliedTick = 10;
  const impactTick = appliedTick + WINDOW + 40;
  const holdUntilTick = appliedTick + WINDOW + 80;
  const thrown = {
    id: 3, type: 'asteroid', mass: 80,
    physicsBody: { mass: 80, material: 'rock' },
  };
  const victim = {
    id: 9, type: 'ship', mass: 20,
    physicsBody: { mass: 20, material: 'ship' },
  };
  const classifyReceipt = (receipt) => {
    const presentation = buildCollisionPresentationProvenance(victim, thrown, receipt);
    const kill = buildKillPresentationReceipt({ playerId: PLAYER }, victim, PLAYER, {
      origin: { kind: 'collision', id: 'terrain' },
      packet: { source: { kind: 'collision_terrain', collisionPresentation: presentation } },
    });
    return classifyImpactResponsibility(
      impactLinkFromPresentation(kill, { impactTick, playerId: PLAYER }),
    );
  };
  try {
    const recorded = recordImpulseProvenance(thrown, {
      actorId: PLAYER, tag: 'massline_throw', appliedTick, magnitude: 80,
    });
    assert.equal(recorded.holdUntilTick, undefined);
    const held = holdImpulseProvenance(thrown, holdUntilTick, appliedTick, appliedTick);
    assert.equal(held.holdUntilTick, holdUntilTick);
    const causal = contactImpulseProvenance(victim, thrown, impactTick);
    assert.equal(causal && causal.tag, 'massline_throw');
    assert.equal(causal.holdUntilTick, holdUntilTick);
    const receipt = resolveCollisionConsequence({
      target: victim,
      other: thrown,
      exchangedMomentum: 4000,
      tick: impactTick,
      pos: { x: 1, z: 2 },
      normal: { x: 1, z: 0 },
      provenance: causal,
    });
    assert.equal(receipt.provenance.tag, 'massline_throw');
    assert.equal(receipt.provenance.holdUntilTick, holdUntilTick);
    assert.equal(classifyReceipt(receipt).class, 'indirect');

    const lapsed = resolveCollisionConsequence({
      target: victim,
      other: thrown,
      exchangedMomentum: 4000,
      tick: impactTick,
      pos: { x: 1, z: 2 },
      normal: { x: 1, z: 0 },
      provenance: {
        actorId: PLAYER, tag: 'massline_throw', appliedTick, holdUntilTick: null,
      },
    });
    assert.equal(lapsed.provenance.holdUntilTick, undefined);
    assert.equal(classifyReceipt(lapsed).class, 'stale');
  } finally {
    clearImpulseProvenance(thrown);
    clearImpulseProvenance(victim);
  }
});

test('a collision kill receipt carries the cause the card classifies', () => {
  const provenance = buildCollisionPresentationProvenance(
    { vel: { x: 4, z: 0 } },
    { id: 'rock', vel: { x: 0, z: 0 } },
    {
      pos: { x: 1, z: 2 },
      normal: { x: 1, z: 0 },
      surface: 'craft',
      deltaV: 9,
      exchangedMomentum: 30,
      impactDamage: 4,
      provenance: {
        actorId: PLAYER, tag: 'massline_throw', appliedTick: 40, holdUntilTick: 400,
      },
    },
  );
  assert.equal(provenance.provenance.tag, 'massline_throw');
  assert.equal(provenance.provenance.holdUntilTick, 400);

  const state = { playerId: PLAYER };
  const target = { id: 9, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const receipt = buildKillPresentationReceipt(state, target, PLAYER, {
    origin: { kind: 'collision', id: 'craft' },
    packet: { source: { kind: 'collision_craft', collisionPresentation: provenance } },
  });
  assert.equal(receipt.impactLink.tag, 'massline_throw');
  assert.equal(receipt.impactLink.actorId, PLAYER);
  assert.equal(Object.isFrozen(receipt.impactLink), true);
  const link = impactLinkFromPresentation(receipt, { impactTick: 50, playerId: PLAYER });
  assert.equal(classifyImpactResponsibility(link).class, 'indirect');
});

test('a live law adjudication puts that class on the card', () => {
  const sim = createSimulation({ seed: 4242, systems: [lawSecurity] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  state.world.sectors = {
    sector_tethys_junction: { id: 'sector_tethys_junction', factionId: 'faction_scn', security: 0.9, tier: 0 },
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const victim = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free',
    pos: { x: 80, z: 0 }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: 'hauler', ai: { archetype: 'fleeing_trader' } },
  });
  const emitted = [];
  bus.on('law:killedAdjudicated', (payload) => emitted.push(payload));
  const tick = state.tick | 0;
  bus.emit('entity:killed', {
    id: victim.id,
    killerId: state.playerId,
    type: 'ship',
    pos: { x: victim.pos.x, z: victim.pos.z },
    victimClass: 'hauler',
    factionId: 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    presentation: {
      cause: 'ship_collision',
      playerCaused: true,
      surface: 'craft',
      impactLink: {
        actorId: state.playerId,
        tag: 'massline_throw',
        appliedTick: tick,
        holdUntilTick: tick + 90,
      },
    },
  });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].impactLink.tag, 'massline_throw');
  assert.equal(emitted[0].impactLink.playerId, state.playerId);
  assert.match(collisionResponsibilityLine(emitted[0]), /threw what hit them/);
  sim.dispose();
});
