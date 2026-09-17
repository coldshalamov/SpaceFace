// INFERENCE (WF-09) — a player kill of a named captain is answered, not just noted:
// the defeat event fires for the ledger, every surviving seed captain flies one wing
// heavier next time, and the next hunter's entrance names the victim. World kills
// carry no grudge. Fixed seeds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { NAMED_CAPTAINS } from '../src/data/encounters.js';

const SHAPE = 'named_hunter';
const SECTOR = 'sector_io_reach';

function boot(seed = 90210) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector'), player };
}

function record(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function force(t, suffix) {
  const encounterId = `revenge-test:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId, sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

const liveOf = (t, id) => t.state.encounterDirector.live[id];
const rowsOf = (rows, name) => rows.filter((r) => r.name === name).map((r) => r.payload);
function step(t, n = 3) {
  for (let s = 0; s < n; s++) t.sim.step(1);
}

function bossOf(t, id) {
  const live = liveOf(t, id);
  const bossId = Object.keys(live.roles).find((key) => live.roles[key] === 'boss');
  return t.state.entities.get(Number(bossId));
}

function killBoss(t, id, byPlayer) {
  const boss = bossOf(t, id);
  boss.alive = false; // combat sets this before emitting; mirror that order
  t.bus.emit('entity:killed', {
    id: boss.id, killerId: byPlayer ? t.player.id : 999999, type: 'ship', pos: { ...boss.pos },
  });
  step(t, 1);
}

function escortCount(t, id) {
  return Object.values(liveOf(t, id).roles).filter((role) => role === 'escort').length;
}

function captainDefOf(live) {
  return NAMED_CAPTAINS.find((c) => c.id === live.data.captainId);
}

test('a player kill emits defeat, escalates survivors, and is named on the next hunt', () => {
  const t = boot();
  const rows = record(t, ['encounter:namedCaptainDefeated', 'encounter:voice']);
  const first = force(t, 'first-blood');
  const victim = liveOf(t, first).vars.name;
  const victimId = liveOf(t, first).data.captainId;
  assert.ok(victimId, 'the seed roster supplies the captain');

  killBoss(t, first, true);

  const defeats = rowsOf(rows, 'encounter:namedCaptainDefeated');
  assert.equal(defeats.length, 1);
  assert.equal(defeats[0].captainId, victimId);
  assert.equal(defeats[0].byPlayer, true);
  assert.equal(defeats[0].sectorId, SECTOR);

  const named = t.state.encounterDirector.named;
  for (const cap of NAMED_CAPTAINS) {
    if (cap.id === victimId) {
      assert.equal(named[cap.id].alive, false);
    } else {
      assert.equal(named[cap.id].tier, 1, `${cap.name} flies heavier next time`);
    }
  }

  const second = force(t, 'answer');
  const hunter = liveOf(t, second);
  const def = captainDefOf(hunter);
  assert.ok(def, 'the answer comes from the surviving roster');
  assert.equal(escortCount(t, second), def.escort.size[0] + 1, 'grudge tier adds one wingman');
  const voices = rowsOf(rows, 'encounter:voice').filter((v) => v.encounterId === second);
  assert.equal(voices.length, 1, 'one primary entrance line');
  assert.match(voices[0].text, new RegExp(`${hunter.vars.name} flies for ${victim}\\.$`),
    'the hunter names the victim');
});

test('a world kill emits defeat but carries no grudge and no vow', () => {
  const t = boot(777);
  const rows = record(t, ['encounter:namedCaptainDefeated', 'encounter:voice']);
  const first = force(t, 'world-first');
  killBoss(t, first, false);

  const defeats = rowsOf(rows, 'encounter:namedCaptainDefeated');
  assert.equal(defeats.length, 1);
  assert.equal(defeats[0].byPlayer, false);

  const named = t.state.encounterDirector.named;
  for (const cap of NAMED_CAPTAINS) {
    assert.equal(named[cap.id].tier || 0, 0, `${cap.id} holds no grudge for a world kill`);
  }

  const second = force(t, 'world-answer');
  const hunter = liveOf(t, second);
  const def = captainDefOf(hunter);
  assert.equal(escortCount(t, second), def.escort.size[0], 'no revenge wing without player blood');
  const voices = rowsOf(rows, 'encounter:voice').filter((v) => v.encounterId === second);
  assert.equal(voices.length, 1);
  assert.doesNotMatch(voices[0].text, /flies for/, 'no vow without a player victim');
});

test('the grudge caps at tier three across stacked player kills', () => {
  const t = boot(4242);
  const first = force(t, 'cap-one');
  const firstVictim = liveOf(t, first).data.captainId;
  killBoss(t, first, true);
  const second = force(t, 'cap-two');
  const secondVictim = liveOf(t, second).data.captainId;
  assert.notEqual(secondVictim, firstVictim, 'the dead stay out of the pool');
  killBoss(t, second, true);

  const named = t.state.encounterDirector.named;
  const last = NAMED_CAPTAINS.find((c) => named[c.id].alive !== false);
  assert.ok(last, 'one captain remains');
  assert.equal(named[last.id].tier, 2, 'two player kills stack two grudge tiers');

  // Escapes still stack on top of revenge, capped at three.
  named[last.id].tier = 3;
  const third = force(t, 'cap-three');
  const def = captainDefOf(liveOf(t, third));
  assert.equal(escortCount(t, third), Math.min(4, def.escort.size[0] + 3), 'composition caps, never HP');
});
