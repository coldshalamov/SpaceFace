#!/usr/bin/env node
// BP-05.1/BARK-01 radio-cadence surfacing contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { barkFor } from '../src/data/barks.js';
import { contactGrammarFor } from '../src/data/factionContactGrammar.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { hash32 } from '../src/core/rng.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/barkDirector.js', import.meta.url)),
  'src/systems/barkDirector.js exists');

const sysMod = await import('../src/systems/barkDirector.js');
const barkDirector = sysMod.barkDirector || sysMod.default;
const { classifyBarkSituation } = sysMod;

assert.equal(barkDirector && barkDirector.name, 'barkDirector', 'barkDirector exports a registry system');
assert.equal(typeof classifyBarkSituation, 'function', 'classifyBarkSituation helper exported');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in bark director path'); };
  Date.now = () => { throw new Error('Date.now in bark director path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testConcordScanThenAttack);
guarded(testSimultaneousBarksUseArbiterFloor);
guarded(testEventBarksAndDebounce);
guarded(testDeterministicLineSelection);
testPackageRegistryAndSourceGuards();

console.log(`[check-bark-director] PASS - ${sections} sections green`);

function boot(seed = 1205) {
  const sim = createSimulation({ seed, systems: [barkDirector, voiceArbiter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 220,
    hullMax: 220,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const log = { voices: [], toasts: [] };
  bus.on('barkDirector:voice', (payload) => log.voices.push(payload));
  bus.on('toast', (payload) => log.toasts.push(payload));
  return { sim, state, bus, player, log };
}

function spawnContact(t, overrides = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: overrides.team ?? 1,
    factionId: overrides.factionId || 'faction_reach',
    pos: overrides.pos || { x: 260, z: 0 },
    hull: 90,
    hullMax: 90,
    radius: 8,
    data: {
      ai: {
        fsm: 'pursue',
        archetype: 'pirate_raider',
        hostileTeams: [0],
        ...(overrides.ai || {}),
      },
      combat: { targetId: t.player.id, ...(overrides.combat || {}) },
      intent: { fire: false, ...(overrides.intent || {}) },
      ...(overrides.data || {}),
    },
  });
}

function expectedLine(seed, entityId, factionId, situation) {
  return barkFor(factionId, situation, hash32(seed, 'barkDirector', String(entityId), situation));
}

function testConcordScanThenAttack() {
  const t = boot(1210);
  const patrol = spawnContact(t, {
    team: 2,
    factionId: 'faction_scn',
    ai: { lawful: true, fsm: 'pursue', archetype: 'patrol_lawman', hostileTeams: [] },
  });

  assert.equal(classifyBarkSituation(patrol, t.state), 'scan', 'lawful intercept classifies as scan');
  t.sim.step();
  assert.equal(t.log.voices.length, 1, 'Concord intercept emits one bark receipt');
  assert.equal(t.log.voices[0].situation, 'scan', 'first Concord line is scan');
  assert.equal(t.log.voices[0].text, expectedLine(1210, patrol.id, 'faction_scn', 'scan'),
    'scan line is deterministic from seed/entity/situation');
  assert.match(t.log.voices[0].text, /Concord|Vessel|Automated hail/, 'scan line uses Concord register');

  patrol.data.ai.fsm = 'attack';
  patrol.data.intent.fire = true;
  t.sim.step();
  assert.equal(t.log.voices.length, 2, 'same ship escalating emits one new attack bark');
  assert.equal(t.log.voices[1].situation, 'attack', 'escalation line is attack');
  assert.equal(t.log.voices[1].text, expectedLine(1210, patrol.id, 'faction_scn', 'attack'),
    'attack line is deterministic from the same seeded domain');
  ok('Concord patrol scan escalates to one faction-specific attack bark');
}

function testSimultaneousBarksUseArbiterFloor() {
  const t = boot(1220);
  const one = spawnContact(t, { pos: { x: 240, z: -20 } });
  const two = spawnContact(t, { pos: { x: 260, z: 20 }, ai: { squadId: 'second' } });
  t.sim.step();

  // Both contacts are Crimson Reach (spawnContact's default faction). Commit f277c5e7 taught
  // classifyBarkSituation the faction contact grammar: a faction whose demandType is 'tithe' opens
  // a contact with the toll ask, not with paperwork. Reach's authored grammar says exactly that
  // (contactWord 'TOLL', demandType 'tithe', primaryBark 'demand-cargo'), so a Reach picket's
  // first line is the demand. The subject of this section is unchanged — two same-priority barks
  // in one tick are serialized by the arbiter — only the opening situation follows the grammar.
  const opening = 'demand-cargo';
  assert.equal(opening, contactGrammarFor('faction_reach').primaryBark,
    'the pinned opening situation is the faction grammar primary bark, not a loose literal');

  assert.equal(t.log.voices.length, 2, 'two simultaneous contacts enqueue two bark receipts');
  assert.deepEqual(t.log.voices.map((v) => v.situation), [opening, opening],
    'both Reach contacts open with their faction primary bark');
  assert.equal(t.log.toasts.length, 1, 'voiceArbiter surfaces only one bark on the floor this tick');
  assert.equal(t.log.toasts[0].text, expectedLine(1220, one.id, 'faction_reach', opening),
    'first insertion wins the same-priority floor');
  const arbiter = t.sim.registry.get('voiceArbiter');
  assert.equal(arbiter.queue.pending.length, 1, 'second same-priority bark remains queued, not overlapping');
  assert.equal(arbiter.queue.pending[0].text, expectedLine(1220, two.id, 'faction_reach', opening),
    'queued bark keeps its deterministic text');
  ok('simultaneous barks are serialized by voiceArbiter');
}

function testEventBarksAndDebounce() {
  const t = boot(1230);
  const raider = spawnContact(t);
  t.bus.emit('ai:flee', { entityId: raider.id });
  t.bus.emit('ai:flee', { entityId: raider.id });
  assert.equal(t.log.voices.length, 1, 'duplicate ai:flee event emits only one flee bark');
  assert.equal(t.log.voices[0].situation, 'flee', 'ai:flee maps to flee situation');
  assert.equal(t.log.voices[0].text, expectedLine(1230, raider.id, 'faction_reach', 'flee'),
    'flee event line uses the seeded bark domain');

  const captain = spawnContact(t, { factionId: 'faction_mts', ai: { fsm: 'pursue', hostileTeams: [0] } });
  t.bus.emit('ai:reinforcementScheduled', { entityId: captain.id, packageId: 'backup' });
  assert.equal(t.log.voices.length, 2, 'reinforcement event emits a second bark receipt');
  assert.equal(t.log.voices[1].situation, 'reinforce', 'reinforcement schedule maps to reinforce situation');
  assert.match(t.log.voices[1].text, /team|assets|Backup|collections|investment/i,
    'reinforce line uses the faction corpus');
  ok('flee and reinforcement event seams route through barkDirector once');
}

function testDeterministicLineSelection() {
  const run = () => {
    const t = boot(1240);
    const ship = spawnContact(t, { factionId: 'faction_quiet' });
    t.sim.step();
    ship.data.ai.fsm = 'attack';
    ship.data.intent.fire = true;
    t.sim.step();
    return t.log.voices.map((v) => ({ situation: v.situation, text: v.text, factionId: v.factionId }));
  };
  assert.deepEqual(run(), run(), 'same seed/entity sequence produces identical bark transcript');
  ok('barkDirector line picks are replay-deterministic');
}

function testPackageRegistryAndSourceGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:bark-director'], 'node scripts/check-bark-director.mjs',
    'package exposes check:bark-director');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ barkDirector \} from '\.\.\/systems\/barkDirector\.js';/,
    'registry imports barkDirector system');
  // Commit 3f98e842 ("feat(lab): Phase 2 authoritative runtime profiles and system manifest") moved
  // the sim update order out of a flat identifier list in registry.js and into the authoritative
  // manifest; registry.js now materialises UPDATE_ORDER from PRODUCTION_UPDATE_ORDER. The order
  // itself did not change (factionPresence was inserted before aiSlot, which is why the old text
  // literal no longer matched). Assert the ordering the sentence actually claims, at its source.
  const aiIndex = PRODUCTION_UPDATE_ORDER.indexOf('aiSlot');
  const barkIndex = PRODUCTION_UPDATE_ORDER.indexOf('barkDirector');
  const encounterIndex = PRODUCTION_UPDATE_ORDER.indexOf('aiEncounter');
  assert.ok(aiIndex >= 0 && barkIndex >= 0 && encounterIndex >= 0,
    'aiSlot, barkDirector and aiEncounter are all in the production update order');
  assert.ok(aiIndex < barkIndex && barkIndex < encounterIndex,
    'barkDirector runs after AI and before aiEncounter in update order');

  const source = readFileSync(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  assert.match(source, /helpers\.voice/, 'barkDirector reads helpers.voice');
  assert.match(source, /voice\.say\(\{[\s\S]*channel: 'bark'/, 'barkDirector routes through voice.say bark channel');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'barkDirector uses no RNG, wall clock, performance clock, or timers');
  assert.doesNotMatch(source, /bus\.emit\('toast'|this\._emit\('toast'/,
    'barkDirector does not bypass voiceArbiter with direct toasts');
  assert.doesNotMatch(source, /grantCredits|chargeCredits|addCargo|removeCargo|applyRep/,
    'barkDirector does not directly write economy/cargo/rep');
  ok('package, registry, voice routing, and determinism guards are pinned');
}
