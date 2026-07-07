// BP-12 packet CUSTOMS_MOMENT acceptance check ("The Customs Scan Moment").
//
// Contract (src/ui/customsPrompt.js):
//   - holdRisk reads contraband via the economy registry slot's illicitCargo() and projects a fine
//     with the SAME FINE_MULT the engine uses (legal:0/restricted:0.8/illegal:1.2/contraband:1.5) —
//     but it NEVER charges; the real fine comes from contraband:scanned.fine or economy.payBribe.
//   - customsDecision returns null for a clean hold (engine says no contraband + nothing illicit) —
//     never surfaces a phantom decision/fine the engine won't charge.
//   - Bribe routes through `contraband:bribe` (the event economy.payBribe listens for); Submit emits
//     no second penalty (only a `customs:submit` seam); Run emits `customs:breakScan` (the additive
//     flight cue seam) — Run only avoids the scan, not an already-resolved bust.
//   - The wired module binds player:scannedByPatrol, debounces on state.simTime, routes ONE comms
//     hail through voice.say (never a raw toast when voice accepts it), and NEVER writes credits.
import assert from 'node:assert/strict';

import {
  customsPrompt, customsDecision, holdRisk, FINE_MULT, BRIBE_FRAC,
} from '../src/ui/customsPrompt.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');

// Run body with Math.random / Date.now poisoned (the panel is a pure read + event emit).
function guarded(fn) {
  const r = Math.random, n = Date.now;
  Math.random = () => { throw new Error('Math.random in customs-prompt path'); };
  Date.now = () => { throw new Error('Date.now in customs-prompt path'); };
  try { return fn(); } finally { Math.random = r; Date.now = n; }
}

testFineMultMirrorsEngine();
testHoldRiskClean();
guarded(testHoldRiskProjectsEngineFine);
guarded(testCustomsDecisionCleanHoldIsNull);
guarded(testCustomsDecisionContraband);
testWiredModuleOneHailAndNoCreditWrite();
testWiredModuleDismissesOnBust();
testActionsRouteThroughShippedEvents();

console.log('Customs-prompt checks OK');

// ── 1. the fine multiplier mirrors the engine (economy.js:48) ─────────────────────────────────
function testFineMultMirrorsEngine() {
  assert.deepStrictEqual(
    { ...FINE_MULT },
    { legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 },
    'FINE_MULT mirrors economy.js:48 so the panel estimate matches the engine',
  );
  assert.equal(BRIBE_FRAC, 0.30, 'BRIBE_FRAC mirrors economy.js:50');
}

// ── 2. clean hold → no risk, no fine ──────────────────────────────────────────────────────────
function testHoldRiskClean() {
  const state = { player: { cargo: { items: { cmdty_fuel_cells: 10 } } } };
  const econ = { illicitCargo() { return []; } };
  const risk = holdRisk(state, econ);
  assert.equal(risk.hasContraband, false);
  assert.equal(risk.estFine, 0);
  assert.equal(risk.estBribe, 0);
  assert.deepEqual(risk.stacks, []);
  // null economySys → still safe (no throw)
  const risk2 = holdRisk(state, null);
  assert.equal(risk2.hasContraband, false);
}

// ── 3. holdRisk projects the engine fine (SAME mult), never charges ───────────────────────────
function testHoldRiskProjectsEngineFine() {
  // 4u narcotics (contraband, basePrice 220, fineMult 1.2/1.5) + 2u weapons (restricted, 280, 0.8/1.2)
  const state = { player: { cargo: { items: { cmdty_narcotics: 4, cmdty_weapons: 2 } } } };
  const econ = {
    illicitCargo() {
      return [
        { commodityId: 'cmdty_narcotics', qty: 4, def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 } },
        { commodityId: 'cmdty_weapons', qty: 2, def: { name: 'Weapon Systems', basePrice: 280, legality: 'restricted', fineMult: 1.2 } },
      ];
    },
  };
  const risk = holdRisk(state, econ);
  assert.equal(risk.hasContraband, true);
  // narcotics: 220*4*1.5 = 1320 (FINE_MULT legality key wins over def.fineMult, like economy.js:866)
  assert.equal(risk.stacks[0].estFine, 1320, 'contraband uses FINE_MULT.legality = 1.5 (engine parity)');
  // weapons: 280*2*0.8 = 448
  assert.equal(risk.stacks[1].estFine, 448, 'restricted uses FINE_MULT.legality = 0.8');
  assert.equal(risk.estFine, 1768);
  assert.equal(risk.estBribe, Math.round(1768 * 0.30), 'bribe estimate = round(fine * BRIBE_FRAC)');
}

// ── 4. customsDecision: clean hold (engine flag + risk both clean) → null ─────────────────────
function testCustomsDecisionCleanHoldIsNull() {
  const state = { player: { cargo: { items: {} } }, world: { currentSectorId: 'sector_x' } };
  const econ = { illicitCargo() { return []; }, scanningFaction() { return 'faction_scn'; } };
  assert.equal(customsDecision(state, { hasContraband: false }, econ), null,
    'clean hold → no panel (never a phantom decision)');
  assert.equal(customsDecision(state, null, econ), null, 'missing payload → null');
}

// ── 5. customsDecision: contraband → full model with the 3 shipped actions ───────────────────
function testCustomsDecisionContraband() {
  const state = { player: { cargo: { items: { cmdty_narcotics: 4 } } }, world: { currentSectorId: 'sector_x' } };
  const econ = {
    illicitCargo() { return [{ commodityId: 'cmdty_narcotics', qty: 4, def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 } }]; },
    scanningFaction() { return 'faction_scn'; },
  };
  const d = customsDecision(state, { hasContraband: true }, econ);
  assert.ok(d, 'contraband flagged → panel model');
  assert.equal(d.factionShort, 'Concord', 'scanningFaction resolved to Concord short name');
  assert.equal(d.hasContraband, true);
  assert.equal(d.bribeCost, Math.round(1320 * 0.30));
  assert.deepEqual(d.actions, ['submit', 'bribe', 'run'], 'the 3 shipped actions');
  // pure / deterministic
  const d2 = customsDecision(state, { hasContraband: true }, econ);
  assert.deepStrictEqual(d, d2);
}

// ── 6. wired module: ONE comms hail via voice.say; NEVER writes credits ───────────────────────
function testWiredModuleOneHailAndNoCreditWrite() {
  const handlers = new Map();
  const emitted = [];
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { emitted.push({ evt, p }); for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const voiceCalls = [];
  const state = {
    simTime: 100,
    player: { cargo: { items: { cmdty_narcotics: 4 } }, credits: 5000 },
    world: { currentSectorId: 'sector_x' },
  };
  const registry = {
    get(name) {
      if (name === 'economy') return {
        illicitCargo() { return [{ commodityId: 'cmdty_narcotics', qty: 4, def: { name: 'Narcotics', basePrice: 220, legality: 'contraband', fineMult: 1.2 } }]; },
        scanningFaction() { return 'faction_scn'; },
      };
      return null;
    },
  };
  const sys = { ...customsPrompt };
  sys.init({ bus, state, registry, helpers: { voice: { say(m) { voiceCalls.push(m); return true; } } } });

  // Fire the scan ping twice inside the debounce window — ONE hail.
  bus.emit('player:scannedByPatrol', { hasContraband: true });
  bus.emit('player:scannedByPatrol', { hasContraband: true });
  assert.equal(voiceCalls.length, 1, 'debounced on simTime → exactly one customs hail');
  assert.equal(voiceCalls[0].channel, 'comms', 'routes through the comms channel (one-voice)');
  assert.ok(/scan/i.test(voiceCalls[0].text), 'the hail names the scan');
  assert.ok(state.ui && state.ui.customsPrompt, 'additive UI state written');

  // No credit-writing event was emitted by the panel itself (only UI state). economy owns credits.
  const creditWrites = emitted.filter((e) => e.evt === 'economy:chargeCredits' || e.evt === 'economy:grantCredits');
  assert.equal(creditWrites.length, 0, 'the panel NEVER writes credits — economy owns that');
  sys.destroy();
}

// ── 7. bust (contraband:scanned) or sector:exit dismisses the panel ───────────────────────────
function testWiredModuleDismissesOnBust() {
  const handlers = new Map();
  const bus = {
    on(evt, fn) { if (!handlers.has(evt)) handlers.set(evt, []); handlers.get(evt).push(fn); },
    off(evt, fn) { const l = handlers.get(evt) || []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, p) { for (const fn of (handlers.get(evt) || []).slice()) fn(p); },
  };
  const state = { simTime: 100, player: { cargo: { items: { cmdty_narcotics: 4 } } }, world: {} };
  const registry = { get() { return { illicitCargo() { return [{ commodityId: 'cmdty_narcotics', qty: 4, def: { name: 'Narcotics', basePrice: 220, legality: 'contraband' } }]; }, scanningFaction() { return 'faction_scn'; } }; } };
  const sys = { ...customsPrompt };
  sys.init({ bus, state, registry, helpers: { voice: { say() { return true; } } } });
  bus.emit('player:scannedByPatrol', { hasContraband: true });
  assert.ok(state.ui.customsPrompt, 'panel surfaced');
  // engine resolves the bust — panel must clear so a Run can't dodge an already-resolved consequence
  bus.emit('contraband:scanned', { found: true, fine: 1320, confiscated: [], bribeCost: 396 });
  assert.ok(!state.ui.customsPrompt, 'bust dismisses the panel (Run can no longer dodge it)');
  sys.destroy();
}

// ── 8. the 3 actions route through shipped events — never a second penalty path ───────────────
function testActionsRouteThroughShippedEvents() {
  const emitted = [];
  const bus = { on() {}, off() {}, emit(evt, p) { emitted.push({ evt, p }); } };
  const state = { simTime: 100, ui: { customsPrompt: { factionId: 'faction_scn', risk: { estFine: 1000 } } }, player: {}, world: {} };
  const sys = { ...customsPrompt };
  sys.init({ bus, state, registry: { get() { return { illicitCargo() { return []; }, scanningFaction() { return 'faction_scn'; } }; } }, helpers: { voice: { say() { return true; } } } });

  sys.choose('bribe');
  const bribe = emitted.find((e) => e.evt === 'contraband:bribe');
  assert.ok(bribe, 'Bribe emits contraband:bribe (the event economy.payBribe listens for)');
  assert.equal(bribe.p.fine, 1000, 'passes the engine-estimate fine; economy charges round(fine*0.3)');
  assert.ok(!emitted.find((e) => e.evt === 'economy:chargeCredits'), 'bribe does NOT charge credits directly');

  emitted.length = 0;
  state.ui.customsPrompt = { factionId: 'faction_scn', risk: { estFine: 1000 } };
  sys.choose('submit');
  assert.ok(emitted.find((e) => e.evt === 'customs:submit'), 'Submit emits only the customs:submit seam');
  assert.ok(!emitted.find((e) => e.evt === 'contraband:bribe' || e.evt === 'economy:chargeCredits'),
    'Submit adds no second penalty — the shipped encounter/patrol:proximity resolves');

  emitted.length = 0;
  state.ui.customsPrompt = { factionId: 'faction_scn', risk: { estFine: 1000 } };
  sys.choose('run');
  assert.ok(emitted.find((e) => e.evt === 'customs:breakScan'), 'Run emits customs:breakScan (additive flight seam)');
  assert.ok(!emitted.find((e) => e.evt === 'contraband:scanned'), 'Run does not itself manufacture a bust');

  sys.destroy();
}
