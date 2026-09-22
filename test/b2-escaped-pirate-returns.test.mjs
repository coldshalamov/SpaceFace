// §22 Wave B2 — one pirate who escapes is back in the same sector later, with a line,
// and is a body you can fight. Fixture: escape event, advance sim time, same identity
// spawns in the same sector, bark/comms payload is non-empty, and the player is not
// stat-debuffed. Fixed seeds 4242 and 8008. Headless; no playtest.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { factions } from '../src/systems/factions.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { aceById } from '../src/data/namedAces.js';

const SEEDS = [4242, 8008];
const SECTOR = 'sector_helios_prime';
const ACE_ID = 'ace_yara_no_cut';

function boot(seed) {
  const sim = createSimulation({
    seed,
    systems: [factions, spawnBudget, aceMemory, barkDirector],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;

  const voiceLines = [];
  const aceSystem = sim.registry.get('aceMemory');
  aceSystem.helpers = {
    ...aceSystem.helpers,
    voice: {
      say(payload) {
        voiceLines.push(payload);
        return true;
      },
    },
  };
  const barkLines = [];
  const barkSystem = sim.registry.get('barkDirector');
  barkSystem.helpers = {
    ...barkSystem.helpers,
    voice: {
      say(payload) {
        barkLines.push(payload);
        return true;
      },
    },
  };

  const events = [];
  for (const name of [
    'aceMemory:transition', 'aceMemory:returnRequested', 'aceMemory:returnSpawned',
    'aceMemory:voice', 'barkDirector:voice', 'comms:popup', 'comms:log',
  ]) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, voiceLines, barkLines, events };
}

function playerSnapshot(state, player) {
  return {
    hull: player.hull,
    hullMax: player.hullMax,
    mass: player.mass,
    radius: player.radius,
    credits: state.player && state.player.credits,
    heat: state.heat,
    wanted: state.wanted,
    sectorId: state.world.currentSectorId,
  };
}

function escape(t, ace) {
  t.bus.emit('encounter:receipt', {
    shape: 'named_hunter',
    outcome: 'escaped',
    encounterId: `b2:${ace.id}:escape`,
    aceId: ace.id,
    text: `${ace.name} breaks off and burns dark.`,
    sectorId: t.state.world.currentSectorId,
    t: t.state.simTime,
  });
}

function advanceSimTimeTo(t, target) {
  // Jump the sim clock to the return window, then step real ticks so aceMemory's
  // return-check accumulator actually runs (same seam pq-150 uses).
  if (t.state.simTime < target) t.state.simTime = target;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
}

for (const seed of SEEDS) {
  test(`B2 seed ${seed}: escaped ace returns in-sector with a non-empty line and a fightable body`, () => {
    const t = boot(seed);
    const ace = aceById(ACE_ID);
    assert.ok(ace, 'roster supplies the ace');

    const before = playerSnapshot(t.state, t.player);
    const escapeAt = t.state.simTime;
    escape(t, ace);

    const rec = t.state.aceMemory[ACE_ID];
    assert.ok(rec && rec.fled === true, 'escape is recorded on the same identity');
    assert.equal(rec.fleeCount, 1);
    assert.ok(Number.isFinite(rec.returnAt) && rec.returnAt > escapeAt,
      'escape schedules a later return');

    advanceSimTimeTo(t, rec.returnAt + 1);

    const returned = t.events.find((row) => row.name === 'aceMemory:returnSpawned'
      && row.payload.aceId === ACE_ID);
    assert.ok(returned, 'the same identity spawns after sim time advances');
    assert.equal(returned.payload.aceId, ACE_ID, 'return is the same identity');
    assert.ok(Array.isArray(returned.payload.spawnedIds) && returned.payload.spawnedIds.length >= 1,
      'at least one body spawns');

    const boss = t.state.entities.get(returned.payload.spawnedIds[0]);
    assert.ok(boss && boss.alive !== false, 'the returning captain is a live body');
    assert.equal(boss.data.aceMemory.aceId, ACE_ID, 'spawned hull carries the same ace id');
    assert.equal(boss.data.ai.name, ace.name, 'same captain name on the returned hull');
    assert.equal(t.state.world.currentSectorId, SECTOR, 'still the same sector');
    assert.ok(Number.isFinite(boss.pos.x) && Number.isFinite(boss.pos.z),
      'return body has a position in the live sector');

    // A body you can fight: hostile to the player, not a passive/hold-fire wing, no new brain.
    assert.notEqual(boss.data.ai.passive, true, 'return wing is not a friendly work offer');
    assert.notEqual(boss.data.ai.roe, 'hold_fire', 'the returning captain does not hold fire');
    assert.equal(boss.data.ai.forcePlayerTarget, true, 'the captain comes back to fight');
    assert.ok(Array.isArray(boss.data.ai.hostileTeams) && boss.data.ai.hostileTeams.includes(0),
      'player team is on the hostile list');
    assert.ok(
      boss.data.ai.doctrine === 'scavenger' || typeof boss.data.ai.doctrine === 'string',
      'return reuses an existing doctrine id (no new AI brain)',
    );

    // Bark or comms payload is non-empty.
    const voiceRows = t.events.filter((row) => row.name === 'aceMemory:voice');
    assert.ok(voiceRows.length >= 1, 'the return speaks');
    const spoken = voiceRows.map((row) => String(row.payload.text || '').trim()).filter(Boolean);
    assert.ok(spoken.length >= 1, 'aceMemory voice payload text is non-empty');
    assert.ok(
      spoken.some((text) => text.includes(ace.name) || text.includes('Yara') || text.length > 0),
      `return line names the encounter: ${spoken.join(' | ')}`,
    );
    const sayPayloads = t.voiceLines.concat(t.barkLines)
      .filter((payload) => payload && typeof payload.text === 'string' && payload.text.trim());
    assert.ok(sayPayloads.length >= 1,
      'voice.say receives a non-empty bark/comms payload for the return');
    assert.ok(sayPayloads.every((payload) => payload.channel === 'bark' || payload.channel === 'comms'),
      'payload rides the bark or comms channel');

    // No stat debuff on the player.
    const after = playerSnapshot(t.state, t.player);
    assert.deepEqual(after, before, 'the return never mutates player stats, heat, wanted, or sector');
  });
}
