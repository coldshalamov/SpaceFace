// A cold bell on the Towed Moonlet tolls when the player is close to a radiation front.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES, FIELD_LANGUAGE } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { handleAlienEcologyEvent, materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';
import { faunaFieldNote } from '../src/ui/targetPanel.js';

function makeWorld(sectorId) {
  const state = {
    meta: { seed: 4242 },
    simTime: 10,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const emitLog = [];
  const world = {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z }, vel: spec.vel || { x: 0, z: 0 } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return { state, world, emitLog };
}

function tollText(row) {
  return row.type === 'comms:log' && typeof row.p?.text === 'string'
    && row.p.text.includes('tolls on the band');
}

test('the cold bell names itself and tolls only when the player is in reach of the front', () => {
  const site = ALIEN_SITES.towed_moonlet;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  state.world.sectors[site.sectorId] = { hazards: [{ type: 'radiation' }] };
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 2;
  const bell = state.entityList.find((e) => e.data?.ecology?.speciesId === 'cold_bell'
    && e.data.ecology.siteId === site.siteId);
  assert.ok(bell, 'a cold bell rides the moonlet');
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: bell.pos.x + 20000, z: bell.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  ae._tollT = FIELD_LANGUAGE.weatherFrontPeriodS;
  tickAlienEcology(world, 0.05);
  assert.equal(emitLog.some(tollText), false, 'a far ship does not get the toll');
  assert.notEqual(bell.data.ecology.tolling, true);

  player.pos.x = bell.pos.x + 200;
  player.pos.z = bell.pos.z;
  ae._tollT = FIELD_LANGUAGE.weatherFrontPeriodS;
  tickAlienEcology(world, 0.05);
  assert.equal(bell.data.ecology.tolling, true);
  const toll = emitLog.find(tollText);
  assert.ok(toll, 'the bell tolls on the band');
  assert.equal(toll.p.from, 'Cold Bell');
  assert.equal(toll.p.text, 'Cold Bell tolls on the band — it rings before the radiation front arrives.');
  handleAlienEcologyEvent(world, 'scan:pulse', { source: 'player-scanner', pos: { ...bell.pos }, radius: 100 });
  const note = faunaFieldNote(bell, state);
  assert.ok(note && note.includes('TOLLS AHEAD OF THE FRONT'));
});
