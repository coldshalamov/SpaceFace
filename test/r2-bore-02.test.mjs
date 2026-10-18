// BORE-02: a hollowed room behind a false rock cap is a physical cache.
// Patrol scans miss it unless someone saw the entry. The same goods on the hull still flag.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { readCustomsWeir } from '../src/presentation/customsWeir.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { addCargo, cargo as cargoBase } from '../src/systems/cargo.js';
import { economy as economyBase } from '../src/systems/economy.js';
import { lawWitnessesNear } from '../src/systems/lawSecurity.js';
import { setDeadDropWitnessSource } from '../src/systems/boreDeadDrop.js';
import { readFileSync } from 'node:fs';

// The composition root (src/core/registry.js) registers this at game start; the test does the same.
setDeadDropWitnessSource(lawWitnessesNear);

test('the dead-drop helper stays browser-loadable: no node: import in the module the whole game imports through cargo', () => {
  const src = readFileSync(new URL('../src/systems/boreDeadDrop.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /from\s+['"]node:/, 'a node: import here breaks the browser module graph');
  assert.doesNotMatch(src, /createRequire|\brequire\(/, 'a Node require() here breaks the browser module graph');
});

const DRILL_COLS = 28;
const APPROACH = { col: 2, row: 2 };
const MOUTH = { col: 3, row: 2 };
const ROOM = { col: 4, row: 2 };
const MOUTH_INDEX = MOUTH.row * DRILL_COLS + MOUTH.col;

function rockTile() {
  return { type: 'rock', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 1 };
}

function emptyTile() {
  return { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
}

function makeField(cols, rows, empties) {
  const open = new Set(empties.map((cell) => `${cell.col},${cell.row}`));
  const field = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < rows; r++) col.push(open.has(`${c},${r}`) ? emptyTile() : rockTile());
    field.push(col);
  }
  return field;
}

function boot(opts = {}) {
  const empties = opts.empties || [APPROACH, MOUTH, ROOM];
  const cols = opts.cols || 8;
  const rows = opts.rows || 6;
  const avatar = opts.avatar || APPROACH;
  const bus = createBus();
  const toasts = [];
  const busts = [];
  bus.on('toast', (payload) => { if (payload && payload.text) toasts.push(payload.text); });
  bus.on('contraband:scanned', (payload) => busts.push(payload));
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, data: {},
  };
  const rock = {
    id: 7, type: 'asteroid', alive: true, pos: { x: 400, z: 20 }, radius: 30,
    data: {
      drillCleared: [
        MOUTH_INDEX,
        APPROACH.row * DRILL_COLS + APPROACH.col,
        ROOM.row * DRILL_COLS + ROOM.col,
      ],
    },
  };
  const site = makeSiteRecord({
    id: 'site_1', asteroidId: 7, sectorId: 'sector_helios_prime', createdT: 0,
  });
  site.anchored = opts.anchored !== false;
  site.anchor = { x: 120, z: -40, radius: 30, typeId: 'asteroid_iron', yieldU: 20 };
  const state = {
    meta: { seed: 4242 },
    rng: mulberry32(4242),
    simTime: 12,
    tick: 4,
    playerId: 1,
    player: {
      credits: 100000,
      debt: 0,
      bounty: 0,
      cargo: {
        items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40, selectedId: 'cmdty_narcotics',
      },
      stats: {},
    },
    factions: {},
    conflicts: {},
    entities: new Map([[1, player], [7, rock]]),
    entityList: [player],
    world: { currentSectorId: 'sector_helios_prime' },
    economy: {
      markets: {}, cycles: {}, econEvents: [],
      econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {},
    },
    sites: {
      byId: { site_1: site }, order: ['site_1'], nextSiteNum: 2,
      worldById: {}, worldOrder: [], meta: { rngSeed: 4242 },
    },
    drill: {
      active: true,
      asteroidId: 7,
      field: makeField(cols, rows, empties),
      avatar: { col: avatar.col, row: avatar.row, faceDir: opts.faceDir || 'right' },
    },
    input: { actions: {} },
    lawSecurity: {
      customsWeir: { active: true, seen: false, shape: 'corridor', segments: [{ x: 0, z: 0 }] },
    },
  };
  const cargoSys = { ...cargoBase };
  const economySys = { ...economyBase };
  cargoSys.init({ state, bus, helpers: {}, registry: null });
  economySys.init({ state, bus, helpers: {}, registry: null });
  economySys._rng = () => 0;
  return { state, bus, toasts, busts, cargoSys, economySys, site, player, rock };
}

function dumpLot(ctx, whole) {
  ctx.state.input.actions.jettisonLot = !whole;
  ctx.state.input.actions.jettisonLotAll = !!whole;
  ctx.cargoSys.update(1 / 60, ctx.state);
}

function assertPlain(text) {
  assert.equal(typeof text, 'string');
  assert.doesNotMatch(text, /cmdty_/);
  assert.doesNotMatch(text, /site_\d/);
  assert.doesNotMatch(text, /[a-z]+_[a-z0-9_]+/);
}

function scan(ctx) {
  return ctx.economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
}

test('a sealed bore hides narcotics from a lawful scan that still flags the same goods on the hull', () => {
  const ctx = boot();
  addCargo(ctx.state, 'cmdty_narcotics', 2);
  dumpLot(ctx, true);

  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.equal(ctx.site.deadDrop.sealed, true);
  assert.equal(ctx.site.deadDrop.witnessed, false);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, 2);
  assert.equal(ctx.state.drill.field[MOUTH.col][MOUTH.row].type, 'rock');
  assert.equal(ctx.state.drill.field[MOUTH.col][MOUTH.row].ore, null);
  assert.equal(ctx.rock.data.drillCleared.includes(MOUTH_INDEX), false);

  const line = ctx.toasts.find((text) => text.includes('solid rock'));
  assert.ok(line);
  assert.match(line, /Narcotics/);
  assertPlain(line);

  const picture = readCustomsWeir(ctx.state);
  assert.equal(picture.sealedBoreHidden, true);
  assert.equal(picture.shape, 'corridor');
  assert.equal(picture.seen, false);
  assert.equal(picture.segments.length, 1);

  const hidden = scan(ctx);
  assert.equal(hidden.found, false);
  assert.equal(ctx.busts.length, 0);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, 2);

  addCargo(ctx.state, 'cmdty_narcotics', 2);
  const caught = scan(ctx);
  assert.equal(caught.found, true);
  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, 2);
  assert.ok(ctx.busts.length >= 1);

  const again = boot();
  addCargo(again.state, 'cmdty_narcotics', 2);
  dumpLot(again, true);
  assert.equal(JSON.stringify(again.site.deadDrop), JSON.stringify(ctx.site.deadDrop));

  const corridor = [];
  for (let col = 2; col <= 12; col++) corridor.push({ col, row: 2 });
  const open = boot({ empties: corridor, cols: 16, rows: 6 });
  addCargo(open.state, 'cmdty_narcotics', 2);
  dumpLot(open, true);
  assert.equal(open.site.deadDrop, undefined);
  assert.equal(open.state.player.cargo.items.cmdty_narcotics, 2);

  const loose = boot({ anchored: false });
  addCargo(loose.state, 'cmdty_narcotics', 2);
  dumpLot(loose, true);
  assert.equal(loose.site.deadDrop, undefined);
  assert.equal(loose.state.player.cargo.items.cmdty_narcotics, 2);
});

test('a patrol that sees the mouth voids the concealment, and the scan takes the goods from the rock', () => {
  const ctx = boot();
  addCargo(ctx.state, 'cmdty_narcotics', 2);
  dumpLot(ctx, true);
  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, 2);
  assert.equal(scan(ctx).found, false);

  const patrol = {
    id: 9, type: 'ship', alive: true, pos: { x: 80, z: 0 }, radius: 12,
    data: { ai: { lawful: true } },
  };
  ctx.state.entities.set(9, patrol);
  ctx.state.entityList.push(patrol);
  ctx.cargoSys.update(1 / 60, ctx.state);

  assert.equal(ctx.site.deadDrop.sealed, true);
  assert.equal(ctx.site.deadDrop.witnessed, true);
  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, 2);
  const seenLine = ctx.toasts.find((text) => text.includes('patrol'));
  assert.ok(seenLine);
  assertPlain(seenLine);

  const bust = scan(ctx);
  assert.equal(bust.found, true);
  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.equal(ctx.site.deadDrop.stacks.cmdty_narcotics, undefined);
  assert.equal(ctx.busts.length, 1);
});

test('the cache is still in the rock after the site is saved, and drilling the cap brings it back aboard', () => {
  const ctx = boot();
  const sites = Object.create(asteroidSites);
  sites.init({ state: ctx.state, bus: ctx.bus, helpers: {}, registry: { get() { return null; } } });
  addCargo(ctx.state, 'cmdty_narcotics', 2);
  dumpLot(ctx, true);
  assert.equal(ctx.state.sites.byId.site_1.deadDrop.stacks.cmdty_narcotics, 2);

  const saved = JSON.parse(JSON.stringify(sites.serialize()));
  sites.deserialize(saved);
  const restored = ctx.state.sites.byId.site_1;
  assert.equal(restored.id, 'site_1');
  assert.equal(restored.anchor.x, 120);
  assert.equal(restored.anchor.z, -40);
  assert.equal(restored.deadDrop.sealed, true);
  assert.equal(restored.deadDrop.witnessed, false);
  assert.equal(restored.deadDrop.stacks.cmdty_narcotics, 2);
  assert.equal(restored.deadDrop.place.x, 120);
  assert.equal(restored.deadDrop.place.z, -40);
  assert.equal(scan(ctx).found, false);
  assert.equal(restored.deadDrop.stacks.cmdty_narcotics, 2);

  ctx.state.drill.field[MOUTH.col][MOUTH.row] = emptyTile();
  ctx.bus.emit('drill:break', { col: MOUTH.col, row: MOUTH.row, type: 'rock', ore: null, wasVein: false, wasGas: false });
  assert.equal(restored.deadDrop.sealed, false);
  ctx.state.drill.avatar.col = ROOM.col;
  ctx.state.drill.avatar.row = ROOM.row;
  const usedBefore = ctx.state.player.cargo.usedVolume;
  ctx.cargoSys.update(1 / 60, ctx.state);
  assert.equal(ctx.state.player.cargo.items.cmdty_narcotics, 2);
  assert.ok(ctx.state.player.cargo.usedVolume > usedBefore);
  assert.equal(restored.deadDrop.stacks.cmdty_narcotics, undefined);
  const back = ctx.toasts.find((text) => text.includes('back aboard'));
  assert.ok(back);
  assert.match(back, /Narcotics/);
  assertPlain(back);
});
