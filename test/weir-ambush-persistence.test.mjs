// Focused production-owner integration. No renderer or ordinary-play acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

const SHAPE = 'cargo_weir_ambush';
const SECTOR = 'sector_tethys_junction';

function boot(t) {
  const sim = createSimulation({ seed: 3,
    systems: [ships, cargo, economy, factions, combat, missions, lawSecurity, encounterDirector, save], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  state.story.beatIndex = 7;
  state.meta.createdAt = '2026-11-04T00:00:00.000Z';
  state.world.currentSectorId = SECTOR;
  const shipOwner = sim.registry.get('ships');
  shipOwner.newGame();
  const player = sim.spawn(makeShipEntitySpec(state.player.ownedShips[0].defId, {
    isPlayer: true, player: state.player, fittings: state.player.ownedShips[0].fittings, pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  shipOwner.recomputeActiveShip();
  const events = [];
  for (const name of ['economy:grantCredits', 'faction:repDelta', 'encounter:voice',
    'encounter:resolved', 'law:reportIncidentReceipt', 'encounter:telegraph']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  return { sim, state, bus, events, director: sim.registry.get('encounterDirector'), saver: sim.registry.get('save') };
}

function fire(h) {
  h.director._planSector(SECTOR);
  const dir = h.state.encounterDirector;
  const row = dir.pending.find(item => item.shapeId === SHAPE);
  assert.ok(row, 'seed 3 naturally schedules the registered Weir at Tethys');
  dir.pending = [row];
  h.state.simTime = row.dueAt;
  h.director.player().pos = { ...row.zoneCenter };
  dir.pressure.combat = 100;
  dir.lastMeaningfulAt = -1e9;
  dir.lastEndAt = -1e9;
  dir.window = [];
  h.director._pump(dir, h.state, h.state.simTime);
  const live = dir.live[row.encounterId];
  assert.equal(live?.phase, 'approach');
  return live;
}

function tick(h, seconds = 0) {
  h.state.simTime += seconds;
  h.director._tickLive(h.state.encounterDirector, h.state, h.state.simTime);
}

function choose(h, live, branch) {
  if (live.phase === 'approach') tick(h, 3);
  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId: branch });
}

function envelope(h) {
  return JSON.parse(JSON.stringify(h.saver.serialize('weir-persistence')));
}

function coldContinue(t, saved) {
  const h = boot(t);
  // Consume generation tokens in this fresh host so equality cannot masquerade as a rebind.
  for (let i = 0; i < 20; i++) h.sim.spawn({ type: 'payload', pos: { x: i, z: 0 }, hull: 1 });
  assert.equal(h.saver.loadEnvelope(saved, 'weir-persistence'), true, 'real JSON save envelope restores');
  h.state.mode = 'flight';
  return h;
}

function active(h) {
  return Object.values(h.state.encounterDirector.live).find(live => live.shapeId === SHAPE);
}

function physical(e) {
  return { stableId: e.data.stableId, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, vel: { x: e.vel.x, z: e.vel.z },
    mass: e.mass, hull: e.hull, shield: e.shield, factionId: e.factionId, team: e.team,
    physicsBody: e.physicsBody, cargo: e.data.cargo, passive: e.data.ai?.passive,
    roe: e.data.ai?.roe, activity: e.data.ai?.activity, squadId: e.data.ai?.squadId };
}

test('mid-task real JSON envelope cold-restores the original lot, cast and coordinator', t => {
  const h = boot(t), live = fire(h);
  choose(h, live, 'theft');
  const hulk = h.state.entities.get(live.data.hulkId);
  hulk.pos = { x: live.anchor.x + live.data.weir.outDir.x * 180,
    z: live.anchor.z + live.data.weir.outDir.z * 180 };
  hulk.vel = { x: 7.25, z: -3.5 };
  hulk.data.cargo = { items: { cmdty_electronics: 3 }, usedVolume: 3, usedMass: 3 };
  tick(h, 1);
  assert.ok(live.data.specialistSprung, 'outbound tow has already sprung the real specialist');
  const bodies = [...live.ids, ...live.propIds].map(id => h.state.entities.get(id));
  const expected = bodies.map(e => ({ state: physical(e), generation: e.occupantGeneration }));
  const deadline = live.data.taskDeadlineAt;
  const saved = envelope(h);
  const resumed = coldContinue(t, saved), restored = active(resumed);
  t.diagnostic(JSON.stringify({ originalHulk: physical(hulk), originalGeneration: hulk.occupantGeneration,
    branch: live.data.task, deadline, savedOriginal: saved.data.entities.persistent.some(e => e.data?.stableId === hulk.data.stableId),
    restoredPhase: restored?.phase ?? null }));
  assert.ok(restored, 'cold Continue reconstructs the unfinished Weir coordinator');
  assert.equal(restored.id, live.id);
  assert.equal(restored.phase, 'task');
  assert.equal(restored.data.task, 'theft');
  assert.equal(restored.data.taskDeadlineAt, deadline);
  assert.equal(resumed.state.simTime, h.state.simTime, 'deadline remains on the restored sim clock');
  for (const row of expected) {
    const matches = resumed.state.entityList.filter(e => e.alive && e.data?.stableId === row.state.stableId);
    assert.equal(matches.length, 1, `one original body for ${row.state.stableId}`);
    assert.deepEqual(physical(matches[0]), row.state);
    assert.notEqual(matches[0].occupantGeneration, row.generation, 'fresh occupant generation');
    assert.equal(restored.data.gens[matches[0].id], matches[0].occupantGeneration);
  }
  assert.equal(restored.data.hulkId, resumed.state.entityList.find(e => e.data?.stableId === hulk.data.stableId).id);
  assert.equal(resumed.events.some(e => ['economy:grantCredits', 'faction:repDelta', 'encounter:voice',
    'law:reportIncidentReceipt', 'encounter:telegraph'].includes(e.name)), false, 'reconstruction replays no effects');
  const count = resumed.state.entityList.length;
  resumed.director._fire(resumed.state.encounterDirector, resumed.state, live.plan, ENCOUNTERS[SHAPE], resumed.state.simTime);
  assert.equal(active(resumed), restored, 'a duplicate planned row cannot replace the active continuation');
  assert.equal(resumed.state.entityList.length, count, 'no substitute cast or cargo');
});

function effects(h) {
  return h.events.filter(e => e.name === 'economy:grantCredits' && e.payload.reason.startsWith('weir:')
    || e.name === 'faction:repDelta' && e.payload.reason.startsWith('weir_'));
}

function assertTerminal(h, outcome) {
  assert.equal(active(h), undefined);
  assert.equal(h.state.story.depthProgramEncounters.completed[SHAPE].outcome, outcome);
  assert.equal(h.director._gatesPass(ENCOUNTERS[SHAPE], h.state), false);
}

function hardReentry(h) {
  h.state.simTime += 2000;
  h.bus.emit('sector:exit', { sectorId: SECTOR });
  h.bus.emit('sector:enter', { sectorId: SECTOR });
  const count = h.state.entityList.length;
  const result = h.director.requestAuthoredEncounter({ shapeId: SHAPE, encounterId: 'weir:reoffer',
    sectorId: SECTOR, zoneId: 'zone_tethys_checkpoint', force: false });
  assert.equal(result.ok, false, 'a hard reentry cannot reoffer the once-only opportunity');
  assert.equal(result.reason, 'gated');
  assert.equal(h.state.entityList.length, count);
}

for (const phase of ['approach', 'offer', 'refusal']) {
  test(`${phase} cold Continue preserves phase and offer/departure clocks without replaying hails`, t => {
    const h = boot(t), live = fire(h);
    if (phase === 'offer') tick(h, 3);
    if (phase === 'refusal') choose(h, live, 'refuse');
    const resumed = coldContinue(t, envelope(h)), restored = active(resumed);
    assert.ok(restored);
    assert.equal(restored.phase, live.phase);
    assert.equal(restored.deadlineAt, live.deadlineAt);
    assert.equal(restored.data.approachEndsAt, live.data.approachEndsAt);
    assert.equal(restored.offerConsumed, !!live.offerConsumed);
    assert.equal(restored.data.specialistSprung, live.data.specialistSprung);
    assert.equal(effects(resumed).length, 0);
    assert.equal(resumed.events.some(e => e.name === 'encounter:voice'), false);
    if (phase === 'offer') {
      choose(resumed, restored, 'assist');
      assert.equal(restored.data.task, 'law', 'the restored offer remains actionable');
    }
    if (phase === 'refusal') {
      const specialist = resumed.director.entsOf(restored, 'specialist')[0];
      resumed.sim.helpers.removeEntity(specialist.id, { immediate: true });
      tick(resumed);
      assertTerminal(resumed, 'weir_refused');
      const terminal = coldContinue(t, envelope(resumed));
      assertTerminal(terminal, 'weir_refused');
      hardReentry(terminal);
      assert.equal(effects(terminal).length, 0);
    }
  });
}

test('warm Continue rebinds incoming actors without retiring their persistence', t => {
  const h = boot(t), live = fire(h);
  choose(h, live, 'assist');
  const saved = envelope(h), before = h.events.length;
  assert.equal(h.saver.loadEnvelope(saved, 'weir-persistence'), true);
  const restored = active(h);
  assert.ok(restored);
  for (const id of [...restored.ids, ...restored.propIds]) {
    const e = h.state.entities.get(id);
    assert.equal(e.flags.persistent, true);
    assert.equal(e.data.persistenceOwner, 'weirAmbush');
    assert.equal(restored.data.gens[id], e.occupantGeneration);
  }
  assert.equal(h.events.slice(before).some(e => e.name === 'encounter:voice'), false);
  const cold = coldContinue(t, envelope(h));
  assert.equal(active(cold)?.data.task, 'law');
});

for (const branch of ['assist', 'theft']) {
  test(`${branch} pays once after cold Continue and stays terminal through another Continue and hard reentry`, t => {
    const source = boot(t), first = fire(source);
    choose(source, first, branch);
    const h = coldContinue(t, envelope(source)), live = active(h);
    assert.ok(live);
    const hulk = h.state.entities.get(live.data.hulkId);
    const patrol = h.director.entsOf(live, 'patrol')[0];
    hulk.pos = branch === 'assist' ? { x: patrol.pos.x + 20, z: patrol.pos.z }
      : { x: live.anchor.x + live.data.weir.outDir.x * 350,
          z: live.anchor.z + live.data.weir.outDir.z * 350 };
    hulk.vel = { x: 0, z: 0 };
    h.state.player.tether = { active: true, targetId: hulk.id };
    tick(h);
    assert.equal(effects(h).length, 0, 'still-attached original cargo does not settle');
    h.state.player.tether = { active: false, targetId: null };
    const beforeCredits = h.state.player.credits;
    const beforeRep = h.state.factions.faction_scn.rep;
    tick(h);
    const outcome = branch === 'assist' ? 'weir_lawful_assist' : 'weir_theft';
    assertTerminal(h, outcome);
    assert.equal(h.state.player.credits, beforeCredits + (branch === 'assist' ? 150 : 200));
    assert.equal(h.state.factions.faction_scn.rep, beforeRep + (branch === 'assist' ? 8 : -10));
    assert.equal(effects(h).length, 2);
    for (const id of [...live.ids, ...live.propIds]) {
      const e = h.state.entities.get(id);
      assert.notEqual(e.flags.persistent, true, 'terminal actors return to the normal straggler lifetime');
      assert.equal(e.data.persistenceOwner, undefined);
    }
    if (branch === 'theft') {
      const receipts = h.events.filter(e => e.name === 'law:reportIncidentReceipt');
      assert.equal(receipts.length, 1, 'real law owner adjudicates the report once');
      t.diagnostic(`Canonical theft intake: ${JSON.stringify(receipts[0].payload)}`);
    }
    const saved = envelope(h), terminal = coldContinue(t, saved);
    assertTerminal(terminal, outcome);
    assert.equal(terminal.state.player.credits, h.state.player.credits);
    assert.equal(terminal.state.factions.faction_scn.rep, h.state.factions.faction_scn.rep);
    hardReentry(terminal);
    tick(terminal);
    assert.equal(effects(terminal).length, 0);
    assert.equal(terminal.events.some(e => e.name === 'law:reportIncidentReceipt'), false);
  });
}

test('an already-completed real envelope rejects a second opportunity after cold Continue', t => {
  const h = boot(t), live = fire(h);
  choose(h, live, 'assist');
  const hulk = h.state.entities.get(live.data.hulkId), patrol = h.director.entsOf(live, 'patrol')[0];
  hulk.pos = { x: patrol.pos.x + 20, z: patrol.pos.z };
  hulk.vel = { x: 0, z: 0 };
  tick(h);
  assert.equal(h.state.player.credits, 150);
  const cold = coldContinue(t, envelope(h));
  assert.equal(cold.state.player.credits, 150, 'the saved payout survives exactly once');
  assertTerminal(cold, 'weir_lawful_assist');
  hardReentry(cold);
  assert.equal(effects(cold).length, 0);
});

for (const replacement of [false, true]) {
  test(`original hulk ${replacement ? 'id replacement' : 'loss'} before a save cannot restore substitute cargo or pay`, t => {
    const h = boot(t), live = fire(h);
    choose(h, live, 'theft');
    const original = h.state.entities.get(live.data.hulkId);
    const stableId = original.data.stableId;
    h.sim.helpers.removeEntity(original.id, { immediate: true });
    let foreign;
    if (replacement) {
      foreign = h.sim.spawn({ id: original.id, type: 'payload', pos: { ...live.anchor },
        mass: 90, hull: 10, flags: { persistent: true }, data: { stableId: 'foreign:cargo', persistenceOwner: 'foreign' } });
      assert.equal(foreign.id, original.id);
      assert.notEqual(foreign.occupantGeneration, live.data.gens[foreign.id]);
    }
    // No script tick after removal: the actual envelope must not turn absence into respawn.
    const cold = coldContinue(t, envelope(h));
    assertTerminal(cold, 'weir_hulk_lost');
    assert.equal(cold.state.entityList.some(e => e.data?.stableId === stableId), false);
    assert.equal(effects(cold).length, 0);
    if (foreign) {
      const restoredForeign = cold.state.entityList.find(e => e.data?.stableId === 'foreign:cargo');
      assert.equal(restoredForeign.flags.persistent, true);
      assert.equal(restoredForeign.data.persistenceOwner, 'foreign');
      assert.equal(restoredForeign.data.despawnAt, undefined);
      tick(h);
      assertTerminal(h, 'weir_hulk_lost');
      assert.equal(foreign.data.despawnAt, undefined, 'live loss also preserves the replacement occupant');
    }
    const terminal = coldContinue(t, envelope(cold));
    assertTerminal(terminal, 'weir_hulk_lost');
    hardReentry(terminal);
    assert.equal(effects(terminal).length, 0);
  });
}

for (const branch of [null, 'assist', 'refuse']) {
  test(`intentional hard departure during ${branch || 'approach'} consumes the opportunity without pay or reputation`, t => {
    const h = boot(t), live = fire(h);
    if (branch) choose(h, live, branch);
    h.bus.emit('sector:exit', { sectorId: SECTOR });
    assertTerminal(h, 'weir_abandoned');
    assert.equal(effects(h).length, 0);
    const cold = coldContinue(t, envelope(h));
    assertTerminal(cold, 'weir_abandoned');
    hardReentry(cold);
    assert.equal(effects(cold).length, 0);
  });
}

test('restored task deadline stalls once on sim time; continuous membership is not abandonment', t => {
  const h = boot(t), live = fire(h);
  choose(h, live, 'assist');
  h.bus.emit('sector:exit', { sectorId: SECTOR, continuous: true });
  assert.equal(active(h), live);
  const cold = coldContinue(t, envelope(h)), restored = active(cold);
  assert.ok(restored);
  cold.state.simTime = restored.data.taskDeadlineAt - 0.1;
  tick(cold);
  assert.equal(active(cold), restored);
  tick(cold, 0.1);
  assertTerminal(cold, 'weir_stalled');
  assert.equal(effects(cold).length, 0);
  const terminal = coldContinue(t, envelope(cold));
  assertTerminal(terminal, 'weir_stalled');
  hardReentry(terminal);
});
