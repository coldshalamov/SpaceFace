// D135 — one player compass. +z is north (screen up), +x is east. Wave callouts, the
// cryo room line, the kettle tell, and the authored site bearings all read that compass.
// Seed 4242 is the fixed seed; the compass itself does not roll.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  cryoThermalSentence,
  playerBearingHyphen,
  playerBearingLetter,
  playerBearingName,
} from '../src/core/playerCompass.js';
import { createRunState } from '../src/core/runState.js';
import {
  SKER_SCRAP_BALER,
  STARTER_FIELD_MACHINE,
  VESTA_ORE_WINNOW,
  VESTA_SHEAR_JAWS,
} from '../src/data/environmentalMachinery.js';
import { CONTENT_FACTORY_STRINGS } from '../src/contracts/contentFactory.js';
import { AUTHORED_DOCK_RUMORS, frontierRumorOffer } from '../src/data/frontierRumors.js';
import { kettleLineBearingToNext, KETTLE_LINE_LEGS } from '../src/data/kettleLine.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { WORLD_ONE_OFFS } from '../src/data/worldOneOffs.js';
import { SECTORS } from '../src/data/sectors.js';
import { projectRadarPoint } from '../src/ui/map/tacticalMapGrammar.js';
import { cryoQuadrantKey, cryoThermalMap, planCryoInstall } from '../src/systems/cryoDriftArena.js';
import { survivalAnnounce, waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { GATE_BEARINGS } from '../src/systems/waveMaterialization.js';
import { world } from '../src/systems/world.js';

const SEED = 4242;

test('seed 4242: +z is north, screen up, and +x is east', () => {
  assert.equal(playerBearingName(0, 1), 'north');
  assert.equal(playerBearingName(1, 1), 'northeast');
  assert.equal(playerBearingName(1, 0), 'east');
  assert.equal(playerBearingName(1, -1), 'southeast');
  assert.equal(playerBearingName(0, -1), 'south');
  assert.equal(playerBearingName(-1, -1), 'southwest');
  assert.equal(playerBearingName(-1, 0), 'west');
  assert.equal(playerBearingName(-1, 1), 'northwest');
  assert.equal(playerBearingLetter(0, 1), 'N');
  assert.equal(playerBearingLetter(0, -1), 'S');
  assert.equal(playerBearingHyphen(1, 1), 'north-east');
  assert.equal(playerBearingHyphen(-1, 1), 'north-west');
});

test('seed 4242: a wave callout names the gate by the player compass', () => {
  const plan = {
    packages: [{ gateGroup: 'front', role: 'mass', enemyId: 'wasp_swarmer', count: 6 }],
  };
  const line = waveOpeningLine(1, plan);
  const word = playerBearingName(GATE_BEARINGS.front.x, GATE_BEARINGS.front.z);
  assert.equal(word, 'south');
  assert.ok(GATE_BEARINGS.front.z < 0, 'front gate is −z, the bottom of the flight view');
  assert.ok(line.includes(`the ${word}`), line);
  assert.equal(playerBearingName(GATE_BEARINGS.rear.x, GATE_BEARINGS.rear.z), 'north');
  assert.equal(playerBearingName(GATE_BEARINGS.nw.x, GATE_BEARINGS.nw.z), 'southwest');
  assert.equal(playerBearingHyphen(GATE_BEARINGS.sw.x, GATE_BEARINGS.sw.z), 'north-west');
  assert.equal(playerBearingHyphen(GATE_BEARINGS.ne.x, GATE_BEARINGS.ne.z), 'south-east');
  assert.match(
    CONTENT_FACTORY_STRINGS['recipe.factory_herald_pincer.summary'],
    /mass on the north-west, pressure on the south-east/,
  );
});

test('seed 4242: cryo alternating halves call +z north, and the combat net says so', () => {
  const room = planCryoInstall({
    arenaPhase: 'shutter_alternating',
    at: { x: 0, z: 0 },
    lane: { x: 1, z: 0 },
  });
  const sentence = cryoThermalSentence(cryoThermalMap('shutter_alternating'));
  assert.equal(sentence, 'north is cold, south is hot');
  assert.equal(room.note, `the halves have rotated; ${sentence}`);

  const at = { x: 0, z: 0 };
  const thermal = cryoThermalMap('shutter_alternating');
  const northKey = cryoQuadrantKey(at, { x: 12, z: 80 });
  const southKey = cryoQuadrantKey(at, { x: -12, z: -80 });
  assert.equal(thermal[northKey], 'cold');
  assert.equal(thermal[southKey], 'hot');
  assert.equal(playerBearingName(0, 80), 'north');
  assert.equal(playerBearingName(0, -80), 'south');

  const idle = planCryoInstall({ arenaPhase: 'idle', at, lane: { x: 1, z: 0 } });
  assert.match(idle.note, /^west is cold, east is hot/);

  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const run = createRunState({ kind: 'survival', seed: SEED });
  run.arenaId = 'cryo_drift';
  run.phase = 'active';
  run.wave = 7;
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  bus.emit('survivalArena:installed', {
    wave: 7,
    arenaId: 'cryo_drift',
    note: room.note,
  });
  const spoken = emitted
    .filter((entry) => entry.event === 'voice:say')
    .map((entry) => entry.payload.text);
  assert.ok(spoken.some((text) => text.includes('north is cold') && text.includes('south is hot')), spoken.join(' | '));
  survivalAnnounce.destroy();
});

test('seed 4242: kettle tell, winnow banks, and sited machines use the same north', () => {
  const hopper = KETTLE_LINE_LEGS[0];
  const ribs = KETTLE_LINE_LEGS[1];
  const dx = ribs.pos.x - hopper.pos.x;
  const dz = ribs.pos.z - hopper.pos.z;
  const bearing = kettleLineBearingToNext(hopper.poiId);
  assert.equal(bearing.octant, playerBearingHyphen(dx, dz));
  assert.equal(bearing.octant, 'north-west');

  const northBank = VESTA_ORE_WINNOW.furniture.find((row) => row.id.endsWith('_north'));
  const southBank = VESTA_ORE_WINNOW.furniture.find((row) => row.id.endsWith('_south'));
  assert.ok(northBank && southBank);
  assert.ok(northBank.pos.z > southBank.pos.z, 'the north bank is the +z flank');

  assert.equal(playerBearingName(STARTER_FIELD_MACHINE.dir.x, STARTER_FIELD_MACHINE.dir.z), 'south');

  const bazaar = SECTOR_ANCHORS.sector_sker_haven.stations.find((row) => row.id === 'station_sker');
  const balerDx = SKER_SCRAP_BALER.localPos.x - bazaar.pos.x;
  const balerDz = SKER_SCRAP_BALER.localPos.z - bazaar.pos.z;
  assert.equal(playerBearingName(balerDx, balerDz), 'south');

  const forge = SECTOR_ANCHORS.sector_vesta_forge.stations.find((row) => row.id === 'station_forge');
  const shearDx = VESTA_SHEAR_JAWS.localPos.x - forge.pos.x;
  const shearDz = VESTA_SHEAR_JAWS.localPos.z - forge.pos.z;
  assert.equal(playerBearingName(shearDx, shearDz), 'southeast');
});

test('seed 4242: a scan lead and a rumor card use the same letters', () => {
  const up = projectRadarPoint({ x: 0, z: 0 }, { x: 0, z: 250 }, 1000);
  const down = projectRadarPoint({ x: 0, z: 0 }, { x: 0, z: -250 }, 1000);
  assert.ok(up.y < down.y, '+z draws above −z, the same side as the radar N');
  assert.equal(playerBearingLetter(0, 250), 'N');

  const lead = world._scanFieldLead({
    world: { activeSector: { fields: [{ id: 'f_north', center: { x: 0, z: 250 } }] } },
    entities: { get() { return { pos: { x: 0, z: 0 } }; } },
    playerId: 'p',
    fieldDepletion: { fields: { f_north: { depletion: 0.4 } } },
  });
  assert.equal(lead, 'freshest seam 250 WU N');

  // Authored bar leads name the same octant as the prop's offset from its station.
  // The letter is computed here; the sentence is the string the bar speaks.
  const spoken = [
    ['oneoff_the_pour', 'station_rhea_cinder', 'SE', /^South-east of the claim/],
    ['oneoff_the_answer', 'station_phoebe_echo', 'NW', /^North-west of here/],
    ['oneoff_half_cut', 'station_hyperion_cut', 'SE', /^South-east of the refinery/],
    ['oneoff_open_hand', 'station_nereid', 'NE', /^North-east of the market/],
    ['oneoff_double_take', 'station_proteus', 'NE', /^North-east of here/],
  ];
  const veil = SECTOR_ANCHORS.sector_veil_nebula;
  const veilStation = veil.stations.find((row) => row.id === 'station_veil');
  const storm = veil.fields.find((row) => row.id === 'f_veil_1');
  const shrine = WORLD_ONE_OFFS.find((row) => row.id === 'oneoff_surge_shrine');
  const shrineX = veilStation.pos.x + shrine.offsetLocal.x;
  const shrineZ = veilStation.pos.z + shrine.offsetLocal.z;
  assert.equal(playerBearingName(shrineX - storm.center.x, shrineZ - storm.center.z), 'south');
  assert.match(AUTHORED_DOCK_RUMORS.station_veil, /south of the storm/);

  for (const [propId, stationId, letter, pattern] of spoken) {
    const prop = WORLD_ONE_OFFS.find((row) => row.id === propId);
    assert.ok(prop, propId);
    assert.equal(playerBearingLetter(prop.offsetLocal.x, prop.offsetLocal.z), letter, propId);
    assert.match(AUTHORED_DOCK_RUMORS[stationId], pattern);
  }

  const east = world._scanFieldLead({
    world: { activeSector: { fields: [{ id: 'f_east', center: { x: 80, z: 0 } }] } },
    entities: { get() { return { pos: { x: 0, z: 0 } }; } },
    playerId: 'p',
    fieldDepletion: { fields: { f_east: { depletion: 0.5 } } },
  });
  assert.equal(east, 'freshest seam 80 WU E');

  const state = createGameState(SEED);
  state.player.credits = 20000;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, { ...sector }]));
  state.world.discovery = {};
  const sectorById = new Map(SECTORS.map((sector) => [sector.id, sector]));
  let matched = 0;
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      const offer = frontierRumorOffer(state, station.id);
      if (!offer || !offer.text) continue;
      const home = sectorById.get(offer.sectorId);
      const poi = home && (home.pois || []).find((row) => row.id === offer.targetId);
      const field = home && (home.fields || []).find((row) => row.id === offer.targetId);
      const local = (poi && poi.pos) || (field && field.center) || null;
      if (!local) continue;
      const letter = playerBearingLetter(local.x, local.z);
      if (!letter) continue;
      assert.ok(offer.text.includes(` ${letter} `) || offer.text.includes(`${letter} of`),
        `${offer.id} text should carry ${letter}: ${offer.text}`);
      matched += 1;
      if (matched >= 3) break;
    }
    if (matched >= 3) break;
  }
  assert.ok(matched >= 1, 'a station on the default route offered a bearing card');
});
