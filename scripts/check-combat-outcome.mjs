#!/usr/bin/env node
// BP-02.1/C9 Kills-Less-Central Outcomes contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/combatOutcome.js', import.meta.url)),
  'src/systems/combatOutcome.js exists');

const mod = await import('../src/systems/combatOutcome.js');
const combatOutcome = mod.combatOutcome || mod.default;
const { combatOutcomeForEntity } = mod;

assert.equal(combatOutcome && combatOutcome.name, 'combatOutcome', 'combatOutcome exports registry system');
assert.equal(typeof combatOutcomeForEntity, 'function', 'combatOutcomeForEntity helper exported');

let sections = 0;
function ok(label) {
  sections++;
  console.log(`  PASS ${label}`);
}

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in combat outcome path'); };
  Date.now = () => { throw new Error('Date.now in combat outcome path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testAiFleeRecordsOneOutcomeAndVoice);
guarded(testForceFleeUpdatePath);
guarded(testSubsystemDisableOutcomeAndConsequence);
guarded(testKilledAndSurrenderedOutcomes);
guarded(testIgnoresCiviliansAndNonTerminalSubsystems);
testPackageAndRegistryWiring();

console.log(`[check-combat-outcome] PASS - ${sections} sections green`);

function boot(seed = 909) {
  const voices = [];
  const sim = createSimulation({
    seed,
    helpers: {
      voice: {
        say(payload) {
          voices.push(payload);
          return true;
        },
      },
    },
    systems: [combatOutcome],
  });
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
  const log = { outcomes: [], consequences: [], voices };
  bus.on('combat:outcome', (payload) => log.outcomes.push(payload));
  bus.on('combat:outcomeConsequence', (payload) => log.consequences.push(payload));
  return { sim, state, bus, player, log };
}

function spawnHostile(t, overrides = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: 1,
    factionId: 'faction_reach',
    pos: { x: 180, z: 0 },
    hull: 60,
    hullMax: 120,
    radius: 8,
    data: {
      name: 'Reach Raider',
      shipClass: 'fighter',
      bountyCr: 300,
      combat: { targetId: t.state.playerId },
      ai: { hostileTeams: [0], archetype: 'pirate_raider' },
      ...(overrides.data || {}),
    },
    ...overrides,
  });
}

function testAiFleeRecordsOneOutcomeAndVoice() {
  const t = boot();
  const raider = spawnHostile(t);
  t.bus.emit('ai:flee', { entityId: raider.id });
  t.bus.emit('ai:flee', { entityId: raider.id });
  const rec = combatOutcomeForEntity(t.state, raider.id);
  assert.equal(rec.outcome, 'fled', 'ai:flee records fled outcome');
  assert.equal(rec.reason, 'ai:flee', 'fled reason records source event');
  assert.equal(t.log.outcomes.length, 1, 'flee outcome emits once');
  assert.equal(t.log.consequences.length, 1, 'flee emits one consequence seam');
  assert.equal(t.log.voices.length, 1, 'flee routes exactly one voice line');
  assert.match(t.log.voices[0].text, /fled the fight/i, 'voice line says fled');
  ok('ai:flee records one fled outcome and one voice line');
}

function testForceFleeUpdatePath() {
  const t = boot(910);
  const raider = spawnHostile(t);
  raider.data.ai.forceFlee = true;
  t.sim.step();
  const rec = combatOutcomeForEntity(t.state, raider.id);
  assert.equal(rec.outcome, 'fled', 'live forceFlee state records fled outcome');
  assert.equal(rec.reason, 'forceFlee', 'forceFlee reason records live-state path');
  assert.equal(t.log.outcomes.length, 1, 'forceFlee emits exactly one outcome');
  ok('live data.ai.forceFlee path records a fled outcome without AI edits');
}

function testSubsystemDisableOutcomeAndConsequence() {
  const t = boot(911);
  const raider = spawnHostile(t);
  t.bus.emit('combat:subsystemDisabled', { entityId: raider.id, subsystemId: 'subsystem_drive' });
  const rec = combatOutcomeForEntity(t.state, raider.id);
  assert.equal(rec.outcome, 'disabled', 'drive disable records disabled outcome');
  assert.equal(rec.reason, 'subsystem_drive', 'disabled reason records subsystem');
  assert.equal(t.log.consequences[0].outcome, 'disabled', 'disabled emits consequence hook');
  assert.equal(t.log.voices.length, 1, 'disabled emits one voice line');
  assert.match(t.log.voices[0].text, /disabled/i, 'disabled voice line is readable');
  ok('terminal subsystem disable records disabled outcome and consequence seam');
}

function testKilledAndSurrenderedOutcomes() {
  const killedRun = boot(912);
  const killed = spawnHostile(killedRun);
  killedRun.bus.emit('entity:killed', {
    id: killed.id,
    killerId: killedRun.state.playerId,
    type: 'ship',
    pos: killed.pos,
    factionId: killed.factionId,
    victimClass: 'fighter',
    bountyCr: 300,
  });
  assert.equal(combatOutcomeForEntity(killedRun.state, killed.id).outcome, 'killed',
    'entity:killed records killed outcome beside the shipped kill event');

  const surrenderRun = boot(913);
  const surrender = spawnHostile(surrenderRun);
  surrenderRun.bus.emit('combat:surrendered', { entityId: surrender.id });
  assert.equal(combatOutcomeForEntity(surrenderRun.state, surrender.id).outcome, 'surrendered',
    'combat:surrendered records surrendered outcome');
  assert.equal(killedRun.log.voices.length, 1, 'killed speaks once');
  assert.equal(surrenderRun.log.voices.length, 1, 'surrender speaks once');
  ok('killed and surrendered outcomes are recorded through event seams');
}

function testIgnoresCiviliansAndNonTerminalSubsystems() {
  const t = boot(914);
  const civilian = t.sim.spawn({
    type: 'ship',
    team: 2,
    factionId: 'faction_free',
    pos: { x: 220, z: 0 },
    hull: 80,
    hullMax: 80,
    radius: 8,
    data: {
      name: 'Free Trader',
      combat: { targetId: null },
      ai: { passive: true, archetype: 'trader' },
    },
  });
  t.bus.emit('ai:flee', { entityId: civilian.id });
  t.bus.emit('combat:subsystemDisabled', { entityId: civilian.id, subsystemId: 'subsystem_sensor' });
  assert.equal(combatOutcomeForEntity(t.state, civilian.id), null, 'civilian/nonterminal events are ignored');
  assert.equal(t.log.outcomes.length, 0, 'ignored events emit no outcomes');
  assert.equal(t.log.voices.length, 0, 'ignored events emit no voice');
  ok('combatOutcome ignores civilians and non-terminal subsystem disables');
}

function testPackageAndRegistryWiring() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:combat-outcome'], 'node scripts/check-combat-outcome.mjs',
    'package exposes check:combat-outcome');

  const registry = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(registry, /import \{ combatOutcome \} from '\.\.\/systems\/combatOutcome\.js';/,
    'registry imports combatOutcome system');
  assert.match(registry, /combat, combatOutcome, tetherGameplay/,
    'combatOutcome is registered after combat and before tetherGameplay');

  const source = readFileSync(new URL('../src/systems/combatOutcome.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'combatOutcome path uses no RNG, wall-clock time, or timers');
  assert.doesNotMatch(source, /grantCredits|chargeCredits|addCargo|removeCargo|applyRep/,
    'combatOutcome does not directly write economy/cargo/rep');
  ok('package, registry, determinism, and single-writer guards are pinned');
}
