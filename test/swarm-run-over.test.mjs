// Run Over (design/overhaul/04_SWARM.md §8): the Swarm death plate's six lines, as words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isSwarmRunOver, kilnRunOverLine, runOverBestMoment, runOverBuildLine, runOverFigures, runOverKiller,
  damageBreakdown,
} from '../src/ui/screens/crucible.js';
import { bestMomentFor, hitSourceFallback } from '../src/systems/survivalResults.js';

const DEATH = Object.freeze({
  ruleset: 'swarm', outcome: 'defeat', wave: 6, kills: 31, bestChain: 24, durationS: 252,
  defeat: { attacker: 'Reaver Corsair', faction: 'Crimson Reach', weapon: 'Heavy Autocannon M', direction: 'AFT', dominantLayer: 'hull' },
  damageTrail: [{ weaponId: null, type: 'collision', amount: 7 }, { weaponId: null, amount: 3 }],
});

test('only a Swarm death gets the six-line plate', () => {
  assert.equal(isSwarmRunOver(DEATH), true);
  assert.equal(isSwarmRunOver({ ...DEATH, ruleset: 'scored' }), false);
  assert.equal(isSwarmRunOver({ ...DEATH, outcome: 'victory' }), false);
  assert.equal(isSwarmRunOver({ ...DEATH, stopReason: 'player_retired' }), false);
});

test("Kiln's line is eight words or fewer for every shape of run", () => {
  const shapes = [
    { wave: 1, kills: 0 }, { wave: 5, kills: 20 }, { wave: 7, kills: 12, bestMoment: { kind: 'stunt' } },
    { wave: 8, kills: 40, bestChain: 31 }, { wave: 22, kills: 300 }, { wave: 12, kills: 90 }, { wave: 3, kills: 0 },
    { wave: 4, kills: 9 },
  ];
  for (const shape of shapes) {
    const line = kilnRunOverLine({ ...DEATH, bestChain: 0, ...shape });
    assert.ok(line.split(/\s+/).length <= 8, line);
  }
});

test('what killed you is always named, without a faction, a "?" or "unknown"', () => {
  const named = runOverKiller(DEATH);
  assert.equal(named.name, 'Reaver Corsair');
  assert.equal(named.detail, 'Heavy Autocannon M · from behind · through the hull');
  const room = runOverKiller({ ...DEATH, defeat: { attacker: 'Unknown contact', physicalLabel: 'arena impact', direction: 'PORT' } });
  assert.equal(room.name, 'The wall');
  const bare = runOverKiller({ ...DEATH, defeat: null, death: { causeText: '?' } });
  for (const text of [named.name, named.detail, room.name, room.detail, bare.name, bare.detail]) {
    assert.doesNotMatch(text, /\?|unknown|unidentified|Crimson Reach/i, text);
  }
  const rows = damageBreakdown(DEATH.damageTrail).rows.map((r) => r.weapon);
  assert.deepEqual(rows, ['Collision', 'Impact'], 'weaponless hits name what they did');
});

test('the recorder names every hit and keeps the best moment structured', () => {
  assert.equal(hitSourceFallback({ origin: { kind: 'hazard_radiation' } }), 'radiation');
  assert.equal(hitSourceFallback({ origin: { kind: 'furnace_mouth_hazard' } }), 'the room');
  assert.equal(hitSourceFallback({ type: 'kinetic' }, 'Wasp'), 'ram');
  assert.equal(hitSourceFallback({ type: 'thermal' }), 'heat');
  assert.equal(hitSourceFallback({}), 'impact');
  const stunt = bestMomentFor({ stuntKills: [{ name: 'Rock Discovery', trickId: 'rock_discovery', points: 50, victim: 'Wasp', wave: 4 }], bestChain: 30 });
  assert.deepEqual(stunt, { kind: 'stunt', trickId: 'rock_discovery', name: 'Rock Discovery', victim: 'Wasp', wave: 4 });
  assert.equal(runOverBestMoment({ bestMoment: stunt }), 'Rock Discovery: you put a Wasp into a rock in round 4.');
  assert.deepEqual(bestMomentFor({ bestChain: 12, chainWave: 3 }), { kind: 'chain', count: 12, wave: 3 });
  assert.equal(runOverBestMoment({ bestMoment: { kind: 'chain', count: 12, wave: 3 } }), '12 kills in one chain in round 3.');
  assert.equal(runOverBestMoment({ kills: 0 }), 'No kills yet. The room is a weapon: use it.');
});

test('figures and build read as a player says them', () => {
  assert.deepEqual(runOverFigures(DEATH), [['Round', '6'], ['Kills', '31'], ['Best chain', '24'], ['Time', '4:12']]);
  assert.equal(runOverFigures({ ...DEATH, durationS: null }).length, 3, 'no clock, no fake 0:00');
  assert.equal(runOverBuildLine({ points: { rigger: 9, gunner: 4 }, nodes: [] }, 'Hornet', 'Autocannon S'),
    'Hornet + Autocannon S — Line 9 · Guns 4');
  assert.equal(runOverBuildLine({ points: { rigger: 5, gunner: 5 }, nodes: ['evolution_orbital_saw'] }, 'Wasp'),
    'Orbital Saw · Wasp — Guns 5 · Line 5');
  assert.equal(runOverBuildLine(null, 'Hornet'), 'Hornet — no cards taken');
});

test('an ended run, a cash-out and the round-30 win read on the same plate, with their own titles and Kiln lines', async () => {
  const { swarmPlateKind, kilnPlateLine, RUN_OVER_TITLES } = await import('../src/ui/screens/crucible.js');
  assert.equal(swarmPlateKind(DEATH), 'defeat');
  assert.equal(swarmPlateKind({ ...DEATH, outcome: 'aborted', stopReason: 'player_retired' }), 'retired');
  assert.equal(swarmPlateKind({ ...DEATH, outcome: 'extracted', defeat: null }), 'extracted');
  assert.equal(swarmPlateKind({ ...DEATH, outcome: 'victory', wave: 30, deepestWave: 30, defeat: null }), 'win');
  assert.equal(swarmPlateKind({ ...DEATH, ruleset: 'scored' }), null, 'a Gauntlet run keeps its own record');
  assert.equal(swarmPlateKind({ ...DEATH, outcome: 'aborted', stopReason: 'wave_plan_failed' }), null,
    'a failed room build keeps the loud record');
  for (const kind of ['defeat', 'retired', 'extracted', 'win']) {
    assert.ok(RUN_OVER_TITLES[kind], kind);
    for (const shape of [{ wave: 1, kills: 0 }, { wave: 7, kills: 40, bestChain: 30 }, { wave: 30, kills: 400 }]) {
      const line = kilnPlateLine({ ...DEATH, ...shape }, kind);
      assert.ok(line.split(/\s+/).length <= 8, `${kind}: ${line}`);
      assert.doesNotMatch(line, /Crucible|unknown|\?$/i);
    }
  }
});
