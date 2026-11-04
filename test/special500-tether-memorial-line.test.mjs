// special500 SP2-172 — THE TETHER MEMORIAL'S NEW LINE (1310). The wall hears the maydays:
// after the director's hull:fractured notice armed the wall (special500.SP2-172), a real
// near-death of the player's own — hull at or below 10% integrity, still alive — is the date
// the wall keeps. Bring that near-death back to the Charon buoy and the line is simply there,
// in the same paint as everyone else's; the memorial becomes a permanent chart landmark, and
// one warrant hunter buys the drink that mark earns.
//
// Every claim below routes through the live owners: the director's durable special500 row and
// story flags for the context, the live player hull for the record, the active POI row and its
// marker entity for the dressing, the world discovery record for the landmark, and the
// director's situation memory for the one-time outcome.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import {
  MEMORIAL, runtime as memorialRuntime, nearDeathRecord,
} from '../src/data/encounters/1310-tether-memorial-line.js';

const SEED = 1310;
const SECTOR = 'sector_charon_expanse';
const SITE = Object.freeze({ x: -1140, z: 300 });   // the memorial's authored sector-local pos
const STANDOFF = Object.freeze({ x: SITE.x + 900, z: SITE.z - 500 });
const SHAPE = 'tether_memorial_line';
// The director is a ~1 Hz calendar clock: a beat's tick runs after ~1 s of sim elapses.
const STEP_S = 70;

let nextMarkerId = 77001;

/** Boot one lab: the expanse, the memorial's live POI row and marker, the player hull set. */
async function boot({ contextFlag = true, hullFrac = 1, wallKnows = false, nearDeath = null } = {}) {
  const host = await bootRealPath({
    seed: SEED,
    systems: [spawnBudget, encounterDirector, 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { ...STANDOFF }, isPlayer: true, factionId: 'faction_free' }],
  });
  const { state, bus } = host;
  state.world.currentSectorId = SECTOR;
  const events = [];
  for (const name of ['encounter:resolved', 'encounter:voice', 'poi:discovered']) {
    bus.on(name, (p) => events.push({ name, p: { ...p } }));
  }
  // The story the director already wrote (and any stale-save shape the tests ask for).
  if (!state.story || typeof state.story !== 'object') state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  if (!state.story.depthProgramEncounters) {
    state.story.depthProgramEncounters = { schemaVersion: 1, completed: {}, history: [] };
  }
  if (contextFlag) state.story.flags[MEMORIAL.contextFlag] = 100;
  if (wallKnows) state.story.flags[MEMORIAL.flagWallKnows] = 50;
  if (nearDeath) {
    state.story.flags[MEMORIAL.flagNearDeath] = nearDeath.at;
    state.story.flags[MEMORIAL.flagNearDeathHull] = nearDeath.hull;
  }
  // The known-places record the world owner seeds for a charted sector at init.
  if (!state.world.discovery) state.world.discovery = {};
  if (!state.world.discovery[SECTOR]) {
    state.world.discovery[SECTOR] = { discovered: false, visitedCount: 0, pois: {}, fieldsDepleted: {} };
  }
  // The memorial as the world materializes it: an active POI row plus its marker entity.
  const marker = host.spawnObstacle({ pos: { ...SITE }, radius: 10, mass: 40, data: { poiId: MEMORIAL.poiId } });
  state.world.active = {
    stations: [],
    pois: [{ id: marker.id, poiId: MEMORIAL.poiId, type: 'beacon', pos: { x: SITE.x, z: SITE.z } }],
  };
  const player = state.entities.get(state.playerId);
  const hullMax = Number(player.hullMax) || 100;
  player.hull = hullMax * hullFrac;

  const director = host.runtime.getSystem('encounterDirector');
  return {
    host, state, bus, events, director, player, hullMax,
    marker,
    disc: () => state.world.discovery && state.world.discovery[SECTOR]
      && state.world.discovery[SECTOR].pois
      && state.world.discovery[SECTOR].pois[MEMORIAL.poiId],
    flags: () => state.story.flags,
    fire: () => director.requestAuthoredEncounter({
      shapeId: SHAPE, encounterId: 'test_memorial_line', sectorId: SECTOR,
      anchor: { ...STANDOFF }, zoneType: 'derelict_field', zoneRadius: 800, force: true,
    }),
    live: () => Object.values(state.encounterDirector.live).find((l) => l.shapeId === SHAPE) || null,
  };
}

const voice = (h) => h.events.filter((e) => e.name === 'encounter:voice').map((e) => e.p.text);
const outcomes = (h) => h.events.filter((e) => e.name === 'encounter:resolved').map((e) => e.p.outcome);
const memory = (h) => h.state.story.depthProgramEncounters.completed[SHAPE];

test('the memorial leg is registered as a self-registered expanse beat', () => {
  const enc = ENCOUNTERS[SHAPE];
  assert.ok(enc, 'registered through the generated index');
  assert.equal(enc.script, 'selfRegistered');
  assert.equal(enc.tier, 'ambient');
  assert.ok(enc.gates.sectorIds.includes(SECTOR));
  assert.equal(enc.gates.blockAfterOutcome, 'wall_knows');
  assert.equal(enc.shape.situation, 'wreck');
});

test('gates unmet: no hull:fractured notice on record, the wall never listens', async () => {
  const h = await boot({ contextFlag: false });
  try {
    assert.equal(memorialRuntime.fireReady(h.state), false, 'no notice, no watch');
    const res = h.fire();
    assert.equal(res.reason, 'resolved_on_fire', 'the shape fired and stood down in the same beat');
    assert.equal(h.live(), null, 'the beat aborted inert');
    assert.deepEqual(outcomes(h), ['aborted:wall_not_listening']);
    assert.equal(h.flags()[MEMORIAL.flagNearDeath], undefined, 'no near-death record written');
    assert.deepEqual(voice(h), [], 'the wall said nothing');
  } finally { h.host.dispose(); }
});

test('the watch keeps the first below-10% hull read as the near-death record', async () => {
  const h = await boot({ hullFrac: 0.08 });
  try {
    assert.equal(memorialRuntime.fireReady(h.state), true, 'a noticed wall in its own sector listens');
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    const rec = nearDeathRecord(h.state);
    assert.ok(rec, 'the near-death went on the record');
    assert.equal(rec.hull, 0.08, 'the wall keeps the hull it heard');
    assert.ok(voice(h).some((t) => t.includes('fresh paint waits')), 'the band carries the mayday');

    // Repair and keep flying: the first date stands, no second stencil.
    h.player.hull = h.hullMax * 0.5;
    h.state.simTime += 400;
    h.host.step(STEP_S);
    assert.equal(nearDeathRecord(h.state).at, rec.at, 'the record keeps the first date');
  } finally { h.host.dispose(); }
});

test('a hull event above the line is no near-death: the watch stays silent', async () => {
  const h = await boot({ hullFrac: 0.4 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    assert.equal(nearDeathRecord(h.state), null, '40% hull is not a mayday');
    assert.deepEqual(voice(h), []);
  } finally { h.host.dispose(); }
});

test('a dead hull is not a survived near-death: the wall takes no date', async () => {
  const h = await boot({ hullFrac: 0.05 });
  try {
    h.player.alive = false;
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    assert.equal(nearDeathRecord(h.state), null, 'the wall stencils survivors, not bunks');
  } finally { h.host.dispose(); }
});

test('bring the near-death back to the buoy: the line goes on the wall, chart, and band', async () => {
  const h = await boot({ hullFrac: 0.08 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    assert.ok(nearDeathRecord(h.state), 'the watch holds the record');

    // Fly the recorded near-death back to the memorial; the next 1 Hz tick delivers.
    h.player.pos.x = SITE.x + 60;
    h.player.pos.z = SITE.z;
    h.host.step(STEP_S);

    const flags = h.flags();
    assert.ok(flags[MEMORIAL.flagWallKnows] != null, 'the authored wall_knows flag is set');
    assert.ok(flags[MEMORIAL.flagDrink] != null, 'the drink is on the house');

    // The dressing: the live POI row and its marker carry the new line for the scanner.
    const row = h.state.world.active.pois[0];
    assert.match(row.scanDescription, /same paint as every bunk line/);
    assert.match(h.marker.data.scanLabel, /one line newer/);
    assert.match(h.marker.data.scanDescription, /No hand signed it/);

    // The permanent landmark: the discovery record now keeps the memorial found and named.
    const disc = h.disc();
    assert.ok(disc, 'the memorial has a known-places row');
    assert.equal(disc.discovered, true);
    assert.equal(disc.identified, true);
    assert.equal(disc.name, 'Tether Memorial');

    // The band: the wall line, then the hunter buying the drink.
    const lines = voice(h);
    assert.ok(lines.some((t) => t.includes('The wall hears the maydays')), 'the regular explains the wall');
    assert.ok(lines.some((t) => t.includes('fun way onto it')), 'a hunter buys the drink');

    // The durable one-time record, with the physical facts that produced it.
    assert.deepEqual(outcomes(h), ['wall_knows']);
    assert.equal(memory(h).outcome, 'wall_knows');
    assert.equal(memory(h).facts.nearDeathHull, 0.08);
    assert.equal(memory(h).facts.drinkOwedBy, 'warrant_hunter_charon');
  } finally { h.host.dispose(); }
});

test('a stale save with the flag but no delivery cannot stencil twice', async () => {
  const h = await boot({ wallKnows: true });
  try {
    assert.equal(memorialRuntime.fireReady(h.state), false, 'the wall already knows this hull');
    const res = h.fire();
    assert.equal(res.reason, 'resolved_on_fire', 'the shape fired and stood down in the same beat');
    assert.equal(h.live(), null, 'the beat stands down inert');
    assert.equal(h.flags()[MEMORIAL.flagNearDeath], undefined, 'no second record');
    assert.deepEqual(voice(h), []);
  } finally { h.host.dispose(); }
});

test('duplicate delivery: after the wall knows, a refired watch changes nothing', async () => {
  const h = await boot({ hullFrac: 0.08 });
  try {
    assert.equal(h.fire().ok, true);
    h.host.step(STEP_S);
    h.player.pos.x = SITE.x + 60;
    h.player.pos.z = SITE.z;
    h.host.step(STEP_S);
    const first = memory(h);
    const flagsSnapshot = { ...h.flags() };
    assert.equal(first.outcome, 'wall_knows');

    // A second beat after the resolve (a duplicated authored request, a replayed receipt).
    const res = h.fire();
    assert.equal(res.reason, 'resolved_on_fire', 'the refire fired and stood down inert');
    assert.equal(h.live(), null, 'the refire stood down');
    assert.equal(memory(h).visits, first.visits, 'the durable record took no second visit');
    assert.deepEqual(h.flags(), flagsSnapshot, 'no flag moved twice');
    assert.deepEqual(h.disc(), { ...h.disc() }, 'the landmark row is stable');
  } finally { h.host.dispose(); }
});
