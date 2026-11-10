import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  SITE_LIFE_ERADICATED,
  SITE_LIFE_LIVING,
  SITE_LIFE_STERILE,
  SITE_LIFE_SUPPRESSED,
  SITE_LIFE_THIN,
  SITE_LIFE_UNKNOWN,
  copyLifeRead,
  lifeSampleFromSite,
  readSiteLife,
} from '../src/data/siteLifeRead.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  deserializeAlienEcologyState,
  materializeAlienEcology,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const deep = ALIEN_SITES.harvest_deep;
const sterile = ALIEN_SITES.sterile_zone;
const nursery = ALIEN_SITES.veil_ray_nursery;

test('a quiet relay does not turn a living site into an eradication', () => {
  const quietLiving = readSiteLife({
    sampled: true, living: true, relayQuiet: true, suppressed: true, sterile: false, biomassGone: false,
  });
  assert.equal(quietLiving.reading, 'suppressed');
  assert.equal(quietLiving.biomass, 'living');
  assert.equal(quietLiving.activity, 'quiet');
  assert.equal(quietLiving.confidence, 'sure');
  assert.equal(quietLiving.text, SITE_LIFE_SUPPRESSED);
  assert.equal(quietLiving.text.includes('ERADICATED'), false);

  const stillLiving = readSiteLife({ sampled: true, living: true, relayQuiet: false });
  assert.equal(stillLiving.reading, 'living');
  assert.equal(stillLiving.biomass, 'living');
  assert.equal(stillLiving.activity, 'active');
  assert.equal(stillLiving.text, SITE_LIFE_LIVING);

  const heldEmpty = readSiteLife(lifeSampleFromSite(sterile, { relaySevered: true, state: 'severed' }, true));
  assert.equal(heldEmpty.reading, 'sterile');
  assert.equal(heldEmpty.biomass, 'none');
  assert.equal(heldEmpty.activity, 'quiet');
  assert.equal(heldEmpty.confidence, 'sure');
  assert.equal(heldEmpty.text, SITE_LIFE_STERILE);
  assert.notEqual(heldEmpty.reading, 'suppressed');
  assert.notEqual(heldEmpty.reading, 'eradicated');

  const nurseryLive = readSiteLife(lifeSampleFromSite(nursery, { relaySevered: false, state: 'dormant' }, true));
  assert.equal(nursery.faunaCast.veil_ray, 3);
  assert.equal(nursery.sterile, true);
  assert.equal(nurseryLive.reading, 'living');
  assert.equal(nurseryLive.biomass, 'living');
  assert.equal(nurseryLive.text, SITE_LIFE_LIVING);
  const nurseryQuiet = readSiteLife(lifeSampleFromSite(nursery, { relaySevered: true, state: 'severed' }, true));
  assert.equal(nurseryQuiet.reading, 'suppressed');
  assert.equal(nurseryQuiet.biomass, 'living');
  assert.equal(nurseryQuiet.activity, 'quiet');
  assert.equal(nurseryQuiet.text, SITE_LIFE_SUPPRESSED);
  assert.notEqual(nurseryQuiet.reading, 'sterile');
  assert.equal(nurseryQuiet.text.includes('ERADICATED'), false);

  const noSample = readSiteLife(lifeSampleFromSite(deep, { relaySevered: true, state: 'severed' }, false));
  assert.equal(noSample.reading, 'unknown');
  assert.equal(noSample.biomass, 'unknown');
  assert.equal(noSample.activity, 'unknown');
  assert.equal(noSample.confidence, 'none');
  assert.equal(noSample.text, SITE_LIFE_UNKNOWN);

  const thin = readSiteLife({ sampled: true, relayQuiet: true });
  assert.equal(thin.reading, 'unknown');
  assert.equal(thin.confidence, 'thin');
  assert.equal(thin.text, SITE_LIFE_THIN);
  assert.notEqual(thin.reading, 'eradicated');

  const gone = readSiteLife({ sampled: true, living: false, biomassGone: true, relayQuiet: true });
  assert.equal(gone.reading, 'eradicated');
  assert.equal(gone.biomass, 'none');
  assert.equal(gone.text, SITE_LIFE_ERADICATED);

  const fromSite = lifeSampleFromSite(deep, { relaySevered: true, state: 'severed' }, true);
  assert.equal(fromSite.living, true);
  assert.equal(readSiteLife(fromSite).reading, 'suppressed');
});

test('the meter calls a quiet living site suppressed, and a bad save cannot call it eradicated', () => {
  const state = {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {} } },
    world: { currentSectorId: deep.sectorId, sectors: {}, rng: () => 0.5 },
    rng: () => 0.5,
  };
  const events = [];
  const world = {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity(spec) {
        const body = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        body.id = state.entities.size + 100;
        state.entities.set(body.id, body);
        state.entityList.push(body);
        return body;
      },
      removeEntity(id) {
        const body = state.entities.get(id);
        if (body) body.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
  };
  materializeAlienEcology(world, { id: deep.sectorId }, world.active);
  const player = {
    id: 1, type: 'player', alive: true, pos: { x: deep.center.x, z: deep.center.z },
    vel: { x: 0, z: 0 }, data: { fittings: ['mod_field_coherence_meter'] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);

  tickAlienEcology(world, 1.1);
  const livingRead = events.filter((e) => e.type === 'ecology:coherence').at(-1);
  assert.equal(livingRead.payload.siteId, deep.siteId);
  assert.equal(livingRead.payload.coherent, true);
  assert.equal(livingRead.payload.life.reading, 'living');
  assert.equal(livingRead.payload.life.biomass, 'living');
  assert.equal(livingRead.payload.life.activity, 'active');

  const rec = ensureAlienEcologyState(state).sites[deep.siteId];
  rec.relaySevered = true;
  rec.state = 'severed';
  tickAlienEcology(world, 1.1);
  const quietRead = events.filter((e) => e.type === 'ecology:coherence').at(-1);
  assert.equal(quietRead.payload.coherent, false);
  assert.equal(quietRead.payload.life.reading, 'suppressed');
  assert.equal(quietRead.payload.life.biomass, 'living');
  assert.equal(quietRead.payload.life.activity, 'quiet');
  assert.equal(quietRead.payload.life.confidence, 'sure');
  assert.equal(quietRead.payload.life.text, SITE_LIFE_SUPPRESSED);
  const spoken = events.filter((e) => e.type === 'comms:log' && e.payload.from === 'Coherence meter');
  assert.equal(spoken.at(-1).payload.text.includes('SUPPRESSED'), true);
  assert.equal(spoken.at(-1).payload.text.includes('ERADICATED'), false);
  assert.equal(rec.lifeRead.reading, 'suppressed');

  const before = events.length;
  tickAlienEcology(world, 1.1);
  const extra = events.slice(before).filter((e) => e.type === 'comms:log' && e.payload.from === 'Coherence meter');
  assert.equal(extra.length, 0);

  const saved = serializeAlienEcologyState(state);
  const restored = {
    meta: { seed: 47 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    player: { cargo: { items: {} } }, world: { currentSectorId: deep.sectorId, sectors: {} },
  };
  deserializeAlienEcologyState(restored, saved);
  const kept = ensureAlienEcologyState(restored).sites[deep.siteId].lifeRead;
  assert.equal(kept.reading, 'suppressed');
  assert.equal(kept.biomass, 'living');
  assert.equal(kept.activity, 'quiet');
  assert.equal(kept.text, SITE_LIFE_SUPPRESSED);

  saved.sites[deep.siteId].lifeRead = {
    biomass: 'living', activity: 'active', confidence: 'sure', reading: 'eradicated', text: SITE_LIFE_ERADICATED,
  };
  const correctedState = {
    meta: { seed: 47 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    player: { cargo: { items: {} } }, world: { currentSectorId: deep.sectorId, sectors: {} },
  };
  deserializeAlienEcologyState(correctedState, saved);
  const corrected = ensureAlienEcologyState(correctedState).sites[deep.siteId].lifeRead;
  assert.equal(corrected.reading, 'suppressed');
  assert.equal(corrected.biomass, 'living');
  assert.equal(corrected.text, SITE_LIFE_SUPPRESSED);
  assert.equal(copyLifeRead(saved.sites[deep.siteId].lifeRead).reading, 'suppressed');
});
