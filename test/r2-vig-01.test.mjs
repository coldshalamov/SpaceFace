import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { ships } from '../src/systems/ships.js';

const SECTOR = 'sector_vesta_forge';
const SHAPE = 'the_blind_welder';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector, ships] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.world.activeSector = {
    stations: [{ id: 'station_forge', name: 'Vesta Forge', pos: { x: 500, z: 600 } }],
    pois: [],
  };
  // The reward proof needs a real owned hull: seed two open scars the welder can cover.
  // createSimulation spawns no ownedShips; mirror the living-hull suite and furnish one.
  sim.state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: [], livingHull: null }];
  sim.state.player.activeShipIndex = 0;
  seedOpenScars(sim);
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function ownedRecord(t) {
  const player = t.state.player;
  return player && Array.isArray(player.ownedShips)
    ? player.ownedShips[player.activeShipIndex || 0] || null
    : null;
}

function seedOpenScars(sim) {
  const owned = sim.state.player && Array.isArray(sim.state.player.ownedShips)
    ? sim.state.player.ownedShips[sim.state.player.activeShipIndex || 0]
    : null;
  if (!owned) return;
  const tick = sim.state.tick | 0;
  owned.livingHull = {
    schema: 'spaceface.livingHull.v1',
    killTally: 0,
    repairPatches: 0,
    heatScorch: 0,
    lastWashAtT: 0,
    washCount: 0,
    graffitiLine: null,
    graffitiAuthor: null,
    updatedAtT: 0,
    historyVersion: 2,
    scars: [
      { id: 'weld:test:1', cause: 'weapon', surface: 'weapon', band: 'hard', facing: 'bow', atT: 0, tick, patchedAtT: null },
      { id: 'weld:test:2', cause: 'slam', surface: 'terrain', band: 'graze', facing: 'stern', atT: 0, tick, patchedAtT: null },
    ],
  };
}

function force(t, suffix = 'a', options = {}) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:welder:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor: options.anchor || { x: 0, z: 0 },
    force: options.force !== false,
    data: options.data || {},
  });
  assert.equal(result.ok, true, `${SHAPE}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function completion(t, shapeId = SHAPE) {
  return t.state.story.depthProgramEncounters?.completed?.[shapeId] || null;
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function ownedHull(t) {
  const owned = ownedRecord(t);
  return (owned && owned.livingHull) || null;
}

function openScars(t) {
  const hull = ownedHull(t);
  return hull && Array.isArray(hull.scars)
    ? hull.scars.filter((scar) => scar && scar.patchedAtT == null)
    : [];
}

function bargeOf(t, encounterId) {
  const rec = live(t, encounterId);
  return t.state.entities.get(rec.vars.bargeId);
}

function parkBargeOnSeam(t, encounterId, seamIndex) {
  const rec = live(t, encounterId);
  const barge = bargeOf(t, encounterId);
  const seams = rec.vars.seams;
  assert.ok(Array.isArray(seams) && seams.length === 3, 'the strut carries three cracked seams');
  const seam = seams[seamIndex];
  // The tow trick, played straight: player and barge move together under the gate,
  // nose on the seam so the fixed welder arc can trace it.
  const player = t.state.entities.get(t.state.playerId);
  barge.pos.x = seam.x;
  barge.pos.z = seam.z;
  barge.vel.x = 2;
  barge.vel.z = 1;
  barge.rot = seam.arc;
  player.pos.x = seam.x + 60;
  player.pos.z = seam.z;
  player.vel.x = 2;
  player.vel.z = 1;
  player.rot = seam.arc;
}

test('the Blind Welder plans on the Vesta Forge slag field and nowhere else', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.script, 'selfRegistered');
  let planned = null;
  for (let day = 0; day < 80 && !planned; day += 1) {
    planned = planEncounters(4242, SECTOR, day,
      zonesForSector(SECTOR), null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id) || null;
  }
  assert.ok(planned, 'the seeded civilian deck must eventually select the Blind Welder');
  for (let day = 0; day < 40; day += 1) {
    const rows = planEncounters(4242, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape });
    assert.equal(rows.length, 0, `the welder must not leak outside Vesta (day ${day})`);
  }
});

test('firing hails on the band channel and floats a tetherable sensor-dead barge', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice']);
  const id = force(t, 'hail');
  const rec = live(t, id);
  assert.equal(rec.phase, 'offer', 'the barge waits on a line, not a timer');
  const hail = events.find((row) => row.name === 'encounter:voice' && row.payload.primary === true);
  assert.ok(hail, 'the hail is the first and only prompt');
  assert.equal(hail.payload.channel, 'band', 'the sensor-dead barge hails on the radio band');
  const barge = bargeOf(t, id);
  assert.ok(barge, 'the barge must be a physical body, not a line of text');
  assert.equal(barge.data.masslineTetherable, true);
  assert.ok(Array.isArray(rec.vars.seams) && rec.vars.seams.length === 3,
    'the strut carries three cracked seams');
});

test('tracing all three seams inside the tow gate welds the strut, repairs the scars, and marks the bow', () => {
  const t = boot();
  const events = collect(t, [
    'encounter:voice', 'encounter:resolved', 'service:completed',
    'graffiti:show', 'news:publish', 'economy:grantCredits',
  ]);
  const id = force(t, 'weld');
  assert.equal(openScars(t).length, 2, 'precondition: the hull carries two open scars');

  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: bargeOf(t, id).id });
  assert.equal(live(t, id).phase, 'towing', 'the latch itself is the answer');

  for (let seam = 0; seam < 3; seam += 1) {
    // The director ticks scripts at ~1 Hz: 240 sim ticks ≈ 4 s under the gate per seam,
    // re-parked each batch since an untethered harness body drifts between batches.
    // The third seam resolves the encounter (live goes null) — stop parking then.
    for (let batch = 0; batch < 4; batch += 1) {
      if (!live(t, id)) break;
      parkBargeOnSeam(t, id, seam);
      t.sim.runTicks(60);
      const rec = live(t, id);
      if (!rec || (rec.vars.tracedSeams || 0) >= seam + 1) break;
    }
    if (!live(t, id)) break;
    const rec = live(t, id) || { vars: {} };
    assert.ok((rec.vars.tracedSeams || 0) >= seam + 1,
      `seam ${seam + 1} of 3 must trace while towed inside the gate`);
  }

  assert.equal(completion(t)?.outcome, 'welded');
  assert.equal(t.state.story.flags.blindWelder, 'welded');
  assert.equal(openScars(t).length, 0, 'the free repair covers every open scar');
  const repairReceipt = events.find((row) => row.name === 'service:completed'
    && row.payload && row.payload.type === 'repair');
  assert.ok(repairReceipt, 'the reward writes a real scar-repair receipt');
  assert.ok(Number(repairReceipt.payload.restoredHull) >= 0);
  assert.ok(events.some((row) => row.name === 'graffiti:show'
    && /weld/i.test(row.payload.line || '')),
  'the bow carries a weld-seam mark, not an identifier');
  const words = events.filter((row) => row.name === 'encounter:voice')
    .map((row) => String(row.payload.text || ''));
  assert.ok(!words.some((line) => /blind_welder|the_blind_welder|seam_[0-9]|weldseam_livery/.test(line)),
    'player words never carry a raw identifier');
});

test('parking on the strut untowed welds nothing — the arc needs the tow', () => {
  const t = boot();
  const id = force(t, 'park');
  for (let seam = 0; seam < 3; seam += 1) {
    parkBargeOnSeam(t, id, seam);
    t.sim.runTicks(80);
  }
  assert.equal((live(t, id) || { vars: {} }).vars.tracedSeams || 0, 0,
    'a parked barge traces no seam');
  assert.equal(openScars(t).length, 2, 'no tow, no free repair');
  assert.equal(completion(t), null, 'the job stays open and reachable');
});

test('a fast tow blows the gate — the barge shears loose and stays adrift for later', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice', 'encounter:resolved']);
  const id = force(t, 'fast');
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: bargeOf(t, id).id });
  assert.equal(live(t, id).phase, 'towing');

  // Sustain 30 WU/s against the 8 WU/s gate: 4 batches re-applied since an
  // untethered harness body drifts between batches; the shear needs 4 s over gate.
  // Handles are re-fetched per batch because the encounter may resolve mid-loop.
  for (let batch = 0; batch < 4; batch += 1) {
    if (!live(t, id)) break;
    const barge = bargeOf(t, id);
    const player = t.state.entities.get(t.state.playerId);
    barge.vel.x = 30;
    barge.vel.z = 0;
    player.vel.x = 30;
    player.vel.z = 0;
    t.sim.runTicks(70);
  }
  assert.equal(completion(t)?.outcome, 'sheared');
  assert.equal(openScars(t).length, 2, 'a botched tow earns no repair');
  assert.ok(events.some((row) => row.name === 'encounter:voice' && /shear/i.test(row.payload.text)),
    'the shear is spoken, not silent');
  const refire = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:welder:later',
    sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(refire.ok, true, 'a botched barge stays adrift and reachable later');
});

test('refusing leaves the barge adrift and reachable later', () => {
  const t = boot();
  const id = force(t, 'refuse');
  t.bus.emit('encounter:choose', { encounterId: id, choiceId: 'pass' });
  assert.equal(completion(t)?.outcome, 'passed');
  const refire = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:welder:return',
    sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(refire.ok, true, 'a refused barge waits for a kinder lane');
});
