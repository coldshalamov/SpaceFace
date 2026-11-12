import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindStuntEvidence,
  unbindStuntEvidence,
  observeConstraint,
  observeRelease,
  observeAppliedImpulse,
  observeContact,
  closeFieldIntervals,
  evidenceForConsequenceLive,
  bodyLife,
  EVIDENCE_REVISION
} from '../src/combat/stuntEvidence.js';
import {
  StuntDetector,
  classifyStuntEvidence,
  createStuntDetector
} from '../src/combat/stuntRecognition.js';

function createScene({ seed = 4242 } = {}) {
  const state = {
    playerId: 0,
    tick: 0,
    simTime: 0,
    entities: new Map(),
    meta: { seed }
  };
  const player = {
    id: 0,
    name: 'Player',
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    mass: 18,
    radius: 6,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel' }
  };
  const hostile = {
    id: 1,
    name: 'Pirate Alpha',
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 20, z: 0 },
    vel: { x: 0, z: 100 },
    mass: 16,
    radius: 6,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel', ai: { huntPlayer: true } }
  };
  const target = {
    id: 2,
    name: 'Pirate Beta',
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 105, z: 105 },
    vel: { x: 0, z: 0 },
    mass: 16,
    radius: 6,
    hull: 10,
    hullMax: 100,
    data: { defId: 'ship_kestrel', ai: { huntPlayer: true } }
  };
  state.entities.set(0, player);
  state.entities.set(1, hostile);
  state.entities.set(2, target);
  bindStuntEvidence(state);
  return { state, player, hostile, target };
}

test('SFQ-B030: continuous three-verb scene (rope -> field -> impulse -> contact) detects slingshot_golf with one_two and full causeChain', () => {
  const { state, player, hostile, target } = createScene({ seed: 4242 });
  const detector = createStuntDetector({ playerId: player.id });

  // Verb 1: Rope constraint + release on hostile hull
  const attachment = {
    id: 'tether:1',
    ownerId: player.id,
    defId: 'tether_standard',
    owner: { entity: player },
    target: { entity: hostile },
    springState: { lastTension: 60 }
  };

  for (let t = 1; t <= 20; t++) {
    state.tick = t;
    state.simTime = t / 60;
    const angle = (t / 20) * (Math.PI / 2); // 0 -> 90 degrees sweep
    hostile.pos = { x: 20 * Math.cos(angle), z: 20 * Math.sin(angle) };
    observeConstraint(attachment, { x: 0, z: 100 }, { x: 10, z: 100 }, t, state);
  }
  observeRelease('tether:1', 20, 'tether_cut', state);

  // Verb 2: Hostile bends through player gravity well
  // At tick 20, hostile was at (0, 20), heading (0, 100).
  // Well is at (100, 50), radius 40. Unswung trajectory (x=0) misses well by > 1.25*(40+6).
  state.tick = 25;
  hostile.pos = { x: 80, z: 50 };
  const wellField = { id: 'field:well:1', ownerId: player.id, x: 100, z: 50, radius: 40 };
  observeAppliedImpulse(
    hostile,
    { x: 0, z: 100 },
    { x: 70, z: 70 },
    { actorId: player.id, field: wellField },
    25,
    'field',
    state
  );
  state.tick = 30;
  closeFieldIntervals(state, 30); // observeFieldExit

  // Verb 3: Bomb/concussion blast punches hostile into new trajectory heading towards target
  // Turns trajectory by 60 degrees (from 45 deg to -15 deg), deltaV = 136 >= 0.2*cruise
  state.tick = 45;
  hostile.pos = { x: 50, z: 80 };
  observeAppliedImpulse(
    hostile,
    { x: 70, z: 70 },
    { x: 150, z: -40 },
    { actorId: player.id, weaponId: 'wpn_concussion_cannon_m' },
    45,
    'impulse',
    state
  );

  // Lethal contact with hostile target at (200, -40)
  state.tick = 55;
  hostile.pos = { x: 195, z: -40 };
  target.pos = { x: 200, z: -40 };
  const contactData = {
    beforeA: { x: 150, z: -40 },
    beforeB: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: 150,
    positionA: { ...hostile.pos },
    positionB: { ...target.pos }
  };
  observeContact(hostile, target, contactData, state);

  const evidence = evidenceForConsequenceLive(
    { tick: 55, targetId: target.id, otherId: hostile.id, surface: 'craft' },
    state
  );
  assert.ok(evidence, 'evidence must be found for lethal contact');

  const receipt = {
    tick: 55,
    targetId: target.id,
    targetName: target.name,
    targetHostile: true,
    damageApplied: true,
    targetKilled: true,
    hullDamage: 100,
    targetHullMax: 100,
    helmLossSeconds: 0,
    surface: 'craft',
    otherMass: 16,
    victimLife: { lifeId: bodyLife(target, state).id, threatClass: 'fodder', dead: true },
    stuntEvidence: evidence
  };

  const detected = detector.processEvent('combat:collisionConsequence', receipt);
  assert.equal(detected.length, 1, 'one trick should be recognized');
  const trick = detected[0];

  // Assert primary trick is slingshot_golf with one_two in factualTags
  assert.equal(trick.trickId, 'slingshot_golf');
  assert.ok(trick.factualTags.includes('one_two'), 'factualTags must contain one_two');

  assert.equal(trick.episodeId, evidence.previousRoot.id, 'episodeId must key to initial chained root');
  assert.equal(trick.rootTick, evidence.previousRoot.tick, 'rootTick must match chained root tick');

  // Assert complete causeChain contains all 5 physical sequence verbs in order with steps 1..5
  const causeTypes = trick.causeChain.map(n => n.type);
  assert.deepEqual(
    causeTypes,
    ['constraint', 'release', 'field_exit', 'impulse', 'contact'],
    'causeChain must carry complete rope -> release -> field_exit -> impulse -> contact sequence'
  );
  assert.deepEqual(
    trick.causeChain.map(n => n.step),
    [1, 2, 3, 4, 5],
    'causeChain steps must be numbered 1..5'
  );

  unbindStuntEvidence(state);
});

test('SFQ-B030 negative branch: non-material consequence or non-hostile target names nothing', () => {
  const { state, player, hostile, target } = createScene({ seed: 4242 });
  const detector = createStuntDetector({ playerId: player.id });

  const attachment = {
    id: 'tether:nm',
    ownerId: player.id,
    defId: 'tether_standard',
    owner: { entity: player },
    target: { entity: hostile },
    springState: { lastTension: 60 }
  };

  for (let t = 1; t <= 20; t++) {
    state.tick = t;
    state.simTime = t / 60;
    const angle = (t / 20) * (Math.PI / 2);
    hostile.pos = { x: 20 * Math.cos(angle), z: 20 * Math.sin(angle) };
    observeConstraint(attachment, { x: 0, z: 100 }, { x: 10, z: 100 }, t, state);
  }
  observeRelease('tether:nm', 20, 'tether_cut', state);

  state.tick = 25;
  hostile.pos = { x: 80, z: 50 };
  const wellField = { id: 'field:well:nm', ownerId: player.id, x: 100, z: 50, radius: 40 };
  observeAppliedImpulse(hostile, { x: 0, z: 100 }, { x: 70, z: 70 }, { actorId: player.id, field: wellField }, 25, 'field', state);
  state.tick = 30;
  closeFieldIntervals(state, 30);

  state.tick = 45;
  hostile.pos = { x: 50, z: 80 };
  observeAppliedImpulse(hostile, { x: 70, z: 70 }, { x: 150, z: -40 }, { actorId: player.id, weaponId: 'wpn_concussion_cannon_m' }, 45, 'impulse', state);

  state.tick = 55;
  hostile.pos = { x: 195, z: -40 };
  target.pos = { x: 200, z: -40 };
  const contactData = {
    beforeA: { x: 150, z: -40 },
    beforeB: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: 150,
    positionA: { ...hostile.pos },
    positionB: { ...target.pos }
  };
  observeContact(hostile, target, contactData, state);

  const evidence = evidenceForConsequenceLive({ tick: 55, targetId: target.id, otherId: hostile.id, surface: 'craft' }, state);
  // Target survived with minimal damage (not material)
  const nonMaterialReceipt = {
    tick: 55,
    targetId: target.id,
    targetName: target.name,
    targetHostile: true,
    damageApplied: true,
    targetKilled: false,
    hullDamage: 5,
    targetHullMax: 100,
    helmLossSeconds: 0,
    surface: 'craft',
    otherMass: 16,
    victimLife: { lifeId: bodyLife(target, state).id, threatClass: 'fodder', dead: false },
    stuntEvidence: evidence
  };

  assert.deepEqual(classifyStuntEvidence(nonMaterialReceipt), []);
  assert.deepEqual(detector.processEvent('combat:collisionConsequence', nonMaterialReceipt), []);

  unbindStuntEvidence(state);
});

test('SFQ-B030 negative branch: timing gap exceeding window severs the three-verb chain', () => {
  const { state, player, hostile, target } = createScene({ seed: 4242 });
  const detector = createStuntDetector({ playerId: player.id });

  const attachment = {
    id: 'tether:2',
    ownerId: player.id,
    defId: 'tether_standard',
    owner: { entity: player },
    target: { entity: hostile },
    springState: { lastTension: 60 }
  };

  for (let t = 1; t <= 20; t++) {
    state.tick = t;
    state.simTime = t / 60;
    const angle = (t / 20) * (Math.PI / 2);
    hostile.pos = { x: 20 * Math.cos(angle), z: 20 * Math.sin(angle) };
    observeConstraint(attachment, { x: 0, z: 100 }, { x: 10, z: 100 }, t, state);
  }
  observeRelease('tether:2', 20, 'tether_cut', state);

  state.tick = 25;
  const wellField = { id: 'field:well:2', ownerId: player.id, x: 100, z: 100, radius: 40 };
  observeAppliedImpulse(hostile, { x: 0, z: 100 }, { x: 75, z: 66 }, { actorId: player.id, field: wellField }, 25, 'field', state);
  state.tick = 30;
  closeFieldIntervals(state, 30);

  // Impulse happens > 120 ticks after rope root (at tick 200, gap = 199 > 120)
  state.tick = 200;
  observeAppliedImpulse(hostile, { x: 75, z: 66 }, { x: 140, z: 140 }, { actorId: player.id, weaponId: 'wpn_concussion_cannon_m' }, 200, 'impulse', state);

  state.tick = 210;
  hostile.pos = { x: 100, z: 100 };
  target.pos = { x: 105, z: 105 };
  const contactData = {
    beforeA: { x: 140, z: 140 },
    beforeB: { x: 0, z: 0 },
    normal: { x: 0.707, z: 0.707 },
    preSolveClosingSpeed: 198,
    positionA: { ...hostile.pos },
    positionB: { ...target.pos }
  };
  observeContact(hostile, target, contactData, state);

  const evidence = evidenceForConsequenceLive({ tick: 210, targetId: target.id, otherId: hostile.id, surface: 'craft' }, state);
  const receipt = {
    tick: 210,
    targetId: target.id,
    targetName: target.name,
    targetHostile: true,
    damageApplied: true,
    targetKilled: true,
    hullDamage: 100,
    targetHullMax: 100,
    helmLossSeconds: 0,
    surface: 'craft',
    otherMass: 16,
    victimLife: { lifeId: bodyLife(target, state).id, threatClass: 'fodder', dead: true },
    stuntEvidence: evidence
  };

  const detected = detector.processEvent('combat:collisionConsequence', receipt);
  // With severed chain timing, slingshot_golf must NOT be recognized
  for (const trick of detected) {
    assert.notEqual(trick.trickId, 'slingshot_golf', 'severed chain should not qualify slingshot_golf');
  }

  unbindStuntEvidence(state);
});

test('SFQ-B030 negative branch: different source life does not chain separate entities', () => {
  const { state, player, hostile, target } = createScene({ seed: 4242 });
  const detector = createStuntDetector({ playerId: player.id });

  const hostile2 = {
    id: 3,
    name: 'Pirate Gamma',
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 50, z: 50 },
    vel: { x: 50, z: 50 },
    mass: 16,
    radius: 6,
    hull: 100,
    hullMax: 100,
    data: { defId: 'ship_kestrel', ai: { huntPlayer: true } }
  };
  state.entities.set(3, hostile2);

  const attachment = {
    id: 'tether:3',
    ownerId: player.id,
    defId: 'tether_standard',
    owner: { entity: player },
    target: { entity: hostile },
    springState: { lastTension: 60 }
  };

  for (let t = 1; t <= 20; t++) {
    state.tick = t;
    state.simTime = t / 60;
    const angle = (t / 20) * (Math.PI / 2);
    hostile.pos = { x: 20 * Math.cos(angle), z: 20 * Math.sin(angle) };
    observeConstraint(attachment, { x: 0, z: 100 }, { x: 10, z: 100 }, t, state);
  }
  observeRelease('tether:3', 20, 'tether_cut', state);

  state.tick = 25;
  const wellField = { id: 'field:well:3', ownerId: player.id, x: 100, z: 100, radius: 40 };
  observeAppliedImpulse(hostile, { x: 0, z: 100 }, { x: 75, z: 66 }, { actorId: player.id, field: wellField }, 25, 'field', state);
  state.tick = 30;
  closeFieldIntervals(state, 30);

  // Impulse is applied to hostile2 (different entity!), not hostile
  state.tick = 45;
  observeAppliedImpulse(hostile2, { x: 75, z: 66 }, { x: 140, z: 140 }, { actorId: player.id, weaponId: 'wpn_concussion_cannon_m' }, 45, 'impulse', state);

  state.tick = 55;
  hostile2.pos = { x: 100, z: 100 };
  target.pos = { x: 105, z: 105 };
  const contactData = {
    beforeA: { x: 140, z: 140 },
    beforeB: { x: 0, z: 0 },
    normal: { x: 0.707, z: 0.707 },
    preSolveClosingSpeed: 198,
    positionA: { ...hostile2.pos },
    positionB: { ...target.pos }
  };
  observeContact(hostile2, target, contactData, state);

  const evidence = evidenceForConsequenceLive({ tick: 55, targetId: target.id, otherId: hostile2.id, surface: 'craft' }, state);
  const receipt = {
    tick: 55,
    targetId: target.id,
    targetName: target.name,
    targetHostile: true,
    damageApplied: true,
    targetKilled: true,
    hullDamage: 100,
    targetHullMax: 100,
    helmLossSeconds: 0,
    surface: 'craft',
    otherMass: 16,
    victimLife: { lifeId: bodyLife(target, state).id, threatClass: 'fodder', dead: true },
    stuntEvidence: evidence
  };

  const detected = detector.processEvent('combat:collisionConsequence', receipt);
  for (const trick of detected) {
    assert.notEqual(trick.trickId, 'slingshot_golf', 'different source life should not produce slingshot_golf');
  }

  unbindStuntEvidence(state);
});
