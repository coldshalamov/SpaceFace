// D135 — one player compass. −z is north, +x is east. Wave callouts, the cryo room
// line, the kettle tell, and the authored site bearings all read that compass.
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
import { kettleLineBearingToNext, KETTLE_LINE_LEGS } from '../src/data/kettleLine.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { cryoQuadrantKey, cryoThermalMap, planCryoInstall } from '../src/systems/cryoDriftArena.js';
import { survivalAnnounce, waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { GATE_BEARINGS } from '../src/systems/waveMaterialization.js';

const SEED = 4242;

test('seed 4242: −z is north and +x is east', () => {
  assert.equal(playerBearingName(0, -1), 'north');
  assert.equal(playerBearingName(1, -1), 'northeast');
  assert.equal(playerBearingName(1, 0), 'east');
  assert.equal(playerBearingName(1, 1), 'southeast');
  assert.equal(playerBearingName(0, 1), 'south');
  assert.equal(playerBearingName(-1, 1), 'southwest');
  assert.equal(playerBearingName(-1, 0), 'west');
  assert.equal(playerBearingName(-1, -1), 'northwest');
  assert.equal(playerBearingLetter(0, -1), 'N');
  assert.equal(playerBearingLetter(0, 1), 'S');
  assert.equal(playerBearingHyphen(1, -1), 'north-east');
  assert.equal(playerBearingHyphen(-1, 1), 'south-west');
});

test('seed 4242: a wave callout names the gate by the player compass', () => {
  const plan = {
    packages: [{ gateGroup: 'front', role: 'mass', enemyId: 'wasp_swarmer', count: 6 }],
  };
  const line = waveOpeningLine(1, plan);
  const word = playerBearingName(GATE_BEARINGS.front.x, GATE_BEARINGS.front.z);
  assert.equal(word, 'north');
  assert.ok(GATE_BEARINGS.front.z < 0, 'front gate is −z');
  assert.ok(line.includes(`the ${word}`), line);
  assert.equal(playerBearingName(GATE_BEARINGS.rear.x, GATE_BEARINGS.rear.z), 'south');
  assert.equal(playerBearingName(GATE_BEARINGS.nw.x, GATE_BEARINGS.nw.z), 'northwest');
});

test('seed 4242: cryo alternating halves call +z south, and the combat net says so', () => {
  const room = planCryoInstall({
    arenaPhase: 'shutter_alternating',
    at: { x: 0, z: 0 },
    lane: { x: 1, z: 0 },
  });
  const sentence = cryoThermalSentence(cryoThermalMap('shutter_alternating'));
  assert.equal(sentence, 'south is cold, north is hot');
  assert.equal(room.note, `the halves have rotated; ${sentence}`);

  const at = { x: 0, z: 0 };
  const thermal = cryoThermalMap('shutter_alternating');
  const southKey = cryoQuadrantKey(at, { x: 12, z: 80 });
  const northKey = cryoQuadrantKey(at, { x: -12, z: -80 });
  assert.equal(thermal[southKey], 'cold');
  assert.equal(thermal[northKey], 'hot');
  assert.equal(playerBearingName(0, 80), 'south');
  assert.equal(playerBearingName(0, -80), 'north');

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
  assert.ok(spoken.some((text) => text.includes('south is cold') && text.includes('north is hot')), spoken.join(' | '));
  survivalAnnounce.destroy();
});

test('seed 4242: kettle tell, winnow banks, and sited machines use the same north', () => {
  const hopper = KETTLE_LINE_LEGS[0];
  const ribs = KETTLE_LINE_LEGS[1];
  const dx = ribs.pos.x - hopper.pos.x;
  const dz = ribs.pos.z - hopper.pos.z;
  const bearing = kettleLineBearingToNext(hopper.poiId);
  assert.equal(bearing.octant, playerBearingHyphen(dx, dz));
  assert.equal(bearing.octant, 'south-west');

  const northBank = VESTA_ORE_WINNOW.furniture.find((row) => row.id.endsWith('_north'));
  const southBank = VESTA_ORE_WINNOW.furniture.find((row) => row.id.endsWith('_south'));
  assert.ok(northBank && southBank);
  assert.ok(northBank.pos.z < southBank.pos.z, 'the north bank is the −z flank');

  assert.equal(playerBearingName(STARTER_FIELD_MACHINE.dir.x, STARTER_FIELD_MACHINE.dir.z), 'north');

  const bazaar = SECTOR_ANCHORS.sector_sker_haven.stations.find((row) => row.id === 'station_sker');
  const balerDx = SKER_SCRAP_BALER.localPos.x - bazaar.pos.x;
  const balerDz = SKER_SCRAP_BALER.localPos.z - bazaar.pos.z;
  assert.equal(playerBearingName(balerDx, balerDz), 'north');

  const forge = SECTOR_ANCHORS.sector_vesta_forge.stations.find((row) => row.id === 'station_forge');
  const shearDx = VESTA_SHEAR_JAWS.localPos.x - forge.pos.x;
  const shearDz = VESTA_SHEAR_JAWS.localPos.z - forge.pos.z;
  assert.equal(playerBearingName(shearDx, shearDz), 'northeast');
});
