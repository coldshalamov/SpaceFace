// AL-LG-01/02/03 — catalog one-off capability doors.
//
// A revisitNeed row is a door on the live fit, never a visibility gate: the one-off stays on the
// scan and the SF-174 lesson reads "not yet" until the fit's real tow/slam/line/field capability
// opens it, then "ready". The verdict is the same shipCapabilities law the fit screen quotes —
// this fixture drives the real scanner + scanReveal seam, the real roster's derived stats for the
// capital-tow pin, and world's own spawn path for the Great Tanker's physical body.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { scanReveal } from '../src/systems/scanReveal.js';
import {
  revisitDoorState,
  towClassMassFor,
  slamSurvivalSpeedFor,
  lineLoadSpeedFor,
} from '../src/systems/shipCapabilities.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { world } from '../src/systems/world.js';
import { stableRecordId, RECORD_KIND } from '../src/world/worldRecords.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ONE_OFF_BY_ID = new Map(WORLD_ONE_OFFS.map((o) => [o.id, o]));

function boot(sectorId = 'sector_test_signals') {
  const sim = createSimulation({ seed: 4242, systems: [scanner, scanReveal] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = sectorId;
  state.world.activeSector = { id: sectorId, pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const events = { results: [] };
  bus.on('signal:scanResults', (payload) => events.results.push(payload));
  return { sim, state, bus, player, events };
}

function pulse(t) {
  t.state.input.actions.scanPulse = true;
  t.sim.runTicks(2);
}

function part(t, sf) {
  const batch = t.events.results.at(-1);
  const rows = (batch ? batch.signals : []).filter((s) => s.discovery && s.discovery.parts && s.discovery.parts[sf]);
  assert.equal(rows.length > 0, true, `${sf} missing from the scan the player reads`);
  return { signal: rows[0], part: rows[0].discovery.parts[sf] };
}

function wreck(t, pos, data) {
  return t.sim.spawn({
    type: 'wreck', team: 0, pos, vel: { x: 0, z: 0 }, radius: 12, hull: 50, hullMax: 50,
    collides: true, data,
  });
}

function derived(accel, mass = 100) {
  return { operationalMass: mass, mass, propulsion: { mainAccel: accel } };
}

function accelForTow(needMass, below) {
  let short = 0;
  let ready = null;
  for (let accel = 0; accel <= 4000; accel += 5) {
    const tow = towClassMassFor(derived(accel));
    if (tow < needMass) short = accel;
    if (ready == null && tow >= needMass) ready = accel;
  }
  assert.ok(ready != null, `a fit exists that tows ${needMass} t`);
  return below ? short : ready;
}

test('AL-LG-01: a tow revisitNeed reads "not yet" under a light fit and "ready" under a real one', () => {
  const shortAccel = accelForTow(240, true);
  const readyAccel = accelForTow(240, false);
  assert.ok(towClassMassFor(derived(shortAccel)) < 240, 'the short fit is honestly short');
  assert.ok(towClassMassFor(derived(readyAccel)) >= 240, 'the ready fit honestly tows it');

  const denied = boot();
  denied.player.derived = derived(shortAccel);
  const ladle = wreck(denied, { x: 40, z: 0 }, { revisitNeed: { kind: 'tow', massT: 240 }, oneOffId: 'oneoff_runaway_ladle' });
  pulse(denied);
  const no = part(denied, 'SF-174');
  assert.equal(no.part.ready, false);
  assert.equal(no.part.verdict, 'not yet');
  assert.equal(no.part.kind, 'tow');
  assert.equal(no.part.needMass, 240);
  assert.match(no.part.sentence, /not yet/);
  assert.equal(no.part.interactionLocked, false);
  assert.equal(no.part.paid, 0);
  // Visibility is not the door: the body is on the scan while the capability is not.
  assert.equal(no.signal.entityId, ladle.id, 'the denied one-off is still the discovered signal');

  const ready = boot();
  ready.player.derived = derived(readyAccel);
  wreck(ready, { x: 40, z: 0 }, { revisitNeed: { kind: 'tow', massT: 240 }, oneOffId: 'oneoff_runaway_ladle' });
  pulse(ready);
  const yes = part(ready, 'SF-174');
  assert.equal(yes.part.ready, true);
  assert.equal(yes.part.verdict, 'ready');
  assert.match(yes.part.sentence, /ready/);
});

test('AL-LG-01: a one-off spec resolves its authored revisitNeed without entity stamping', () => {
  const shortAccel = accelForTow(260, true);
  const t = boot();
  t.player.derived = derived(shortAccel);
  // The spawned physical one-off carries only data.oneOffId — world.js stamps no revisitNeed —
  // so the lesson must read the need off the authored row itself.
  wreck(t, { x: 40, z: 0 }, { oneOffId: 'oneoff_the_erased' });
  pulse(t);
  const lesson = part(t, 'SF-174');
  assert.equal(lesson.part.kind, 'tow');
  assert.equal(lesson.part.needMass, 260);
  assert.equal(lesson.part.ready, false);
  assert.equal(lesson.part.verdict, 'not yet');
});

test('AL-LG-01: slam, line, and field doors read the same not-yet / ready law', () => {
  // Slam — the crumple law, quoted live. A paper hull is denied where the authored bar sits
  // above its walk-away speed; the same hull answers ready under a lower bar.
  const paperHull = { operationalMass: 100, mass: 100, hullMax: 50, propulsion: { mainAccel: 60 } };
  const paperSlam = slamSurvivalSpeedFor(paperHull).speedWuPerS;
  assert.ok(paperSlam > 0 && paperSlam < 2000, 'fixture sanity: a breakable hull');
  const slamDenied = revisitDoorState({ derived: paperHull }, { kind: 'slam', speedWuPerS: Math.ceil(paperSlam) + 1 });
  const slamReady = revisitDoorState({ derived: paperHull }, { kind: 'slam', speedWuPerS: Math.floor(paperSlam) - 1 });
  assert.equal(slamDenied.ready, false);
  assert.equal(slamReady.ready, true);
  const wall = { operationalMass: 100, mass: 100, hullMax: 4000, propulsion: { mainAccel: 60 } };
  const wallDoor = revisitDoorState({ derived: wall }, { kind: 'slam', speedWuPerS: 1900 });
  assert.equal(wallDoor.unbreakable, true);
  assert.equal(wallDoor.ready, true, 'a hull the law cannot total opens every slam door');

  // Line — the fitted specialist head's real rating, on the same reachable rule the verbs use.
  const snare = { operationalMass: 100, mass: 100, masslineHeadId: 'transverse_snare', propulsion: { combatSpeed: 2000 } };
  const snareSpeed = lineLoadSpeedFor(snare).speedWuPerS;
  assert.ok(snareSpeed > 0, 'fixture sanity: the snare has a real rating');
  assert.equal(revisitDoorState({ derived: snare }, { kind: 'line', speedWuPerS: Math.ceil(snareSpeed) + 1 }).ready, false);
  assert.equal(revisitDoorState({ derived: snare }, { kind: 'line', speedWuPerS: Math.floor(snareSpeed) - 1 }).ready, true);
  const standard = { operationalMass: 100, mass: 100, propulsion: { combatSpeed: 100 } };
  const beyondReach = revisitDoorState({ derived: standard }, { kind: 'line', speedWuPerS: 5000 });
  assert.equal(beyondReach.reachable, false);
  assert.equal(beyondReach.ready, true, 'a line rated past anything flyable holds any swing');

  // Field — the countermeasure catalog, including kind and size qualifiers.
  assert.equal(revisitDoorState({ derived: paperHull, fittings: [] }, { kind: 'field' }).ready, false);
  assert.equal(revisitDoorState({ derived: paperHull, fittings: ['mod_chaff_dispenser_m'] }, { kind: 'field' }).ready, true);
  assert.equal(
    revisitDoorState({ derived: paperHull, fittings: ['mod_chaff_dispenser_m'] }, { kind: 'field', fieldKind: 'ecm' }).ready,
    false, 'a chaff dispenser is not a jamming bubble',
  );
  assert.equal(
    revisitDoorState({ derived: paperHull, fittings: ['mod_chaff_dispenser_m'] }, { kind: 'field', fieldKind: 'chaff', radiusWu: 400 }).ready,
    false, 'a 380 m puff is not the 400 m field the door wants',
  );
  assert.equal(
    revisitDoorState({ derived: paperHull, fittings: ['mod_chaff_dispenser_m'] }, { kind: 'field', fieldKind: 'chaff', radiusWu: 300 }).ready,
    true,
  );
});

test('AL-LG-01: a field door on the scan reads "not yet" then "ready" for a real fitting', () => {
  const denied = boot();
  denied.player.derived = derived(60);
  wreck(denied, { x: 40, z: 0 }, { revisitNeed: { kind: 'field', fieldKind: 'chaff' } });
  pulse(denied);
  const no = part(denied, 'SF-174');
  assert.equal(no.part.ready, false);
  assert.equal(no.part.verdict, 'not yet');
  assert.equal(no.part.kind, 'field');
  assert.match(no.part.sentence, /not yet/);

  const ready = boot();
  ready.player.derived = derived(60);
  ready.player.data.fittings = ['mod_chaff_dispenser_m'];
  wreck(ready, { x: 40, z: 0 }, { revisitNeed: { kind: 'field', fieldKind: 'chaff' } });
  pulse(ready);
  const yes = part(ready, 'SF-174');
  assert.equal(yes.part.ready, true);
  assert.equal(yes.part.verdict, 'ready');
  assert.match(yes.part.sentence, /Chaff Dispenser M/);
  assert.match(yes.part.sentence, /ready/);
});

test('AL-LG-02: the Runaway Ladle and the Erased carry real tow doors at their authored masses', () => {
  const ladle = ONE_OFF_BY_ID.get('oneoff_runaway_ladle');
  const erased = ONE_OFF_BY_ID.get('oneoff_the_erased');
  assert.deepEqual(ladle.revisitNeed, { kind: 'tow', massT: 240 });
  assert.deepEqual(erased.revisitNeed, { kind: 'tow', massT: 260 });
  // The door mass IS the body mass — the scan can never quote a threshold the physics disagrees with.
  assert.equal(ladle.physicalBody.mass, ladle.revisitNeed.massT);
  assert.equal(erased.physicalBody.mass, erased.revisitNeed.massT);
});

test('AL-LG-03: the Great Tanker is a physical body gated past every non-capital fit', () => {
  const tanker = ONE_OFF_BY_ID.get('oneoff_great_tanker');
  assert.ok(tanker.physicalBody && tanker.physicalBody.mass === 800,
    'the tanker carries a real 800 t body, not a billboard');
  assert.deepEqual(tanker.revisitNeed, { kind: 'tow', massT: 800 },
    'the door quotes the same 800 t the body actually has');

  // The gate is honest against the live roster: only capital hulls reach an 800 t tow class.
  const CAPITAL_TOWERS = new Set(['ship_colossus', 'ship_leviathan', 'ship_saucer']);
  for (const ship of SHIPS) {
    const stats = getDerivedStats(ship.id, [], null);
    const tow = towClassMassFor(stats);
    if (CAPITAL_TOWERS.has(ship.id)) {
      assert.ok(tow >= 800, `${ship.id} (${ship.role}) is a capital fit and must tow the tanker: got ${tow.toFixed(1)} t`);
      assert.equal(revisitDoorState({ derived: stats }, tanker.revisitNeed).ready, true);
    } else {
      assert.ok(tow < 800, `${ship.id} (${ship.role}) must NOT reach the tanker's door: got ${tow.toFixed(1)} t`);
      assert.equal(revisitDoorState({ derived: stats }, tanker.revisitNeed).ready, false);
    }
  }
});

function bootOneOffHarness() {
  const spawned = [];
  let nextId = 9001;
  const entities = new Map();
  const entityList = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const ent = {
        id: nextId++,
        type: spec.type,
        pos: { ...spec.pos },
        rot: spec.rot,
        angVel: spec.angVel,
        radius: spec.radius,
        mass: spec.mass,
        collides: spec.collides,
        physicsBody: spec.physicsBody && { ...spec.physicsBody },
        vel: spec.vel ? { ...spec.vel } : { x: 0, z: 0 },
        data: { ...spec.data },
        alive: true,
      };
      spawned.push(ent);
      entities.set(ent.id, ent);
      entityList.push(ent);
      return ent;
    },
  };
  system.state = { entities, entityList, meta: { seed: 47 }, world: {} };
  return { system, spawned, entities, entityList };
}

test('AL-LG-03: the tanker spawns as a live tetherable body and a haul survives re-materialization', () => {
  const helios = SECTOR_BY_ID.get('sector_helios_prime');
  const { system, entities } = bootOneOffHarness();
  const active = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(helios, active);

  const tanker = [...entities.values()].find((e) => e.data && e.data.oneOffId === 'oneoff_great_tanker');
  assert.ok(tanker, 'the Great Tanker spawns as a live body, not a dressing row');
  assert.equal(tanker.type, 'wreck');
  assert.equal(tanker.collides, true);
  assert.equal(tanker.mass, 800);
  assert.equal(tanker.physicsBody.mass, 800);
  assert.equal(tanker.data.masslineTetherable, true, 'the rope can bite her — the door is the tow class');
  assert.equal(tanker.data.worldRecordId,
    stableRecordId(47, 'sector_helios_prime', RECORD_KIND.WRECK, 'worldOneOff:oneoff_great_tanker'),
    'she rides the same durable record identity as every physical one-off');

  // A real tow moves her; on re-materialization the world finds the SAME durable record carrier
  // and keeps the player-made pose — the persistence the yard tug already proved (D176 lane).
  tanker.pos.x += 500;
  tanker.pos.z -= 120;
  const after = { pois: [], stations: [], gates: [], dressing: [] };
  system._spawnWorldOneOffs(helios, after);
  const same = [...entities.values()].filter((e) => e.data && e.data.oneOffId === 'oneoff_great_tanker');
  assert.equal(same.length, 1, 're-materialization reuses the durable body, never a duplicate');
  assert.equal(same[0], tanker);
  const expectedX = (() => {
    const station = helios.stations.find((s) => s.id === 'station_helios');
    return station.pos.x + ONE_OFF_BY_ID.get('oneoff_great_tanker').offsetLocal.x + 500;
  })();
  assert.equal(tanker.pos.x, expectedX, 'the 500 WU haul is not yanked back to her berth');
});
