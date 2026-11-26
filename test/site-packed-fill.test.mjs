// Packed fill (design/overhaul 05_ADVENTURE 3.3 "Backfill"): one cast block sets one dug cell
// solid again, so a contact wasted by careless digging can be bought back. The cell is stored the
// way a cave-in's dropped cell is (the rubble record) plus a "placed" mark, so it survives every
// rebuild of the rock and the tunnel-healing timer can never turn it back into the vein that was
// there or into a hole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PACKED_FILL } from '../src/data/sites.js';
import { contactProfile } from '../src/systems/siteProduction.js';
import { stepSiteStructure, SITE_STRUCTURE } from '../src/systems/siteStructuralModel.js';
import { asteroidSites, canPackFillAsteroidSiteFromState } from '../src/systems/asteroidSites.js';
import { drill, generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { cargo, addCargo, removeCargo, sellableCargoQuantity } from '../src/systems/cargo.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';

const { COLS, ROWS } = DRILL_CONST;
const MID = Math.floor(COLS / 2);
const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const DIRT = () => ({ type: 'dirt', hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.7 });
const ROCK_ID = 7001;

/**
 * A real rover session in a real staked claim, in the rock exactly as the game generates it (the
 * claim rebuilds its own copy of the rock from the seed, so hand-placed cells would exist only in
 * the rover's copy). This rock's top is plain matrix with an iron vein along row 3:
 *   row 0: the entrance at MID
 *   row 1: a corridor bored MID-3 .. MID+3
 *   row 2: matrix
 *   row 3: iron vein under MID .. MID+2
 * The Core sits at MID-1,1 (so the claim is staked) and the rover stands at MID,1.
 */
function claim({ regocrete = 6 } = {}) {
  const state = createGameState(11);
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.cargo = { items: { cmdty_regocrete: 6 + regocrete, cmdty_control_unit: 12, cmdty_refined_metals: 20, cmdty_electronics: 8 },
    capVolume: 900, usedVolume: 0, usedMass: 0, capMass: 900 };
  state.player.credits = 5000;
  const bus = createBus();
  const sys = Object.create(asteroidSites);
  const ctx = { state, bus, helpers: {}, registry: { get: (name) => (name === 'asteroidSites' ? sys : null) } };
  cargo.init(ctx);
  drill.init(ctx);
  sys.init(ctx);
  const ent = { id: ROCK_ID, type: 'asteroid', alive: true, pos: { x: 10, z: 10 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, fieldId: 'f' } };
  state.entities.set(ROCK_ID, ent);
  state.entityList.push(ent);
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, { id: state.playerId, hull: 100, hullMax: 100, data: {} });
  }
  assert.ok(drill.begin(ROCK_ID), 'the rover goes down');
  const d = state.drill;
  for (let c = MID - 4; c <= MID + 4; c++) {
    assert.equal(d.field[c][1].type, 'dirt', 'this rock has matrix on row 1');
    assert.equal(d.field[c][2].type, 'dirt', 'and on row 2');
  }
  for (let c = MID; c <= MID + 2; c++) assert.equal(d.field[c][3].ore, 'cmdty_ore_iron', 'and iron under it');
  for (let c = MID - 3; c <= MID + 3; c++) open(state, bus, c, 1);
  d.avatar.col = MID; d.avatar.row = 1;
  const core = sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_massline_core', col: MID - 1, row: 1 });
  assert.equal(core.ok, true, `core: ${core.reason}`);
  const site = sys.getSite(core.siteId);
  // The fill is paid for with the blocks asked for here, whatever the Core cost.
  setBlocks(state, regocrete);
  return { state, bus, sys, ent, site, d };
}

/** Bore one cell out the way the rover does: the live tile, the rock's record, the break event. */
function open(state, bus, col, row) {
  const d = state.drill;
  const ent = state.entities.get(ROCK_ID);
  d.field[col][row] = EMPTY();
  if (!ent.data.drillCleared.includes(tileIndex(col, row))) ent.data.drillCleared.push(tileIndex(col, row));
  bus.emit('drill:break', { col, row, type: 'dirt', ore: null, wasVein: false, wasGas: false });
}

const blocks = (state) => sellableCargoQuantity(state, 'cmdty_regocrete');
function setBlocks(state, n) {
  const have = blocks(state);
  if (have > n) removeCargo(state, 'cmdty_regocrete', have - n);
  else if (have < n) addCargo(state, 'cmdty_regocrete', n - have);
  assert.equal(blocks(state), n);
}

test('a wasted contact comes back: dig the matrix beside an extractor, pack it, and the rate is exact again', () => {
  const h = claim();
  const { state, bus, sys, site, d } = h;
  // The extractor sits in a niche under the corridor: matrix either side, iron below.
  open(state, bus, MID + 1, 2);
  const ex = sys.installMachine({ asteroidId: ROCK_ID, defId: 'sm_extractor', col: MID + 1, row: 2 });
  assert.equal(ex.ok, true, `extractor: ${ex.reason}`);
  const reading = () => {
    const pm = sys.projection(site.id).machines.find((m) => m.id === ex.machineId);
    return { solid: pm.geo.solid, matrix: pm.geo.matrix, out: pm.capability.outputsPerMin };
  };
  const before = reading();
  assert.ok(before.matrix >= 2, 'the extractor starts with matrix under it');
  setBlocks(state, 3);

  // Strip-mine the cell beside the extractor, straight down from where the rover stands.
  open(state, bus, MID, 2);
  const dug = reading();
  assert.equal(dug.solid, before.solid - 1, 'the dug cell is a contact gone');
  assert.ok(dug.out.cmdty_silicate < before.out.cmdty_silicate, 'and silicate per minute drops');

  // The preview says what the block gives before it is spent.
  const quote = sys.canPackFill({ asteroidId: ROCK_ID, col: MID, row: 2, preview: true });
  assert.equal(quote.ok, true, `quote: ${quote.reason}`);
  assert.equal(quote.gain.contacts, 1);
  assert.ok(quote.gain.rate > 0, 'the quote names the rate it restores');
  assert.equal(quote.sealsReturn, false);
  assert.equal(blocks(state), 3, 'a quote spends nothing');

  const fills = [];
  bus.on('drill:fill', (p) => fills.push(p));
  const packed = sys.packFill({ asteroidId: ROCK_ID, col: MID, row: 2 });
  assert.equal(packed.ok, true, `pack: ${packed.reason}`);
  assert.equal(blocks(state), 3 - PACKED_FILL.cost.cmdty_regocrete, 'one block left the hold');
  assert.deepEqual(fills.map((p) => [p.col, p.row]), [[MID, 2]], 'the board is told which cell closed');
  const tile = d.field[MID][2];
  assert.equal(tile.type, 'dirt');
  assert.equal(tile.fill, true);
  assert.deepEqual(reading(), before, 'contacts and rate are exactly what they were before the dig');
  // The rover's own field agrees with the claim's: the block reads as matrix to the extractor.
  assert.equal(contactProfile(d.field, MID + 1, 2, COLS, ROWS).matrix, before.matrix);
  // The mirror the screen reads refuses the same cell now: it is solid.
  assert.equal(canPackFillAsteroidSiteFromState(state, { asteroidId: ROCK_ID, col: MID, row: 2 }).reason, 'fill-solid');
});

test('a packed cell stays packed: field rebuild, save and load, leaving and coming back, and long neglect', () => {
  const h = claim();
  const { state, bus, sys, ent, site } = h;
  // A cell that is an iron vein in the rock as generated. Bore down to it, cut it, pack it.
  const col = MID + 2; const row = 3;
  const idx = tileIndex(col, row);
  open(state, bus, col, 2);
  assert.equal(generateDrillField(ROCK_ID, 'ast_common_rock')[col][row].ore, 'cmdty_ore_iron');
  open(state, bus, col, row);
  assert.equal(sys.packFill({ asteroidId: ROCK_ID, col, row }).ok, true);
  const isFill = (tile, where) => {
    assert.equal(tile.type, 'dirt', `${where}: solid matrix, not a hole`);
    assert.equal(tile.ore, null, `${where}: not the vein that was dug`);
    assert.equal(tile.fill, true, `${where}: still marked as placed`);
  };
  assert.ok(!ent.data.drillCleared.includes(idx), 'the rock no longer lists the cell as dug');
  assert.ok(!site.cleared.includes(idx), 'nor does the claim');
  assert.deepEqual(site.drillFill, [idx]);
  assert.ok(site.drillRubble.includes(idx), 'the claim keeps it in the solid-again record');

  // 1. The claim rebuilds its own field from the record.
  sys._markDirty(site.id, { field: true });
  isFill(sys._runtime(site).field[col][row], 'field rebuild');

  // 2. Leave. drill:end rebuilds the claim's dug list from the rock's record.
  drill.end({ reason: 'retracted' });
  assert.equal(state.drill, null);
  assert.ok(!site.cleared.includes(idx), 'leaving does not reopen the cell');
  sys._markDirty(site.id, { field: true });
  isFill(sys._runtime(site).field[col][row], 'after leaving');

  // 3. Save and load the claim, with the rock streamed out and stamped back from the claim.
  const saved = JSON.parse(JSON.stringify(sys.serialize()));
  for (const key of ['drillCleared', 'drillRubble', 'drillFill', 'drillVented', 'drillScars', 'drillFaults']) delete ent.data[key];
  sys.deserialize(saved);
  const restored = sys.getSite(site.id);
  assert.deepEqual(restored.drillFill, [idx], 'the save carries the placed mark');
  isFill(sys._runtime(restored).field[col][row], 'after load');

  // 4. Come back: the rover's own field has the block.
  ent.data.drillCleared = restored.cleared.slice();
  ent.data.drillRubble = restored.drillRubble.slice();
  ent.data.drillFill = restored.drillFill.slice();
  assert.ok(drill.begin(ROCK_ID));
  isFill(state.drill.field[col][row], 'on re-entry');
  drill.end({ reason: 'retracted' });

  // 5. The claim is gone and the rock sits untouched for a day: tunnels heal, the block does not
  //    turn back into iron and does not open.
  delete ent.data.siteId;
  ent.data.lastDrillT = state.simTime;
  state.simTime += 86400;
  assert.ok(drill.begin(ROCK_ID));
  isFill(state.drill.field[col][row], 'after a day of healing');
  assert.equal(state.drill.field[MID + 3][1].type !== 'empty', true, 'a plain dug cell did heal in that time');
});

test('packed fill can be bored out again: it pays nothing and leaves an ordinary tunnel', () => {
  const h = claim();
  const { state, bus, sys, ent, site, d } = h;
  const col = MID + 1; const row = 2;
  const idx = tileIndex(col, row);
  open(state, bus, col, row);
  assert.equal(sys.packFill({ asteroidId: ROCK_ID, col, row }).ok, true);
  const holdBefore = JSON.stringify(state.player.cargo.items);
  // Stand over it and bore down.
  d.avatar.col = col; d.avatar.row = 1;
  for (let i = 0; i < 400 && d.field[col][row].type !== 'empty'; i++) {
    d.moveCooldown = 0;
    drill.tickInput({ left: false, right: false, up: false, down: true }, 0.1);
  }
  assert.equal(d.field[col][row].type, 'empty', 'the rover chewed through the block');
  assert.equal(JSON.stringify(state.player.cargo.items), holdBefore, 'and banked nothing for it');
  assert.ok(ent.data.drillCleared.includes(idx));
  assert.ok(!(ent.data.drillRubble || []).includes(idx));
  assert.ok(!(ent.data.drillFill || []).includes(idx), 'the placed mark went with it');
  assert.ok(site.cleared.includes(idx));
  assert.ok(!(site.drillFill || []).includes(idx), 'the claim forgets the block too');
  sys._markDirty(site.id, { field: true });
  assert.equal(sys._runtime(site).field[col][row].type, 'empty');
});

test('fill never goes where something else lives, and never without a block to spend', () => {
  const h = claim({ regocrete: 2 });
  const { state, bus, sys, site, d } = h;
  const why = (col, row) => sys.canPackFill({ asteroidId: ROCK_ID, col, row, preview: true }).reason;
  assert.equal(why(MID + 1, 2), 'fill-solid', 'solid rock');
  assert.equal(why(MID - 1, 1), 'occupied', 'the Core');
  assert.equal(why(MID, 0), 'entry-reserved', 'the entrance');
  assert.equal(why(MID, 1), 'rover-here', 'the rover');
  assert.equal(why(-1, 1), 'out-of-bounds');
  // A hollow cell the rover cannot reach.
  d.field[MID + 6][8] = EMPTY();
  assert.equal(why(MID + 6, 8), 'no-access-route');
  // A cell carrying a cable.
  assert.equal(sys.setOverlay(site.id, 'power', MID + 1, 1, true).ok, true);
  assert.equal(why(MID + 1, 1), 'fill-line');
  assert.equal(sys.setOverlay(site.id, 'power', MID + 1, 1, false).ok, true);
  // A vented seam a tap may still be sipping.
  d.field[MID + 2][1].vented = true;
  assert.equal(why(MID + 2, 1), 'fill-vented');
  delete d.field[MID + 2][1].vented;
  // A planted charge.
  d.charge = { col: MID + 2, row: 1, fuse: 1, payload: 'blast', pattern: [] };
  assert.equal(why(MID + 2, 1), 'fill-charge');
  d.charge = null;
  // A rock nobody has claimed.
  const other = { id: 7002, type: 'asteroid', alive: true, pos: { x: 90, z: 10 }, radius: 9, data: { typeId: 'ast_common_rock' } };
  state.entities.set(7002, other);
  assert.equal(sys.canPackFill({ asteroidId: 7002, col: MID, row: 1 }).reason, 'fill-no-claim');

  // Closing the corridor between the rover and the entrance is allowed, and warned about.
  d.avatar.col = MID + 2; d.avatar.row = 1;
  const seal = sys.canPackFill({ asteroidId: ROCK_ID, col: MID + 1, row: 1, preview: true });
  assert.equal(seal.ok, true, `seal: ${seal.reason}`);
  assert.equal(seal.sealsReturn, true, 'the quote says it cuts the way back');
  assert.equal(sys.canPackFill({ asteroidId: ROCK_ID, col: MID + 3, row: 1, preview: true }).sealsReturn, false);

  // The far side of the Core is out of the rover's reach: the Core fills the corridor.
  assert.equal(why(MID - 3, 1), 'no-access-route');

  // Two blocks, two cells; the third is refused and nothing changes.
  assert.equal(sys.packFill({ asteroidId: ROCK_ID, col: MID + 3, row: 1 }).ok, true);
  assert.equal(sys.packFill({ asteroidId: ROCK_ID, col: MID, row: 1 }).ok, true);
  assert.equal(blocks(state), 0);
  const broke = sys.packFill({ asteroidId: ROCK_ID, col: MID + 1, row: 1 });
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'materials');
  assert.deepEqual(broke.missing, { cmdty_regocrete: 1 });
  assert.equal(d.field[MID + 1][1].type, 'empty', 'a refused fill leaves the cell open');
  void bus;
});

test('a packed pillar holds a roof: one block between two running refineries stops the shaking', () => {
  const build = (pillar) => {
    const f = [];
    for (let c = 0; c < COLS; c++) { f[c] = []; for (let r = 0; r < ROWS; r++) f[c][r] = DIRT(); }
    for (let c = 8; c <= 14; c++) { f[c][10] = EMPTY(); f[c][11] = EMPTY(); }
    if (pillar) f[11][10] = { ...DIRT(), rubble: true, fill: true };
    return f;
  };
  const machines = [
    { id: 'm1', defId: 'sm_refinery', col: 8, row: 10, powerRatio: 1 },
    { id: 'm2', defId: 'sm_refinery', col: 14, row: 10, powerRatio: 1 },
  ];
  const run = (f) => {
    let structure = null; let fell = false;
    for (let t = 0; t < SITE_STRUCTURE.fractureS + 2; t++) {
      const out = stepSiteStructure({ dtS: 1, cols: COLS, rows: ROWS, machines, field: f, avatar: null, structure });
      structure = out.structure;
      if (out.fracture) fell = true;
    }
    return fell;
  };
  assert.equal(run(build(false)), true, 'the open span comes down');
  assert.equal(run(build(true)), false, 'a packed cell on the line between them carries it');
});

test('the generated rock is untouched by any of this: a field with no fill record has no fill', () => {
  const f = generateDrillField(ROCK_ID, 'ast_common_rock');
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) assert.ok(!f[c][r].fill);
});

test('the board says it: the palette carries the key, and the card names what a block restores or why not', async () => {
  const { PALETTE_ITEMS, PALETTE_GLYPHS } = await import('../src/ui/asteroid/buildPalette.js');
  const { fillLensModel, tileLensModel, placementReason } = await import('../src/ui/asteroid/inspector.js');
  const key = PALETTE_ITEMS.find((item) => item.kind === 'fill');
  assert.ok(key, 'packed fill is on the build palette');
  assert.equal(key.name, 'Packed fill');
  assert.deepEqual(key.cost, PACKED_FILL.cost);
  assert.ok(PALETTE_GLYPHS[key.id], 'with its own glyph');

  const good = fillLensModel({ ok: true, sealsReturn: false, gain: { contacts: 2, rate: 0.4, processBonus: 0.15, machineCount: 2 } });
  assert.equal(good.name, 'Packed fill');
  assert.equal(good.lamp, 'mint');
  assert.equal(good.body, 'Restores 2 contacts · +0.4/min · +15% process speed');
  assert.equal(fillLensModel({ ok: true, gain: null }).body, 'No machine beside this cell');
  assert.equal(fillLensModel({ ok: true, sealsReturn: true, gain: null }).chips[0].id, 'seal');
  const poor = fillLensModel({ ok: false, reason: 'materials', missing: { cmdty_regocrete: 1 } });
  assert.equal(poor.lamp, 'coral');
  assert.match(poor.body, /^Need 1 /);
  for (const reason of ['fill-solid', 'fill-no-claim', 'fill-vented', 'fill-line', 'fill-charge', 'no-access-route', 'occupied', 'rover-here', 'entry-reserved']) {
    const card = fillLensModel({ ok: false, reason });
    assert.notEqual(card.body, 'Placement blocked', `${reason} has its own short line`);
    assert.ok(card.body.split(' ').length <= 5, `${reason}: five words at most`);
    const said = placementReason({ reason });
    assert.notEqual(said, 'Placement blocked.', `${reason} is announced in a full sentence`);
    assert.ok(!/[!—]/.test(card.body + said), `${reason}: no exclamation mark or em dash`);
  }

  // Hovering a packed cell names it and does not raise the cave-in alarm.
  const tile = { type: 'dirt', hp: 8, maxHp: 8, ore: null, hazard: false, tierReq: 1, hardness: 0.4, rubble: true, fill: true };
  const hover = tileLensModel({ tile, appearance: null, telemetry: null });
  assert.equal(hover.name, 'Packed fill');
  assert.equal(hover.body, 'Packed by you: reads as matrix to machines');
  assert.ok(!hover.chips.some((chip) => chip.id === 'rubble'));
  const fallen = tileLensModel({ tile: { ...tile, fill: false }, appearance: null, telemetry: null });
  assert.ok(fallen.chips.some((chip) => chip.id === 'rubble'), 'a real cave-in still reads as rubble');
});

test('the worker boundary carries it: the command is allowed and the placed mark reaches the screen', async () => {
  const { readFileSync } = await import('node:fs');
  const host = readFileSync(new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url), 'utf8');
  assert.match(host, /packFill: 1/, 'the site command list allows packFill with one argument');
  const read = readFileSync(new URL('../scripts/lib/simReadModel.mjs', import.meta.url), 'utf8');
  assert.match(read, /'rubble','fill'/, 'the tile fields sent to the screen include the placed mark');
  const facade = readFileSync(new URL('../src/runtime/laneSystemFacades.js', import.meta.url), 'utf8');
  assert.match(facade, /packFill: \(request\) => call\('packFill', \[request\]\)/);
  assert.match(facade, /canPackFill,/);
});
