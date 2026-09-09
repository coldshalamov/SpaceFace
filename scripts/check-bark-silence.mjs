#!/usr/bin/env node
// BP-05.1/BARK-02 ambient bark decay + post-combat silence contract.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.ok(existsSync(new URL('../src/systems/barkDirector.js', import.meta.url)),
  'src/systems/barkDirector.js exists before BARK-02');
assert.ok(existsSync(new URL('../scripts/check-bark-silence.mjs', import.meta.url)),
  'scripts/check-bark-silence.mjs exists');

const mod = await import('../src/systems/barkDirector.js');
const barkDirector = mod.barkDirector || mod.default;
const {
  POST_COMBAT_SILENCE_S,
  AMBIENT_BASE_GAP_S,
  AMBIENT_GAP_STEP_S,
  AMBIENT_QUIET_STEP_S,
} = mod;

assert.equal(barkDirector && barkDirector.name, 'barkDirector', 'barkDirector remains the registry system');
assert.equal(Number.isFinite(POST_COMBAT_SILENCE_S), true, 'post-combat silence constant exported');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in bark silence path'); };
  Date.now = () => { throw new Error('Date.now in bark silence path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testPostCombatSilenceSuppressesOnlyFlavorBarks);
guarded(testAmbientGreetingDecayAndFloor);
testPackageAndSourceGuards();

console.log(`[check-bark-silence] PASS - ${sections} sections green`);

function boot(seed = 1301) {
  const sim = createSimulation({ seed, systems: [barkDirector, voiceArbiter] });
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_sker_haven';
  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 200,
    hullMax: 200,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  const log = { voices: [], toasts: [], silences: [] };
  bus.on('barkDirector:voice', (payload) => log.voices.push(payload));
  bus.on('barkDirector:silence', (payload) => log.silences.push(payload));
  bus.on('toast', (payload) => log.toasts.push(payload));
  return { sim, state, bus, helpers, player, log };
}

function spawnFlavor(t, situation, overrides = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: overrides.team ?? 2,
    factionId: overrides.factionId || 'faction_free',
    pos: overrides.pos || { x: 360 + (overrides.offset || 0), z: 0 },
    hull: 80,
    hullMax: 80,
    radius: 8,
    data: {
      barkSituation: situation,
      ai: {
        lawful: overrides.lawful ?? true,
        archetype: 'patrol_lawman',
        fsm: 'patrol',
        ...(overrides.ai || {}),
      },
      combat: { targetId: null },
      intent: { fire: false },
    },
  });
}

function runSeconds(sim, seconds) {
  sim.runTicks(Math.ceil(seconds / SIM_DT));
}

function testPostCombatSilenceSuppressesOnlyFlavorBarks() {
  const t = boot(1310);
  const taunter = spawnFlavor(t, 'taunt', { factionId: 'faction_reach', team: 1 });
  t.bus.emit('combat:outcome', { entityId: taunter.id, outcome: 'killed' });
  t.sim.step();

  assert.equal(t.log.silences.length, 1, 'combat outcome starts one bark silence receipt');
  assert.equal(t.log.voices.length, 0, 'taunt bark is suppressed during post-combat silence');
  assert.equal(t.state.barkDirector.suppressed.at(-1).reason, 'post-combat-silence',
    'suppression receipt names post-combat silence');
  assert.ok(t.state.barkDirector.postCombatSilenceUntil > t.state.simTime,
    'state stores a future postCombatSilenceUntil');

  t.helpers.voice.say({ channel: 'story', text: 'Story channel still has the floor.', ttl: 0.5, kind: 'story' });
  t.sim.step();
  assert.equal(t.log.toasts.at(-1).text, 'Story channel still has the floor.',
    'story channel still surfaces while flavor barks are silent');

  runSeconds(t.sim, POST_COMBAT_SILENCE_S + 0.2);
  t.sim.step();
  assert.equal(t.log.voices.length, 1, 'same suppressed flavor ship can speak after silence expires');
  assert.equal(t.log.voices[0].situation, 'taunt', 'expired silence releases the flavor bark');
  ok('post-combat silence suppresses only flavor barks, not critical voice channels');
}

function testAmbientGreetingDecayAndFloor() {
  const t = boot(1320);
  spawnFlavor(t, 'patrol-greeting', { offset: 0 });
  t.sim.step();
  assert.equal(t.log.voices.length, 1, 'first patrol greeting is allowed');
  const firstAmbient = t.state.barkDirector.ambientBySector.sector_sker_haven;
  assert.equal(firstAmbient.lastGap, AMBIENT_BASE_GAP_S, 'fresh sector uses the base ambient gap');

  const suppressedProbe = spawnFlavor(t, 'patrol-greeting', { offset: 40 });
  t.sim.step();
  assert.equal(t.log.voices.length, 1, 'second immediate patrol greeting is decayed out');
  assert.equal(t.state.barkDirector.suppressed.at(-1).reason, 'ambient-decay',
    'ambient suppression records decay as the reason');
  suppressedProbe.data.barkDirectorSuppressed = true;

  runSeconds(t.sim, AMBIENT_QUIET_STEP_S + AMBIENT_BASE_GAP_S + 0.2);
  spawnFlavor(t, 'patrol-greeting', { offset: 80 });
  t.sim.step();
  assert.equal(t.log.voices.length, 2, 'patrol greeting returns after the decayed gap');
  const secondAmbient = t.state.barkDirector.ambientBySector.sector_sker_haven;
  assert.equal(secondAmbient.lastGap, AMBIENT_BASE_GAP_S + AMBIENT_GAP_STEP_S,
    'quiet-sector ambient gap grows after one quiet bucket');
  assert.ok(secondAmbient.nextAt > t.state.simTime, 'ambient cadence always schedules a next floor, not permanent silence');
  ok('ambient patrol greetings decay in frequency with a nonzero floor');
}

function testPackageAndSourceGuards() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['check:bark-silence'], 'node scripts/check-bark-silence.mjs',
    'package exposes check:bark-silence');

  const source = readFileSync(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  assert.match(source, /postCombatSilenceUntil/, 'barkDirector stores postCombatSilenceUntil');
  assert.match(source, /ambientBySector/, 'barkDirector stores per-sector ambient decay');
  assert.match(source, /FLAVOR_SITUATIONS/, 'post-combat silence is scoped to flavor situations');
  assert.doesNotMatch(source, /Math\.random|Date\.now|performance\.now|setTimeout|setInterval/,
    'bark silence path uses no RNG, wall-clock time, performance clock, or timers');
  assert.doesNotMatch(source, /bus\.emit\('toast'|this\._emit\('toast'/,
    'bark silence path does not bypass voiceArbiter with direct toasts');
  ok('package and source guards pin BARK-02 scope');
}
