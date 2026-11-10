import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WINCH_BRACE,
  createAttachmentService,
  resolveWinchBrace,
} from '../src/combat/attachments.js';
import { deliverPhysicalImpulseDetailed } from '../src/combat/physicalEffects.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import {
  consumePhysicsCommand,
  hasPendingAnchoredPhysicsImpulse,
  queuePhysicsImpulse,
  writePhysicsControl,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { WEAPONS } from '../src/data/weapons.js';

// RW-01 winch brace (build_map §30.1). The emergent mass driver's slug momentum
// (EMERGENT_TUNING slugMass 9 x slugSpeed 340) is the authored volley scale.
const DT = 1 / 60;
const SLUG_RECOIL = 9 * 340;
const SIEGE_LANCE = WEAPONS.find((def) => def.id === 'wpn_siege_lance_l');
const HEAVY_BEAM = WEAPONS.find((def) => def.id === 'wpn_heavy_beam_l');
const LIGHTHOUSE_BEAM = WEAPONS.find((def) => def.id === 'unique_lighthouse_heavy_beam');

function harness({ anchorMass = 2000, restLength = 300, anchorX = -300 } = {}) {
  const player = makeShip(1, 0, 0, 90);
  const rock = makeRock(2, anchorX, 0, anchorMass);
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    tick: 100,
    simTime: 100 * DT,
    playerId: player.id,
    entities,
    entityList: [...entities.values()],
    runtime: { features: { massline2: { enabled: true } } },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = {
    createAttachment() { return { id: 'joint-brace' }; },
    cutAttachment() { return true; },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0 }; },
    setAttachmentReel() { return true; },
  };
  const events = [];
  const bus = { emit(type, payload) { events.push({ type, payload }); } };
  const service = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const created = service.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: anchorX, z: 0 },
  });
  assert.equal(created.ok, true, `harness line must create: ${created.reason || ''}`);
  // The service derives restLength from the authored endpoint pair; pin the requested separation
  // explicitly so the taut/slack geometry under test is stated, not implied.
  const attachment = service.get(created.attachment.id);
  attachment.restLength = restLength;
  return { state, player, rock, service, attachment, events };
}

function makeShip(id, x, z, mass) {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
    physicsBody: { schemaVersion: 1, radius: 4, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
  };
}

function makeRock(id, x, z, mass) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 12,
    mass,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass, inertiaY: 400, dynamic: mass < 1800, ccd: false, revision: 0 },
  };
}

function slugRecoil(state, entity) {
  return deliverPhysicalImpulseDetailed(state, entity, { x: -SLUG_RECOIL, z: 0 },
    { tag: 'mass_driver_recoil', motionIntent: 'player_maneuver', tick: state.tick },
    { scaleEnvironment: false });
}

test('a taut line to a massive anchor routes along-line recoil into load, not hull velocity', () => {
  const h = harness();
  const brace = resolveWinchBrace(h.state, h.player.id);
  assert.ok(brace, 'a line taut to a 2000-mass rock resolves as a brace');
  assert.ok(Math.abs(brace.axisX + 1) < 1e-9, 'the line axis points hull -> anchor');

  const result = slugRecoil(h.state, h.player);
  assert.equal(result.accepted, false, 'a pure along-line recoil leaves nothing to apply to the hull');
  assert.equal(result.deltaV, 0);

  const expectedLoad = SLUG_RECOIL * WINCH_BRACE.loadPerImpulse;
  assert.ok(Math.abs(h.attachment.braceLoadN - expectedLoad) < 1e-6,
    `brace load must be the authored gain over the routed impulse; got ${h.attachment.braceLoadN}, want ${expectedLoad}`);

  const anchorCommand = consumePhysicsCommand(h.rock);
  assert.ok(anchorCommand && anchorCommand.impulses.length === 1,
    'the routed momentum is transferred to the anchor, never deleted');
  assert.ok(Math.abs(anchorCommand.impulses[0].x + SLUG_RECOIL) < 1e-6);
  assert.ok(Math.abs(anchorCommand.impulses[0].z) < 1e-6);
});

test('a slack line, a light anchor, and no line at all never brace', () => {
  // Slack: the hull sits well inside its rest length.
  const slack = harness({ restLength: 500 });
  assert.equal(resolveWinchBrace(slack.state, slack.player.id), null);
  const slackResult = slugRecoil(slack.state, slack.player);
  assert.equal(slackResult.accepted, true);
  assert.ok(Math.abs(slackResult.deltaV - SLUG_RECOIL / 90) < 1e-9,
    'an unbraced hull takes the full recoil as velocity');
  assert.equal(slack.attachment.braceLoadN, 0);

  // Light anchor: taut, but 500 mass does not hold a siege.
  const light = harness({ anchorMass: 500 });
  assert.equal(resolveWinchBrace(light.state, light.player.id), null);
  const lightResult = slugRecoil(light.state, light.player);
  assert.ok(Math.abs(lightResult.deltaV - SLUG_RECOIL / 90) < 1e-9);
  assert.equal(light.attachment.braceLoadN, 0);
});

test('perpendicular recoil still shoves the braced hull — the brace routes, it never deletes', () => {
  const h = harness();
  const result = deliverPhysicalImpulseDetailed(h.state, h.player, { x: 0, z: -1200 },
    { tag: 'weapon_recoil', motionIntent: 'player_maneuver', tick: h.state.tick },
    { scaleEnvironment: false });
  assert.equal(result.accepted, true);
  assert.ok(Math.abs(result.deltaV - 1200 / 90) < 1e-9,
    'the component across the line still reaches the hull at full strength');
  assert.equal(h.attachment.braceLoadN, 0, 'a perpendicular impulse loads nothing');
  const anchorCommand = consumePhysicsCommand(h.rock);
  assert.ok(!anchorCommand || anchorCommand.impulses.length === 0);
});

test('brace load follows the ordered warning -> lease -> snap contract, then ordinary recoil returns', () => {
  const h = harness();
  h.attachment.braceLoadN = WINCH_BRACE.snapLoad * 0.8;
  h.service.updateTelemetryAndBreak();

  const warning = h.events.find((e) => e.type === 'tether:nearBreak');
  assert.ok(warning, 'crossing 75% of the authored snap ceiling raises the near-break receipt');
  assert.equal(warning.payload.brace, true);
  assert.ok(Math.abs(warning.payload.ratio - 0.8) < 1e-9);
  assert.equal(h.attachment.nearBreakWarned, true);
  assert.equal(h.attachment.breakWarningUntilTick, h.state.tick + 15,
    'the pilot keeps the same 15-tick counterplay window as every other overload');
  assert.equal(h.attachment.state, 'active', 'the warned line is still recoverable');

  h.attachment.braceLoadN = WINCH_BRACE.snapLoad * 1.05;
  h.state.tick += 16;
  h.service.updateTelemetryAndBreak();
  assert.equal(h.attachment.state, 'broken');
  assert.equal(h.attachment.breakReason, 'brace_overload');
  assert.ok(h.events.some((e) => e.type === 'tether:broken'));

  // The line is gone: unlocking the reel is not even needed — ordinary recoil is restored.
  const after = slugRecoil(h.state, h.player);
  assert.ok(Math.abs(after.deltaV - SLUG_RECOIL / 90) < 1e-9,
    'a snapped brace returns the hull to ordinary full recoil');
});

test('a released line cools: brace load decays on the tick and re-arms the warning', () => {
  const h = harness();
  h.attachment.braceLoadN = 5000;
  h.service.updateTelemetryAndBreak();
  assert.ok(Math.abs(h.attachment.braceLoadN - 5000 * WINCH_BRACE.decayPerTick) < 1e-6,
    'stored load bleeds at the authored per-tick decay');
  assert.ok(!h.events.some((e) => e.type === 'tether:nearBreak'), 'a cool line raises no alarm');

  h.attachment.nearBreakWarned = true;
  for (let i = 0; i < 3000; i += 1) {
    h.state.tick += 1;
    h.service.updateTelemetryAndBreak();
  }
  assert.equal(h.attachment.braceLoadN, 0, 'an unloaded line returns to cold');
  assert.equal(h.attachment.nearBreakWarned, false, 'the warning re-arms after cooling');
});

test('the brace stances are authored on the siege-class catalog, not invented per test', () => {
  assert.equal(SIEGE_LANCE.recoilImpulse, 340, 'one spinal shot, one real shove');
  assert.equal(HEAVY_BEAM.recoilImpulsePerSec, 2000, 'a sustained siege beam pushes its shooter');
  assert.equal(LIGHTHOUSE_BEAM.recoilImpulsePerSec, 2500, 'the unique variant escalates, it does not skip the law');
});

test('a braced light hull holds its aim through a volley that shoves the unbraced hull off', async () => {
  const DT_LOCAL = DT;
  const makeHull = () => makeShip('brace-proof-hull', 0, 0, 90);
  const makeAnchor = () => {
    const rock = makeRock('brace-proof-anchor', -300, 0, 4000);
    rock.physicsBody.dynamic = true;
    return rock;
  };

  // Unbraced baseline: the same volley the game delivers to an unbraced hull.
  const looseHull = makeHull();
  const looseAnchor = makeAnchor();
  const loose = await createSg02DynamicBodyOwner({ fixedDt: DT_LOCAL, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    loose.syncFromEntities([looseHull, looseAnchor]);
    queuePhysicsImpulse(looseHull, { x: -SLUG_RECOIL, z: 0 },
      { tag: 'mass_driver_recoil', motionIntent: 'player_maneuver', tick: 0 });
    for (let tick = 0; tick < 60; tick += 1) {
      writePhysicsControl(looseHull, idleControl());
      loose.step(DT_LOCAL);
    }
  } finally {
    loose.dispose();
  }
  const unbracedDrift = Math.abs(looseHull.pos.x);
  assert.ok(unbracedDrift > 25,
    `one unbraced slug must shove a 90-mass hull measurably off aim; got ${unbracedDrift.toFixed(2)} WU`);

  // Braced: the same impulse the routing hands to the anchor instead of the hull.
  const bracedHull = makeHull();
  const bracedAnchor = makeAnchor();
  const braced = await createSg02DynamicBodyOwner({ fixedDt: DT_LOCAL, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    braced.syncFromEntities([bracedHull, bracedAnchor]);
    braced.createAttachment({
      attachmentId: 'brace-proof-line',
      defId: 'tether_standard',
      ownerId: bracedHull.id,
      targetId: bracedAnchor.id,
      sourceWorld: bracedHull.pos,
      targetWorld: bracedAnchor.pos,
      restLength: 300,
      tick: 0,
    });
    queuePhysicsImpulse(bracedAnchor, { x: -SLUG_RECOIL, z: 0 },
      { tag: 'winch_brace_transfer', externalEffect: true, tick: 0 });
    for (let tick = 0; tick < 60; tick += 1) {
      writePhysicsControl(bracedHull, idleControl());
      braced.step(DT_LOCAL);
    }
  } finally {
    braced.dispose();
  }
  const bracedDrift = Math.hypot(bracedHull.pos.x, bracedHull.pos.z);
  const bracedSpeed = Math.hypot(bracedHull.vel.x, bracedHull.vel.z);
  assert.ok(bracedDrift < 2,
    `a braced hull holds its aim point through the same volley; got ${bracedDrift.toFixed(3)} WU of drift`);
  assert.ok(bracedSpeed < 2, `the braced hull stays on station; got ${bracedSpeed.toFixed(3)} WU/s`);
  const anchorRecoil = Math.abs(bracedAnchor.pos.x + 300);
  assert.ok(anchorRecoil > 0.1,
    `the routed volley's momentum reaches the anchor as real recoil; got ${anchorRecoil.toFixed(3)} WU`);
});

function idleControl(maxSpeed = 260) {
  return {
    source: 'winch-brace-proof',
    mode: 'newtonian',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    maxSpeed,
  };
}
