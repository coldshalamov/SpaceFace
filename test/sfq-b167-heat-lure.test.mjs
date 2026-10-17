import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { HEAT_TRIAL_NOTE, noteHeatTrial } from '../src/data/heatProximityTrial.js';
import {
  LURE_FILAMENT,
  LURE_MADE,
  LURE_MADE_RESIN,
  LURE_NEED,
  LURE_RESIN,
  LURE_SHOWN,
  LURE_SITE_ID,
  copyHeatDerivative,
  heatLureRecipe,
} from '../src/data/heatLure.js';
import {
  deserializeAlienEcologyState,
  handleAlienEcologyEvent,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';
import { commsToastSpec } from '../src/ui/floatingText.js';

const site = ALIEN_SITES.harvest_deep;
const CLOSE = site.arrivalBands.close;

function worldAt(x, z, items) {
  const state = {
    meta: { seed: 4242 },
    simTime: 10,
    tick: 1,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: {
      cargo: {
        items: { ...(items || {}) },
        usedVolume: 2,
        usedMass: 2,
      },
    },
    factions: { faction_free: { rep: 0 } },
    missions: { boards: {}, active: [] },
    world: {
      currentSectorId: site.sectorId,
      sectors: {
        [site.sectorId]: {
          id: site.sectorId,
          factionId: 'faction_free',
          stations: [],
        },
      },
      rng: () => 0.2,
    },
    rng: () => 0.2,
  };
  const events = [];
  const player = {
    id: 1, type: 'player', alive: true, pos: { x, z }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  // A successful field trial needs the live cast, not only a return-band toast.
  const species = FAUNA_SPECIES.furnace_maw;
  const maw = {
    id: 2, type: 'fauna', alive: true, hull: 100, radius: species.radius,
    homeSectorId: site.sectorId, rot: Math.PI,
    pos: { x: site.center.x + 700, z: site.center.z }, vel: { x: 0, z: 0 },
    data: { ecology: { speciesId: species.id, siteId: site.siteId, faunaKey: 'fixture:maw',
      anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0 } },
  };
  state.entities.set(maw.id, maw);
  state.entityList.push(maw);
  const world = {
    state,
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, payload) => { events.push({ type, payload }); } },
    helpers: { spawnEntity() { return null; }, removeEntity() {} },
  };
  return { state, world, events, player };
}

function move(pack, x, z) {
  pack.player.pos.x = x;
  pack.player.pos.z = z;
}

function fileNote(state) {
  let book = noteHeatTrial(null, { heat: false, drive: 'shadow', geometryKey: 0 });
  book = noteHeatTrial(book, { heat: true, drive: 'charge', geometryKey: 0 });
  ensureAlienEcologyState(state).heatTrial = book;
  assert.equal(book.note, HEAT_TRIAL_NOTE);
}

function qty(state, id) {
  const items = state.player.cargo.items;
  return items[id] || 0;
}

function lureOf(state) {
  return ensureAlienEcologyState(state).heatDerivative || null;
}

function lureLogs(events) {
  return events.filter((e) => e.type === 'comms:log' && e.payload && (
    e.payload.text === LURE_NEED
    || e.payload.text === LURE_MADE
    || e.payload.text === LURE_MADE_RESIN
    || e.payload.text === LURE_SHOWN
  ));
}

function scan(pack, sectorId) {
  handleAlienEcologyEvent(pack.world, 'scan:completed', { sectorId: sectorId || site.sectorId });
}

function reloadAt(pack, x, z) {
  const saved = serializeAlienEcologyState(pack.state);
  const next = worldAt(x, z, {});
  next.state.player.cargo = JSON.parse(JSON.stringify(pack.state.player.cargo));
  deserializeAlienEcologyState(next.state, saved);
  return next;
}

function runTrial(pack) {
  for (let i = 0; i < 120 && lureOf(pack.state)?.shown !== true; i++) {
    pack.state.simTime += 0.1;
    tickAlienEcology(pack.world, 0.1);
  }
  assert.equal(lureOf(pack.state)?.shown, true, 'a live maw must answer the deployed decoy');
}

test('the notebook and one sample are the lure recipe', () => {
  assert.equal(site.siteId, LURE_SITE_ID);
  assert.equal(site.faunaCast.furnace_maw > 0, true);
  assert.deepEqual(heatLureRecipe(null, 1, 1), { ready: false, material: null, text: null });
  assert.deepEqual(heatLureRecipe('nope', 1, 1), { ready: false, material: null, text: null });
  assert.deepEqual(
    heatLureRecipe(HEAT_TRIAL_NOTE, 1, 1),
    { ready: true, material: LURE_FILAMENT, text: LURE_MADE },
  );
  assert.deepEqual(
    heatLureRecipe(HEAT_TRIAL_NOTE, 0, 2),
    { ready: true, material: LURE_RESIN, text: LURE_MADE_RESIN },
  );
  assert.deepEqual(
    heatLureRecipe(HEAT_TRIAL_NOTE, 0, 0),
    { ready: false, material: null, text: LURE_NEED },
  );
  assert.equal(copyHeatDerivative(null), null);
  assert.equal(copyHeatDerivative({ lure: 'nope', extra: 1 }), null);
  assert.deepEqual(
    copyHeatDerivative({ lure: LURE_FILAMENT, shown: true, edge: true, asked: true, extra: 9 }),
    { lure: LURE_FILAMENT, shown: true, edge: true, asked: true },
  );
  for (const line of [LURE_NEED, LURE_MADE, LURE_MADE_RESIN, LURE_SHOWN]) {
    const notice = commsToastSpec({ from: site.name, kind: 'ecology', text: line }).text;
    assert.equal(notice.includes('...'), false, notice);
  }
  const made = commsToastSpec({ from: site.name, kind: 'ecology', text: LURE_MADE }).text;
  const resin = commsToastSpec({ from: site.name, kind: 'ecology', text: LURE_MADE_RESIN }).text;
  const shown = commsToastSpec({ from: site.name, kind: 'ecology', text: LURE_SHOWN }).text;
  assert.equal(made.includes('Leave and come back'), true);
  assert.equal(resin.includes('Leave and come back'), true);
  assert.equal(shown.includes('The maw answers the lure'), true);
});

test('one sample becomes a lure, and coming back is the trial', () => {
  const inside = { x: site.center.x, z: site.center.z };
  const outside = { x: site.center.x + CLOSE * 2, z: site.center.z };
  const onRadius = { x: site.center.x + CLOSE, z: site.center.z };

  const parked = worldAt(outside.x, outside.z, { [LURE_FILAMENT]: 1, [LURE_RESIN]: 1 });
  fileNote(parked.state);
  tickAlienEcology(parked.world, 30);
  scan(parked);
  assert.equal(qty(parked.state, LURE_FILAMENT), 1);
  assert.equal(qty(parked.state, LURE_RESIN), 1);
  assert.equal(lureOf(parked.state), null);
  assert.equal(lureLogs(parked.events).length, 0);

  const bare = worldAt(inside.x, inside.z, { [LURE_FILAMENT]: 1 });
  tickAlienEcology(bare.world, 0.5);
  scan(bare);
  assert.equal(qty(bare.state, LURE_FILAMENT), 1);
  assert.equal(lureOf(bare.state), null);

  const empty = worldAt(inside.x, inside.z, {});
  fileNote(empty.state);
  tickAlienEcology(empty.world, 0.5);
  scan(empty);
  scan(empty);
  assert.deepEqual(lureLogs(empty.events).map((e) => e.payload.text), [LURE_NEED]);
  assert.equal(lureOf(empty.state).asked, true);
  assert.equal(lureOf(empty.state).lure, undefined);
  const emptyAgain = reloadAt(empty, inside.x, inside.z);
  tickAlienEcology(emptyAgain.world, 0.5);
  scan(emptyAgain);
  assert.equal(lureLogs(emptyAgain.events).length, 0);
  assert.equal(lureOf(emptyAgain.state).asked, true);

  const waiting = worldAt(inside.x, inside.z, { [LURE_FILAMENT]: 2, [LURE_RESIN]: 1 });
  fileNote(waiting.state);
  tickAlienEcology(waiting.world, 40);
  assert.equal(qty(waiting.state, LURE_FILAMENT), 2);
  assert.equal(lureOf(waiting.state), null);
  move(waiting, onRadius.x, onRadius.z);
  scan(waiting);
  assert.equal(qty(waiting.state, LURE_FILAMENT), 2);
  assert.equal(lureOf(waiting.state), null);

  move(waiting, inside.x, inside.z);
  scan(waiting);
  assert.equal(qty(waiting.state, LURE_FILAMENT), 1);
  assert.equal(qty(waiting.state, LURE_RESIN), 1);
  assert.equal(lureOf(waiting.state).lure, LURE_FILAMENT);
  assert.equal(lureOf(waiting.state).edge, true);
  assert.equal(lureOf(waiting.state).shown, undefined);
  assert.equal(ensureAlienEcologyState(waiting.state).heatTrial.lure, undefined);
  assert.equal(ensureAlienEcologyState(waiting.state).heatTrial.note, HEAT_TRIAL_NOTE);
  assert.deepEqual(lureLogs(waiting.events).map((e) => e.payload.text), [LURE_MADE]);
  scan(waiting);
  tickAlienEcology(waiting.world, 40);
  assert.equal(qty(waiting.state, LURE_FILAMENT), 1);
  assert.equal(lureLogs(waiting.events).filter((e) => e.payload.text === LURE_SHOWN).length, 0);

  const fitted = reloadAt(waiting, inside.x, inside.z);
  tickAlienEcology(fitted.world, 0.5);
  assert.equal(lureLogs(fitted.events).length, 0);
  assert.equal(lureOf(fitted.state).lure, LURE_FILAMENT);
  assert.equal(lureOf(fitted.state).edge, true);
  assert.equal(lureOf(fitted.state).shown, undefined);
  assert.equal(qty(fitted.state, LURE_FILAMENT), 1);

  move(waiting, onRadius.x, onRadius.z);
  tickAlienEcology(waiting.world, 30);
  assert.equal(lureOf(waiting.state).edge, false);
  assert.equal(lureLogs(waiting.events).filter((e) => e.payload.text === LURE_SHOWN).length, 0);
  const armed = reloadAt(waiting, inside.x, inside.z);
  runTrial(armed);
  assert.deepEqual(lureLogs(armed.events).map((e) => e.payload.text), [LURE_SHOWN]);
  assert.equal(lureOf(armed.state).shown, true);

  move(waiting, inside.x, inside.z);
  runTrial(waiting);
  assert.deepEqual(
    lureLogs(waiting.events).filter((e) => e.payload.text === LURE_SHOWN).map((e) => e.payload.text),
    [LURE_SHOWN],
  );
  tickAlienEcology(waiting.world, 40);
  move(waiting, onRadius.x, onRadius.z);
  tickAlienEcology(waiting.world, 0.5);
  move(waiting, inside.x, inside.z);
  tickAlienEcology(waiting.world, 0.5);
  assert.equal(lureLogs(waiting.events).filter((e) => e.payload.text === LURE_SHOWN).length, 1);

  const shown = reloadAt(waiting, inside.x, inside.z);
  tickAlienEcology(shown.world, 0.5);
  assert.equal(lureLogs(shown.events).length, 0);
  assert.equal(lureOf(shown.state).shown, true);
  assert.equal(lureOf(shown.state).lure, LURE_FILAMENT);
  const stripped = serializeAlienEcologyState(shown.state);
  delete stripped.heatDerivative;
  deserializeAlienEcologyState(shown.state, stripped);
  assert.equal(lureOf(shown.state), null);
  assert.equal(ensureAlienEcologyState(shown.state).heatTrial.note, HEAT_TRIAL_NOTE);

  const resinOnly = worldAt(inside.x, inside.z, { [LURE_RESIN]: 1 });
  fileNote(resinOnly.state);
  tickAlienEcology(resinOnly.world, 0.5);
  scan(resinOnly);
  assert.equal(qty(resinOnly.state, LURE_RESIN), 0);
  assert.equal(lureOf(resinOnly.state).lure, LURE_RESIN);
  assert.deepEqual(lureLogs(resinOnly.events).map((e) => e.payload.text), [LURE_MADE_RESIN]);
  move(resinOnly, onRadius.x, onRadius.z);
  tickAlienEcology(resinOnly.world, 0.5);
  move(resinOnly, inside.x, inside.z);
  runTrial(resinOnly);
  assert.deepEqual(
    lureLogs(resinOnly.events).map((e) => e.payload.text),
    [LURE_MADE_RESIN, LURE_SHOWN],
  );

  const locked = worldAt(inside.x, inside.z, { [LURE_FILAMENT]: 1 });
  fileNote(locked.state);
  locked.state.story = { persistentCargo: [LURE_FILAMENT] };
  tickAlienEcology(locked.world, 0.5);
  scan(locked);
  assert.equal(qty(locked.state, LURE_FILAMENT), 1);
  assert.equal(lureOf(locked.state), null);
  assert.equal(lureLogs(locked.events).length, 0);

  const dock = ALIEN_SITES.breathing_dock;
  const elsewhere = worldAt(dock.center.x, dock.center.z, { [LURE_FILAMENT]: 1 });
  elsewhere.state.world.currentSectorId = dock.sectorId;
  fileNote(elsewhere.state);
  scan(elsewhere, dock.sectorId);
  assert.equal(qty(elsewhere.state, LURE_FILAMENT), 1);
  assert.equal(lureOf(elsewhere.state), null);
});
