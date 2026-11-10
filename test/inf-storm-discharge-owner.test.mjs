import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { physics } from '../src/core/physics.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { STORM_ARENA_ID, STORM_DISCHARGE_WARNING_S } from '../src/systems/stormLatticeArena.js';

const fields = { name: 'fields', init() { this.rows = new Map(); },
  registerEnvironmental(s) { this.rows.set(s.id, { ...s }); return this.rows.get(s.id); },
  registerExternal(s) { return this.registerEnvironmental(s); },
  updateExternal(id, patch) { const row = this.rows.get(id); if (row) Object.assign(row, patch); return row; },
  unregisterExternal(id) { return this.rows.delete(id); }, hasExternal(id) { return this.rows.has(id); } };

function fixture(t, native = false) {
  const sim = createSimulation({ seed: 7, systems: native
    ? [fields, runSession, survivalArena, swarmJuice, physics] : [fields, runSession, survivalArena, swarmJuice] });
  t.after(() => sim.dispose());
  const { state, bus, helpers } = sim;
  helpers.combatPhysics = { createAttachment: () => ({ id: 'accepted-native-joint' }),
    cutAttachment: () => true };
  state.mode = 'flight';
  const player = sim.spawn({ type: 'ship', team: 0, isPlayer: true, pos: { x: 3000, z: 400 },
    vel: { x: 0, z: 0 }, radius: 10, mass: 20, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 }),
    arenaId: STORM_ARENA_ID, phase: 'wave_intro', wave: 5 };
  const arena = sim.registry.get('survivalArena');
  const events = [];
  for (const name of ['survivalArena:stormWarning', 'survivalArena:stormResolve', 'survivalArena:stormCancel',
    'swarm:stormDischarge', 'combat:damage', 'entity:killed', 'audio:cue']) {
    bus.on(name, payload => events.push({ name, payload: structuredClone(payload) }));
  }
  const plan = planWave({ seed: 7, arenaId: STORM_ARENA_ID, wave: 5 });
  assert.equal(plan.arenaPhase, 'furnace_active');
  bus.emit('run:wavePlanned', { wave: 5, plan, tick: state.tick });
  const relay = arena._roomSolids.get('relay_0');
  assert.ok(relay && state.entities.get(relay.id) === relay);
  state.run.phase = 'active'; noteSwarmPilotAction(state);
  const kernel = getCombatKernel(sim.registry.ctx);
  function step(count = 1) {
    for (let n = 0; n < count; n++) { state.tick++; state.simTime += SIM_DT; arena.update(SIM_DT, state); }
  }
  function until(name, max = 600) {
    const start = events.length;
    for (let n = 0; n < max; n++) { step(); const found = events.slice(start).find(e => e.name === name); if (found) return found.payload; }
    assert.fail(`no ${name} within ${max} ticks`);
  }
  function spawnTarget(pos, options = {}) {
    return sim.spawn({ type: 'drone', team: 1, pos: { ...pos }, vel: { x: 0, z: 0 },
      radius: 8, hull: options.hull ?? 100, hullMax: 100, armorHp: options.armor ?? 0,
      armorMax: options.armor ?? 0, shield: options.shield ?? 0, shieldMax: options.shield ?? 0,
      data: { runCohort: 'survival', runWave: 5, ...(options.data || {}) } });
  }
  return { sim, state, bus, player, arena, kernel, relay, events, step, until, spawnTarget };
}

test('active-fight clock warns before damage, pauses, and walks once with accepted armor damage', t => {
  const h = fixture(t);
  const target = h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z }, { armor: 50 });
  h.state.run.phase = 'wave_intro'; h.step(300);
  assert.equal(h.events.some(e => e.name === 'survivalArena:stormWarning'), false);
  h.state.run.phase = 'active';
  const warning = h.until('survivalArena:stormWarning');
  assert.ok(warning.segments.length > 0 && warning.nodes.length > 0);
  assert.equal(h.events.some(e => e.name === 'combat:damage'), false, 'warning precedes all damage');
  assert.equal(warning.warningS, STORM_DISCHARGE_WARNING_S);
  assert.ok(h.events.some(e => e.name === 'audio:cue'));
  h.state.mode = 'paused';
  for (let i = 0; i < 180; i++) h.arena.update(SIM_DT, h.state);
  assert.equal(h.events.some(e => e.name === 'survivalArena:stormResolve'), false);
  h.state.mode = 'flight';
  h.bus.emit('survivalArena:stormPresented', { wave: warning.wave,
    roomGeneration: warning.roomGeneration, serial: warning.serial });
  const resolved = h.until('survivalArena:stormResolve');
  assert.equal(resolved.serial, warning.serial);
  const hits = h.events.filter(e => e.name === 'combat:damage' && e.payload.targetId === target.id);
  assert.equal(hits.length, 1, `one hit per life per walk; warning=${JSON.stringify(warning)} resolved=${JSON.stringify(resolved)} target=${JSON.stringify(target.pos)}`);
  assert.ok(hits[0].payload.armorDamage > 0, 'real damage kernel used the armor layer');
  assert.equal(hits[0].payload.attackerId, STORM_ARENA_ID);
  assert.ok(h.events.findIndex(e => e.name === 'survivalArena:stormWarning') < h.events.findIndex(e => e.name === 'combat:damage'));
  h.step(1);
  assert.equal(h.events.filter(e => e.name === 'combat:damage' && e.payload.targetId === target.id).length, 1);
});

test('accepted player line and recent release credit only current lives, not NPC or stale lines', t => {
  const h = fixture(t);
  const target = h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z }, { hull: 10 });
  const result = h.kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: h.relay.id });
  assert.equal(result.ok, true, result.reason);
  const cut = h.kernel.attachments.cut(result.attachment.id, h.player.id, 'pilot');
  assert.equal(cut.ok, true, JSON.stringify(cut));
  h.bus.on('survivalArena:stormWarning', p => h.bus.emit('survivalArena:stormPresented', {
    wave: p.wave, roomGeneration: p.roomGeneration, serial: p.serial,
  }));
  h.until('survivalArena:stormResolve');
  const hit = h.events.find(e => e.name === 'combat:damage' && e.payload.targetId === target.id);
  assert.equal(hit?.payload.attackerId, h.player.id, 'accepted recently released line credits downstream hull');
  assert.equal(h.events.find(e => e.name === 'entity:killed' && e.payload.id === target.id)?.payload.killerId, h.player.id);

  const record = h.arena._relayWiredAt.get('relay_0');
  assert.ok(record);
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', record.at + 8.01), false);
  h.player.occupantGeneration++;
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', record.at + 1), false, 'recycled player cannot inherit credit');
  h.player.occupantGeneration--;
  h.relay.occupantGeneration++;
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', record.at + 1), false, 'recycled relay cannot inherit credit');
});

test('a wired arc keeps the player vulnerable and honors canonical friendly-device refusal', t => {
  const h = fixture(t);
  h.player.pos.x = h.relay.pos.x + 10; h.player.pos.z = h.relay.pos.z;
  const ally = h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  ally.team = h.player.team; ally.ownerId = h.player.id;
  const line = h.kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: h.relay.id });
  assert.equal(line.ok, true, line.reason);
  h.bus.on('survivalArena:stormWarning', p => h.bus.emit('survivalArena:stormPresented', {
    wave: p.wave, roomGeneration: p.roomGeneration, serial: p.serial,
  }));
  h.until('survivalArena:stormResolve');
  const playerHit = h.events.find(e => e.name === 'combat:damage' && e.payload.targetId === h.player.id);
  assert.equal(playerHit?.payload.attackerId, STORM_ARENA_ID, 'the player cannot self-credit away the hazard');
  assert.equal(h.events.some(e => e.name === 'combat:damage' && e.payload.targetId === ally.id), false);
  assert.equal(ally.hull, 100, 'the combat owner refuses damage to the player-owned device');
});

test('source movement, phase exit and restore invalidate warned paths without unseen damage', t => {
  const h = fixture(t);
  h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  const warning = h.until('survivalArena:stormWarning');
  h.bus.emit('survivalArena:stormPresented', { wave: warning.wave,
    roomGeneration: warning.roomGeneration, serial: warning.serial });
  const pending = h.arena._dischargePending;
  const relayHop = pending.hops.find(hop => String(hop.fromId).startsWith('relay_') || String(hop.toId).startsWith('relay_'));
  assert.ok(relayHop);
  const id = String(relayHop.fromId).startsWith('relay_') ? relayHop.fromId : relayHop.toId;
  const relay = h.arena._roomSolids.get(id);
  relay.alive = false;
  h.until('survivalArena:stormResolve');
  assert.equal(h.events.filter(e => e.name === 'combat:damage').length, 0, 'dead source cannot deliver old arc');
  assert.ok(h.events.some(e => e.name === 'survivalArena:stormResolve' && e.payload.serial === warning.serial));
  h.bus.emit('save:loaded');
  assert.equal(h.arena._dischargePending, null);
  assert.equal(h.arena._relayWiredAt.size, 0);
  assert.equal(h.arena._dischargeElapsed, 0);
});

test('a stale HUD held ID or an accepted NPC line cannot grant player credit', t => {
  const h = fixture(t);
  const npc = h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  h.state.player.tether = { active: true, targetId: h.relay.id };
  const other = h.kernel.attachments.create({ defId: 'tether_standard', ownerId: npc.id, targetId: h.relay.id });
  assert.equal(other.ok, true, other.reason);
  h.step(5);
  assert.equal(h.arena._relayWiredAt.has('relay_0'), false);
  assert.equal(h.kernel.attachments.cut(other.attachment.id, npc.id, 'pilot').ok, true);
  assert.equal(h.arena._relayWiredAt.has('relay_0'), false, 'another pilot\'s release has no player provenance');
  const own = h.kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: h.relay.id });
  assert.equal(own.ok, true, own.reason);
  h.arena._relayWiredAt.clear();
  h.relay.occupantGeneration++;
  h.arena._stormPlayerWiring(h.state);
  assert.equal(h.arena._relayWiredAt.has('relay_0'), false, 'an accepted line to an old relay life is stale');
});

test('an accepted transfer to another pilot retires the earlier player wire credit', t => {
  const h = fixture(t);
  const npc = h.sim.spawn({ type: 'ship', team: 1, pos: { x: h.relay.pos.x + 80, z: h.relay.pos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100 });
  const own = h.kernel.attachments.create({ defId: 'tether_standard', ownerId: h.player.id, targetId: h.relay.id });
  assert.equal(own.ok, true, own.reason);
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', h.state.simTime), true);
  const transfer = h.kernel.attachments.transfer(own.attachment.id, h.player.id, npc.id);
  assert.equal(transfer.ok, true, transfer.reason);
  h.arena._stormPlayerWiring(h.state);
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', h.state.simTime), false);
  assert.equal(h.kernel.attachments.cut(own.attachment.id, npc.id, 'pilot').ok, true);
  assert.equal(h.arena._stormRelayCredited(h.state, 'relay_0', h.state.simTime), false);
});

test('without a current presentation receipt a warning expires without damage', t => {
  const h = fixture(t);
  h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  const warning = h.until('survivalArena:stormWarning');
  h.bus.emit('survivalArena:stormPresented', { wave: warning.wave,
    roomGeneration: warning.roomGeneration, serial: warning.serial + 1 });
  h.step(270);
  assert.equal(h.events.filter(e => e.name === 'combat:damage').length, 0);
  assert.ok(h.events.some(e => e.name === 'survivalArena:stormCancel' && e.payload.serial === warning.serial));
  h.bus.emit('survivalArena:stormPresented', { wave: warning.wave,
    roomGeneration: warning.roomGeneration, serial: warning.serial });
  h.step(30);
  assert.equal(h.events.filter(e => e.name === 'combat:damage').length, 0, 'late receipt cannot revive the strike');
});

test('a lost presentation cancels even a previously acknowledged warning', t => {
  const h = fixture(t);
  h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  const warning = h.until('survivalArena:stormWarning');
  const receipt = { wave: warning.wave, roomGeneration: warning.roomGeneration, serial: warning.serial };
  h.bus.emit('survivalArena:stormPresented', receipt);
  h.step(10);
  h.bus.emit('survivalArena:stormPresented', { ...receipt, available: false });
  h.step(100);
  assert.equal(h.events.some(e => e.name === 'combat:damage'), false);
  assert.ok(h.events.some(e => e.name === 'survivalArena:stormCancel' && e.payload.serial === warning.serial));
});

test('the insulated island remains safe even when a relay is dragged to its edge', t => {
  const h = fixture(t);
  const at = h.arena._stormAt;
  h.relay.pos.x = at.x + 45; h.relay.pos.z = at.z;
  h.player.pos.x = at.x + 25; h.player.pos.z = at.z;
  h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  h.bus.on('survivalArena:stormWarning', p => h.bus.emit('survivalArena:stormPresented', {
    wave: p.wave, roomGeneration: p.roomGeneration, serial: p.serial,
  }));
  h.until('survivalArena:stormResolve');
  assert.equal(h.events.some(e => e.name === 'combat:damage' && e.payload.targetId === h.player.id), false);
});

test('campaign restore cancels the transient survival warning and rejects its stale receipt', t => {
  const h = fixture(t);
  h.spawnTarget({ x: h.relay.pos.x + 18, z: h.relay.pos.z });
  const warning = h.until('survivalArena:stormWarning');
  h.bus.emit('save:restoring');
  assert.equal(h.state.run.kind, 'adventure', 'runSession owns the supported restore boundary');
  assert.equal(h.arena._dischargePending, null);
  assert.ok(h.events.some(e => e.name === 'survivalArena:stormCancel' && e.payload.serial === warning.serial));
  h.bus.emit('survivalArena:stormPresented', { wave: warning.wave,
    roomGeneration: warning.roomGeneration, serial: warning.serial });
  h.bus.emit('save:loaded');
  h.step(150);
  assert.equal(h.events.some(e => e.name === 'combat:damage'), false);
});

test('the normal native relay motion can still carry a warned walk', async t => {
  const h = fixture(t, true);
  h.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);
  h.bus.on('survivalArena:stormWarning', p => h.bus.emit('survivalArena:stormPresented', {
    wave: p.wave, roomGeneration: p.roomGeneration, serial: p.serial,
  }));
  const start = { x: h.relay.pos.x, z: h.relay.pos.z };
  for (let i = 0; i < 390 && !h.events.some(e => e.name === 'survivalArena:stormResolve'); i++) h.sim.step(SIM_DT);
  const resolved = h.events.find(e => e.name === 'survivalArena:stormResolve');
  assert.ok(resolved, 'a warning resolves in the native room');
  assert.ok(resolved.payload.hops > 0, 'ordinary native motion does not cancel the full walk');
  assert.ok(Math.hypot(h.relay.pos.x - start.x, h.relay.pos.z - start.z) > 0.1, 'the original relay moved under native physics');
});
