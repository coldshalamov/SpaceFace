#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateEvidenceDocument, formatEvidenceIssue } from '../src/contracts/evidenceSchemas.js';
import { combat } from '../src/systems/combat.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TICK_RATE = 60;
const MAX_SPEC_SECONDS = 6;
const ENVELOPE_PATH = 'test/47a.telemetry.expected.json';

const envelope = readJson(ENVELOPE_PATH);
const evidenceResult = validateEvidenceDocument(envelope, { file: ENVELOPE_PATH });
assert(evidenceResult.ok, evidenceResult.issues.map(formatEvidenceIssue).join('\n'));

const retryCeilingTicks = envelope.acceptanceCriteria.deathToRetryTickMax;
assert(Number.isSafeInteger(retryCeilingTicks), '47-A telemetry envelope must declare deathToRetryTickMax');
assert(retryCeilingTicks <= TICK_RATE * MAX_SPEC_SECONDS,
  'deathToRetryTickMax must preserve the 47-A under-6s proof metric');

const state = makeState();
const player = makePlayer();
state.entities.set(player.id, player);
state.entityList = [player];
const events = [];

combat.state = state;
combat.bus = {
  emit(event, payload) {
    events.push({
      event,
      payload,
      index: events.length,
      tick: state.tick,
      simTime: state.simTime,
    });
  },
};

combat.respawnPlayer(player, 'hostile_massline_interdictor');

const death = events.find((entry) => entry.event === 'player:death');
const respawn = events.find((entry) => entry.event === 'player:respawn');

assert(death, 'player death should emit player:death');
assert(respawn, 'player death should emit player:respawn');
assert(death.index < respawn.index, 'respawn evidence should follow death evidence');

const retryTicks = respawn.tick - death.tick;
assert(retryTicks >= 0, 'death-to-retry ticks should never be negative');
assert(retryTicks <= retryCeilingTicks,
  `death-to-retry exceeded envelope ceiling: ${retryTicks} > ${retryCeilingTicks}`);

assert.equal(respawn.payload.stationId, 'station_helios', 'retry should restore from the insured station');
assert.equal(player.pos.x, 320, 'retry should move player to the station x coordinate');
assert.equal(player.pos.z, -80, 'retry should move player to the station z coordinate');
assert.equal(player.vel.x, 0, 'retry should clear player x velocity');
assert.equal(player.vel.z, 0, 'retry should clear player z velocity');
assert.equal(player.hull, player.hullMax, 'retry should restore hull');
assert.equal(player.shield, player.shieldMax, 'retry should restore shields');
assert.equal(player.cap, player.capMax, 'retry should restore capacitor');
assert.equal(player.flags.invuln, true, 'retry should grant short spawn protection');

console.log(`47-A death-to-retry checks OK (${retryTicks} ticks <= ${retryCeilingTicks})`);

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
}

function makeState() {
  return {
    tick: 1800,
    simTime: 30,
    playerId: 1,
    meta: { seed: 47 },
    content: {},
    player: {
      credits: 100,
      insurance: {
        rate: 0.6,
        deductibleCr: 500,
        insuredModules: true,
        lastStationId: 'station_helios',
      },
      ownedShips: [{ defId: 'ship_pelican', fittings: ['mod_cargo_pod_m', 'wpn_pulse_laser_s'] }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_ore_iron: 4 },
        usedVolume: 4,
        usedMass: 4,
        capVolume: 100,
        capMass: 100,
      },
    },
    entities: new Map(),
    entityList: [],
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: {
        stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }],
      },
    },
  };
}

function makePlayer() {
  return {
    id: 1,
    type: 'ship',
    pos: makeVec(10, 10),
    prevPos: makeVec(10, 10),
    vel: makeVec(5, -3),
    flags: {},
    data: { defId: 'ship_pelican' },
    hull: 0,
    hullMax: 180,
    shield: 0,
    shieldMax: 60,
    cap: 0,
    capMax: 110,
  };
}

function makeVec(x, z) {
  return {
    x,
    y: 0,
    z,
    copy(other) {
      this.x = other.x;
      this.y = other.y || 0;
      this.z = other.z;
      return this;
    },
  };
}
