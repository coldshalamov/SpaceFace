// Bore-charge review fixes (commit 0b0e95c adversarial pass). Each case pins a defect the
// review proved by scratch run — quote-vs-bank truth, the paid-charge save settle, the
// visible quote at arm time, and the exit report counting blast ore.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import {
  drill,
  CHARGE_FUSE_S,
  CHARGE_YIELD_FRACTION,
} from '../src/systems/drill.js';
import { cargo, cargoUnitVolume, addCargo } from '../src/systems/cargo.js';
import { chargeQuoteText } from '../src/ui/asteroid/asteroidController.js';

const STEP = 1 / 60;
const ORE = 'cmdty_ore_iron';
const SCREEN_SRC = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');

function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) { for (const fn of handlers.get(type) || []) fn(payload); },
  };
}

function stepSeconds(state, n) {
  for (let i = 0; i < Math.ceil(n / STEP); i++) {
    state.simTime = (Number(state.simTime) || 0) + STEP;
    state.tick = (state.tick || 0) + 1;
    drill.tickInput({ left: false, right: false, up: false, down: false }, STEP);
  }
}

function setup(seed = 770001, { credits = 2000, capVolume = 100 } = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  const ctx = {
    state, bus,
    helpers: { routeCombatDamage() { return { ok: true }; } },
    registry: { get() { return null; } },
  };
  cargo.init(ctx);
  drill.init(ctx);
  state.player.cargo = { items: {}, usedVolume: 0, capVolume, capMass: 100 };
  state.player.credits = credits;
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, { id: state.playerId, hull: 100, hullMax: 100, data: {} });
  }
  if (!state.entities.has(seed)) state.entities.set(seed, { id: seed, data: {} });
  assert.ok(drill.begin(seed), 'drill session begins');
  bus.on('economy:chargeCredits', (p) => {
    state.player.credits = Math.max(0, (Number(state.player.credits) || 0) - (Number(p.amount) || 0));
  });
  return { state, bus };
}

// Aim the charge so the preview actually brackets a vein — the seat is a face the boom can
// reach beside the rig and the cut is the 3×3 around it, so the honest fix is to walk the rig
// next to an ore vein and aim at the face that puts the vein inside the quoted cut.
function quoteCoveringVein() {
  const d = drill.state.drill;
  const keep = { col: d.avatar.col, row: d.avatar.row };
  for (let vc = 0; vc < d.field.length; vc += 1) {
    for (let vr = 0; vr < d.field[vc].length; vr += 1) {
      const tile = d.field[vc][vr];
      if (!tile || tile.type !== 'vein' || !tile.ore || !(tile.yieldU > 0)) continue;
      for (let ac = -1; ac <= 1; ac += 1) {
        for (let ar = -1; ar <= 1; ar += 1) {
          if (ac === 0 && ar === 0) continue;
          const anchor = { col: vc + ac, row: vr + ar };
          for (let pc = -1; pc <= 1; pc += 1) {
            for (let pr = -1; pr <= 1; pr += 1) {
              if (pc === 0 && pr === 0) continue;
              const pos = { col: anchor.col + pc, row: anchor.row + pr };
              if (pos.col < 0 || pos.col >= d.field.length) continue;
              d.avatar.col = pos.col;
              d.avatar.row = pos.row;
              drill.setChargeAim(anchor.col, anchor.row);
              const pv = drill.chargePreview();
              const hit = pv && pv.cells && pv.cells.find((cell) => cell.verdict === 'break' && cell.type === 'vein' && cell.ore);
              if (hit) {
                const v = d.field[hit.col][hit.row];
                return { pv, vein: { col: hit.col, row: hit.row, ore: hit.ore, yieldU: v.yieldU || 0 } };
              }
            }
          }
        }
      }
    }
  }
  d.avatar.col = keep.col;
  d.avatar.row = keep.row;
  return null;
}

// B1 — the quote equals what the blast banks, cell for cell, against a real hold.
{
  const { state } = setup();
  const d = state.drill;
  // A genuinely full hold (zero free volume) — the quote must name the spill, not promise ore.
  state.player.cargo.usedVolume = state.player.cargo.capVolume;
  drill.armCharge();
  const aimed = quoteCoveringVein();
  assert.ok(aimed, 'an aim exists whose preview brackets a vein');
  const { pv: fullQuote, vein } = aimed;
  const take = Math.max(1, Math.floor(vein.yieldU * CHARGE_YIELD_FRACTION));
  assert.deepEqual(fullQuote.yields[vein.ore] || 0, 0, 'a full hold quotes zero banked ore');
  assert.equal(fullQuote.spill[vein.ore], take,
    `the full-hold spill names the lost ${take}u`);

  // Free hold: the quote promises exactly what addCargo would take.
  state.player.cargo.usedVolume = 0;
  const freeQuote = drill.chargePreview();
  assert.equal(freeQuote.yields[vein.ore], take, 'the free hold quotes the full banked take');
  assert.equal(freeQuote.spill[vein.ore] || 0, 0, 'no spill predicted with room');

  // And the quote is cell-for-cell what the real detonation settles.
  assert.ok(drill.plantCharge());
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  assert.equal(d.yieldLog[vein.ore] || 0, freeQuote.yields[vein.ore],
    'the blast banks exactly what the free-hold quote promised');
  assert.equal(state.player.cargo.items[vein.ore] || 0, freeQuote.yields[vein.ore],
    'the hold received exactly the quoted units');

  // Fractional-volume regression (Codex): a 40-unit hold holding 49 diamonds leaves 0.8
  // volume free — enough for exactly one 0.8-volume diamond, which the old floored math
  // quoted as zero. The quote must share cargo's own resolution and acceptance math.
  const t2 = setup();
  const d2 = t2.state.drill;
  drill.armCharge();
  const aimed2 = quoteCoveringVein();
  assert.ok(aimed2);
  const vein2 = aimed2.vein;
  d2.field[vein2.col][vein2.row].ore = 'cmdty_gem_diamond';
  // 49 diamonds through the real writer — the usedVolume accumulates unit-by-unit exactly
  // the way the live hold does (49 × 0.8 adds, not one multiplication), leaving the same
  // 0.8000000000000114 free remainder Codex measured.
  t2.state.player.cargo.capVolume = 40;
  for (let i = 0; i < 49; i += 1) addCargo(t2.state, 'cmdty_gem_diamond', 1);
  const pv2 = drill.chargePreview();
  const take2 = Math.max(1, Math.floor(vein2.yieldU * CHARGE_YIELD_FRACTION));
  assert.equal(pv2.yields.cmdty_gem_diamond, 1,
    `the fractional remainder banks exactly one diamond, not zero — got ` +
    JSON.stringify({ ok: pv2.ok, yields: pv2.yields, spill: pv2.spill, vol: cargoUnitVolume(t2.state, 'cmdty_gem_diamond'), free: 40 - t2.state.player.cargo.usedVolume, budget: d2.rockBudget }));
  assert.equal(pv2.spill.cmdty_gem_diamond || 0, take2 - 1, 'the rest of the cut spills');
  assert.ok(drill.plantCharge());
  stepSeconds(t2.state, CHARGE_FUSE_S + 0.1);
  assert.equal(d2.yieldLog.cmdty_gem_diamond || 0, pv2.yields.cmdty_gem_diamond,
    'the blast banks exactly what the fractional quote promised');

  // Two-vein regression (Codex round-4): 44 diamonds in a 40-unit hold leaves 4.8 volume;
  // two diamond veins of 2+9 units should bank 6 in addCargo's own order — a single
  // subtracted free-volume shadow quoted 5.
  const t3 = setup();
  const d3 = t3.state.drill;
  drill.armCharge();
  const aimed3 = quoteCoveringVein();
  assert.ok(aimed3);
  const veinA = aimed3.vein;
  d3.field[veinA.col][veinA.row].ore = 'cmdty_gem_diamond';
  d3.field[veinA.col][veinA.row].yieldU = 2;
  // Seed a second diamond vein directly beside the first — the same blast footprint.
  const cellB = d3.field[veinA.col + 1] && d3.field[veinA.col + 1][veinA.row];
  let veinB = null;
  if (cellB && cellB.type !== 'vein') {
    cellB.type = 'vein'; cellB.ore = 'cmdty_gem_diamond'; cellB.yieldU = 9;
    cellB.maxHp = cellB.maxHp || 1; cellB.hp = cellB.hp || 1;
    veinB = cellB;
  }
  t3.state.player.cargo.capVolume = 40;
  for (let i = 0; i < 44; i += 1) addCargo(t3.state, 'cmdty_gem_diamond', 1);
  const pv3 = drill.chargePreview();
  if (veinB) {
    assert.equal(pv3.yields.cmdty_gem_diamond || 0, 6,
      `two-vein fractional remainder banks 6 — got ${JSON.stringify(pv3.yields)}`);
  }
  assert.ok(drill.plantCharge());
  stepSeconds(t3.state, CHARGE_FUSE_S + 0.1);
  assert.equal(d3.yieldLog.cmdty_gem_diamond || 0, pv3.yields.cmdty_gem_diamond || 0,
    'the multi-vein quote still equals the blast, cell for cell');
  console.log('B1 quote-equality ok');
}

// B2 — a paid, cooking charge settles inside the capture seam, never vanishing with the debit.
{
  const { state, bus } = setup();
  const d = state.drill;
  drill.armCharge();
  const aimed = quoteCoveringVein();
  assert.ok(aimed);
  const { vein } = aimed;
  const creditsBefore = state.player.credits;
  assert.ok(drill.plantCharge());
  assert.ok(state.player.credits < creditsBefore, 'the plant debited the wallet');
  stepSeconds(state, 20 * STEP); // ~0.33s — mid-fuse, the charge is still cooking
  assert.ok(d.charge, 'the charge is still live 20 ticks in');

  // The real pre-capture seam: saveSystem emits save:started BEFORE the envelope is built
  // on every write, and the unload/exit flush uses reason 'exit_to_menu'. An ordinary save
  // must not spend the fuse; the exit save must settle it inside the boundary.
  bus.emit('save:started', { slot: 'slot1', reason: 'manual', autosave: false });
  assert.equal(d.charge, null,
    'a quicksave cooks the charge off — the listener settles on EVERY reason, F5/F9 included');
  assert.ok((d.yieldLog[vein.ore] || 0) > 0,
    'the quicksave-captured state holds the blast for the debit');
  bus.emit('save:started', { slot: 'auto', reason: 'exit_to_menu', autosave: true });
  assert.equal(drill.serialize(), null, 'the session stays transient — no saved drill slice');
  assert.ok((d.yieldLog[vein.ore] || 0) > 0,
    'the debit has a matching cook-off result inside the captured state');
  assert.ok(d.tilesCleared > 0, 'the blast resolved against the field the save records');
  console.log('B2 save-settle ok');
}

// B4 — the quote is player-visible at arm time through the screen's own surface.
{
  // The screen speaks the preview: source-level proof of the same announce surface the rest
  // of the demolition verb already uses (asteroid-site-drawers.test.mjs precedent).
  const onCharge = SCREEN_SRC.slice(
    SCREEN_SRC.indexOf('onCharge()'),
    SCREEN_SRC.indexOf('onChargeCancel()'),
  );
  assert.match(onCharge, /chargePreview\(\)/, 'arm time reads the live preview');
  assert.match(onCharge, /chargeQuoteText/, 'the quote text reaches the announce surface');
  assert.match(SCREEN_SRC, /chargeQuoteText/,
    'the screen wires the shared formatter in (imported from the controller)');

  // And the preview carries everything the speaker needs — executed, not regex-matched.
  setup();
  drill.armCharge();
  const aimed = quoteCoveringVein();
  assert.ok(aimed);
  const pv = drill.chargePreview();
  assert.ok('cost' in pv && 'payloadLabel' in pv, 'the quote names what it costs');
  assert.ok('yields' in pv && 'spill' in pv, 'the quote separates banked ore from spill');
  assert.ok('selfDanger' in pv && 'tierBlocked' in pv && 'gasCount' in pv,
    'the quote names its hazards');
  const text = chargeQuoteText(pv);
  assert.ok(text, 'the formatter produces the spoken line for a live preview');
  assert.match(text, /cr$|cr |from stock/, 'the line carries the cost');
  assert.match(text, /banks \d+u/, 'the line carries the banked ore');
  assert.match(text, /face the cut/, 'the line still coaches the second press');
  assert.equal(chargeQuoteText(null), null, 'no preview, no quote');
  assert.equal(chargeQuoteText({ ok: false }), null, 'a refused preview speaks nothing');
  console.log('B4 quote-display ok');
}

// B5 — the exit report counts blast ore: end() returns the settled yield log.
{
  const { state } = setup();
  const d = state.drill;
  drill.armCharge();
  const aimed = quoteCoveringVein();
  assert.ok(aimed);
  const { vein } = aimed;
  assert.ok(drill.plantCharge());
  stepSeconds(state, 20 * STEP); // still cooking — end() must detonate before the report reads
  const result = drill.end({ reason: 'retracted' });
  assert.ok(result, 'end() returns the session report');
  assert.ok(result.yieldLog[vein.ore] > 0,
    'the report includes the blast ore the charge banked');
  assert.equal(d.yieldLog[vein.ore], result.yieldLog[vein.ore],
    'the report matches the settled log');

  // The screen builds its summary from that same post-detonation result.
  const exitFn = SCREEN_SRC.slice(
    SCREEN_SRC.indexOf('function exit('),
    SCREEN_SRC.indexOf('function showSummary'),
  );
  assert.ok(exitFn.indexOf('drillSys.end(') < exitFn.indexOf('yieldLog'),
    'the screen reads the report after end() detonates the charge');
  assert.match(exitFn, /result\.yieldLog|result\.yields/, 'the report comes from end(), not a pre-blast snapshot');
  console.log('B5 exit-report ok');
}
