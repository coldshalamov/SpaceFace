import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { encounterDirector, PURSUIT_RESOLVE_S } from '../src/systems/encounterDirector.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { PATROL_INTERVENTION_HAILS } from '../src/data/barks.js';
import { inventoryText } from '../scripts/lib/localizationInventory.mjs';

const cases = [
  ['sector_helios_prime', { x: 400, z: 0 }, 'faction_scn'],
  ['sector_tethys_junction', { x: 1050, z: 380 }, 'faction_mts'],
  ['sector_ceres_belt', { x: 500, z: -700 }, 'faction_dmc'],
  ['sector_io_reach', { x: -1400, z: 1200 }, 'faction_free'],
];

function setup({ sectorId = 'sector_tethys_junction', local = { x: 1050, z: 380 },
  owner = 'faction_mts', node, conflicts, acceptVoice = true, seed = 4242 } = {}) {
  const says = [], logs = [], voices = [], interventions = [];
  const voice = { say(req) { says.push(req); return acceptVoice; } };
  const sim = createSimulation({ seed, systems: [spawnBudget, encounterDirector, barkDirector], helpers: { voice } });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.world.sectors = sectorId ? { [sectorId]: { owner } } : {};
  if (node) state.sectorSim = { field: { nodes: { [sectorId]: node } } };
  state.conflicts = conflicts || {};
  const pos = sectorLocalToGlobalForSector(local, sectorId);
  const player = sim.spawn({ type: 'ship', team: 0, pos, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
  state.playerId = player.id;
  const attacker = sim.spawn({ type: 'ship', team: 1, pos: { x: pos.x + 380, z: pos.z },
    vel: { x: 0, z: 0 }, hull: 180, hullMax: 180, radius: 12,
    data: { ai: { archetype: 'pirate', targetId: player.id }, combat: { targetId: player.id } } });
  bus.on('comms:log', (p) => logs.push(p));
  bus.on('barkDirector:voice', (p) => voices.push(p));
  bus.on('encounter:patrolIntervened', (p) => interventions.push(p));
  return { sim, state, bus, attacker, player, says, logs, voices, interventions, director: sim.registry.get('encounterDirector') };
}
function intervene(h) {
  h.director._tickHostilePursuitResolution(h.state.encounterDirector, h.state, 1);
  h.director._tickHostilePursuitResolution(h.state.encounterDirector, h.state, 1 + PURSUIT_RESOLVE_S);
  assert.equal(h.interventions.length, 1);
  return h.interventions[0];
}

test('actual pursuit resolution uses matching sector owner and zone, with the same spoken and logged line', () => {
  for (const [sectorId, local, owner] of cases) {
    const h = setup({ sectorId, local, owner });
    const e = intervene(h), patrol = h.state.entities.get(e.patrolId);
    assert.equal(e.jurisdiction, owner, sectorId);
    assert.equal(e.factionId, owner);
    assert.equal(patrol.factionId, owner);
    assert.equal(patrol.data.ai.securityTargetId, h.attacker.id);
    assert.equal(patrol.data.ai.lawful, true);
    assert.equal(patrol.data.ai.roe, 'weapons_free');
    assert.equal(patrol.data.ai.engagementTrigger, 'security_response');
    h.state.simTime = 601;
    h.state.tick = 120;
    const verdict = authorizeAIEngagement({ state: h.state, self: patrol, target: h.attacker,
      objectiveReason: 'combat_doctrine:interceptor_flyby:strike' });
    assert.equal(verdict.ok, true, `${owner} response must retain fire authority: ${verdict.reason}`);
    assert.equal(h.logs.length, 1);
    assert.equal(h.logs[0].from, PATROL_INTERVENTION_HAILS[owner].name);
    assert.equal(h.logs[0].text, e.hailText);
    assert.equal(h.voices.length, 1);
    assert.equal(h.voices[0].text, e.hailText);
    assert.equal(h.says[0].text, e.hailText);
    assert.equal(h.says[0].valid(), true);
    h.bus.emit('encounter:patrolIntervened', e);
    assert.equal(h.voices.length, 1, 'duplicate receipt cannot repeat the voice');
    patrol.alive = false;
    assert.equal(h.says[0].valid(), false, 'dead responder cannot surface a queued voice');
    assert.equal(h.attacker.hull, 180);
  }
});

test('unknown, neutral, foreign, contested and changed control keep jurisdiction unknown', () => {
  const scenarios = [
    { sectorId: null },
    { sectorId: 'sector_unknown' },
    { owner: null },
    { owner: 'faction_dmc' },
    { owner: 'faction_reach' },
    { local: { x: -1380, z: 420 } },
    { local: { x: 9000, z: 9000 } },
    { node: { dominantFactionId: 'faction_mts', contestMargin: 0.03 } },
    { node: { dominantFactionId: 'faction_mts', contestMargin: 0.14, driver: { influence: 'contested_influence' } } },
    { node: { dominantFactionId: 'faction_dmc', contestMargin: 0.8 } },
    { conflicts: { 'faction_dmc:faction_mts': { state: 'war' } } },
  ];
  for (const scenario of scenarios) {
    const h = setup(scenario), e = intervene(h);
    assert.equal(e.jurisdiction, null, JSON.stringify(scenario));
    assert.equal(e.factionId, 'faction_scn', 'original fallback hull retained');
    assert.equal(h.logs[0].from, PATROL_INTERVENTION_HAILS.unknown.name);
    assert.equal(h.voices[0].text, h.logs[0].text);
    assert.ok(PATROL_INTERVENTION_HAILS.unknown.lines.some((row) => row.text === h.logs[0].text));
  }
});

test('intervention waits for threshold and does not repeat or consume rejected voice', () => {
  const h = setup({ acceptVoice: false });
  const dir = h.state.encounterDirector;
  h.director._tickHostilePursuitResolution(dir, h.state, 1);
  h.director._tickHostilePursuitResolution(dir, h.state, PURSUIT_RESOLVE_S);
  assert.equal(h.interventions.length, 0);
  h.director._tickHostilePursuitResolution(dir, h.state, PURSUIT_RESOLVE_S + 1);
  assert.equal(h.interventions.length, 1);
  assert.equal(h.voices.length, 0);
  h.director._tickHostilePursuitResolution(dir, h.state, PURSUIT_RESOLVE_S + 10);
  assert.equal(h.interventions.length, 1);
  const bark = h.sim.registry.get('barkDirector');
  bark.helpers.voice.say = (req) => { h.says.push(req); return true; };
  h.bus.emit('encounter:patrolIntervened', h.interventions[0]);
  assert.equal(h.voices.length, 1, 'refused voice did not consume the situation');
});

test('every intervention line and sender is recognized by the real localization extractor', () => {
  const config = JSON.parse(readFileSync(new URL('../scripts/localization-surfaces.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('../src/data/barks.js', import.meta.url), 'utf8');
  const messages = new Set(inventoryText({ path: 'src/data/barks.js', source, config }).map((e) => e.message));
  for (const row of Object.values(PATROL_INTERVENTION_HAILS)) {
    assert.ok(messages.has(row.name), row.name);
    for (const line of row.lines) assert.ok(messages.has(line.text), line.text);
  }
});
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink } from '../src/core/simLaneCommands.js';

test('production worker encounter, voice and comms cross the main-lane bridge', async () => {
  const host = createSimHost(), main = createGameState(4242), bus = createBus();
  let receive, initRequest;
  const asWorker = async fn => {
    const sink = laneCommandSink(); uninstallSimCommandSink();
    try { return await fn(); } finally { if (sink) installSimCommandSink(sink); }
  };
  const lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; }, post(msg) { if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  const log = [], voice = [];
  bus.on('comms:log', p => log.push(p));
  bus.on('barkDirector:voice', p => voice.push(p));
  try {
    const contract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8'));
    const init = await asWorker(() => host.init({ ...initRequest, profile: 'production', seed: 4242, scenarioContract: contract, bridgeAll: true }));
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init }));
    await lane.readyPromise;
    const { state, runtime, registry } = host.host;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_tethys_junction';
    state.world.sectors['sector_tethys_junction'].owner = 'faction_mts';
    // Keep test authority explicit and avoid depending on a seeded unrelated war.
    state.conflicts = {};
    state.sectorSim.field.nodes.sector_tethys_junction = { dominantFactionId: 'faction_mts', contestMargin: 0.8 };
    const pos = sectorLocalToGlobalForSector({ x: 1050, z: 380 }, 'sector_tethys_junction');
    const player = runtime.spawn({ type: 'ship', team: 0, pos, vel: { x: 0, z: 0 }, hull: 200, hullMax: 200, radius: 6 });
    state.playerId = player.id;
    const attacker = runtime.spawn({ type: 'ship', team: 1, pos: { x: pos.x + 380, z: pos.z }, vel: { x: 0, z: 0 }, hull: 180, hullMax: 180, radius: 12,
      data: { ai: { targetId: player.id }, combat: { targetId: player.id } } });
    const director = registry.get('encounterDirector');
    await asWorker(() => {
      director._tickHostilePursuitResolution(state.encounterDirector, state, 1);
      director._tickHostilePursuitResolution(state.encounterDirector, state, 1 + PURSUIT_RESOLVE_S);
    });
    const reply = await asWorker(() => host.tick({ tick: 1, steps: 0, commands: [], generation: 0 }));
    receive(structuredClone({ kind: 'clockTick', ...reply }));
    const delivered = log.find(x => x.from === 'MERIDIAN TRADE');
    assert.ok(delivered, 'comms reaches main from production host');
    assert.ok(voice.some(x => x.reason === 'encounter:patrolIntervened' && x.text === delivered.text), 'same voice reaches main');
    assert.equal(attacker.hull, 180);
  } finally { lane.close(); host.shutdown(); }
});

test('queued intervention voice expires if its patrol id is recycled', () => {
  const h = setup(), e = intervene(h), req = h.says[0];
  const old = h.state.entities.get(e.patrolId);
  const generation = old.occupantGeneration;
  old.occupantGeneration = (generation ?? 0) + 1;
  assert.equal(req.valid(), false, 'a changed occupant generation invalidates the queued voice');
  old.occupantGeneration = generation;
  h.sim.helpers.removeEntity(old.id, { immediate: true });
  const replacement = h.sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, hull: 50, hullMax: 50, data: {} });
  assert.equal(replacement.id, old.id, 'fixture exercises core id reuse');
  assert.equal(req.valid(), false, 'a recycled id is not the original speaker');
});


test('all authored intervention lines are selectable by actual encounters', () => {
  for (const [sectorId, local, owner] of [...cases, ['sector_unknown', { x: 0, z: 0 }, null]]) {
    const expected = PATROL_INTERVENTION_HAILS[owner || 'unknown'].lines.map(row => row.text);
    const heard = new Set();
    for (let seed = 1; seed <= 80 && heard.size < expected.length; seed++) {
      const h = setup({ sectorId, local, owner, seed });
      const e = intervene(h);
      assert.equal(h.voices[0].text, e.hailText);
      heard.add(e.hailText);
      h.sim.dispose();
    }
    assert.deepEqual(heard, new Set(expected), `${owner || 'unknown'} rows must all reach the listener`);
  }
});

test('jurisdiction reads live ownership at response time, including a sector flip', () => {
  const h = setup();
  h.director._tickHostilePursuitResolution(h.state.encounterDirector, h.state, 1);
  h.state.world.sectors.sector_tethys_junction.owner = 'faction_dmc';
  h.director._tickHostilePursuitResolution(h.state.encounterDirector, h.state, 1 + PURSUIT_RESOLVE_S);
  assert.equal(h.interventions.length, 1);
  assert.equal(h.interventions[0].jurisdiction, null);
  assert.equal(h.logs[0].from, PATROL_INTERVENTION_HAILS.unknown.name);
  assert.equal(h.voices[0].text, h.logs[0].text);
});
