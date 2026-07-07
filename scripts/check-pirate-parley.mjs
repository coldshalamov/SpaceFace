#!/usr/bin/env node
// BP-13/B6 Pirate Toll Ladder contract.
//
// A doctrine-tagged pirate squad gets a deterministic parley state machine layered over the
// already-spawned ships: scan bark -> demand bark -> comply/refuse/timeout. Compliance uses the
// cargo owner's jettison API and breaks the squad off; refusal/timeout flips scanner hostility.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { cargo } from '../src/systems/cargo.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/pirateParley.js', import.meta.url)),
  'src/systems/pirateParley.js exists');

const sysMod = await import('../src/systems/pirateParley.js');
const pirateParley = sysMod.pirateParley || sysMod.default;
assert.ok(pirateParley && pirateParley.name === 'pirateParley',
  'pirateParley system exports the registry object');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate parley path'); };
  Date.now = () => { throw new Error('Date.now in pirate parley path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testScanDemandBeforeFire);
guarded(testComplyDropsTitheAndBreaksOff);
guarded(testRefuseFlipsScannerHostility);
guarded(testTimeoutHardEscalates);
guarded(testDoctrineGateIsNotAllPirates);
guarded(testDeterminism);

console.log(`[check-pirate-parley] PASS - ${sections} sections green`);

function boot({
  seed = 2026,
  doctrine = 'toll',
  squadId = 'sq_toll_1',
  cargoItems = { cmdty_refined_metals: 12, cmdty_food: 5 },
} = {}) {
  const sim = createSimulation({ seed, systems: [cargo, pirateParley, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  state.world.sectors.sector_tethys_junction = {
    id: 'sector_tethys_junction',
    factionId: 'faction_reach',
    security: 0.35,
  };

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
  });
  state.playerId = player.id;
  state.player.cargo.items = { ...cargoItems };
  sim.registry.get('cargo').recompute();

  const pirates = [];
  for (let i = 0; i < 2; i++) {
    pirates.push(sim.spawn({
      type: 'ship',
      team: 1,
      factionId: 'faction_reach',
      pos: { x: 120 + i * 24, z: 20 + i * 10 },
      hull: 90,
      hullMax: 90,
      radius: 6,
      data: {
        ai: {
          doctrine,
          squadId,
          archetype: 'pirate_raider',
          spawnContext: 'ambient',
          sectorId: 'sector_tethys_junction',
        },
        intent: { moveX: 0, moveZ: 0, fire: true },
        combat: { targetId: player.id },
      },
    }));
  }

  const log = { events: [], voices: [], toasts: [], fires: [] };
  bus.on('pirateParley:started', (p) => log.events.push({ evt: 'started', p }));
  bus.on('pirateParley:demand', (p) => log.events.push({ evt: 'demand', p }));
  bus.on('pirateParley:resolved', (p) => log.events.push({ evt: 'resolved', p }));
  bus.on('pirateParley:voice', (p) => log.voices.push(p));
  bus.on('toast', (p) => log.toasts.push(p));
  bus.on('combat:fire', (p) => log.fires.push(p));

  return { sim, state, bus, player, pirates, log, squadId };
}

function stepFor(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function runToDemand(t) {
  stepFor(t.sim, 0.1);
  stepFor(t.sim, 2.15);
  assert.deepEqual(t.log.voices.map((v) => v.situation), ['scan', 'demand-cargo'],
    'scan then demand barks are emitted in order');
  assert.equal(t.log.fires.length, 0, 'no combat fire emitted before demand resolves');
}

function allPirates(t) {
  return t.pirates.map((e) => t.state.entities.get(e.id)).filter(Boolean);
}

function testScanDemandBeforeFire() {
  const t = boot();
  stepFor(t.sim, 0.1);
  assert.ok(t.log.voices.length > 0, 'first parley voice emitted');
  assert.equal(t.log.voices[0].situation, 'scan', 'first parley bark is scan');
  assert.ok(t.log.toasts.length > 0, 'voice arbiter surfaced the first parley line');
  assert.match(t.log.toasts[0].text, /Reach|REACH|Cargo|hold|watching|counting/i,
    'scan bark routes through the voice arbiter as a toast');
  for (const e of allPirates(t)) {
    assert.equal(e.data.ai.passive, true, 'parley squad is passive during scan');
    assert.equal(e.data.intent.fire, false, 'parley clears pre-existing fire intent during scan');
    assert.equal(isHostileToPlayer(e, 0, t.state), false, 'scanner reads scan-phase parley as non-hostile');
  }

  stepFor(t.sim, 2.15);
  assert.deepEqual(t.log.voices.map((v) => v.situation), ['scan', 'demand-cargo'],
    'demand bark follows scan');
  assert.equal(t.log.voices[1].squadId, t.squadId, 'demand bark names the squad');
  assert.equal(t.log.fires.length, 0, 'no weapon fire before comply/refuse/timeout');
  assert.ok(t.log.events.some((e) => e.evt === 'demand' && e.p.tithe && e.p.tithe.qty > 0),
    'demand exposes a concrete tithe');
  for (const e of allPirates(t)) {
    assert.equal(e.data.ai.passive, true, 'parley squad remains passive during demand');
    assert.equal(isHostileToPlayer(e, 0, t.state), false, 'demand-phase parley is still non-hostile');
  }
  ok('scan -> demand barks happen before any weapon fire or hostility');
}

function testComplyDropsTitheAndBreaksOff() {
  const t = boot();
  runToDemand(t);
  const before = { ...t.state.player.cargo.items };
  t.bus.emit('pirateParley:choose', { squadId: t.squadId, choice: 'comply' });
  const resolved = t.log.events.find((e) => e.evt === 'resolved');
  assert.equal(resolved.p.outcome, 'complied', 'comply resolves the parley');
  assert.equal(resolved.p.next, 'break-off', 'comply flips squad to break-off');
  assert.ok(resolved.p.tithe && resolved.p.tithe.qty > 0, 'resolved payload includes dropped tithe');
  assert.equal((t.state.player.cargo.items[resolved.p.tithe.commodityId] || 0),
    (before[resolved.p.tithe.commodityId] || 0) - resolved.p.tithe.qty,
    'tithe is removed through cargo ownership');
  assert.ok(t.state.entityList.some((e) => e.type === 'pickup' && e.data && e.data.commodityId === resolved.p.tithe.commodityId),
    'tithe is dropped into space as recoverable cargo');
  for (const e of allPirates(t)) {
    assert.equal(e.data.ai.passive, true, 'complied squad stays passive while breaking off');
    assert.equal(e.data.pirateParley.phase, 'break-off', 'entity carries break-off phase');
    assert.equal(isHostileToPlayer(e, 0, t.state), false, 'break-off squad is not hostile');
  }
  ok('comply drops a deterministic tithe and breaks the squad off');
}

function testRefuseFlipsScannerHostility() {
  const t = boot();
  runToDemand(t);
  t.bus.emit('pirateParley:choose', { squadId: t.squadId, choice: 'refuse' });
  const resolved = t.log.events.find((e) => e.evt === 'resolved');
  assert.equal(resolved.p.outcome, 'refused', 'refuse resolves as refused');
  assert.equal(t.log.voices.at(-1).situation, 'attack', 'refuse emits attack bark');
  for (const e of allPirates(t)) {
    assert.equal(!!e.data.ai.passive, false, 'refused squad goes active');
    assert.equal(e.data.ai.forcePlayerTarget, true, 'refused squad targets the player');
    assert.equal(e.data.combat.targetId, t.player.id, 'combat target is the player');
    assert.equal(isHostileToPlayer(e, 0, t.state), true, 'scanner hostility flips true on refusal');
  }
  ok('refuse flips the squad hostile through scanner-readable AI state');
}

function testTimeoutHardEscalates() {
  const t = boot();
  runToDemand(t);
  stepFor(t.sim, 5.25);
  const resolved = t.log.events.find((e) => e.evt === 'resolved');
  assert.equal(resolved.p.outcome, 'timeout', 'unanswered demand hard-times out');
  assert.equal(t.log.voices.at(-1).situation, 'attack', 'timeout emits attack bark');
  for (const e of allPirates(t)) {
    assert.equal(isHostileToPlayer(e, 0, t.state), true, 'timeout squad is hostile');
  }
  ok('unanswered parley cannot softlock; it escalates to violence');
}

function testDoctrineGateIsNotAllPirates() {
  const t = boot({ doctrine: 'thief', squadId: 'sq_thief' });
  stepFor(t.sim, 2.5);
  assert.equal(t.log.voices.length, 0, 'non-parley thief doctrine does not get the toll ladder');
  assert.equal(t.log.events.length, 0, 'non-parley doctrine produces no parley events');
  for (const e of allPirates(t)) {
    assert.notEqual(e.data.ai.passive, true, 'non-parley pirate is not made passive by B6');
    assert.equal(e.data.intent.fire, true, 'non-parley pirate fire intent is not silently cleared');
  }
  ok('B6 gates by doctrine instead of converting every pirate');
}

function testDeterminism() {
  const run = () => {
    const t = boot({ seed: 77, squadId: 'sq_det' });
    runToDemand(t);
    t.bus.emit('pirateParley:choose', { squadId: t.squadId, choiceId: 'comply' });
    const pickups = t.state.entityList
      .filter((e) => e.type === 'pickup')
      .map((e) => ({
        commodityId: e.data.commodityId,
        amount: e.data.amount,
        x: Number(e.pos.x.toFixed(4)),
        z: Number(e.pos.z.toFixed(4)),
      }));
    return {
      voices: t.log.voices.map((v) => ({ situation: v.situation, text: v.text })),
      resolved: t.log.events.filter((e) => e.evt === 'resolved').map((e) => e.p),
      cargo: { ...t.state.player.cargo.items },
      pickups,
    };
  };
  assert.deepEqual(run(), run(), 'same seed/squad/cargo produces identical parley transcript and tithe');
  ok('pirate parley is deterministic across repeated headless runs');
}
