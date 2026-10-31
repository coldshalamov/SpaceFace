import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  applyDomainPathUpdate,
  configureDomainMirroring,
  createDomainDiffer,
  createDomainMirroringProfile,
} from '../scripts/lib/simReadModel.mjs';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { createLaneSystemFacade } from '../src/runtime/laneSystemFacades.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  CIRCUIT_DESTINATIONS,
  circuitFor,
  circuitRoundFor,
  createCircuitState,
} from '../src/systems/survivalCircuit.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { difficultyForWave } from '../src/data/survivalActs.js';
import { summarizeRunBuild } from '../src/data/runModifiers.js';
import { normalizeMutators } from '../src/systems/survivalMutators.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { swarmRoundPreview } from '../src/data/swarmLadder.js';
import {
  crucibleDraftScreen,
  crucibleRefitScreen,
  circuitPanelLines,
  swarmForecastForRun,
  swarmNextLine,
} from '../src/ui/screens/crucibleDraft.js';

function runAtShop() {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
  run.phase = 'draft';
  run.wave = 1;
  run.arenaId = 'helios_core';
  run.credits = 350;
  run.arenaMutators = [];
  run.modifiers = [];
  run.telemetry = { ...(run.telemetry || {}), swarmStake: 'contender', threats: [] };
  return run;
}

// Kept parallel to survivalRun's ordinary-Swarm planner call; this pins the inputs the shop
// must share, not an alternate source of quota or pressure values.
function canonicalPlan(run, wave) {
  return planWave({
    seed: run.seed,
    arenaId: run.arenaId,
    wave,
    act: 0,
    difficulty: difficultyForWave(wave),
    mutators: normalizeMutators(run.arenaMutators),
    buildSummary: summarizeRunBuild(run.modifiers),
    mode: 'swarm',
    ruleset: run.ruleset,
    swarmStake: typeof run.telemetry?.swarmStake === 'string' ? run.telemetry.swarmStake : null,
    swarmThreats: Array.isArray(run.telemetry?.threats) ? run.telemetry.threats : null,
    circuitRound: null,
  });
}
const enemyName = new Map(ENEMY_TYPES.map((enemy) => [enemy.id, enemy.name]));

function fakeButton(label, key) {
  const button = {
    dataset: { label, key }, childNodes: [{}], disabled: false, hidden: false,
    classList: { toggle() {} }, style: {},
    setAttribute() {},
    querySelector: () => null,
    appendChild(node) { this.childNodes.push(node); },
  };
  Object.defineProperty(button, 'textContent', {
    get() { return this._textContent || ''; },
    set(value) { this._textContent = value; if (value === '') this.childNodes = []; },
  });
  return button;
}

function eventBus() {
  const bus = createBus();
  bus.listenerCount = (name) => bus._listeners.get(name)?.size || 0;
  return bus;
}

function flushUiMicrotasks() {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function armoryFor(run, preview) {
  const bus = eventBus();
  const state = {
    run,
    rng: { calls: 0, next() { this.calls += 1; return 0.5; } },
    // Mirrors the exact read model exposed by laneSystemFacades.survivalDraft. Worker replies
    // publish this snapshot before their result events are replayed on the main bus.
    survivalDraftPublic: { offers: [], wave: run.wave, notice: null, reroll: { open: false }, recommended: [] },
  };
  const offers = {
    currentOffers: () => state.survivalDraftPublic?.offers || [],
    currentWave: () => state.survivalDraftPublic?.wave ?? run.wave,
    lastNotice: () => state.survivalDraftPublic?.notice ?? null,
    rerollState: () => state.survivalDraftPublic?.reroll || { open: false },
    recommendedOffers: () => state.survivalDraftPublic?.recommended || [],
  };
  const ctx = { state, registry: { get: () => offers }, bus };
  const root = { classList: { toggle() {} }, contains: () => false };
  const screen = Object.assign(Object.create(crucibleDraftScreen), {
    _ctx: ctx,
    _root: root,
    _cards: { innerHTML: '', querySelectorAll: () => [], querySelector: () => null },
    _title: { textContent: '' },
    _filters: { hidden: false, children: [] },
    _refitBtn: { hidden: false },
    _sub: { textContent: '' },
    _preview: preview,
    _skip: fakeButton(`Launch round ${run.wave + 1}`, 'Esc'),
    _rerollBtn: Object.assign(fakeButton('Re-roll', 'R'), { style: {} }),
    _wallet: { textContent: '' },
    _hint: { textContent: '' },
    _note: { textContent: '' },
    _category: 'All',
    _query: '',
    _clipRailToWholeRows() {},
  });
  return {
    screen, ctx, bus, offers,
    publish({ credits, notice, ...readModel } = {}) {
      if (credits !== undefined) run.credits = credits;
      state.survivalDraftPublic = { ...state.survivalDraftPublic, ...readModel,
        ...(notice === undefined ? {} : { notice }) };
    },
  };
}

function refitFor(run, preview) {
  const bus = eventBus();
  const state = {
    run,
    rng: { calls: 0, next() { this.calls += 1; return 0.5; } },
    survivalDraftPublic: { offers: [], wave: run.wave, notice: null, reroll: { open: false }, recommended: [], refitRows: [] },
  };
  const offers = {
    lastNotice: () => state.survivalDraftPublic?.notice ?? null,
    refitRows: () => state.survivalDraftPublic?.refitRows || [],
  };
  const ctx = { state, registry: { get: () => offers }, bus };
  const screen = Object.assign(Object.create(crucibleRefitScreen), {
    _ctx: ctx,
    _rows: { innerHTML: '', children: [] },
    _preview: preview,
    _root: null,
    _jig: null,
    _spareChoice: new Map(),
    _bank: fakeButton('Bank half, keep flying', 'B'),
    _bankNote: { textContent: '' },
    _dressHull() {},
    _note: { textContent: '' },
  });
  return {
    screen, ctx, bus,
    publish({ credits, notice, ...readModel } = {}) {
      if (credits !== undefined) run.credits = credits;
      state.survivalDraftPublic = { ...state.survivalDraftPublic, ...readModel,
        ...(notice === undefined ? {} : { notice }) };
    },
  };
}

function runPlanThroughOwner(sourceRun, wave) {
  const run = structuredClone(sourceRun);
  run.wave = wave - 1;
  run.phase = 'wave_intro';
  const events = [];
  const listeners = new Map();
  const bus = {
    on(name, listener) {
      const rows = listeners.get(name) || [];
      rows.push(listener);
      listeners.set(name, rows);
      return () => rows.splice(rows.indexOf(listener), 1);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const listener of [...(listeners.get(name) || [])]) listener(payload);
    },
  };
  const state = createGameState(run.seed);
  state.run = run;
  const owner = Object.assign({}, survivalRun);
  owner.init({ state, bus });
  owner._planCurrentWaveIntro(run);
  owner.destroy();
  return events.find((event) => event.name === 'run:wavePlanned')?.payload?.plan || null;
}

function circuitWidgets() {
  return {
    el: { hidden: true },
    status: { textContent: '' },
    route: { textContent: '' },
    next: { textContent: '', hidden: true },
  };
}

function previewNode() { return { textContent: '', hidden: true }; }

test('shop forecast follows canonical stake, Threat, modifier and mutator plan inputs', () => {
  const run = runAtShop();
  const expectedAt = (wave) => {
    const plan = canonicalPlan(run, wave);
    const authored = swarmRoundPreview({ arenaId: run.arenaId, wave, seed: run.seed });
    const forecast = swarmForecastForRun(run, wave);
    assert.ok(plan && plan.swarm);
    assert.equal(forecast.killTarget, plan.swarm.killTarget);
    assert.equal(forecast.concurrent, plan.swarm.concurrent);
    assert.deepEqual(forecast.roster, [...new Set(plan.swarm.roster
      .filter((entry) => entry.weight > 0)
      .map((entry) => enemyName.get(entry.enemyId))
      .filter(Boolean))]);
    assert.equal(forecast.newcomer, plan.swarm.newcomer?.name || null);
    assert.deepEqual(forecast.boss, plan.swarm.boss && plan.swarm.bossLabel
      ? { label: plan.swarm.bossLabel } : null);
    assert.equal(forecast.zone.name, authored.zone.name);
    assert.equal(forecast.event?.name || null, authored.event?.name || null);
    return forecast;
  };

  const base = expectedAt(2);
  assert.equal(base.killTarget, 24);
  assert.equal(base.concurrent, 11);
  let line = swarmNextLine(base);
  assert.match(line, /room cap 11/);
  assert.doesNotMatch(line, /11 in the room|admissions/i);

  run.telemetry.swarmStake = 'exhibition';
  assert.equal(expectedAt(2).killTarget, 16);
  run.telemetry.swarmStake = 'veteran';
  assert.equal(expectedAt(2).killTarget, 28);
  run.telemetry.swarmStake = 'ironbound';
  assert.equal(expectedAt(2).killTarget, 31);

  run.telemetry.swarmStake = 'contender';
  run.telemetry.threats = ['thick_pack'];
  const threatened = expectedAt(2);
  assert.equal(threatened.killTarget, 32);
  assert.equal(threatened.concurrent, 15);

  run.modifiers = [{ kind: 'weapon', offerId: 'throw', verb: 'Throw', defId: 'wpn_concussion_cannon_m', wave: 1 }];
  run.arenaMutators = ['heavies_only'];
  const changedBuild = expectedAt(2);
  assert.deepEqual(changedBuild.roster, ['Bruiser Brawler', 'Corsair Raider', 'Anchor Controller']);

  run.arenaMutators = [];
  run.modifiers = [];
  const boss = expectedAt(20);
  assert.equal(boss.boss?.label, 'Mirrorjaw Foreman');
  assert.match(swarmNextLine(boss), /boss: Mirrorjaw Foreman/);
  const newcomer = expectedAt(22);
  assert.equal(newcomer.newcomer, 'Anchor Controller');
  assert.match(swarmNextLine(newcomer), /new: Anchor Controller/);
});

test('shop values agree with survivalRun’s actual planning handler, not a parallel planner fixture', () => {
  const run = runAtShop();
  run.telemetry.swarmStake = 'ironbound';
  run.telemetry.threats = ['thick_pack'];
  run.modifiers = [{ kind: 'weapon', offerId: 'throw', verb: 'Throw', defId: 'wpn_concussion_cannon_m', wave: 1 }];
  run.arenaMutators = ['heavies_only'];
  const actual = runPlanThroughOwner(run, 2);
  const forecast = swarmForecastForRun(run, 2);
  assert.ok(actual?.swarm);
  assert.equal(forecast.killTarget, actual.swarm.killTarget);
  assert.equal(forecast.concurrent, actual.swarm.concurrent);
  assert.deepEqual(forecast.roster, [...new Set(actual.swarm.roster
    .filter((entry) => entry.weight > 0)
    .map((entry) => enemyName.get(entry.enemyId))
    .filter(Boolean))]);

  // A later ordinary-Swarm boss forecast also agrees with the production owner plan.
  run.telemetry.threats = [];
  run.arenaMutators = [];
  run.modifiers = [];
  const actualBoss = runPlanThroughOwner(run, 20);
  const bossForecast = swarmForecastForRun(run, 20);
  assert.equal(bossForecast.killTarget, actualBoss.swarm.killTarget);
  assert.equal(bossForecast.concurrent, actualBoss.swarm.concurrent);
  assert.equal(bossForecast.boss.label, actualBoss.swarm.bossLabel);
});

test('Armory and Refit refresh with changed plans, without touching the run or its RNG', () => {
  const run = runAtShop();
  const armoryPreview = previewNode();
  const refitPreview = previewNode();
  const armory = armoryFor(run, armoryPreview);
  const refit = refitFor(run, refitPreview);
  const oldDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    createElementNS: undefined,
    createElement: () => ({ textContent: '', setAttribute() {} }),
  };
  try {
    let beforeRefresh = structuredClone(run);
    armory.screen.refresh(armory.ctx);
    refit.screen.refresh(refit.ctx);
    assert.deepEqual(run, beforeRefresh);
    assert.equal(armoryPreview.hidden, false);
    assert.equal(armoryPreview.textContent, refitPreview.textContent);
    assert.match(armoryPreview.textContent, /clear 24 · room cap 11/);

    // The planner runs only on a real shop refresh; periodic animation passes keep their early
    // return and therefore do not rebuild/consume a planner stream every frame.
    const beforePeriodic = armoryPreview.textContent;
    armory.screen.refresh(armory.ctx, { periodic: true });
    refit.screen.refresh(refit.ctx, { periodic: true });
    assert.equal(armoryPreview.textContent, beforePeriodic);

    run.telemetry.swarmStake = 'exhibition';
    beforeRefresh = structuredClone(run);
    armory.screen.refresh(armory.ctx);
    refit.screen.refresh(refit.ctx);
    assert.deepEqual(run, beforeRefresh);
    assert.match(armoryPreview.textContent, /clear 16 · room cap 7/);
    assert.equal(armoryPreview.textContent, refitPreview.textContent);
    assert.equal(armory.ctx.state.rng.calls, 0);
    assert.equal(refit.ctx.state.rng.calls, 0);
    // If canonical planning cannot produce a forecast, both actual consumers hide it instead
    // of returning to the misleading base ladder estimate.
    run.arenaId = 'not_a_real_arena';
    armory.screen.refresh(armory.ctx);
    refit.screen.refresh(refit.ctx);
    assert.equal(armoryPreview.hidden, true);
    assert.equal(armoryPreview.textContent, '');
    assert.equal(refitPreview.hidden, true);
    assert.equal(refitPreview.textContent, '');

    // Circuit owns its own route language; invalid Circuit telemetry also has no generic Swarm
    // fallback in the shared Armory/Refit preview slot.
    run.arenaId = 'helios_core';
    run.telemetry.circuit = {};
    beforeRefresh = structuredClone(run);
    armory.screen.refresh(armory.ctx);
    refit.screen.refresh(refit.ctx);
    assert.deepEqual(run, beforeRefresh);
    assert.equal(armoryPreview.hidden, true);
    assert.equal(refitPreview.hidden, true);
    assert.equal(swarmForecastForRun(run, 2), null);
    assert.equal(armory.ctx.state.rng.calls, 0);
    assert.equal(refit.ctx.state.rng.calls, 0);

    // A valid finite Circuit keeps its authored route panel; the exported ordinary-Swarm
    // forecast helper refuses it just as the Armory painter does.
    delete run.telemetry.circuit;
    run.wave = 1;
    run.telemetry.circuit = createCircuitState('helios_core');
    assert.ok(circuitFor(run));
    assert.equal(swarmForecastForRun(run, 2), null);
    const circuitPanel = circuitWidgets();
    armory.screen._circuit = circuitPanel;
    armory.screen._paintCircuitRoute = () => {};
    armory.screen._paintCircuitChoices = () => {};
    armory.screen.refresh(armory.ctx);
    const expectedPanel = circuitPanelLines(run);
    assert.equal(circuitPanel.el.hidden, false);
    assert.equal(circuitPanel.next.textContent, expectedPanel.next);
    assert.match(circuitPanel.next.textContent, /Next — stage 1, round 2/);
    assert.equal(armoryPreview.hidden, true);

    // After round 16 the Circuit descriptor is absent and survivalRun plans ordinary Swarm.
    // Keep the Circuit's Overtime status line while restoring the useful quota/cap forecast.
    run.wave = 16;
    run.telemetry.circuit = {
      ...createCircuitState('helios_core'),
      route: [
        { stage: 1, arenaId: 'helios_core', nodeId: 'helios_core' },
        ...[2, 3, 4].map((stage) => {
          const destination = CIRCUIT_DESTINATIONS[stage][0];
          return { stage, arenaId: destination.arenaId, nodeId: destination.nodeId };
        }),
      ],
      clearedStages: 4,
      status: 'overtime',
      wonAtWave: 16,
    };
    assert.equal(circuitFor(run)?.status, 'overtime');
    assert.equal(circuitRoundFor(run, 17), null);
    const actualOvertime = runPlanThroughOwner(run, 17);
    const overtimeForecast = swarmForecastForRun(run, 17);
    assert.ok(actualOvertime?.swarm);
    assert.equal(overtimeForecast.killTarget, actualOvertime.swarm.killTarget);
    assert.equal(overtimeForecast.concurrent, actualOvertime.swarm.concurrent);
    armory.screen.refresh(armory.ctx);
    refit.screen.refresh(refit.ctx);
    assert.equal(circuitPanel.el.hidden, false);
    assert.match(circuitPanel.next.textContent, /Overtime — round 17/);
    assert.equal(armoryPreview.hidden, false);
    assert.equal(armoryPreview.textContent, refitPreview.textContent);
    assert.match(armoryPreview.textContent, /Round 17/);
    assert.match(armoryPreview.textContent, /room cap/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('Armory and Refit repaint once from delayed worker receipts and unbind across visibility changes', async () => {
  const oldDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    createElementNS: undefined,
    createElement: () => ({ textContent: '', setAttribute() {} }),
  };
  try {
    const armory = armoryFor(runAtShop(), previewNode());
    let armoryRefreshes = 0;
    const armoryRefresh = armory.screen.refresh.bind(armory.screen);
    armory.screen.refresh = (...args) => { armoryRefreshes += 1; return armoryRefresh(...args); };

    armory.screen.onShow(armory.ctx);
    assert.equal(armory.bus.listenerCount('run:shopPurchased'), 1);
    const afterOpen = armoryRefreshes;
    armory.screen._requestReroll(armory.ctx);
    assert.equal(armoryRefreshes, afterOpen + 1, 'the immediate read remains for the synchronous/main lane');

    // Worker-lane ordering: applyTickReply first installs domainUpdates (run + public draft
    // snapshot), then replays the worker event list. Publish that read model before the receipt.
    armory.publish({
      credits: 214,
      notice: 'Not enough run credits. Save for the next round.',
      reroll: { open: true, available: false, reason: 'insufficient_credits' },
    });
    armory.bus.emit('run:spendRejected', { reason: 'unrelated_wallet_spend' });
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, afterOpen + 1, 'unrelated spend receipts are ignored');
    armory.bus.emit('run:spendRejected', { reason: 'crucible:draftReroll' });
    armory.bus.emit('run:draftRerollRejected', { reason: 'insufficient_credits' });
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, afterOpen + 2, 'the rejection pair coalesces into one repaint');
    assert.equal(armory.screen._wallet.textContent, '214 cr to spend');
    assert.equal(armory.screen._note.textContent, 'Not enough run credits. Save for the next round.');

    // A main-thread owner can emit the result inside the intent. Suppression plus the direct
    // refresh means its synchronous event does not trigger a second/re-entrant repaint.
    const syncArmoryBase = armoryRefreshes;
    const offSyncArmory = armory.bus.on('run:draftRerollRequested', () => {
      armory.publish({ credits: 180, notice: null, reroll: { open: true } });
      armory.bus.emit('run:draftOffered', { wave: 1, offers: [] });
    });
    armory.screen._requestReroll(armory.ctx);
    offSyncArmory();
    assert.equal(armoryRefreshes, syncArmoryBase + 1);
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, syncArmoryBase + 1);

    // Delayed successful purchase can replay several canonical effects; the snapshot already
    // contains the new wallet and notice, and event coalescing gives one actual Armory repaint.
    const asyncPurchaseBase = armoryRefreshes;
    armory.publish({ credits: 97, notice: 'Concussion cannon fitted. Buy again or launch the next round.' });
    armory.bus.emit('module:equipped', { shipId: 'player', slotIndex: 0, defId: 'wpn_concussion_cannon_m' });
    armory.bus.emit('run:shopPurchased', { wave: 1, offerId: 'cannon', price: 83 });
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, asyncPurchaseBase + 1);
    assert.equal(armory.screen._wallet.textContent, '97 cr to spend');
    assert.match(armory.screen._note.textContent, /fitted/);

    // Hiding cancels an already queued result; reopening twice still leaves only one result
    // subscription, and dispose is a final unbind.
    const hiddenBase = armoryRefreshes;
    armory.publish({ credits: 120, notice: 'late hidden result' });
    armory.bus.emit('run:shopPurchased', { wave: 1, offerId: 'late', price: 0 });
    armory.screen.onHide();
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, hiddenBase);
    assert.equal(armory.bus.listenerCount('run:shopPurchased'), 0);
    armory.screen.onShow(armory.ctx);
    armory.screen.onShow(armory.ctx);
    assert.equal(armory.bus.listenerCount('run:shopPurchased'), 1);
    const reopenedBase = armoryRefreshes;
    armory.bus.emit('run:shopPurchased', { wave: 1, offerId: 'visible', price: 0 });
    await flushUiMicrotasks();
    assert.equal(armoryRefreshes, reopenedBase + 1);
    armory.screen.dispose();
    assert.equal(armory.bus.listenerCount('run:shopPurchased'), 0);

    const refitRun = runAtShop();
    refitRun.phase = 'refit';
    refitRun.wave = 10;
    const refit = refitFor(refitRun, previewNode());
    let refitRefreshes = 0;
    const refitRefresh = refit.screen.refresh.bind(refit.screen);
    refit.screen.refresh = (...args) => {
      if (!(args[1] && args[1].periodic)) refitRefreshes += 1;
      return refitRefresh(...args);
    };
    refit.screen.onShow(refit.ctx);
    refit.screen.refresh(refit.ctx);
    assert.equal(refit.bus.listenerCount('run:refitChanged'), 1);

    const beforeRefitIntent = refitRefreshes;
    refit.screen._emitIntentAndRefresh(refit.ctx, 'run:refitFitRequested', { slotIndex: 0, instanceId: 'spare-1' });
    assert.equal(refitRefreshes, beforeRefitIntent + 1);
    const oldNotice = refit.screen._note.textContent;
    refit.publish({ credits: 280, notice: 'That fitting will not fit this hardpoint.' });
    const oldBankNote = refit.screen._bankNote.textContent;
    refit.screen.refresh(refit.ctx, { periodic: true });
    assert.equal(refitRefreshes, beforeRefitIntent + 1, 'periodic refresh still returns early');
    assert.equal(refit.screen._note.textContent, oldNotice, 'periodic refresh cannot paint an unacknowledged read');
    assert.equal(refit.screen._bankNote.textContent, oldBankNote, 'periodic refresh cannot paint the changed purse');
    refit.bus.emit('run:refitChanged', { wave: 1, slotIndex: 0, action: 'fit', ok: false, reason: 'wrong_size' });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, beforeRefitIntent + 2);
    assert.equal(refit.screen._note.textContent, 'That fitting will not fit this hardpoint.');
    assert.match(refit.screen._bankNote.textContent, /140 cr moves to the hangar chest now.*140 cr stays in the purse/);

    const beforeBankReject = refitRefreshes;
    refit.publish({ credits: 280, notice: 'The bank window closed before the spend landed.' });
    refit.bus.emit('run:spendRejected', { reason: 'other_spend' });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, beforeBankReject);
    refit.bus.emit('run:spendRejected', { reason: 'partial_bank' });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, beforeBankReject + 1);
    assert.equal(refit.screen._note.textContent, 'The bank window closed before the spend landed.');

    const beforeBankSuccess = refitRefreshes;
    refit.publish({ credits: 140, notice: '70 cr banked for the hangar.' });
    refit.bus.emit('run:partialBanked', { credits: 70, secured: 70, remaining: 140, wave: 1 });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, beforeBankSuccess + 1);
    assert.equal(refit.screen._note.textContent, '70 cr banked for the hangar.');

    // Include the existing refund receipt for a spend that was accepted then invalidated.
    const beforeRefund = refitRefreshes;
    refit.publish({ credits: 210, notice: 'Bank refunded; the window changed.' });
    refit.bus.emit('run:awarded', { credits: 70, reason: 'partial_bank_refund' });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, beforeRefund + 1);

    const syncRefitBase = refitRefreshes;
    const offSyncRefit = refit.bus.on('run:refitStripRequested', () => {
      refit.publish({ notice: 'Stripped.' });
      refit.bus.emit('run:refitChanged', { wave: 1, slotIndex: 0, action: 'strip', ok: true });
    });
    refit.screen._emitIntentAndRefresh(refit.ctx, 'run:refitStripRequested', { slotIndex: 0 });
    offSyncRefit();
    assert.equal(refitRefreshes, syncRefitBase + 1);
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, syncRefitBase + 1);

    const hiddenRefitBase = refitRefreshes;
    refit.bus.emit('run:refitChanged', { wave: 1, slotIndex: 0, action: 'fit', ok: true });
    refit.screen.onHide();
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, hiddenRefitBase);
    assert.equal(refit.bus.listenerCount('run:refitChanged'), 0);
    // A successful worker fit can complete while the modal is hidden. No event is retained, so
    // reopening must synchronously consume the latest public snapshot and canonical run fields.
    const lateRows = [{ slotIndex: 0, slotType: 'weapon', defId: 'wpn_concussion_cannon_m', name: 'Concussion Cannon', spares: [] }];
    refit.publish({ credits: 118, notice: 'Late fit receipt: Corsair mount is live.', refitRows: lateRows });
    // Exercise the production row reader against the worker-published survivalDraftPublic
    // snapshot while keeping the DOM row factory out of this narrow ack/lifecycle test.
    const fixtureRows = refit.screen._rows_data;
    delete refit.screen._rows_data;
    assert.deepEqual(refit.screen._rows_data(refit.ctx), lateRows);
    refit.screen._rows_data = fixtureRows;
    refit.ctx.state.run.telemetry.swarmStake = 'exhibition';
    refit.bus.emit('run:refitChanged', { wave: 1, slotIndex: 0, action: 'fit', ok: true });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, hiddenRefitBase);
    refit.publish({ refitRows: [] });
    refit.screen.onShow(refit.ctx);
    assert.equal(refit.screen._note.textContent, 'Late fit receipt: Corsair mount is live.');
    assert.match(refit.screen._bankNote.textContent, /59 cr moves to the hangar chest now.*59 cr stays in the purse/);
    assert.match(refit.screen._preview.textContent, /Round 11 .*clear 27/);
    refit.screen.onShow(refit.ctx);
    assert.equal(refit.bus.listenerCount('run:refitChanged'), 1);
    const reopenedRefitBase = refitRefreshes;
    refit.bus.emit('run:refitChanged', { wave: 1, slotIndex: 0, action: 'fit', ok: true });
    await flushUiMicrotasks();
    assert.equal(refitRefreshes, reopenedRefitBase + 1);
    refit.screen.dispose();
    assert.equal(refit.bus.listenerCount('run:refitChanged'), 0);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('production domain wire, lane facade and result bridge repaint the merged shop snapshot', async () => {
  configureDomainMirroring(createDomainMirroringProfile('station'));
  const sourceRun = runAtShop();
  const sourceState = {
    run: sourceRun,
    survivalDraftPublic: {
      offers: [], wave: sourceRun.wave, notice: null,
      reroll: { open: true, credits: sourceRun.credits }, recommended: [],
      preparation: null, generation: 0, refitRows: [],
    },
  };
  const differ = createDomainDiffer();
  const roots = new Map();
  const applyWire = (updates) => {
    for (const update of structuredClone(updates)) applyDomainPathUpdate(roots, update);
  };
  applyWire(differ.diff(sourceState, 0).updates);

  const oldDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    createElementNS: undefined,
    createElement: () => ({ textContent: '', setAttribute() {} }),
  };
  try {
    const armory = armoryFor(sourceRun, previewNode());
    armory.ctx.state.run = roots.get('run');
    armory.ctx.state.survivalDraftPublic = roots.get('survivalDraftPublic');
    const getLaneFacade = createLaneSystemFacade({ state: armory.ctx.state, bus: armory.bus });
    armory.ctx.registry = { get: (name) => name === 'survivalDraft' ? getLaneFacade(name) : null };
    let repaintCount = 0;
    const paint = armory.screen.refresh.bind(armory.screen);
    armory.screen.refresh = (...args) => { repaintCount += 1; return paint(...args); };
    armory.screen.onShow(armory.ctx);
    const beforeAck = repaintCount;

    // Worker-side result publication replaces the detached public snapshot. Mirror the
    // production host hook by invoking the same differ API here: only existing run descendants
    // are invalidated, so changed canonical planner inputs can accompany this result pass.
    sourceRun.credits = 214;
    sourceRun.telemetry.swarmStake = 'exhibition';
    sourceRun.modifiers = [{ kind: 'weapon', offerId: 'throw', verb: 'Throw', defId: 'wpn_concussion_cannon_m', wave: 1 }];
    sourceState.survivalDraftPublic = {
      ...sourceState.survivalDraftPublic,
      notice: 'Concussion cannon fitted. Buy again or launch the next round.',
      reroll: { open: true, credits: 214 },
      offers: [], recommended: [], refitRows: [],
    };
    assert.ok(differ.invalidateSubtree('run') > 0, 'shop result invalidates existing run descendants only');
    const resultPass = differ.diff(sourceState, 1);
    const resultUpdates = structuredClone(resultPass.updates);
    const resultPaths = new Set(resultUpdates.map((update) => update.segs.join('.')));
    for (const path of ['survivalDraftPublic', 'run.credits', 'run.telemetry', 'run.modifiers']) {
      assert.ok(resultPaths.has(path), `${path} accompanies the same component result pass`);
    }
    applyWire(resultUpdates);

    const mirroredRun = roots.get('run');
    const mirroredDraft = roots.get('survivalDraftPublic');
    assert.equal(mirroredRun.credits, 214);
    assert.equal(mirroredRun.telemetry.swarmStake, 'exhibition');
    assert.equal(mirroredRun.modifiers[0].defId, 'wpn_concussion_cannon_m');
    assert.equal(mirroredDraft.reroll.credits, 214);

    // This is a native-component seam: production diff/clone/facade/projector/EventBus, not a
    // browser end-to-end playthrough or a direct refresh call. Apply the result pass first as
    // the main lane does, then replay the canonical receipt to wake the visible Armory.
    const wireReceipt = projectBridgeEvent('run:shopPurchased', { wave: 1, offerId: 'throw', price: 136 });
    assert.equal(wireReceipt.dropped, false);
    armory.bus.emit('run:shopPurchased', structuredClone(wireReceipt.flat));
    await flushUiMicrotasks();
    assert.equal(repaintCount, beforeAck + 1);
    assert.equal(armory.screen._wallet.textContent, '214 cr to spend');
    assert.equal(armory.screen._note.textContent, mirroredDraft.notice);
    assert.equal(armory.screen._preview.textContent, swarmNextLine(swarmForecastForRun(mirroredRun, 2)));
    assert.match(armory.screen._preview.textContent, /clear 16/);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('unavailable forecast inputs return no line rather than throwing or inventing a base plan', () => {
  const run = runAtShop();
  assert.equal(swarmForecastForRun(null, 2), null);
  assert.equal(swarmForecastForRun(run, 0), null);
  assert.equal(swarmForecastForRun({ ...run, arenaId: 'not_a_real_arena' }, 2), null);
  assert.equal(swarmForecastForRun({ ...run, modifiers: null, arenaMutators: null, telemetry: null }, 2)?.killTarget, 24);
});
