// INF-instrument review fix (seed 4242) — a scan ping dies when its source is answered.
//
// upsertUnknownPing is create-only and the bucket rides the save, so a ping row lived forever:
// after the hidden POI behind it was discovered (poi.hidden flips false, world.js poi:discovered
// flow), every map surface kept drawing the '?' — and, since the local-map courseable-ping unit,
// kept offering a named one-click 'Unresolved contact' course to a question already answered.
// The scanner now prunes rows whose source no longer qualifies, on the same pulse that refreshes
// the bucket, keyed on the POI identity (never the signal: string namespace).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { pingOverlayMarks } from '../src/ui/screens/localmap.js';

const SEED = 4242;
const SECTOR = 'sector_test_ping_prune';
const POI_ID = 'poi_test_hidden_cache';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [scanner] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = { id: SECTOR, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { sim, state, player };
}

// A hidden POI at the given distance, wired the way the sector cook does it: an activeSector
// poi row whose id is the spawned entity, plus the entity's own poi stamp.
function addHiddenPoi(t, { distance = 800, hidden = true } = {}) {
  const entity = t.sim.spawn({
    type: 'fx', team: 2, pos: { x: distance, z: 0 }, radius: 10, mass: 0, collides: false,
    data: { poi: true, poiId: POI_ID, poiType: 'wreck', hidden },
  });
  const poi = { id: entity.id, poiId: POI_ID, hidden, type: 'wreck' };
  t.state.world.activeSector.pois.push(poi);
  return { entity, poi };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function clearCooldown(t) {
  t.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

function bucket(t) {
  return (t.state.world.scanPings && t.state.world.scanPings[SECTOR]) || [];
}

test(`seed ${SEED}: the pulse files a ping for a hidden POI, named after the POI`, () => {
  const t = boot();
  addHiddenPoi(t);
  pulse(t);
  const rows = bucket(t);
  assert.equal(rows.length, 1, 'the unknown contact is remembered');
  assert.equal(rows[0].id, POI_ID, 'the ping is keyed on the POI identity');
  assert.equal(rows[0].kind, 'unknown');
});

test(`seed ${SEED}: discovering the POI answers the ping — the next pulse retires it`, () => {
  const t = boot();
  const { poi, entity } = addHiddenPoi(t);
  pulse(t);
  assert.equal(bucket(t).length, 1, 'the ping exists while the source is hidden');

  // The discovery flip, exactly as the poi:discovered flow writes it (world.js): the poi row
  // and the entity stamp both unhide.
  poi.hidden = false;
  entity.data.hidden = false;
  clearCooldown(t);
  pulse(t);

  assert.equal(bucket(t).length, 0, 'the answered source leaves no stale ping row');
  // The instrument consequence: the local map stops offering the course.
  const marks = pingOverlayMarks(t.state, (x) => x, (z) => z);
  assert.equal(marks.length, 0, "no surface keeps offering 'Unresolved contact' to an answered question");
});

test(`seed ${SEED}: an out-of-range fix stays remembered — the radius is not an answer`, () => {
  const t = boot();
  const { poi } = addHiddenPoi(t, { distance: 800 });
  pulse(t);
  assert.equal(bucket(t).length, 1);

  // Fly far beyond poiRadius: the pulse can no longer refresh the ping, but the source still
  // qualifies, so the remembered fix must survive the prune.
  const player = t.state.entities.get(t.state.playerId);
  player.pos.x = 9000;
  clearCooldown(t);
  pulse(t);

  assert.equal(bucket(t).length, 1, 'the remembered fix out of range is kept');
  assert.equal(bucket(t)[0].id, POI_ID);
  assert.equal(poi.hidden, true, 'the source is still unanswered');
});

test(`seed ${SEED}: an orphan row in a cooked sector is pruned; a transiently empty sector wipes nothing`, () => {
  const t = boot();
  addHiddenPoi(t);
  pulse(t);
  assert.equal(bucket(t).length, 1);

  // The poi record leaves the cooked sector (source identity gone): the orphan row dies…
  t.state.world.activeSector.pois.length = 0;
  t.state.world.activeSector.pois.push({ id: 'other_entity', poiId: 'poi_other', hidden: true, type: 'cache' });
  clearCooldown(t);
  pulse(t);
  assert.equal(bucket(t).length, 0, 'an id no current POI claims is not a mark');

  // …but a transiently empty poi list (mid-cook shape) must not wipe remembered fixes.
  t.state.world.activeSector.pois.length = 0;
  bucket(t).push({ id: 'remembered_fix', pos: { x: 10, z: 10 }, kind: 'unknown' });
  clearCooldown(t);
  pulse(t);
  assert.equal(bucket(t).length, 1, 'an uncooked sector answers nothing about ownership');
});
