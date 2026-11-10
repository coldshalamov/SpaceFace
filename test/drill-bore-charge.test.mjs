// Bore charges — the demolition verb, proved on the real drill clock.
//
// A charge is a paid, planted, FUSED cut. The assertions that make it honest:
//
//   1. the preview IS the contract: every cell in the 3×3 carries its verdict before the credit
//      moves — what breaks, what cooks off, what survives (tier / machine housing), and exactly
//      what each vein banks at the crude fraction;
//   2. money moves through the economy:chargeCredits seam, never a direct wallet write;
//   3. the fuse is real drill-clock time: the charge cooks off inside tickInput, and the cut it
//      takes is resolved against the field as it stands AT detonation;
//   4. the rig's own square is inside every legal cut — stand in it when the fuse ends and the
//      blast takes hull; step out and it does not;
//   5. gas in the pattern is a gas breach with the same damage packet as a bored pocket;
//   6. a paid charge is never lost: end() cooks it off rather than voiding the spend.
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  drill,
  DRILL_CONST,
  CHARGE_FUSE_S,
  CHARGE_REARM_S,
  CHARGE_COST_CR,
  CHARGE_YIELD_FRACTION,
  CHARGE_BACKBLAST_PCT,
  CHARGE_BLAST_RADIUS,
} from '../src/systems/drill.js';
import { cargo } from '../src/systems/cargo.js';
import { createAsteroidController, MODES } from '../src/ui/asteroid/asteroidController.js';

const STEP = 1 / 60;
const ORE = 'cmdty_ore_iron';

function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      for (const fn of set) fn(payload);
    },
  };
}

function setup(seed = 770001, { credits = 2000 } = {}) {
  const state = createGameState(seed);
  const bus = createBus();
  const damageCalls = [];
  const ctx = {
    state,
    bus,
    helpers: { routeCombatDamage(req) { damageCalls.push(req); return { ok: true }; } },
    registry: { get() { return null; } },
  };
  cargo.init(ctx);
  drill.init(ctx);
  state.player.cargo = { items: {}, usedVolume: 0, capVolume: 100, capMass: 100 };
  state.player.credits = credits;
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, { id: state.playerId, hull: 100, hullMax: 100, data: {} });
  }
  // The rock itself, with the data bag cleared-cell memory persists into.
  if (!state.entities.has(seed)) {
    state.entities.set(seed, { id: seed, data: {} });
  }
  assert.ok(drill.begin(seed), 'drill session begins');
  // The economy owner answers the charge seam exactly the way the live wallet does.
  const charges = [];
  bus.on('economy:chargeCredits', (p) => {
    charges.push(p);
    state.player.credits = Math.max(0, (Number(state.player.credits) || 0) - (Number(p.amount) || 0));
  });
  return { state, bus, ctx, damageCalls, charges };
}

const rock = (hp = 10) => ({ type: 'rock', hp, maxHp: hp, ore: null, hazard: false, tierReq: 1, hardness: 1, risk: 'low' });
const dirt = () => ({ type: 'dirt', hp: 4, maxHp: 4, ore: null, hazard: false, tierReq: 1, hardness: 0.75, risk: 'low' });
const vein = (yieldU = 6, tierReq = 1, ore = ORE) => ({ type: 'vein', hp: 12, maxHp: 12, ore, yieldU, hazard: false, tierReq, hardness: 1.1, risk: 'low' });
const gas = () => ({ type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5, risk: 'critical' });
const hollow = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const housing = () => ({ ...hollow(), structure: 'sm_extractor' });

/** Park the rig on a hollow cell with a clean clock, facing `dir`. */
function park(state, col, row, dir = 'down') {
  const d = state.drill;
  d.field[col][row] = hollow();
  d.avatar.col = col;
  d.avatar.row = row;
  d.avatar.fromCol = col;
  d.avatar.fromRow = row;
  d.avatar.moveDuration = 0;
  d.avatar.moveElapsed = 0;
  d.avatar.faceDir = dir;
  d.moveCooldown = 0;
  return d.avatar;
}

/** Fill every cell inside the cut around (col,row) with `tile` — the whole pattern, quoted. */
function fillPattern(state, col, row, tile) {
  const d = state.drill;
  for (let dc = -CHARGE_BLAST_RADIUS; dc <= CHARGE_BLAST_RADIUS; dc++) {
    for (let dr = -CHARGE_BLAST_RADIUS; dr <= CHARGE_BLAST_RADIUS; dr++) {
      d.field[col + dc][row + dr] = { ...tile };
    }
  }
}

function step(state, n) {
  for (let i = 0; i < n; i++) drill.tickInput({ left: false, right: false, up: false, down: false }, STEP);
}

function stepSeconds(state, s) {
  step(state, Math.ceil(s / STEP));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The authored constants are the contract — and DRILL_CONST publishes them.
// ─────────────────────────────────────────────────────────────────────────────
{
  assert.ok(CHARGE_FUSE_S > 0.8 && CHARGE_FUSE_S <= 2.5,
    `the fuse must buy real retreat time without becoming a waiting game, got ${CHARGE_FUSE_S}`);
  assert.ok(CHARGE_REARM_S > 0, 'a blast has to cost re-arm time');
  assert.ok(CHARGE_COST_CR > 0, 'a charge is a spend, not a free verb');
  assert.ok(CHARGE_YIELD_FRACTION > 0 && CHARGE_YIELD_FRACTION < 1,
    'the blast must pay LESS than the bore — that is its price');
  assert.ok(CHARGE_BACKBLAST_PCT > 0 && CHARGE_BACKBLAST_PCT < 20,
    'backblast must sting without being a capital crime');
  assert.equal(CHARGE_BLAST_RADIUS, 1, 'the authored cut is a 3×3');
  assert.equal(DRILL_CONST.CHARGE_FUSE_S, CHARGE_FUSE_S, 'DRILL_CONST publishes the fuse');
  assert.equal(DRILL_CONST.CHARGE_COST_CR, CHARGE_COST_CR, 'DRILL_CONST publishes the price');
  console.log(JSON.stringify({ ok: true, section: 'charge-constants' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Arm, quote, set, cook. The preview names every cell before the credit moves;
//    the fuse is drill-clock time; the whole pattern carves at detonation.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus, charges } = setup();
  const d = state.drill;
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());          // faced cell + the whole cut around it
  state.player.credits = 2000;

  const events = { planted: 0, blasts: [], breaks: [], warns: [] };
  bus.on('drill:chargePlanted', () => events.planted++);
  bus.on('drill:chargeBlast', (p) => events.blasts.push(p));
  bus.on('drill:break', (p) => events.breaks.push(p));
  bus.on('drill:warn', (p) => events.warns.push(p));

  assert.ok(drill.armCharge(), 'the verb arms');
  assert.equal(d.chargeArmed, true);

  const pv = drill.chargePreview();
  assert.ok(pv.ok, `a wall in reach should quote clean, got ${pv.reason}`);
  assert.equal(pv.anchor.col, 14);
  assert.equal(pv.anchor.row, 6, 'the auger faces down — the cut centers on the faced cell');
  assert.equal(pv.cells.length, 9, 'a 3×3 quote');
  assert.equal(pv.cells.filter((c) => c.verdict === 'break').length, 9);
  assert.equal(pv.breakCount, 9);
  assert.equal(pv.selfDanger, true, 'the rig is inside every legal cut — the fuse is the answer');
  assert.equal(pv.cost, CHARGE_COST_CR);

  assert.ok(drill.plantCharge(), 'the commit seats the charge');
  assert.equal(charges.length, 1, 'exactly one economy call');
  assert.equal(charges[0].amount, CHARGE_COST_CR);
  assert.equal(charges[0].reason, 'ordnance:bore_charge', 'the spend is named ordnance');
  assert.equal(state.player.credits, 2000 - CHARGE_COST_CR, 'the wallet moved through the seam');
  assert.ok(d.charge, 'a live fuse sits on the board');
  assert.equal(d.charge.col, 14);
  assert.equal(d.charge.row, 6);
  assert.equal(d.chargeArmed, false, 'planting retires the aim');
  assert.equal(events.planted, 1, 'the board heard the seat');

  // A second commit while one cooks is a refusal, not a charge.
  assert.equal(drill.plantCharge(), false, 'one charge in the rock at a time');
  assert.ok(events.warns.some((w) => w.reason === 'charge' && w.chargeReason === 'armed'));

  // The fuse is honest: nothing carves until it ends, and it ends on the drill clock.
  const fuseSteps = Math.ceil(CHARGE_FUSE_S / STEP);
  step(state, fuseSteps - 2);
  assert.ok(d.charge, 'the fuse is still burning a beat early');
  assert.equal(events.blasts.length, 0, 'no blast before the fuse ends');
  step(state, 4);
  assert.equal(events.blasts.length, 1, 'exactly one blast event');
  assert.equal(events.blasts[0].broken, 9, 'the whole quoted cut went');
  assert.equal(events.breaks.length, 9, 'every broken cell raised its own break event');
  for (let dc = -1; dc <= 1; dc++) {
    for (let dr = -1; dr <= 1; dr++) {
      assert.equal(d.field[14 + dc][6 + dr].type, 'empty', `cell ${14 + dc},${6 + dr} carved`);
    }
  }
  assert.ok(d.chargeCooldown > 0 && d.chargeCooldown <= CHARGE_REARM_S + 1e-9,
    `re-arm dead time set, got ${d.chargeCooldown}`);
  assert.equal(charges.length, 1, 'no second spend');

  // The holes persist on the rock — a cut is permanent.
  const ent = state.entities.get(d.asteroidId);
  assert.ok(ent && Array.isArray(ent.data.drillCleared), 'cleared cells persist on the asteroid');
  for (const c of events.breaks) {
    const idx = c.row * DRILL_CONST.COLS + c.col;
    assert.ok(ent.data.drillCleared.includes(idx), `cleared cell ${c.col},${c.row} remembered`);
  }

  // Re-arm gate: during the dead time the verb refuses with its own reason.
  assert.equal(drill.plantCharge(), false);
  assert.ok(events.warns.at(-1).chargeReason === 'cooldown', 'cooldown refusal is named');
  stepSeconds(state, CHARGE_REARM_S + 0.2);
  assert.equal(d.chargeCooldown, 0, 'the dead time decays on the drill clock');
  console.log(JSON.stringify({ ok: true, section: 'plant-fuse-blast', breaks: events.breaks.length }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Backblast: the rig's square is inside the quoted cut. Stand in it, and it
//    takes hull; leave it, and the blast is free work.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus, damageCalls } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  const blasts = [];
  const backblasts = [];
  bus.on('drill:chargeBlast', (p) => blasts.push(p));
  bus.on('drill:backblast', (p) => backblasts.push(p));

  // Standing inside the cut when it fires.
  drill.armCharge();
  assert.ok(drill.plantCharge());
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  assert.equal(backblasts.length, 1, 'a rig that stayed gets hit');
  assert.equal(backblasts[0].dmg, Math.ceil(100 * (CHARGE_BACKBLAST_PCT / 100)),
    'backblast is the authored hull fraction');
  assert.ok(damageCalls.some((c) => c.origin && c.origin.kind === 'deep_core_blast'),
    'the blast routes its own damage packet');
  assert.equal(blasts[0].backblast, backblasts[0].dmg, 'the blast receipt names the hit');

  // Retreating two cells before the fuse ends: no packet, no event.
  damageCalls.length = 0;
  backblasts.length = 0;
  blasts.length = 0;
  const d = state.drill;
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  state.drill.chargeCooldown = 0;
  drill.armCharge();
  assert.ok(drill.plantCharge());
  d.avatar.row = 3; d.avatar.fromRow = 3;      // the rig stepped out of the cut
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  assert.equal(backblasts.length, 0, 'a rig that left is untouched');
  assert.equal(blasts.length, 1, 'the blast still went');
  assert.equal(blasts[0].backblast, 0, 'the receipt is clean');
  assert.ok(!damageCalls.some((c) => c.origin && c.origin.kind === 'deep_core_blast'),
    'no backblast packet was routed');
  console.log(JSON.stringify({ ok: true, section: 'backblast' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Gas in the pattern is a real breach — same damage packet as a bored pocket,
//    plus the blast's own receipt. Two pockets are two breaches.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus, damageCalls } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  state.drill.field[15][7] = gas();
  state.drill.field[13][5] = gas();
  const gasHits = [];
  bus.on('drill:gasHit', (p) => gasHits.push(p));
  const blasts = [];
  bus.on('drill:chargeBlast', (p) => blasts.push(p));

  drill.armCharge();
  const pv = drill.chargePreview();
  assert.equal(pv.cells.filter((c) => c.verdict === 'gas').length, 2, 'the quote names both pockets');
  assert.equal(pv.gasCount, 2);
  assert.ok(drill.plantCharge());
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  assert.equal(gasHits.length, 2, 'two pockets, two breach events');
  assert.equal(state.drill.gasHits, 2, 'the session counts them');
  const gasPackets = damageCalls.filter((c) => c.origin && c.origin.kind === 'deep_core_gas');
  assert.equal(gasPackets.length, 2, 'each pocket routes its own hull packet');
  assert.equal(blasts[0].gasCount, 2, 'the receipt counts the vented pockets');
  console.log(JSON.stringify({ ok: true, section: 'blast-gas', dmg: gasHits.map((g) => g.dmg) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Crude extraction: a blasted vein banks the quoted fraction — never the bore's
//    full cut — and the rubble keeps the rest, debited off the rock all the same.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  state.drill.field[14][6] = vein(6);          // the faced cell itself is a 6u vein
  state.drill.field[13][7] = vein(1);          // a 1u crumb: crude extraction still pays it one
  const yields = [];
  bus.on('drill:yield', (p) => yields.push(p));

  drill.armCharge();
  const pv = drill.chargePreview();
  const quoted = Math.max(1, Math.floor(6 * CHARGE_YIELD_FRACTION));
  assert.equal(pv.yields[ORE], quoted + 1, `the quote is the take: ${pv.yields[ORE]}`);
  assert.ok(drill.plantCharge());
  const budgetBefore = state.drill.rockBudget;
  stepSeconds(state, CHARGE_FUSE_S + 0.1);

  const banked = yields.filter((y) => y.commodityId === ORE).reduce((s, y) => s + y.qty, 0);
  assert.equal(banked, quoted + 1, `the hold took the quoted crude cut, got ${banked}`);
  assert.ok(yields.every((y) => y.via === 'blast'), 'the take is attributed to the blast');
  assert.equal(state.drill.field[14][6].type, 'empty', 'the vein is gone either way');
  // The rock debits the WHOLE cut it gave up (7u), not only what the hold took (4u) — the waste
  // is the price of speed, and it is deterministic, not a rounding accident.
  if (Number.isFinite(budgetBefore)) {
    assert.ok(budgetBefore - state.drill.rockBudget >= 7,
      `the budget spent the whole take, ${budgetBefore} -> ${state.drill.rockBudget}`);
  }
  assert.equal(state.drill.yieldLog[ORE], quoted + 1, 'the receipt logs the banked units');
  console.log(JSON.stringify({ ok: true, section: 'crude-yield', banked, quoted: quoted + 1 }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. What refuses, refuses honestly: no credit moves, the warn carries a reason,
//    and the sim is untouched.
// ─────────────────────────────────────────────────────────────────────────────
{
  // Broke wallet.
  const { state, bus, charges } = setup(770002, { credits: 50 });
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  const warns = [];
  bus.on('drill:warn', (p) => warns.push(p));
  drill.armCharge();
  const pv = drill.chargePreview();
  assert.equal(pv.ok, false);
  assert.equal(pv.reason, 'credits', 'a short wallet is a named refusal');
  assert.equal(drill.plantCharge(), false);
  assert.equal(charges.length, 0, 'no economy call on a refused plant');
  assert.equal(state.player.credits, 50, 'the wallet did not move');
  assert.ok(warns.some((w) => w.reason === 'charge' && w.chargeReason === 'credits'));

  // Open ground — nothing to break.
  const s2 = setup(770003).state;
  park(s2, 14, 5, 'down');
  fillPattern(s2, 14, 6, hollow());
  const pv2 = drill.chargePreview();
  assert.equal(pv2.ok, false);
  assert.equal(pv2.reason, 'empty', 'a hollow cut is a named refusal');
  assert.equal(drill.plantCharge(), false);

  // Machine housing in the cut: the charge seats (housing is blast-proof), and the
  // quote says so before the fuse starts.
  const s3 = setup(770004).state;
  park(s3, 14, 5, 'down');
  fillPattern(s3, 14, 6, rock());
  s3.drill.field[15][7] = housing();
  const pv3 = drill.chargePreview();
  assert.ok(pv3.ok, 'housing does not block the seat — it survives, quoted');
  assert.equal(pv3.structureSurvives, 1);
  assert.equal(pv3.cells.find((c) => c.col === 15 && c.row === 7).verdict, 'structure');
  assert.ok(drill.plantCharge());
  stepSeconds(s3, CHARGE_FUSE_S + 0.1);
  assert.equal(s3.drill.field[15][7].structure, 'sm_extractor', 'the machine survives the cut');
  assert.equal(s3.drill.field[14][7].type, 'empty', 'its neighbor did not');
  console.log(JSON.stringify({ ok: true, section: 'refusals' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Tier law holds under explosives: a vein above the drill head survives the
//    blast exactly like it survives the bit, and the quote says so first.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  state.drill.field[15][7] = vein(10, 9);      // tier 9 — the tier-1 head cannot touch it
  drill.armCharge();
  const pv = drill.chargePreview();
  const cell = pv.cells.find((c) => c.col === 15 && c.row === 7);
  assert.equal(cell.verdict, 'tier', 'the quote marks it out of reach');
  assert.equal(pv.tierBlocked, 1);
  assert.equal(pv.breakCount, 8, 'the other eight still break');
  assert.ok(drill.plantCharge());
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  assert.equal(state.drill.field[15][7].type, 'vein', 'the tiered vein survives the blast');
  assert.equal(state.drill.field[15][7].yieldU, 10, 'untouched, down to the unit');
  assert.equal(state.drill.field[14][7].type, 'empty', 'the rock beside it went');
  console.log(JSON.stringify({ ok: true, section: 'tier-law' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. A paid charge is never lost: retracting with a live fuse cooks it off inside
//    end(), and the receipt counts the shot.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  const blasts = [];
  bus.on('drill:chargeBlast', (p) => blasts.push(p));
  drill.armCharge();
  assert.ok(drill.plantCharge());
  const result = drill.end({ reason: 'retracted' });
  assert.equal(blasts.length, 1, 'the charge cooked off as the rig retracted');
  assert.equal(result.chargesSet, 1, 'the receipt counts the spend');
  assert.equal(state.drill, null, 'the session still closed');
  console.log(JSON.stringify({ ok: true, section: 'retract-cookoff' }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. The keyboard grammar: C arms, C again (or Enter) commits, Esc puts it away
//    one layer at a time, and BUILD can never fight the aim.
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, rock());
  const controlMap = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], scan: ['KeyF'] };
  const calls = [];
  const controller = createAsteroidController({
    drillSys: drill,
    getDrillState: () => state.drill,
    controlMap,
    hooks: {
      onCharge() { calls.push('charge'); },
      onChargeCancel() { calls.push('cancel'); },
    },
  });
  const key = (code, repeat = false) => ({ code, repeat, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(controller.state.mode, MODES.DRIVE);

  // R claims the key in DRIVE; the same key is the commit while armed.
  assert.ok(controller.onKeyDown(key('KeyR')), 'R is a claimed key');
  assert.deepEqual(calls, ['charge']);
  state.drill.chargeArmed = true;            // as if armCharge() had run
  controller.onKeyDown(key('KeyR', true));   // a held R repeats nothing
  assert.deepEqual(calls, ['charge'], 'auto-repeat fires nothing');
  assert.ok(controller.onKeyDown(key('Enter')), 'Enter commits while armed');
  assert.deepEqual(calls, ['charge', 'charge']);
  assert.ok(controller.onKeyDown(key('Space')), 'Space commits while armed');
  state.drill.chargeArmed = false;
  assert.equal(controller.onKeyDown(key('Enter')), false, 'Enter alone is unclaimed in DRIVE');

  // Escape puts the aim away BEFORE it would leave the screen.
  state.drill.chargeArmed = true;
  assert.ok(controller.onKeyDown(key('Escape')), 'Esc while armed is consumed one layer deep');
  assert.deepEqual(calls.at(-1), 'cancel');
  state.drill.chargeArmed = false;
  assert.equal(controller.onKeyDown(key('Escape')), false, 'disarmed Esc falls through to exit');

  // Entering BUILD parks the aim (the sim API is invoked by the mode change itself).
  state.drill.chargeArmed = true;
  controller.onKeyDown(key('KeyB'));
  assert.equal(state.drill.chargeArmed, false, 'BUILD disarms the demolition verb');
  controller.onKeyDown(key('KeyB'));
  assert.equal(controller.state.mode, MODES.DRIVE);
  console.log(JSON.stringify({ ok: true, section: 'verb-grammar', calls }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. The quote never lies twice: veins are priced against the budget as the
//    detonation will actually find it — drained cell by cell — and a refused
//    plant names the real blocker, not "already hollow".
// ─────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup();
  park(state, 14, 5, 'down');
  fillPattern(state, 14, 6, vein(10));          // nine 10u veins in the cut
  const d = state.drill;
  d.rockBudget = 4;                             // the rock can only give up 4 units this visit
  d.rockBudgetMax = 4;
  const yields = [];
  bus.on('drill:yield', (p) => yields.push(p));

  drill.armCharge();
  const pv = drill.chargePreview();
  const firstTake = Math.max(1, Math.floor(4 * CHARGE_YIELD_FRACTION));
  assert.equal(pv.yields[ORE], firstTake,
    `the quote drains the budget like the detonation, not nine full-price veins (${pv.yields[ORE]})`);
  assert.ok(drill.plantCharge());
  stepSeconds(state, CHARGE_FUSE_S + 0.1);
  const banked = yields.reduce((s, y) => s + y.qty, 0);
  assert.equal(banked, pv.yields[ORE], 'the blast banks exactly what the board quoted');

  // Refusals name the real blocker.
  const s2h = setup(770010);
  const warns2 = [];
  s2h.bus.on('drill:warn', (p) => warns2.push(p));
  const s2 = s2h.state;
  park(s2, 14, 5, 'down');
  fillPattern(s2, 14, 6, rock());
  s2.drill.chargePayload = 'vent';
  const pvVent = drill.chargePreview();
  assert.equal(pvVent.ok, false);
  assert.equal(pvVent.reason, 'nogas', 'a venting charge on solid rock has nothing to open');
  assert.equal(drill.plantCharge(), false);
  assert.ok(warns2.at(-1).text.includes('gas pocket'), 'the refusal names the missing pocket');

  const s3h = setup(770011);
  const warns3 = [];
  s3h.bus.on('drill:warn', (p) => warns3.push(p));
  const s3 = s3h.state;
  park(s3, 14, 5, 'down');
  fillPattern(s3, 14, 6, vein(10, 9));          // every cell above the drill head
  s3.drill.chargePayload = 'blast';
  const pvTier = drill.chargePreview();
  assert.equal(pvTier.ok, false);
  assert.equal(pvTier.reason, 'tier', 'an all-blocked cut refuses as too hard, not as hollow');
  assert.equal(pvTier.tierBlocked, 9);
  assert.equal(drill.plantCharge(), false);
  assert.ok(warns3.at(-1).text.includes('drill head'), 'the refusal names the head that fails');
  console.log(JSON.stringify({ ok: true, section: 'quote-and-refusals' }));
}

console.log('drill-bore-charge: all assertions passed');
