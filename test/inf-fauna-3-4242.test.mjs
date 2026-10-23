// An archive crab at the Converted Yards finishes a readable debris pile, then loses it if killed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { handleAlienEcologyEvent, materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';
import { faunaFieldNote } from '../src/ui/targetPanel.js';

function makeWorld(sectorId) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
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
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return { state, world, emitLog };
}

test('the archive crab piles host-archive debris, and the pile collapses when the crab dies', () => {
  const site = ALIEN_SITES.converted_yards;
  const { state, world, emitLog } = makeWorld(site.sectorId);
  materializeAlienEcology(world, { id: site.sectorId }, world.active, [site]);
  const ae = ensureAlienEcologyState(state);
  ae.sites[site.siteId].state = 'awake';
  const crab = state.entityList.find((e) => e.data?.ecology?.speciesId === 'archive_crab');
  assert.ok(crab, 'an archive crab works the yards');
  crab.pos.x = site.center.x;
  crab.pos.z = site.center.z;
  crab.data.ecology.anchor = { x: crab.pos.x, z: crab.pos.z };
  const player = {
    id: 1, type: 'player', alive: true,
    pos: { x: crab.pos.x + 250, z: crab.pos.z },
    vel: { x: 0, z: 0 }, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  for (let i = 0; i < 12; i += 1) {
    state.simTime += 1;
    tickAlienEcology(world, 1);
  }
  assert.equal(crab.data.ecology.driveState, 'forage');
  assert.ok(crab.data.ecology.pile, 'the crab finished a pile');
  assert.equal(crab.data.ecology.pile.commodityId, 'cmdty_host_archive_sample');
  const pile = state.entities.get(crab.data.ecology.pileEntityId);
  assert.ok(pile && pile.alive !== false, 'the arranged debris is on the field');
  assert.equal(pile.data.commodityId, 'cmdty_host_archive_sample');
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === 'The archive crab finishes a pile — arranged debris, still readable.'));
  ae.revelation = 2;
  handleAlienEcologyEvent(world, 'scan:pulse', { source: 'player-scanner', pos: { ...crab.pos }, radius: 100 });
  const note = faunaFieldNote(crab, state);
  assert.ok(note && note.includes('DEBRIS PILE · HOST ARCHIVE'));

  const pickupsBefore = state.entityList.filter((e) => e.type === 'pickup').length;
  handleAlienEcologyEvent(world, 'entity:killed', { id: crab.id });
  assert.equal(crab.data.ecology.pileCollapsed, true);
  assert.equal(pile.alive, false);
  assert.equal(state.entityList.filter((e) => e.type === 'pickup').length, pickupsBefore);
  assert.ok(emitLog.some((row) => row.type === 'toast'
    && row.p.text === 'The crab dies and the pile collapses — the arrangement is gone.'));
  assert.equal(faunaFieldNote(crab, state)?.includes('DEBRIS PILE · HOST ARCHIVE'), false);
});
