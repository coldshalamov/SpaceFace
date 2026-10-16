import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  WRECK_CUT_OPEN,
  WRECK_CUT_WARNED,
  WRECK_SEALED,
  WRECK_SITE_ID,
  WRECK_WARNED,
  stepWreckSuccession,
} from '../src/data/wreckSuccession.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

const garden = ALIEN_SITES.three_hull_garden;
const CLOSE = garden.arrivalBands.close;

function worldAt(x, z) {
  const state = {
    meta: { seed: 7 },
    simTime: 10,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {} } },
    world: { currentSectorId: garden.sectorId, sectors: {}, rng: () => 0.2 },
    rng: () => 0.2,
  };
  const events = [];
  const player = {
    id: 1, type: 'player', alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const world = {
    state,
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, events, player };
}

function logs(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload && e.payload.text
    && (e.payload.text === WRECK_WARNED || e.payload.text === WRECK_SEALED
      || e.payload.text === WRECK_CUT_OPEN || e.payload.text === WRECK_CUT_WARNED));
}

function stageOf(state) {
  const rec = ensureAlienEcologyState(state).sites[garden.siteId];
  return rec && rec.wreckStage ? rec.wreckStage : 'open';
}

test('the garden sequence advances on a return and a cut steps it back', () => {
  assert.equal(garden.siteId, WRECK_SITE_ID);
  assert.deepEqual(stepWreckSuccession('open', 'enter'), { stage: 'warned', text: WRECK_WARNED });
  assert.deepEqual(stepWreckSuccession('warned', 'enter'), { stage: 'sealed', text: WRECK_SEALED });
  assert.deepEqual(stepWreckSuccession('sealed', 'enter'), { stage: 'sealed', text: null });
  assert.deepEqual(stepWreckSuccession('warned', 'cut'), { stage: 'open', text: WRECK_CUT_OPEN });
  assert.deepEqual(stepWreckSuccession('sealed', 'cut'), { stage: 'warned', text: WRECK_CUT_WARNED });
  assert.deepEqual(stepWreckSuccession('open', 'cut'), { stage: 'open', text: null });
  assert.equal(WRECK_WARNED.includes('Cut the lace'), true);
  assert.equal(WRECK_SEALED.includes('One hull has sealed'), true);
});

test('closing, leaving, and reloading keep one stage, and a scan can stop the seal', () => {
  const outside = { x: garden.center.x + CLOSE * 2, z: garden.center.z };
  const inside = { x: garden.center.x, z: garden.center.z };
  const first = worldAt(outside.x, outside.z);
  tickAlienEcology(first.world, 30);
  assert.equal(stageOf(first.state), 'open');
  assert.equal(logs(first.events).length, 0);

  first.player.pos = inside;
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'warned');
  assert.equal(logs(first.events).at(-1).payload.text, WRECK_WARNED);
  tickAlienEcology(first.world, 40);
  assert.equal(stageOf(first.state), 'warned');
  assert.equal(logs(first.events).length, 1);

  handleAlienEcologyEvent(first.world, 'scan:completed', { sectorId: garden.sectorId });
  assert.equal(stageOf(first.state), 'open');
  assert.equal(logs(first.events).at(-1).payload.text, WRECK_CUT_OPEN);

  first.player.pos = outside;
  tickAlienEcology(first.world, 0.5);
  first.player.pos = inside;
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'warned');
  first.player.pos = outside;
  tickAlienEcology(first.world, 0.5);
  first.player.pos = inside;
  tickAlienEcology(first.world, 0.5);
  assert.equal(stageOf(first.state), 'sealed');
  assert.equal(logs(first.events).at(-1).payload.text, WRECK_SEALED);
  const sealedLogs = logs(first.events).filter((e) => e.payload.text === WRECK_SEALED).length;
  tickAlienEcology(first.world, 5);
  assert.equal(logs(first.events).filter((e) => e.payload.text === WRECK_SEALED).length, sealedLogs);

  const away = worldAt(outside.x, outside.z);
  deserializeAlienEcologyState(away.state, serializeAlienEcologyState(first.state));
  assert.equal(stageOf(away.state), 'sealed');
  away.player.pos = inside;
  tickAlienEcology(away.world, 0.5);
  assert.equal(stageOf(away.state), 'sealed');
  assert.equal(logs(away.events).length, 0);

  handleAlienEcologyEvent(away.world, 'scan:completed', { sectorId: garden.sectorId });
  assert.equal(stageOf(away.state), 'warned');
  assert.equal(logs(away.events).at(-1).payload.text, WRECK_CUT_WARNED);
  away.player.pos = outside;
  tickAlienEcology(away.world, 0.5);
  handleAlienEcologyEvent(away.world, 'scan:completed', { sectorId: garden.sectorId });
  assert.equal(stageOf(away.state), 'warned');

  const saved = serializeAlienEcologyState(away.state);
  const back = worldAt(inside.x, inside.z);
  deserializeAlienEcologyState(back.state, saved);
  assert.equal(stageOf(back.state), 'warned');
  tickAlienEcology(back.world, 0.5);
  assert.equal(stageOf(back.state), 'sealed');
  assert.equal(logs(back.events).at(-1).payload.text, WRECK_SEALED);
});
