// Seed 4242. A locked world-site component tells the pilot why the beam was refused and
// leaves the beam off. Finishing a cut closes the beam. A cut that is still going starts
// once and keeps taking progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/core/rng.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { mining } from '../src/systems/mining.js';
import { CERES_SHIPBREAK_MANIFEST, CERES_SHIPBREAK_SITE_ID as SITE_ID } from '../src/data/ceresShipbreak.js';

const SEED = 4242;
const DT = 1 / 60;
const BEAM = { dps: 18, range: 180, directToCargo: false };

function makeBus() {
  const handlers = new Map();
  return {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload || {});
    },
  };
}

function harness() {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    mode: 'flight',
    input: { fireGroup: 2, aimAngle: 0, actions: { mine: true, siteBeam: true } },
    ui: { beamMode: 'auto', componentSelection: null },
    player: {
      credits: 900,
      reputation: { faction_scn: 0 },
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 },
      miningBeam: { tierId: 'beam_industrial', dps: 18, range: 180 },
    },
    world: { currentSectorId: 'sector_ceres_belt' },
    content: { commodities: [] },
  };
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_player',
    pos: {
      x: CERES_SHIPBREAK_MANIFEST.placement.pos.x,
      z: CERES_SHIPBREAK_MANIFEST.placement.pos.z + 200,
    },
    vel: { x: 0, z: 0 },
    radius: 10,
    flags: { docked: false },
    data: { miningBeam: state.player.miningBeam },
  };
  entities.set(player.id, player);
  entityList.push(player);
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  let siteSystem;
  const registry = { get(name) { return name === 'asteroidSites' ? siteSystem : null; } };
  siteSystem = Object.create(asteroidSites);
  siteSystem.init({ state, bus, helpers, registry });
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  const miningSystem = Object.create(mining);
  miningSystem.init({ state, bus, helpers, registry });
  return { state, bus, player, siteSystem, miningSystem };
}

function component(h, componentId) {
  return [...h.state.entities.values()].find((entity) => entity.alive !== false
    && entity.data && entity.data.worldSiteId === SITE_ID
    && entity.data.worldSiteComponentId === componentId);
}

function record(h) {
  return h.state.sites.worldById[SITE_ID];
}

function aim(h, componentId) {
  const target = component(h, componentId);
  assert.ok(target, `the ${componentId} piece is there to beam`);
  h.player.pos = {
    x: target.pos.x,
    z: target.pos.z + (String(componentId).startsWith('keel') ? 90 : -90),
  };
  h.state.player.targetId = target.id;
  h.state.input.actions = { mine: true, siteBeam: true };
  h.state.input.fireGroup = 2;
  h.state.ui.componentSelection = null;
  return target;
}

function pull(h) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.miningSystem._runPlayerBeam(h.player, BEAM, DT, h.state);
}

function since(h, mark) {
  return h.bus.events.slice(mark);
}

function ofType(events, name) {
  return events.filter((event) => event.name === name);
}

function plateCutProgress(h) {
  const live = record(h).components.long_plate;
  const progress = live.progress && live.progress.cut_long_plate_seam;
  return Number(progress) || 0;
}

test('a cut that is still going starts the beam once and keeps taking metal off the plate', () => {
  const h = harness();
  aim(h, 'long_plate');
  const mark = h.bus.events.length;
  for (let n = 0; n < 8; n += 1) pull(h);
  const early = plateCutProgress(h);
  assert.ok(early > 0, 'the first moments of the beam move the cut');
  for (let n = 0; n < 8; n += 1) pull(h);
  const later = plateCutProgress(h);
  const events = since(h, mark);
  assert.equal(ofType(events, 'mining:start').length, 1, 'the beam announces itself once');
  assert.equal(ofType(events, 'mining:stop').length, 0, 'an unfinished cut stays on');
  assert.equal(h.miningSystem._beaming, true);
  assert.ok(later > early, 'holding the beam keeps the cut moving');
  assert.ok(later < 54, 'this hold does not finish the plate');
  assert.equal(record(h).completedOperations.cut_long_plate_seam, undefined);
});

test('finishing the plate cut closes the beam instead of leaving it latched on', () => {
  const h = harness();
  aim(h, 'long_plate');
  const mark = h.bus.events.length;
  let ticks = 0;
  while (ticks < 400 && !record(h).completedOperations.cut_long_plate_seam) {
    pull(h);
    ticks += 1;
  }
  pull(h);
  const events = since(h, mark);
  assert.ok(record(h).completedOperations.cut_long_plate_seam, 'the cut finishes');
  assert.equal(ofType(events, 'mining:start').length, 1);
  assert.equal(ofType(events, 'mining:stop').length, 1, 'the finished cut closes the beam');
  assert.equal(h.miningSystem._beaming, false);
  assert.equal(ticks < 400, true, 'the cut finishes inside one hold');
});

test('a brace that still needs its cut, and a brace whose section is already free, say why and stay off', () => {
  const h = harness();
  aim(h, 'crossbeam_clamp');
  const braceMark = h.bus.events.length;
  let ticks = 0;
  while (ticks < 200 && !record(h).completedOperations.brace_crossbeam) {
    pull(h);
    ticks += 1;
  }
  assert.ok(record(h).completedOperations.brace_crossbeam, 'the crossbeam brace finishes');
  pull(h);
  const braceEvents = since(h, braceMark);
  const locked = ofType(braceEvents, 'beam:denied').at(-1);
  assert.ok(locked, 'the next pull on that brace is refused');
  assert.equal(locked.payload.reason, 'dependency-incomplete');
  const lockedToast = ofType(braceEvents, 'toast').map((event) => event.payload.text);
  assert.deepEqual(lockedToast, ['Finish the prerequisite step on this site first']);
  assert.equal(lockedToast.some((text) => /_|dependency-incomplete|crossbeam/.test(text)), false);
  assert.equal(h.miningSystem._beaming, false);

  const cut = h.siteSystem.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'long_plate',
    verb: 'cut',
    amount: 54,
    requestStreamId: 'player-industrial-beam',
    requestSequence: h.state.tick + 1,
    tick: h.state.tick + 1,
  });
  assert.equal(cut.ok, true, cut.reason);
  assert.equal(cut.receipt && cut.receipt.complete, true);
  h.state.tick += 1;

  aim(h, 'long_plate_clamp');
  const cutMark = h.bus.events.length;
  pull(h);
  const cutEvents = since(h, cutMark);
  const freed = ofType(cutEvents, 'beam:denied').at(-1);
  assert.ok(freed, 'beaming the brace of a freed section is refused');
  assert.equal(freed.payload.reason, 'section-already-cut');
  const freedToast = ofType(cutEvents, 'toast').map((event) => event.payload.text);
  assert.deepEqual(freedToast, ['That section is already cut free']);
  assert.equal(h.miningSystem._beaming, false);
  assert.equal(ofType(cutEvents, 'mining:start').length, 0);
  assert.equal(ofType(cutEvents, 'mining:stop').length, 0);
});
