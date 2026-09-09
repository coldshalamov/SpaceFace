#!/usr/bin/env node
// BP-13/B7 Fake-Civilian-Until-Scan contract.
//
// Disguised pirates are neutral/civilian to the existing scanner predicates until the player uses
// the shipped scan pulse seam. The reveal is sticky and mutates normal AI fields so scanner.js does
// not need a special-case faction hook.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner, contactStateWord, isHostileToPlayer } from '../src/systems/scanner.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/data/pirateDisguise.js', import.meta.url)),
  'src/data/pirateDisguise.js exists');
assert.ok(existsSync(new URL('../src/systems/pirateDisguise.js', import.meta.url)),
  'src/systems/pirateDisguise.js exists');

const dataMod = await import('../src/data/pirateDisguise.js');
const sysMod = await import('../src/systems/pirateDisguise.js');
const {
  PIRATE_DISGUISE_SCAN_RADIUS,
  applyPirateDisguise,
  pirateDisguisePlanForEntity,
  revealPirateDisguise,
} = dataMod;
const pirateDisguise = sysMod.pirateDisguise || sysMod.default;

assert.ok(PIRATE_DISGUISE_SCAN_RADIUS > 0, 'disguise scan radius is exported');
assert.equal(typeof applyPirateDisguise, 'function', 'applyPirateDisguise helper exported');
assert.equal(typeof pirateDisguisePlanForEntity, 'function', 'pirateDisguisePlanForEntity helper exported');
assert.equal(typeof revealPirateDisguise, 'function', 'revealPirateDisguise helper exported');
assert.ok(pirateDisguise && pirateDisguise.name === 'pirateDisguise',
  'pirateDisguise system exports the registry object');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in pirate disguise path'); };
  Date.now = () => { throw new Error('Date.now in pirate disguise path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testScanPulseRevealsDisguisedHauler);
guarded(testOutOfRangeScanDoesNotReveal);
guarded(testRevealIsStickyAndSingleVoice);
guarded(testNonDisguisePirateIsIgnored);
guarded(testDeterminism);

console.log(`[check-pirate-disguise] PASS - ${sections} sections green`);

function boot({ seed = 707, piratePos = { x: 180, z: 0 }, doctrine = 'thief', disguised = true } = {}) {
  const sim = createSimulation({ seed, systems: [scanner, pirateDisguise, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 8,
  });
  state.playerId = player.id;

  const pirate = sim.spawn({
    type: 'ship',
    team: disguised ? 2 : 1,
    factionId: disguised ? 'faction_free' : 'faction_reach',
    pos: piratePos,
    hull: 90,
    hullMax: 90,
    radius: 6,
    data: {
      ai: {
        doctrine,
        squadId: 'sq_mask',
        archetype: disguised ? 'fleeing_trader' : 'pirate_raider',
        passive: disguised,
        spawnContext: 'ambient',
      },
      trafficRole: disguised ? 'hauler' : null,
      trafficLabel: disguised ? 'Cargo Hauler' : null,
      intent: { moveX: 0, moveZ: 0, fire: false },
      combat: { targetId: null },
    },
  });
  if (disguised) applyPirateDisguise(pirate, { seed, key: 'sq_mask' });

  const log = { revealed: [], voices: [], toasts: [] };
  bus.on('pirateDisguise:revealed', (p) => log.revealed.push(p));
  bus.on('pirateDisguise:voice', (p) => log.voices.push(p));
  bus.on('toast', (p) => log.toasts.push(p));
  return { sim, state, bus, player, pirate, log };
}

function stepFor(sim, seconds) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function triggerRealScan(t) {
  t.state.input.actions.scanPulse = true;
  stepFor(t.sim, 0.1);
}

function assertCivilianRead(t) {
  assert.equal(t.pirate.data.trafficRole, 'hauler', 'disguised pirate carries civilian traffic role');
  assert.equal(t.pirate.data.disguiseBlown, undefined, 'disguise starts unblown');
  assert.equal(contactStateWord(t.pirate, 0, t.state), 'HAULER',
    'disguised pirate exposes its specific civilian cover role before scan');
  assert.equal(isHostileToPlayer(t.pirate, 0, t.state), false, 'disguised pirate is non-hostile before scan');
}

function assertHostileRead(t) {
  assert.equal(t.pirate.data.disguiseBlown, true, 'scan sticks disguiseBlown');
  assert.equal(t.pirate.team, 1, 'revealed pirate restores true hostile team');
  assert.equal(t.pirate.data.trafficRole, 'raider', 'revealed pirate stops presenting as a hauler');
  assert.equal(contactStateWord(t.pirate, 0, t.state), 'HOSTILE', 'revealed pirate reads HOSTILE');
  assert.equal(isHostileToPlayer(t.pirate, 0, t.state), true, 'revealed pirate is hostile through scanner predicate');
}

function testScanPulseRevealsDisguisedHauler() {
  const t = boot();
  assertCivilianRead(t);
  const plan = pirateDisguisePlanForEntity(t.pirate);
  assert.equal(plan.trueDoctrine, 'thief', 'thief doctrine supplies a disguise plan');

  triggerRealScan(t);
  assertHostileRead(t);
  assert.equal(t.log.revealed.length, 1, 'scan pulse emits one reveal event');
  assert.equal(t.log.voices.length, 1, 'reveal emits one voice line');
  assert.equal(t.log.voices[0].situation, 'warn', 'reveal voice is a warning bark');
  assert.ok(t.log.toasts.length >= 1, 'voice arbiter surfaced the reveal bark');
  ok('real scan pulse reveals a fake hauler through existing scanner predicates');
}

function testOutOfRangeScanDoesNotReveal() {
  const t = boot({ piratePos: { x: PIRATE_DISGUISE_SCAN_RADIUS + 500, z: 0 } });
  assertCivilianRead(t);
  triggerRealScan(t);
  assert.equal(t.pirate.data.disguiseBlown, undefined, 'out-of-range scan does not reveal');
  assert.equal(t.log.revealed.length, 0, 'out-of-range scan emits no reveal');
  assert.equal(contactStateWord(t.pirate, 0, t.state), 'HAULER',
    'out-of-range target retains its specific civilian cover role');
  ok('scan reveal is range-gated, not global');
}

function testRevealIsStickyAndSingleVoice() {
  const t = boot();
  triggerRealScan(t);
  assertHostileRead(t);
  const firstAt = t.pirate.data.pirateDisguise.revealedAt;
  t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  assertHostileRead(t);
  assert.equal(t.pirate.data.pirateDisguise.revealedAt, firstAt, 'revealedAt does not flicker');
  assert.equal(t.log.revealed.length, 1, 'reveal event is one-shot');
  assert.equal(t.log.voices.length, 1, 'reveal voice is one-shot');
  ok('disguise reveal is sticky and does not spam');
}

function testNonDisguisePirateIsIgnored() {
  const t = boot({ disguised: false, doctrine: 'ideological' });
  assert.equal(pirateDisguisePlanForEntity(t.pirate), null, 'non-disguised doctrine has no disguise plan');
  triggerRealScan(t);
  assert.equal(t.pirate.data.disguiseBlown, undefined, 'ordinary pirate is not changed by B7');
  assert.equal(t.log.revealed.length, 0, 'ordinary pirate emits no disguise reveal');
  ok('B7 ignores normal pirates and does not rewrite all hostiles');
}

function testDeterminism() {
  const run = () => {
    const t = boot({ seed: 313, piratePos: { x: 160, z: 10 } });
    triggerRealScan(t);
    return {
      role: t.pirate.data.pirateDisguise.disguiseRole,
      label: t.pirate.data.trafficLabel,
      word: contactStateWord(t.pirate, 0, t.state),
      hostile: isHostileToPlayer(t.pirate, 0, t.state),
      voices: t.log.voices.map((v) => ({ situation: v.situation, text: v.text })),
      revealed: t.log.revealed.map((e) => ({ entityId: e.entityId, by: e.by, role: e.disguiseRole })),
    };
  };
  assert.deepEqual(run(), run(), 'same seed and entity plan produce identical disguise reveal');
  ok('pirate disguise reveal is deterministic');
}
