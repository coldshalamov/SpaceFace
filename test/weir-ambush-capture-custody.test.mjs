// Focused explicit-owner fixture. Actual roster + custody commands + real save envelope.
// The fixture compresses the schedule, places the pilot, and stages exposed shields/hull
// and canonical combat drive-disable. It does not fabricate surrender/custody outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { combat } from '../src/systems/combat.js';
import { missions } from '../src/systems/missions.js';
import { shipjack } from '../src/systems/shipjack.js';
import { save } from '../src/save/saveSystem.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

const SHAPE = 'cargo_weir_ambush', SECTOR = 'sector_tethys_junction';
function boot(t) {
  const sim = createSimulation({ seed: 3, systems: [ships, cargo, economy, factions,
    combat, missions, lawSecurity, shipjack, encounterDirector, save], updateOrder: [shipjack] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.onboarding = { active: false, finished: true };
  state.story.beatIndex = 7; state.meta.createdAt = '2026-11-04T00:00:00.000Z';
  state.world.currentSectorId = SECTOR;
  const owner = sim.registry.get('ships'); owner.newGame();
  const pilot = sim.spawn(makeShipEntitySpec(state.player.ownedShips[0].defId, {
    isPlayer: true, player: state.player, fittings: state.player.ownedShips[0].fittings,
    pos: { x: 0, z: 0 } }));
  state.playerId = pilot.id; owner.recomputeActiveShip();
  return { sim, state, bus, owner, jack: sim.registry.get('shipjack'),
    director: sim.registry.get('encounterDirector'), saver: sim.registry.get('save') };
}
function fire(h) {
  h.director._planSector(SECTOR);
  const dir = h.state.encounterDirector, row = dir.pending.find(x => x.shapeId === SHAPE);
  assert.ok(row, 'registered Weir naturally scheduled for seed 3');
  dir.pending = [row]; h.state.simTime = row.dueAt;
  h.director.player().pos = { ...row.zoneCenter };
  dir.pressure.combat = 100; dir.lastMeaningfulAt = dir.lastEndAt = -1e9; dir.window = [];
  h.director._pump(dir, h.state, h.state.simTime);
  return dir.live[row.encounterId];
}
function tick(h, s = 0) { h.state.simTime += s; h.director._tickLive(h.state.encounterDirector, h.state, h.state.simTime); }
function capture(h, e) {
  const pilot = h.state.entities.get(h.state.playerId);
  pilot.pos = { x: e.pos.x + 40, z: e.pos.z }; pilot.vel = { x: 0, z: 0 };
  e.vel = { x: 0, z: 0 }; e.angVel = 0; e.shield = 0; e.hull = e.hullMax * .5;
  const disabled = h.sim.helpers.disableShipjackSubsystem({ entityId: e.id, subsystemId: 'subsystem_drive' });
  assert.equal(disabled.ok, true, 'canonical combat drive disable');
  h.sim.runTicks(1);
  h.sim.registry.get('combat').kernel.prePhysics(SIM_DT);
  const command = action => {
    const receipt = h.jack.command({ action, targetId: e.id });
    assert.equal(receipt.ok, true, `${action}: ${receipt.reason}`); return receipt;
  };
  command('scan'); command('hail');
  h.sim.runTicks(110); command('port'); h.sim.runTicks(80); command('secure');
  assert.equal(e.data.shipjackCustody, 'player');
  const v = h.state.shipjack.vesselsById[e.data.vesselId];
  assert.equal(v.custodian, 'player');
  assert.ok(h.state.player.ownedShips.some(s => s.vesselId === v.vesselId));
  return { e, vesselId: v.vesselId, generation: e.occupantGeneration, shipjackGeneration: v.generation };
}
function envelope(h) { return JSON.parse(JSON.stringify(h.saver.serialize('weir-capture-boundary'))); }
function cold(t, saved) {
  const h = boot(t);
  for (let i = 0; i < 25; i++) h.sim.spawn({ type: 'payload', pos: { x: i, z: 0 }, hull: 1 });
  assert.equal(h.saver.loadEnvelope(saved, 'weir-capture-boundary'), true);
  h.state.mode = 'flight'; return h;
}
function active(h) { return Object.values(h.state.encounterDirector.live).find(l => l.shapeId === SHAPE); }
function choose(h, live, choiceId) {
  if (live.phase === 'approach') tick(h, 3);
  h.bus.emit('encounter:choose', { encounterId: live.id, choiceId });
}
function body(h, vesselId) {
  const bodies = h.state.entityList.filter(e => e.alive && e.data?.vesselId === vesselId);
  assert.equal(bodies.length, 1, `one physical hull for ${vesselId}`);
  return bodies[0];
}

test('canonical custody remains outside Weir roles, cleanup and cold restore', t => {
  const h = boot(t), live = fire(h);
  const captures = ['patrol', 'salvor', 'thief'].map(role => ({ role,
    ...capture(h, h.director.entsOf(live, role)[0]) }));
  const mid = envelope(h), resumed = cold(t, mid);
  const restored = Object.values(resumed.state.encounterDirector.live).find(l => l.shapeId === SHAPE);
  const midReadopted = captures.map(c => ({ role: c.role, readopted: restored.ids.some(id =>
    resumed.state.entities.get(id)?.data?.vesselId === c.vesselId) }));
  for (const c of captures) {
    const restoredBody = body(resumed, c.vesselId);
    assert.equal(restoredBody.data.shipjackGeneration, c.shipjackGeneration);
    assert.notEqual(restoredBody.occupantGeneration, c.generation, 'cold host binds a fresh occupant');
    assert.deepEqual(restoredBody.pos, c.e.pos, 'same captured hull pose');
    assert.equal(restoredBody.hull, c.e.hull, 'same captured hull damage');
  }
  // The captured patrol cannot block the theft as though it were still the cordon.
  choose(resumed, restored, 'theft');
  resumed.director.player().pos = { ...restored.anchor };
  const hulk = resumed.state.entities.get(restored.data.hulkId);
  hulk.pos = { x: restored.anchor.x + restored.data.weir.outDir.x * 350,
    z: restored.anchor.z + restored.data.weir.outDir.z * 350 };
  hulk.vel = { x: 0, z: 0 };
  body(resumed, captures.find(c => c.role === 'patrol').vesselId).pos = { ...hulk.pos };
  tick(resumed);
  assert.equal(resumed.state.story.depthProgramEncounters.weirAmbush.outcome, 'weir_theft');
  // The flight springs on its surviving scene member — the captured lead never left the
  // restored roster (player custody is skipped at bind), so nothing can stamp it: the
  // mask, the trigger and the target all stay exactly as custody left them.
  assert.equal(restored.data.thiefSprung, 'ignored_demand', 'the remaining flight springs on the run');
  const capturedThief = body(resumed, captures.find(c => c.role === 'thief').vesselId);
  assert.equal(capturedThief.data.ai?.passive, true, 'captured flight hull never comes off the mask');
  assert.ok(!['explicit_refusal', 'ignored_demand', 'player_attack']
    .includes(capturedThief.data.ai?.engagementTrigger), 'no spring trigger reaches custody');
  assert.notEqual(capturedThief.data.ai?.motiveSatisfied, false, 'no spring motive stamp on custody');
  assert.notEqual(capturedThief.data.combat?.targetId, resumed.state.playerId, 'custody is not targeted');
  assert.notEqual(capturedThief.data.ai?.activity?.targetId, resumed.state.playerId,
    'no conflict activity targets the player through custody');
  choose(h, live, 'refuse');
  const thief = captures.find(c => c.role === 'thief');
  const reactivated = thief.e.data.ai?.roe === 'weapons_free' && thief.e.data.combat?.targetId === h.state.playerId;
  const salvorDepartureStamped = Number.isFinite(captures.find(c => c.role === 'salvor').e.data.despawnAt);
  // Canonical Ships transfer commits the same physical flight hull as the player's helm.
  h.jack.admit(h.state.entities.get(h.state.playerId), { playerOwned: true, ownerId: 'player' });
  const transfer = h.owner.captureAndTransfer({ targetId: thief.e.id,
    targetGeneration: thief.shipjackGeneration, vesselId: thief.vesselId,
    operationId: 'weir-boundary:helm' });
  assert.equal(transfer.ok, true, transfer.reason);
  assert.equal(h.state.entities.get(h.state.playerId), thief.e, 'original physical hull is piloted');
  tick(h);
  assert.equal(h.state.story.depthProgramEncounters.weirAmbush.outcome, undefined,
    'the surviving flight member still owns the refusal fight — custody ends nothing by itself');
  const wing = h.director.entsOf(live, 'thief').find(e => e !== thief.e);
  assert.ok(wing, 'the masked flight fields a second hull');
  h.sim.helpers.removeEntity(wing.id, { immediate: true });
  tick(h);
  assert.equal(h.state.story.depthProgramEncounters.weirAmbush.outcome, 'weir_refused',
    'a captured flight hull no longer keeps the refusal fight alive');
  const terminal = envelope(h), loaded = cold(t, terminal);
  const result = { midReadopted, reactivated, salvorDepartureStamped,
    terminal: captures.map(c => ({ role: c.role, persistent: c.e.flags.persistent === true,
      despawnAt: c.e.data.despawnAt ?? null,
      savedBody: terminal.data.entities.player?.data?.vesselId === c.vesselId || terminal.data.entities.persistent.some(e => e.data?.vesselId === c.vesselId),
      restoredBody: loaded.state.entityList.some(e => e.alive && e.data?.vesselId === c.vesselId),
      custodian: loaded.state.player.shipjack.vesselsById[c.vesselId]?.custodian })) };
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.midReadopted.some(c => c.readopted), false, 'custody must not re-enter scene roles');
  assert.equal(reactivated, false, 'captured specialist must not re-enter hostile role');
  assert.equal(salvorDepartureStamped, false, 'captured salvor must not get a scene departure');
  for (const c of result.terminal) {
    assert.equal(c.persistent, true, `${c.role} retains custody persistence`);
    assert.equal(c.despawnAt, null, `${c.role} receives no scene cleanup deadline`);
    assert.equal(c.savedBody, true, `${c.role} physical body is saved`);
    assert.equal(c.restoredBody, true, `${c.role} physical body cold-restores`);
  }
});

test('captured cordon hulls cannot receive the law-assist cargo', t => {
  const h = boot(t), live = fire(h);
  const patrols = h.director.entsOf(live, 'patrol').map(e => capture(h, e));
  choose(h, live, 'assist');
  const hulk = h.state.entities.get(live.data.hulkId);
  hulk.pos = { ...patrols[0].e.pos }; hulk.vel = { x: 0, z: 0 };
  const credits = h.state.player.credits;
  tick(h);
  // The whole cordon sits in player custody — no lawful eye remains to take the hulk,
  // so the assist voids on the spot with its own receipt instead of idling 320 s into
  // a "nobody moved the hulk" lie.
  assert.equal(h.state.story.depthProgramEncounters.weirAmbush.outcome, 'weir_receiver_dead',
    'player custody is not a lawful receiver — the deal voids immediately');
  assert.equal(h.state.player.credits, credits, 'no impound fee without a custody transfer');
  for (const c of patrols) {
    assert.equal(c.e.flags.persistent, true);
    assert.equal(c.e.data.despawnAt, undefined);
  }
});

test('late salvor capture revokes only its scene deadline and survives hard departure and cold Continue', t => {
  const h = boot(t), live = fire(h);
  choose(h, live, 'refuse');
  const salvor = h.director.entsOf(live, 'salvor')[0];
  assert.ok(salvor.data.despawnAt > h.state.simTime, 'scene departure already scheduled');
  assert.equal(salvor.data.despawnBy, live.id);
  const captured = capture(h, salvor);
  // The public manual-save route emits this lifecycle before building the envelope.
  // Keep file-store writes outside this focused fixture.
  h.bus.emit('save:started', { slot: 'weir-capture-boundary', reason: 'manual', autosave: false });
  const saved = envelope(h); // save:started releases the acquired scene claim before serialization
  assert.equal(salvor.flags.persistent, true);
  assert.equal(salvor.data.despawnAt, undefined, 'only the scene-authored deadline is revoked');
  const resumed = cold(t, saved), restored = active(resumed);
  const physical = body(resumed, captured.vesselId);
  assert.equal(restored.ids.includes(physical.id), false);
  assert.equal(physical.data.despawnAt, undefined);
  const foreign = resumed.director.entsOf(restored, 'patrol')[0];
  foreign.data.persistenceOwner = 'foreign-owner';
  foreign.data.despawnAt = resumed.state.simTime + 987;
  const foreignDeadline = foreign.data.despawnAt;
  // Move the same-generation original to another physical owner. Weir must not reclaim it.
  const continued = cold(t, envelope(resumed)), continuedLive = active(continued);
  const moved = continued.state.entityList.find(e => e.data?.stableId === foreign.data.stableId);
  assert.equal(continuedLive.ids.includes(moved.id), false);
  assert.equal(moved.data.persistenceOwner, 'foreign-owner');
  assert.equal(moved.data.despawnAt, foreignDeadline);
  const retained = body(continued, captured.vesselId), originalHull = retained.hull;
  continued.bus.emit('sector:exit', { sectorId: SECTOR });
  assert.equal(continued.state.story.depthProgramEncounters.weirAmbush.outcome, 'weir_abandoned');
  assert.equal(continued.state.player.shipjack.vesselsById[captured.vesselId].location.kind, 'remote');
  assert.equal(moved.data.persistenceOwner, 'foreign-owner');
  assert.equal(moved.data.despawnAt, foreignDeadline);
  const departed = cold(t, envelope(continued));
  // Shipjack, the canonical remote-custody owner, materializes its own stored physical hull.
  departed.sim.runTicks(1);
  const returned = body(departed, captured.vesselId);
  assert.equal(returned.data.shipjackGeneration, captured.shipjackGeneration);
  assert.equal(returned.hull, originalHull);
  assert.equal(returned.flags.persistent, true);
  assert.equal(returned.data.persistenceOwner, 'shipjack');
  assert.equal(active(departed), undefined);
  assert.equal(departed.state.player.shipjack.vesselsById[captured.vesselId].custodian, 'player');
});
