#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { contactStateWord } from '../src/systems/scanner.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = resolve(ROOT, '.devshots/depth-program-e1-branch-log.json');

const SECTOR = Object.freeze({
  depth_h1_distress_from_inside: 'sector_helios_prime',
  depth_h2_drifting_bloom: 'sector_veil_nebula',
  depth_h3_wreck_that_knows_you: 'sector_io_reach',
  depth_h4_love_letter_buoy: 'sector_io_reach',
  depth_h5_corridor_massacre: 'sector_io_reach',
  depth_h6_patrol_ambush: 'sector_io_reach',
  depth_h7_spared_return: 'sector_io_reach',
  depth_h8_echo_of_player: 'sector_veil_nebula',
});

const MATRIX = Object.freeze([
  ['depth_h1_distress_from_inside', 'listen', 'listen'],
  ['depth_h1_distress_from_inside', 'board', 'boarded'],
  ['depth_h1_distress_from_inside', 'leave', 'left'],
  ['depth_h2_drifting_bloom', 'hail', 'hailed'],
  ['depth_h2_drifting_bloom', 'scan', 'scanned'],
  ['depth_h2_drifting_bloom', 'fire', 'fired'],
  ['depth_h3_wreck_that_knows_you', 'read', 'read'],
  ['depth_h3_wreck_that_knows_you', 'carry', 'carried'],
  ['depth_h3_wreck_that_knows_you', 'ignore', 'ignored'],
  ['depth_h4_love_letter_buoy', 'listen', 'heard'],
  ['depth_h4_love_letter_buoy', 'reseed', 'reseeded'],
  ['depth_h5_corridor_massacre', 'flee', 'fled'],
  ['depth_h5_corridor_massacre', 'publish', 'published'],
  ['depth_h5_corridor_massacre', 'engage', 'engaged'],
  ['depth_h6_patrol_ambush', 'concord', 'concord'],
  ['depth_h6_patrol_ambush', 'reach', 'reach'],
  ['depth_h6_patrol_ambush', 'wait', 'vultured'],
  ['depth_h8_echo_of_player', 'hail', 'hailed'],
  ['depth_h8_echo_of_player', 'break', 'shattered'],
]);

function boot(seed) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.story.beatIndex = 7;
  sim.state.story.playerChoiceLines = ['I came back for the names.'];
  sim.state.player.researchedNodes.push('tech_long_range_survey');
  const events = [];
  for (const name of [
    'encounter:resolved', 'encounter:receipt', 'faction:repDelta', 'faction:aggro',
    'news:headline', 'graffiti:show', 'ambientComms:register', 'ambientComms:toneChanged',
    'mission:offered', 'sensorGhost:swarm', 'salvage:fieldVulture',
  ]) sim.bus.on(name, (payload) => events.push({ name, payload: compact(payload) }));
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector'), events };
}
function force(t, shapeId, key, seed) {
  const sectorId = SECTOR[shapeId];
  t.state.world.currentSectorId = sectorId;
  const encounterId = `debug:e1:${seed}:${key}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId, encounterId, sectorId, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, JSON.stringify({ shapeId, key, result }));
  return encounterId;
}

function runBranch(shapeId, choiceId, expected, index, baseSeed) {
  const seed = baseSeed + index;
  const t = boot(seed);
  const id = force(t, shapeId, `${shapeId}:${choiceId}`, seed);
  if (shapeId === 'depth_h2_drifting_bloom' && choiceId === 'scan') {
    t.bus.emit('scan:pulse', { pos: { x: 0, z: 0 } });
  } else if (shapeId === 'depth_h2_drifting_bloom' && choiceId === 'fire') {
    const targetId = t.state.encounterDirector.live[id].ids[0];
    t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId, amount: 1 });
  } else {
    t.bus.emit('encounter:choose', { encounterId: id, choiceId });
  }
  if (shapeId === 'depth_h6_patrol_ambush' && choiceId === 'wait') {
    for (let tick = 0; tick <= 20; tick += 1) t.sim.step(1);
  }
  const rec = t.state.story.depthProgramEncounters.completed[shapeId];
  assert.equal(rec.outcome, expected);
  return {
    shapeId, branch: choiceId, outcome: rec.outcome, seed,
    persistentCargo: [...t.state.story.persistentCargo],
    flags: compact(t.state.story.flags),
    events: t.events,
  };
}

function runH7(baseSeed, disposition, choiceId) {
  const debtId = `held_out_${disposition}_${choiceId}`;
  let t = null;
  let debt = null;
  let seed = null;
  for (let offset = 0; offset < 128; offset += 1) {
    const candidateSeed = baseSeed + offset;
    const candidate = boot(candidateSeed);
    candidate.state.world.currentSectorId = SECTOR.depth_h7_spared_return;
    candidate.bus.emit('moralMemory:remember', {
      id: debtId, name: 'Held-Out Return', cause: 'spared', factionId: 'faction_reach',
    });
    const candidateDebt = candidate.state.story.moralMemory.debts[debtId];
    if (candidateDebt.disposition === disposition) {
      t = candidate; debt = candidateDebt; seed = candidateSeed; break;
    }
  }
  assert.ok(t && debt && seed != null, `missing deterministic H7 seed for ${disposition}/${choiceId}`);
  const id = force(t, 'depth_h7_spared_return', `h7:${disposition}:${choiceId}`, seed);
  const live = t.state.encounterDirector.live[id];
  assert.ok(live.ids.length >= (debt.disposition === 'vengeful' ? 3 : 1));
  t.bus.emit('encounter:choose', { encounterId: id, choiceId });
  const outcome = t.state.story.depthProgramEncounters.completed.depth_h7_spared_return.outcome;
  const expected = choiceId === 'refuse' ? 'refused' : (debt.disposition === 'ally' ? 'allied' : 'vengeful');
  assert.equal(outcome, expected);
  return {
    shapeId: 'depth_h7_spared_return', branch: `${disposition}:${choiceId}`, outcome, seed,
    debt: compact(debt), mercyCount: t.state.story.moralMemory.mercyCount, events: t.events,
  };
}

function runH8Mirror(seed) {
  const t = boot(seed);
  const shapeId = 'depth_h8_echo_of_player';
  const player = t.state.entities.get(t.state.playerId);
  player.data.defId = 'ship_kestrel';
  player.data.fittings = ['wpn_pulse_laser_s', null, 'mod_scanner_mk1', null, null, null];
  player.factionId = 'faction_free';
  player.data.factionId = player.factionId;
  player.data.team = player.team;
  let spawnedIdentity = null;
  t.bus.on('entity:spawned', ({ entity }) => {
    if (!entity?.data?.echoOfPlayer) return;
    spawnedIdentity = compact({
      defId: entity.data.defId,
      fittings: entity.data.fittings,
      team: entity.team,
      dataTeam: entity.data.team,
      callsign: entity.data.callsign,
      scanLabel: entity.data.scanLabel,
      role: entity.data.role,
      lootTableId: entity.data.lootTableId,
      silhouette: entity.data.silhouette,
      shipClass: entity.data.shipClass,
      archetype: entity.data.ai?.archetype,
      spawnContext: entity.data.ai?.spawnContext,
    });
  });
  const id = force(t, shapeId, 'h8:mirror', seed);
  const live = t.state.encounterDirector.live[id];
  const echo = t.state.entities.get(live.ids[0]);
  assert.deepEqual(spawnedIdentity, {
    defId: player.data.defId,
    fittings: player.data.fittings,
    team: player.team,
    dataTeam: player.team,
    callsign: 'Tessera Echo',
    scanLabel: 'Tessera Echo',
    role: 'echo',
    lootTableId: null,
    archetype: 'mirror_echo',
    spawnContext: 'anomaly_echo',
  });
  assert.equal(contactStateWord(echo, player.team, t.state), 'ECHO');
  const center = live.vars.mirrorCenter;
  echo.pos.x = center.x + 100; echo.pos.z = center.z; echo.vel.x = 12; echo.vel.z = 0;
  player.pos.x = center.x - 100; player.pos.z = center.z; player.vel.x = -12; player.vel.z = 0;
  for (let i = 0; i < 6; i += 1) t.sim.step(1);
  const outcome = t.state.story.depthProgramEncounters.completed[shapeId].outcome;
  assert.equal(outcome, 'synced');
  return {
    shapeId, branch: 'mirror_course_6s', outcome, seed, simCoordinates: true,
    spawnedIdentity, contactWord: contactStateWord(echo, player.team, t.state), events: t.events,
  };
}

function run(baseSeed = 47300) {
  const rows = MATRIX.map((entry, index) => runBranch(...entry, index, baseSeed));
  for (const disposition of ['ally', 'vengeful']) {
    for (const choiceId of ['ask', 'accept', 'refuse']) {
      rows.push(runH7(baseSeed + 70, disposition, choiceId));
    }
  }
  rows.push(runH8Mirror(baseSeed + 80));
  return rows;
}

const first = run();
const second = run();
assert.deepEqual(second, first, 'E1 forced branch artifact must be deterministic across processes/runs');
const report = {
  schemaVersion: 1,
  pass: true,
  authoredEncounters: 8,
  playableBranches: first.length,
  deterministicReplay: true,
  rows: first,
  unresolvedVisualAcceptance: ['H1 mayday screenshot', 'H8 mirror-contact screenshot'],
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`depth-program-e1 PASS (${first.length} branch rows)`);
console.log(OUT);

function compact(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}
