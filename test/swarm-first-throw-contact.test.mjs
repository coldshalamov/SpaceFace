// Runs the production announcer callback and current production massline-impact observer.
// Dependency ports are explicit: no browser, DOM, renderer, physics step or full registry is booted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const announcerSource = read('src/systems/survivalAnnounce.js');
const impactsSource = read('src/systems/masslineImpacts.js');
const hostilitySource = read('src/systems/scannerReadModel.js');
const WASP = { id: 'wasp_swarmer', name: 'Wasp Swarmer', counterHint: '' };

function evaluate(source, expression, ports = {}) {
  const stripped = source
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '')
    .replace(/export\s+default\s+\w+\s*;/g, '')
    .replace(/export\s+/g, '');
  return vm.runInNewContext(`${stripped}\n;${expression}`, ports);
}

function makeBus() {
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn);
      listeners.set(name, rows);
      return () => {
        const index = rows.indexOf(fn);
        if (index >= 0) rows.splice(index, 1);
      };
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
  };
}

const productionHostility = evaluate(hostilitySource, 'isHostileToPlayer', {
  CONTACT_HAIL_RANGE: 0,
  authoritativeAssignmentTargetId: () => null,
  isPlayerWanted: () => false,
});

function harness({ runPatch = {}, planPatch = {}, rockPatch = {}, victimPatch = {}, ratingT = 0 } = {}) {
  const player = { id: 1, alive: true, occupantGeneration: 101, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 16 };
  const rock = { id: 2, alive: true, occupantGeneration: 202, type: 'asteroid',
    pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 220,
    data: { swarmArenaDebris: true, openingTerrainSlot: 0, tetherPayload: true }, ...rockPatch };
  const victim = { id: 3, alive: true, occupantGeneration: 303, type: 'ship', team: 1,
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { runCohort: 'survival', runWave: 1, lootTableId: 'wasp_swarmer',
      combat: { targetId: player.id }, ai: { forcePlayerTarget: true, huntPlayer: true } }, ...victimPatch };
  const state = {
    mode: 'flight', simTime: 0, tick: 0, playerId: player.id,
    run: { kind: 'survival', ruleset: 'swarm', phase: 'wave_intro', wave: 1, seed: 4242,
      arenaId: 'helios_core', arenaMutators: [], ...runPatch },
    rockCore: { ratingT },
    entities: new Map([[player.id, player], [rock.id, rock], [victim.id, victim]]),
    entityList: [player, rock, victim],
    player: { tether: { active: false, targetId: null } },
    ui: { screenStack: [] },
  };
  const bus = makeBus();
  const announce = evaluate(announcerSource, 'survivalAnnounce', {
    ENEMY_TYPES: [WASP], SURVIVAL_TEMPLATE_BLOCK: 30,
    physicalProblemFromPackages: () => null, shippedQuestionFor: () => null,
    SWARM_CHAMPION_LEAD_WAVES: 3, swarmNextBossFor: () => null, SWARM_AFFIX_BY_ID: {},
    validateRunState: () => ({ ok: true }), SURVIVAL_ARENA_INTRO_TICKS: 60,
    SURVIVAL_WAVE_INTRO_TICKS: 60, playerBearingName: () => 'east',
    CRYO_ARENA_ID: 'cryo', GATE_BEARINGS: { east: { x: 1, z: 0 } },
    isSwarmSpecialistRun: () => false, swarmSpecialistBriefForEnemy: () => null,
    occupantGenerationOf: entity => entity?.occupantGeneration ?? null,
    isHostileToPlayer: productionHostility,
  });
  announce.init({ state, bus });
  // The line's existing plan composition is outside this focused seam; retain the real event setup,
  // arming, contact callback and line-budget owner without fabricating an opener.
  announce._speakOpening = () => true;
  const plan = { packages: [{ enemyId: 'wasp_swarmer', role: 'mass', count: 1, gateGroup: 'east' }],
    swarm: {}, ...planPatch };
  bus.emit('run:wavePlanned', { wave: 1, plan });
  state.run = { ...state.run, phase: 'active' };
  bus.emit('run:waveStarted', { wave: 1, tick: 0 });

  const impacts = evaluate(impactsSource, 'masslineImpacts', {
    massline2Flag: () => false,
    queryNearbyEntities: (_state, _center, _radius, _scratch, candidates) => candidates,
    isHostileToPlayer: productionHostility,
  });
  impacts.init({ state, bus });
  return { state, bus, announce, impacts, player, rock, victim, plan,
    voices: () => bus.emitted.filter(event => event.name === 'voice:say').map(event => event.payload) };
}

function latchCourtRock(h) {
  h.state.player.tether = { active: true, targetId: h.rock.id, attachmentId: 'line-1' };
  h.bus.emit('tether:latched', { sourceId: h.player.id, targetId: h.rock.id,
    attachmentId: 'line-1', type: 'tether_standard' });
  // Seed the real observer's on-line tracker while there is no contact yet.
  h.impacts.update(1 / 60, h.state);
}

function makeContact(h, { slung = false, gap = 0, mass = h.rock } = {}) {
  if (slung) h.state.player.tether = { active: false, targetId: null };
  mass.pos = { x: 40, z: 0 };
  mass.vel = { x: 60, z: 0 };
  h.victim.pos = { x: 42 + gap, z: 0 };
  h.victim.vel = { x: 0, z: 0 };
  h.state.simTime += 1 / 60;
  h.state.tick += 1;
  h.impacts.update(1 / 60, h.state);
  return h.state.player.masslineImpacts?.latest;
}

test('ordinary wave-one court rock acknowledgement follows a real current Massline contact once', () => {
  const h = harness();
  latchCourtRock(h);
  const receipt = makeContact(h);
  assert.ok(receipt, 'the production impact observer generated its normal contact record');
  assert.equal(receipt.slung, false, 'a held swing is valid; release is not forced');
  assert.equal(h.state.player.masslineImpacts.latest, receipt);
  assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 1);
  assert.equal(h.voices().at(-1).channel, 'bark', 'the contact yields to objective, tutorial and danger');
  assert.equal(h.voices().at(-1).text, 'Rock strike: Wasp Swarmer. Keep moving.');
  assert.equal(h.state.run.wave, 1, 'the announcer remains a read-only observer');
  h.bus.emit('tether:whipImpact', receipt);
  assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 1,
    'duplicate delivery of the exact receipt is idempotent');
});

test('a released swing still acknowledges the exact court rock when its real contact lands', () => {
  const h = harness();
  latchCourtRock(h);
  const receipt = makeContact(h, { slung: true });
  assert.ok(receipt);
  assert.equal(receipt.slung, true);
  assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 1);
});

test('the authored debris-material court slot remains eligible as its production wreck body', () => {
  const h = harness({ rockPatch: { type: 'wreck', data: { swarmArenaDebris: true,
    openingTerrainSlot: 3, tetherPayload: true } } });
  latchCourtRock(h);
  const receipt = makeContact(h);
  assert.ok(receipt, 'the current Massline observer accepts the shipped wreck collider');
  assert.equal(receipt.targetId, h.rock.id);
  assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 1);
});

test('training, circuit, non-Foundry, mutator, upgraded tier and later-wave plans retain their owners', () => {
  const plans = [
    { planPatch: { openingLesson: { holdTicks: 2700 } } },
    { planPatch: { swarm: { circuit: { stage: 1 } } } },
    { runPatch: { arenaId: 'cryo' } },
    { runPatch: { arenaMutators: ['reef'] } },
    { runPatch: { wave: 2 } },
  ];
  for (const config of plans) {
    const h = harness(config);
    latchCourtRock(h);
    makeContact(h);
    assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 0,
      JSON.stringify(config));
  }
  const upgraded = harness({ ratingT: 1 });
  latchCourtRock(upgraded); makeContact(upgraded);
  assert.equal(upgraded.voices().filter(line => line.id === 'survival:w1:court-impact').length, 0);
});

test('only a player-latched authored court rock and live hostile wave-one body can qualify', () => {
  const wrongSource = harness();
  wrongSource.state.player.tether = { active: true, targetId: 2 };
  wrongSource.bus.emit('tether:latched', { sourceId: 999, targetId: 2 });
  wrongSource.impacts.update(1 / 60, wrongSource.state);
  makeContact(wrongSource);
  assert.equal(wrongSource.voices().filter(line => line.id.includes('court-impact')).length, 0);

  const unmarked = harness({ rockPatch: { data: { swarmArenaDebris: true, tetherPayload: true } } });
  latchCourtRock(unmarked); makeContact(unmarked);
  assert.equal(unmarked.voices().filter(line => line.id.includes('court-impact')).length, 0);

  const laterRoundBank = harness({ rockPatch: { data: { swarmArenaDebris: true,
    openingTerrainSlot: 8, tetherPayload: true } } });
  latchCourtRock(laterRoundBank); makeContact(laterRoundBank);
  assert.equal(laterRoundBank.voices().filter(line => line.id.includes('court-impact')).length, 0,
    'round-two/three bank slots cannot masquerade as the eight-rock wave-one court');

  const neutral = harness();
  neutral.victim.team = neutral.player.team;
  latchCourtRock(neutral); makeContact(neutral);
  assert.equal(neutral.voices().filter(line => line.id.includes('court-impact')).length, 0);

  const posthumous = harness();
  latchCourtRock(posthumous);
  posthumous.victim.alive = false;
  makeContact(posthumous);
  assert.equal(posthumous.voices().filter(line => line.id.includes('court-impact')).length, 0);
});

test('stale, forged, non-current and unrelated contact records cannot trigger the line', () => {
  const h = harness();
  latchCourtRock(h);
  const actual = makeContact(h);
  const before = h.voices().filter(line => line.id.includes('court-impact')).length;
  h.state.simTime += 1 / 60; h.state.tick += 1;
  h.bus.emit('tether:whipImpact', actual);
  h.bus.emit('tether:whipImpact', { targetId: h.rock.id, victimId: h.victim.id, slung: true,
    time: h.state.simTime, tick: h.state.tick });
  assert.equal(h.voices().filter(line => line.id.includes('court-impact')).length, before);

  const unrelated = harness();
  latchCourtRock(unrelated);
  unrelated.state.player.tether = { active: true, targetId: 44 };
  unrelated.state.entities.set(44, { id: 44, alive: true, occupantGeneration: 404,
    type: 'asteroid', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    data: { swarmArenaDebris: true } });
  unrelated.impacts.update(1 / 60, unrelated.state);
  const otherRock = unrelated.state.entities.get(44);
  const receipt = makeContact(unrelated, { mass: otherRock });
  assert.equal(receipt.targetId, 44);
  assert.equal(unrelated.voices().filter(line => line.id.includes('court-impact')).length, 0);
});

test('recycled player/rock identities and absent body generations fail closed', () => {
  for (const which of ['player', 'rock']) {
    const h = harness();
    latchCourtRock(h);
    h[which].occupantGeneration += 1;
    makeContact(h);
    assert.equal(h.voices().filter(line => line.id.includes('court-impact')).length, 0, which);
  }
  const unstamped = harness();
  unstamped.rock.occupantGeneration = null;
  latchCourtRock(unstamped); makeContact(unstamped);
  assert.equal(unstamped.voices().filter(line => line.id.includes('court-impact')).length, 0);
});

test('the low-priority cue leaves a final line for the existing round result and does not exceed five', () => {
  const h = harness();
  h.announce._linesThisWave = 3;
  latchCourtRock(h); makeContact(h);
  assert.equal(h.voices().filter(line => line.id === 'survival:w1:court-impact').length, 1);
  assert.equal(h.announce._linesThisWave, 4);
  h.bus.emit('run:waveCleared', { wave: 1, killed: 1, admitted: 1 });
  assert.ok(h.voices().some(line => line.id === 'survival:w1:clear'));
  assert.equal(h.announce._linesThisWave, 5);

  const full = harness();
  full.announce._linesThisWave = 4;
  latchCourtRock(full); makeContact(full);
  assert.equal(full.voices().filter(line => line.id === 'survival:w1:court-impact').length, 0);
});

test('a saved latest read-model receipt is not polled or replayed after a fresh announcer start', () => {
  const h = harness();
  latchCourtRock(h);
  const receipt = makeContact(h);
  assert.ok(receipt);
  const before = h.voices().length;
  h.announce.destroy();
  h.announce.init({ state: h.state, bus: h.bus });
  h.announce._speakOpening = () => true;
  h.state.run = { ...h.state.run, phase: 'wave_intro' };
  h.bus.emit('run:wavePlanned', { wave: 1, plan: h.plan });
  h.state.run = { ...h.state.run, phase: 'active' };
  h.bus.emit('tether:latched', { sourceId: h.player.id, targetId: h.rock.id });
  h.bus.emit('tether:whipImpact', receipt);
  assert.equal(h.voices().length, before, 'the same current receipt object cannot replay');
  assert.equal(h.announce._linesThisWave, 0, 'loading never polls the saved impact log for feedback');
});
