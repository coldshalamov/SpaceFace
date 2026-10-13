// The Candle Relighting — the starter sector's guaranteed first-hour wonder. The Fleet's
// tender column forms up behind the player's frame, walks the memorial bearing, and resolves
// at the Fleet; a pilot who follows gets the dark plinth's invitation (the landmark quest's
// reason to come back with a scanner). Focused director harness, eighth-bell pattern.
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { encounterDirector, planEncountersDay } from '../src/systems/encounterDirector.js';
import { CANDLE_FLEET_PIT_BEARING } from '../src/data/landmarkMissions.js';

const SECTOR = 'sector_helios_prime';
const SHAPE = 'candle_relighting';
const MEMORIAL_LOCAL = Object.freeze({ x: 1680, z: -820 });
// The production walk (~2,000 WU at the cruise pace, plus nav give) must finish well inside
// the 300 s authored deadline; the proof window sits under it.
const WALK_PROOF_S = 200;

function memorialGlobal() {
  const origin = sectorGlobalOrigin(SECTOR);
  return { x: origin.x + MEMORIAL_LOCAL.x, z: origin.z + MEMORIAL_LOCAL.z };
}

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
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function force(t, suffix, anchor = { x: 0, z: 0 }) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:relight:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor,
    force: true,
    data: {},
  });
  assert.equal(result.ok, true, `${SHAPE}/${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function collect(t, names) {
  const rows = [];
  for (const name of names) t.bus.on(name, (payload) => rows.push({ name, payload }));
  return rows;
}

test('the relighting is authored day-0 content inside its window, and only in Helios', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.earlyWindowGuaranteeDay, 0);
  assert.deepEqual([...shape.earlyDelayS], [540, 810]);
  const zones = zonesForSector(SECTOR);
  // Planner contract: the day-0 guarantee never lands later than its authored window. An
  // organic ambient pick of the shape may ride earlier (the splice only clamps late organic
  // delays), so the upper bound is the hard promise; the pinned lower bound must also occur
  // across seeds for the days the organic deck draws something else.
  const delays = [];
  for (let seed = 4242; seed < 4262; seed++) {
    const planned = planEncountersDay(seed, SECTOR, 0, zones, null, { [shape.id]: shape })
      .find((row) => row.shapeId === shape.id);
    assert.ok(planned, `day 0 must guarantee the relighting (seed ${seed})`);
    assert.ok(planned.delay <= 810,
      `guaranteed onset ${planned.delay} must not pass the authored window (seed ${seed})`);
    delays.push(planned.delay);
  }
  assert.ok(delays.some((delay) => delay >= 540),
    'the authored early window must pin onsets when the organic deck misses the shape');
  for (const day of [0, 1, 2]) {
    const rows = planEncountersDay(4242, 'sector_ceres_belt', day,
      zonesForSector('sector_ceres_belt'), null, { [shape.id]: shape });
    assert.equal(rows.find((row) => row.shapeId === shape.id), undefined,
      `the relighting must not plan outside Helios (day ${day})`);
  }
});

test('firing forms the tender column behind the frame, walking the memorial bearing', () => {
  const t = boot();
  const voices = collect(t, ['encounter:voice']);
  const id = force(t, 'cast');
  const rec = live(t, id);
  assert.equal(rec.ids.length, 5, 'lead + four lamps');
  assert.equal(rec.phase, 'walk');
  const ents = rec.ids.map((entId) => t.state.entities.get(entId));
  const lead = t.state.entities.get(rec.data.leadId);
  assert.ok(lead && lead.pos, 'the lead tender exists');
  const memorial = memorialGlobal();
  for (const ent of ents) {
    assert.equal(ent.data.ai.passive, true, 'tenders are working pilots, not combatants');
    assert.equal(ent.data.ai.roe, 'hold_fire');
    assert.equal(ent.data.ai.spawnContext, 'convoy_civilian');
    assert.equal(ent.data.ai.activity.reason, 'encounter:candle_relighting');
    assert.equal(ent.data.intent.fire, false);
  }
  // Every hull starts behind the fire anchor relative to the memorial bearing, lead furthest
  // along, and nobody spawns on top of the player.
  const toMemorial = (pos) => Math.hypot(memorial.x - pos.x, memorial.z - pos.z);
  const anchor = rec.anchor;
  assert.ok(toMemorial(lead.pos) < toMemorial(anchor), 'the column leads toward the Fleet');
  const sorted = ents.map((ent) => toMemorial(ent.pos)).sort((a, b) => a - b);
  assert.ok(sorted[0] < sorted[sorted.length - 1], 'the lamps trail in a stagger');
  assert.equal(voices.filter((row) => row.payload.primary).length, 1,
    'exactly one primary line on entry (one-voice law)');
});

test('the column walks; a follower witnesses the plinth line at the Fleet', () => {
  const t = boot();
  const comms = collect(t, ['comms:log']);
  const id = force(t, 'follow');
  const rec = live(t, id);
  const lead = t.state.entities.get(rec.data.leadId);
  const memorial = memorialGlobal();
  // The focused harness has no AI system, so the walk is asserted as the intent the shared
  // tactical navigation executes: a carrot 200 WU ahead on the memorial bearing, matched to
  // the cruise pace. The real-execution proof runs on the production path below.
  const dir = (pos) => {
    const dx = memorial.x - pos.x;
    const dz = memorial.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len };
  };
  for (const entId of rec.ids) {
    const ent = t.state.entities.get(entId);
    const want = dir(ent.pos);
    assert.ok(Math.abs(ent.data.ai.activity.anchor.x - (ent.pos.x + want.x * 200)) < 1
      && Math.abs(ent.data.ai.activity.anchor.z - (ent.pos.z + want.z * 200)) < 1,
      'each tender carries a carrot on its own memorial bearing');
    assert.ok(Math.abs(ent.data.ai.activity.anchorVelocity.x - want.x * 26) < 0.01
      && Math.abs(ent.data.ai.activity.anchorVelocity.z - want.z * 26) < 0.01,
      'the walk holds the cruise pace');
  }

  // The player follows the lamps all the way in; the lead closes the last stretch.
  const player = t.state.entities.get(t.state.playerId);
  player.pos.x = memorial.x + 200; player.pos.z = memorial.z;
  lead.pos.x = memorial.x; lead.pos.z = memorial.z;
  t.sim.runTicks(70);
  assert.ok(!live(t, id), 'the encounter closes at the Fleet');
  assert.ok(comms.some((row) => /Twenty-four lit/.test(row.payload.text)
    && /scanner/i.test(row.payload.text)), 'a follower hears the dark plinth invitation');
});

test('an unfollowed walk still completes: the shift happens without the player', () => {
  const t = boot();
  const comms = collect(t, ['comms:log']);
  const id = force(t, 'alone');
  const rec = live(t, id);
  rec.deadlineAt = 0.001;
  t.sim.runTicks(70);
  assert.ok(!live(t, id), 'the walk ends on its own clock');
  assert.ok(comms.some((row) => /without you/.test(row.payload.text)
    || /keeps its hour/.test(row.payload.text)), 'the unwatched ending still speaks, quietly');
  assert.ok(!comms.some((row) => /Twenty-four lit/.test(row.payload.text)),
    'the witnessed line is reserved for witnesses');
});

// Production path: with the full AI/tactical-navigation stack live, the column must actually
// fly the bearing and close on the Fleet — intent writes are not the deliverable, the walk is.
test('production path: the tender column really walks to the Fleet', { timeout: 300_000 }, async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec, fittingsFromDefaultModules } = await import('../src/systems/ships.js');
  const { NEW_GAME } = await import('../src/data/newGameDefaults.js');
  os.setPriority?.(os.constants.priority.PRIORITY_LOW);
  const origin = sectorGlobalOrigin(SECTOR);
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const { state, bus } = runtime;
    state.mode = 'flight';
    state.settings.gameplay.tutorialHints = false;
    runtime.getSystem('ships').newGame();
    state.playerId = runtime.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules),
      pos: { x: origin.x, z: origin.z }, rot: 0,
    })).id;
    runtime.getSystem('world').newGame();
    runtime.getSystem('economy').newGame();
    runtime.getSystem('world').enterSector(NEW_GAME.startingSectorId, {});
    bus.emit('game:started', {});
    await runtime.getSystem('physics').prepareBackend(state, { reset: true });

    const director = runtime.getSystem('encounterDirector');
    const fired = director.requestAuthoredEncounter({
      shapeId: SHAPE,
      encounterId: 'debug:relight:realpath',
      sectorId: SECTOR,
      anchor: { x: origin.x + 200, z: origin.z },
      force: true,
      data: {},
    });
    assert.equal(fired.ok, true, JSON.stringify(fired));
    const rec = state.encounterDirector.live['debug:relight:realpath'];
    assert.ok(rec, 'the forced relighting is live');
    const memorial = memorialGlobal();
    const leadOf = () => state.entities.get(rec.data.leadId);
    const distTo = (pos) => Math.hypot(memorial.x - pos.x, memorial.z - pos.z);
    let closed = false;
    let resolved = false;
    for (let second = 0; second < WALK_PROOF_S && !resolved; second++) {
      const before = distTo(leadOf().pos);
      runtime.runTicks(60, 1 / 60);
      const lead = leadOf();
      if (!lead) { resolved = true; break; }
      if (distTo(lead.pos) < before - 20) closed = true;
      if (!state.encounterDirector.live['debug:relight:realpath']) resolved = true;
    }
    assert.ok(closed, `the lead must close on the Fleet within ${WALK_PROOF_S}s of production ticks`);
    assert.ok(resolved, 'the walk ends (arrival or its own clock)');
  } finally {
    runtime.dispose();
  }
});
