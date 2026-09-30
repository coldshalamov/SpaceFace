// PB-TAC-A (SF-046 + SF-052) — the tether cutter commits to geometry, and the paired
// specialist pressure alternates instead of overlapping.
//
// Before this row the cut_line verb was a proximity aura: whenever the doctrine was inside its
// attach window and the blade within cutRangeWu of the PLAYER, the player's line broke — no
// commitment, no geometry, nothing an angle change could beat. These tests pin the committed
// pass: snapshot at the spool telegraph, real segment contact at landing, angle-change beat
// into a vulnerable recovery, cancellation without penalty, and the cutter/disruptor offset.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SPECIALIST_PLANS, specialistPlanByEnemyId } from '../src/ai/specialistPlans.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import { fields } from '../src/systems/fields.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

function callCut(state, specialist, phase, tick, attachments) {
  return applySpecialistCounterplay({
    state,
    specialist,
    enemyId: 'tether_control_raider',
    doctrinePhase: phase,
    tick,
    attachments,
    fields: null,
  });
}

function lineState(id, attachments) {
  return attachments.get(id).state;
}

test('PB-TAC-A cutter commits at the spool telegraph and lands inside the attach window', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);

  const duringCue = callCut(h.state, raider, 'spool_cue', 30, h.attachments);
  assert.equal(duringCue, null, 'the cut never lands on the telegraph itself');
  assert.ok(raider.data._cutterCommit, 'the telegraphed commitment exists');
  assert.equal(lineState(h.line.id, h.attachments), 'active');

  const landing = callCut(h.state, raider, 'attach_window', 31, h.attachments);
  assert.equal(landing && landing.verb, 'cut_line');
  assert.ok(Number.isFinite(landing.segmentDistance), 'the landing reports real segment contact');
  assert.equal(lineState(h.line.id, h.attachments), 'broken');
  assert.equal(h.attachments.get(h.line.id).breakReason, 'specialist_cut');
  assert.equal(raider.data._cutterCommit, undefined, 'a landed pass clears its commit');

  const repeat = callCut(h.state, raider, 'attach_window', 33, h.attachments);
  assert.equal(repeat, null, 'repeated invocation inside the cooldown does not double-cut');
});

test('PB-TAC-A the cut never lands on the telegraph itself, even with fresh geometry', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);

  assert.equal(callCut(h.state, raider, 'spool_cue', 30, h.attachments), null);
  assert.ok(raider.data._cutterCommit);
  // The player holds the rope exactly as committed — the blade still may not cut until its
  // attach window opens: the telegraph must be seeable before the verb lands.
  assert.equal(callCut(h.state, raider, 'spool_cue', 32, h.attachments), null);
  assert.equal(lineState(h.line.id, h.attachments), 'active');

  const landing = callCut(h.state, raider, 'attach_window', 34, h.attachments);
  assert.equal(landing && landing.verb, 'cut_line');
  assert.equal(lineState(h.line.id, h.attachments), 'broken');
});

test('PB-TAC-A swinging the line angle beats the committed pass into a vulnerable recovery', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);

  assert.equal(callCut(h.state, raider, 'spool_cue', 30, h.attachments), null);
  assert.ok(raider.data._cutterCommit, 'pass committed on the telegraph');

  // The counter: sweep the rope's bearing around its anchor (player hauls to the far side).
  h.player.pos.z = -200;

  assert.equal(callCut(h.state, raider, 'attach_window', 31, h.attachments), null);
  assert.equal(lineState(h.line.id, h.attachments), 'active',
    'the angle change defeats the cut — under the old proximity aura this line was already broken');
  assert.equal(raider.data._cutterCommit, undefined, 'the beaten pass loses its commit');
  assert.ok(raider.data._cutterRecoverUntil > 31, 'the miss buys the player a recovery window');

  // Even back on the committed geometry, the blade is locked out while recovering.
  h.player.pos.z = 0;
  assert.equal(callCut(h.state, raider, 'attach_window', 33, h.attachments), null);
  assert.equal(lineState(h.line.id, h.attachments), 'active', 'recovery holds the blade out');

  // After the recovery expires the blade may commit again.
  const afterRecovery = callCut(h.state, raider, 'spool_cue', raider.data._cutterRecoverUntil + 1, h.attachments);
  assert.equal(afterRecovery, null);
  assert.ok(raider.data._cutterCommit, 'a fresh pass may be committed after the recovery');
});

test('PB-TAC-A dropping the rope mid-pass cancels the commit without a recovery penalty', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);

  assert.equal(callCut(h.state, raider, 'spool_cue', 30, h.attachments), null);
  assert.ok(raider.data._cutterCommit);

  // The player releases the rope themselves — a cost already paid, so no recovery penalty.
  const released = h.attachments.cut(h.line.id, h.player.id, 'tether_cut');
  assert.equal(released.ok, true, released && released.reason);

  assert.equal(callCut(h.state, raider, 'attach_window', 31, h.attachments), null);
  assert.equal(raider.data._cutterCommit, undefined, 'the pass cancels when the rope is gone');
  assert.equal(raider.data._cutterRecoverUntil, undefined, 'cancellation is not a miss');

  // A new rope is committed normally — nothing was poisoned by the cancelled pass.
  const second = h.attachments.create({
    defId: 'tether_standard',
    ownerId: h.player.id,
    targetId: h.rock.id,
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: 120, z: 0 },
  });
  assert.equal(second.ok, true, second.reason || 'second line must exist');
  h.state.tick = 33;

  assert.equal(callCut(h.state, raider, 'spool_cue', 34, h.attachments), null);
  const landing = callCut(h.state, raider, 'attach_window', 35, h.attachments);
  assert.equal(landing && landing.verb, 'cut_line', 'the fresh pass lands on the new rope');
  assert.equal(lineState(second.attachment.id, h.attachments), 'broken');
});

test('PB-TAC-A a pass that expires without contact is a miss, not a silent reset', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 320, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);

  // In envelope at commitment? No — the nearest rope point is the anchor (120,0), 200 wu away,
  // beyond the authored 180 wu cut reach, so no pass is committed at all from here.
  assert.equal(callCut(h.state, raider, 'spool_cue', 30, h.attachments), null);
  assert.equal(raider.data._cutterCommit, undefined, 'no commitment to a rope it cannot reach');

  // From inside the envelope, a pass that never lands expires into recovery.
  raider.pos = { x: 40, z: 0 };
  assert.equal(callCut(h.state, raider, 'spool_cue', 31, h.attachments), null);
  assert.ok(raider.data._cutterCommit);
  assert.equal(callCut(h.state, raider, 'escape', 90, h.attachments), null,
    'the doctrine left the window without a landing');
  assert.equal(raider.data._cutterCommit, undefined, 'the expired pass resolves');
  assert.ok(raider.data._cutterRecoverUntil > 90, 'the expiry carries the recovery');
  assert.equal(lineState(h.line.id, h.attachments), 'active', 'no landing means no cut');
});

test('PB-TAC-A SF-052 cutter and ghost alternate: no overlapping commits, breather after each', () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: 35901, bus: createBus(), systems: [fields] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      rot: 0, radius: 12, hull: 200, hullMax: 200, flags: {}, data: {},
    });
    state.playerId = player.id;
    const fieldsSys = sim.registry.get('fields');
    state.input.aimWorld = { x: 220, z: 0 };
    state.input.actions.deployWell = true;
    sim.step();
    assert.ok(fieldsSys._kernel.size >= 1, 'player well is parked');

    ensureCombatState(state);
    const attachments = createAttachmentService({
      state,
      catalog: createCombatCatalog(),
      helpers: { combatPhysics: { createAttachment: () => ({ id: 'joint:x' }), cutAttachment: () => true } },
      bus: createBus(),
    });
    const rock = { id: 'rock', type: 'asteroid', alive: true, pos: { x: 120, z: 0 }, vel: { x: 0, z: 0 } };
    state.entities.set(rock.id, rock);
    const line = attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: rock.id,
      sourceWorld: { x: 0, z: 0 },
      targetWorld: { x: 120, z: 0 },
    });
    assert.equal(line.ok, true, line.reason || 'line must exist');
    player.data = player.data || {};
    player.data.derived = player.data.derived || {};

    const raider = { id: 'raider', alive: true, pos: { x: 40, z: 0 }, data: { lootTableId: 'tether_control_raider' } };
    const ghost = { id: 'ghost', alive: true, pos: { x: 40, z: 0 }, data: { lootTableId: 'quiet_ghost' } };
    state.entities.set(raider.id, raider);
    state.entities.set(ghost.id, ghost);

    // 1. The cutter commits on its telegraph — the ghost's fire window defers while the pass
    // is committed, even though the well is squarely in disrupt range.
    assert.equal(callCut(state, raider, 'spool_cue', 10, attachments), null);
    assert.ok(raider.data._cutterCommit, 'cutter pass committed');
    const ghostDeferred = applySpecialistCounterplay({
      state, specialist: ghost, enemyId: 'quiet_ghost',
      doctrinePhase: 'fire_window', tick: 12, attachments, fields: fieldsSys,
    });
    assert.equal(ghostDeferred, null, 'the ghost holds while the cutter pass is committed');
    assert.ok(fieldsSys._kernel.size >= 1, 'the well survives the deferral');

    // 2. The cutter lands; its breather still holds the ghost out.
    const landing = callCut(state, raider, 'attach_window', 12, attachments);
    assert.equal(landing && landing.verb, 'cut_line', 'the committed pass lands');
    assert.equal(lineState(line.attachment.id, attachments), 'broken');
    const ghostHeld = applySpecialistCounterplay({
      state, specialist: ghost, enemyId: 'quiet_ghost',
      doctrinePhase: 'fire_window', tick: 14, attachments, fields: fieldsSys,
    });
    assert.equal(ghostHeld, null, 'the landed cut reserves its breather');
    assert.ok(fieldsSys._kernel.size >= 1);

    // 3. Once the breather expires the ghost commits its own pass (SF-047: acquire at the
    // charge telegraph, land after the working interval) and reserves its own breather.
    const ghostAcquires = applySpecialistCounterplay({
      state, specialist: ghost, enemyId: 'quiet_ghost',
      doctrinePhase: 'charge_cue', tick: 56, attachments, fields: fieldsSys,
    });
    assert.equal(ghostAcquires, null, 'the ghost acquires at its telegraph');
    const ghostFires = applySpecialistCounterplay({
      state, specialist: ghost, enemyId: 'quiet_ghost',
      doctrinePhase: 'fire_window', tick: 92, attachments, fields: fieldsSys,
    });
    assert.equal(ghostFires && ghostFires.verb, 'disrupt_field');
    assert.ok(ghostFires.count >= 1);
    assert.equal(fieldsSys._kernel.size, 0, 'the parked well is gone');

    // 4. Inside the ghost's breather a fresh cutter cannot even commit a pass.
    const secondRock = { id: 'rock2', type: 'asteroid', alive: true, pos: { x: -120, z: 0 }, vel: { x: 0, z: 0 } };
    state.entities.set(secondRock.id, secondRock);
    const line2 = attachments.create({
      defId: 'tether_standard',
      ownerId: player.id,
      targetId: secondRock.id,
      sourceWorld: { x: 0, z: 0 },
      targetWorld: { x: -120, z: 0 },
    });
    assert.equal(line2.ok, true, line2.reason || 'second line must exist');
    raider.data = { lootTableId: 'tether_control_raider' };

    assert.equal(callCut(state, raider, 'attach_window', 58, attachments), null,
      'the cutter defers inside the ghost breather');
    assert.equal(raider.data._cutterCommit, undefined, 'deferral is not a commitment');
    assert.equal(lineState(line2.attachment.id, attachments), 'active');

    // 5. After the breather (the ghost landed at 92, its lock runs to 152) the cutter commits
    // and lands again — the alternation holds.
    assert.equal(callCut(state, raider, 'attach_window', 153, attachments), null);
    assert.ok(raider.data._cutterCommit, 'committed once the ghost breather expired');
    const relanding = callCut(state, raider, 'attach_window', 155, attachments);
    assert.equal(relanding && relanding.verb, 'cut_line');
    assert.equal(lineState(line2.attachment.id, attachments), 'broken');
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});

test('PB-TAC-A the composed pincer encounter guarantees both specialists on separated bearings', () => {
  const pincer = ENCOUNTERS['tether_ghost_pincer'];
  assert.ok(pincer, 'the authored pincer encounter is registered');
  assert.equal(pincer.squad.anchorArchetype, 'tether_control_raider');
  assert.ok(pincer.squad.archetypes.includes('quiet_ghost'));
  assert.ok(pincer.squad.guaranteeArchetypes.includes('quiet_ghost'),
    'removing the ghost from the light pool draw cannot remove the ghost from the fight');
  assert.ok(pincer.squad.minSeparation >= 300,
    'the two specialists spawn apart — different readable bearings');
  assert.equal(pincer.engagementTrigger, 'player_signature_massline_use',
    'the fork springs while the rope is live: spend it or save it');
  assert.equal(specialistPlanByEnemyId('tether_control_raider').verb, 'cut_line');
  assert.equal(specialistPlanByEnemyId('quiet_ghost').verb, 'disrupt_field');
  assert.ok(SPECIALIST_PLANS.find((row) => row.id === 'tether_cutter').commitTicks > 0,
    'the committed-pass contract is plan data, not a hidden constant');
});

function liveLine() {
  const player = body('player', 'ship', 0, 0, { radius: 8, mass: 40 });
  const rock = body('rock', 'asteroid', 120, 0, { radius: 16, mass: 640 });
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    playerId: player.id,
    player: {},
    entities,
    entityList: [...entities.values()],
    runtime: { features: {} },
    world: { currentSectorId: 'test-sector' },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = {
    createAttachment(spec) { return { id: `joint:${spec.attachmentId}` }; },
    cutAttachment() { return true; },
  };
  const attachments = createAttachmentService({
    state,
    catalog,
    helpers: { combatPhysics: physics },
    bus: createBus(),
  });
  const created = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: 120, z: 0 },
  });
  assert.equal(created.ok, true, created.reason || 'line must exist');
  return { state, player, rock, line: created.attachment, attachments };
}

function body(id, type, x, z, extra = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    team: type === 'ship' ? 0 : null,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    data: {},
    ...extra,
  };
}
