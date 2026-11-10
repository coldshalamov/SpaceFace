import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { AUDIO_RECIPE_BY_ID, CAPITAL_PREDET_RECIPE, resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';

const SECTOR = 'sector_vesta_forge';
const SHAPE = 'the_runaway_kiln';
const RING = Object.freeze({ x: 700, z: 900 });

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.world.activeSector = {
    stations: [{ id: 'station_depot3', name: 'Refuel Depot', pos: { x: RING.x, z: RING.z } }],
    pois: [],
  };
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function force(t, suffix = 'a', options = {}) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:kiln:${suffix}`;
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

function crucibleOf(t, encounterId) {
  const rec = live(t, encounterId);
  return t.state.entities.get(rec.vars.crucibleId);
}

test('the Runaway Kiln plans on the Vesta Forge approach and nowhere else', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.script, 'selfRegistered');
  let planned = null;
  for (let day = 0; day < 80 && !planned; day += 1) {
    planned = planEncounters(4242, SECTOR, day,
      zonesForSector(SECTOR), null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id) || null;
  }
  assert.ok(planned, 'the seeded civilian deck must eventually select the Runaway Kiln');
  for (let day = 0; day < 40; day += 1) {
    const rows = planEncounters(4242, 'sector_helios_prime', day,
      zonesForSector('sector_helios_prime'), null, { [shape.id]: shape });
    assert.equal(rows.length, 0, `the kiln must not leak outside Vesta (day ${day})`);
  }
});

test('firing spawns an already-drifting crucible on the ring vector — no offer, no timer', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice']);
  const id = force(t, 'spawn');
  const rec = live(t, id);
  assert.equal(rec.phase, 'runaway', 'the load is already moving; the world does not wait for accept');
  const crucible = crucibleOf(t, id);
  assert.ok(crucible, 'the crucible must be a physical body, not a line of text');
  assert.equal(crucible.data.masslineTetherable, true);
  assert.equal(crucible.hull, 90);
  assert.equal(crucible.physicsBody.shape, 'compound', 'she flies the measured kilnback compound body');
  assert.equal(crucible.physicsBody.mass, 150);

  // The closing vector points at the ring at the authored speed.
  const vx = crucible.vel.x;
  const vz = crucible.vel.z;
  const speed = Math.hypot(vx, vz);
  assert.ok(Math.abs(speed - 24) < 1e-6, `authored closing speed; got ${speed}`);
  const toRing = { x: RING.x - crucible.pos.x, z: RING.z - crucible.pos.z };
  const dot = (vx * toRing.x + vz * toRing.z) / (speed * Math.hypot(toRing.x, toRing.z));
  assert.ok(dot > 0.999, 'the velocity is dead-on the depot ring');
  assert.deepEqual(rec.vars.ring, { x: RING.x, z: RING.z, name: 'Refuel Depot' });
  assert.ok(events.some((row) => row.name === 'encounter:voice' && /CRUCIBLE/i.test(row.payload.text)),
    'the depot hail is the first and only prompt');
});

test('the bleed is physical: below save speed the yard takes her, pays, and remembers', () => {
  const t = boot();
  const events = collect(t, [
    'economy:grantCredits', 'faction:repDelta', 'news:publish',
    'encounter:resolved', 'sectorsim:impulse', 'audio:cue',
  ]);
  const id = force(t, 'bleed');
  const crucible = crucibleOf(t, id);

  // Simulated rope work: a bridle/anchor bleed is a velocity change and nothing else.
  crucible.vel.x = 3;
  crucible.vel.z = 4;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'saved');
  assert.equal(t.state.story.flags.runawayKiln, 'saved');
  const savedCue = events.find((row) => row.name === 'audio:cue');
  assert.equal(resolveAudioCueRecipeId(savedCue?.payload.id), 'sfx_dock_clunk',
    'the yard taking the kiln must play the existing docking voice');
  assert.ok(AUDIO_RECIPE_BY_ID[resolveAudioCueRecipeId(savedCue?.payload.id)]);
  assert.ok(events.some((row) => row.name === 'economy:grantCredits' && row.payload.amount === 320));
  assert.ok(events.some((row) => row.name === 'faction:repDelta'
    && row.payload.factionId === 'faction_choir' && row.payload.delta === 8));
  assert.ok(events.some((row) => row.name === 'news:publish' && /CRUCIBLE/i.test(row.payload.text)),
    'the save is a headline, not a toast');

  const blocked = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:kiln:again',
    sectorId: SECTOR, anchor: { x: 0, z: 0 },
  });
  assert.deepEqual(blocked, { ok: false, reason: 'gated' }, 'blockAfterOutcome must seal a saved kiln');
  const refire = t.director.requestAuthoredEncounter({
    shapeId: SHAPE, encounterId: 'debug:kiln:saved-again',
    sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: true,
  });
  assert.deepEqual(refire, { ok: false, reason: 'resolved_on_fire' });
});

test('an unbled crucible meets the ring and the load answers — no scripted stop short of it', () => {
  const t = boot();
  const events = collect(t, ['sectorsim:impulse', 'news:publish', 'encounter:resolved', 'economy:grantCredits', 'audio:cue']);
  const id = force(t, 'impact');
  const crucible = crucibleOf(t, id);
  assert.ok(Math.hypot(crucible.vel.x, crucible.vel.z) >= 12, 'she is still hot when she arrives');

  crucible.pos.x = RING.x + 50;
  crucible.pos.z = RING.z;
  t.sim.runTicks(70);
  assert.equal(completion(t)?.outcome, 'impact');
  assert.equal(t.state.story.flags.runawayKiln, 'impact');
  const detonationCue = events.find((row) => row.name === 'audio:cue');
  assert.equal(resolveAudioCueRecipeId(detonationCue?.payload.id), CAPITAL_PREDET_RECIPE,
    'the detonation cue must reach the authored capital warning voice');
  assert.ok(AUDIO_RECIPE_BY_ID[resolveAudioCueRecipeId(detonationCue?.payload.id)]);
  assert.ok(events.some((row) => row.name === 'sectorsim:impulse'
    && row.payload.kind === 'runaway_kiln_detonation' && row.payload.danger > 0),
    'the scorch is real noise on the lane');
  assert.ok(events.some((row) => row.name === 'news:publish' && /RING/i.test(row.payload.text)));
  assert.ok(!events.some((row) => row.name === 'economy:grantCredits'),
    'watching the ring take the load pays nothing');
});

test('a shot is a real detonation ending: first scratch warns, the second lights the load', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice', 'encounter:resolved', 'sectorsim:impulse']);
  const id = force(t, 'shot');
  const crucible = crucibleOf(t, id);

  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: crucible.id, applied: 3 });
  assert.ok(live(t, id), 'the first scratch is a warning, not a detonation');
  assert.equal(live(t, id).vars.struck, 1, 'the damage routes to the encounter through live.ids');
  assert.ok(events.some((row) => row.name === 'encounter:voice' && /Stop shooting/i.test(row.payload.text)),
    'the depot names the danger before it ends the vignette');

  t.bus.emit('combat:damage', { attackerId: t.state.playerId, targetId: crucible.id, applied: 3 });
  assert.equal(completion(t)?.outcome, 'detonated');
  assert.equal(t.state.story.flags.runawayKiln, 'detonated');
  assert.ok(events.some((row) => row.name === 'sectorsim:impulse'
    && row.payload.kind === 'runaway_kiln_detonation'));
});

test('roping her says the work line once, and the registry answers a scan', () => {
  const t = boot();
  const events = collect(t, ['encounter:voice']);
  const id = force(t, 'rope');
  const crucible = crucibleOf(t, id);

  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: crucible.id });
  t.bus.emit('tether:attached', { actorId: t.state.playerId, targetId: crucible.id });
  const ropeLines = events.filter((row) => /LINE ON/i.test(row.payload.text));
  assert.equal(ropeLines.length, 1, 'the work line is spoken once per latch, not per tick');

  t.bus.emit('scan:pulse', { sourceId: t.state.playerId, targetId: crucible.id });
  const registryLines = events.filter((row) => /REGISTRY/i.test(row.payload.text));
  assert.equal(registryLines.length, 1, 'the registry line is one-shot');
  assert.match(registryLines[0].payload.text, /molten glass charge\. CREW: none/);
});
