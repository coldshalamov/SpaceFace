// LAW-10 — dumping the scanned lot mid-scan downgrades the finding to suspicion.
// Seed 4242, deterministic (no rolls on this path — simTime/tick only).
//
// Path A (dump): a hold scan opens with contraband aboard; the player jettisons the
// whole scanned lot before the scan completes. The law resolves the scan as aborted
// with a suspicion note (one `customs:scanAborted` seam event, one suspicion receipt,
// one bark) and forges no second verdict — no re-scan, no fine, no standing move,
// no heat write. The jettisoned pod keeps its contraband stamp, so the later
// cone/weir read still prices heat through heat.js (dumping is never heat-free).
// The customs deck surfaces the abort as a toast and dismisses the panel.
//
// Path B (finish): the same scan with no dump completes; the engine's
// `contraband:scanned` stands verbatim as the full finding — no abort, no downgrade.
//
// An unrelated (legal) dump mid-scan does not abort the watch.
import test from 'node:test';
import assert from 'node:assert/strict';

import { lawSecurity } from '../src/systems/lawSecurity.js';
import { cargo } from '../src/systems/cargo.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SEED = 4242;
const CONTRABAND_ID = 'cmdty_narcotics';
const LEGAL_ID = 'cmdty_food';

const LEGALITY = new Map(COMMODITIES.map((c) => [c.id, c.legality || 'legal']));

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      const list = handlers.get(evt) || [];
      handlers.set(evt, list.filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function events(bus, name) {
  return bus.emitLog.filter((row) => row.evt === name);
}

// The engine's own illicit read, minus hidden-hold/bay nuance the watch does not need:
// every non-legal hold stack is scan-exposed.
function fakeEconomy() {
  return {
    illicitCargo(state) {
      const items = (state.player && state.player.cargo && state.player.cargo.items) || {};
      const out = [];
      for (const id of Object.keys(items)) {
        const qty = Math.max(0, Math.floor(Number(items[id]) || 0));
        if (qty <= 0 || (LEGALITY.get(id) || 'legal') === 'legal') continue;
        out.push({ commodityId: id, qty, holdQty: qty, bayQty: 0, def: { legality: LEGALITY.get(id) } });
      }
      return out;
    },
  };
}

function makeState(items) {
  const entities = new Map();
  const state = {
    meta: { seed: SEED },
    simTime: 100,
    tick: 600,
    mode: 'flight',
    playerId: 'player',
    player: {
      credits: 5000,
      cargo: { items: { ...items }, usedVolume: 0, usedMass: 0, capVolume: 100 },
    },
    world: { currentSectorId: 'sector_helios_prime' },
    entities,
    entityList: [],
    ui: {},
  };
  entities.set('player', {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 5,
    factionId: 'player', data: {},
  });
  return state;
}

function bootLaw(state, bus) {
  const economy = fakeEconomy();
  const law = Object.create(lawSecurity);
  law.init({ state, bus, helpers: {}, registry: { get: (name) => (name === 'economy' ? economy : null) } });
  return { law, economy };
}

function bootCargo(state, bus, pods) {
  const ship = Object.create(cargo);
  ship.init({
    state,
    bus,
    helpers: {
      spawnEntity(payloadSpec) {
        const pod = { id: `pod-test-${pods.length + 1}`, alive: true, data: payloadSpec.data || {} };
        pods.push({ spec: payloadSpec, pod });
        return pod;
      },
    },
    registry: { get() { return null; } },
  });
  return ship;
}

function scanSignal(bus, extra = {}) {
  bus.emit('player:scannedByPatrol', {
    hasContraband: true, factionId: 'faction_scn', patrolId: 'patrol-1', stationId: 'station_helios',
    ...extra,
  });
}

test('LAW-10 dump path: full mid-scan dump aborts with a suspicion note', () => {
  const bus = makeBus();
  const pods = [];
  const state = makeState({ [CONTRABAND_ID]: 4 });
  const { law } = bootLaw(state, bus);
  const ship = bootCargo(state, bus, pods);

  scanSignal(bus);
  assert.equal(law._scanDumpWatch && law._scanDumpWatch.phase, 'scanning', 'dirty scan opens the watch');
  assert.deepEqual(
    law._scanDumpWatch.lots,
    [{ commodityId: CONTRABAND_ID, qty: 4 }],
    'the watch snapshots the engine illicit read',
  );

  const creditsBefore = state.player.credits;
  const dumped = ship.jettison(CONTRABAND_ID, 4);
  assert.equal(dumped, 4, 'the whole scanned lot leaves the hold');
  assert.equal(state.player.cargo.items[CONTRABAND_ID] || 0, 0, 'hold reads clean of the lot');

  // The cargo receipt names what left and what remains (the law's correlator).
  const jettisoned = events(bus, 'cargo:jettisoned');
  assert.equal(jettisoned.length, 1);
  assert.equal(jettisoned[0].payload.commodityId, CONTRABAND_ID);
  assert.equal(jettisoned[0].payload.amount, 4);
  assert.equal(jettisoned[0].payload.legality, 'contraband');
  assert.equal(jettisoned[0].payload.holdRemaining, 0);

  // The abort: one seam event, one suspicion receipt, one bark — and nothing else.
  const aborted = events(bus, 'customs:scanAborted');
  assert.equal(aborted.length, 1, 'one aborted-scan seam event');
  assert.equal(aborted[0].payload.reason, 'dumped_mid_scan');
  assert.equal(aborted[0].payload.suspicion, true);
  assert.equal(aborted[0].payload.patrolId, 'patrol-1');
  assert.deepEqual(aborted[0].payload.dumped, [{ commodityId: CONTRABAND_ID, amount: 4, tick: 600 }]);
  assert.equal(law._scanDumpWatch.phase, 'aborted_dump');

  const receipts = state.lawSecurity.receipts.filter((row) => row.outcome === 'scan_aborted_dump');
  assert.equal(receipts.length, 1, 'one suspicion receipt on the ledger');
  assert.match(receipts[0].text, /suspicion noted/);
  assert.match(receipts[0].text, /cmdty_narcotics/);
  const barks = events(bus, 'law:voice').filter((row) => String(row.payload.id || '').startsWith('law:scan-dump:'));
  assert.equal(barks.length, 1, 'one lawful dump bark');

  // The law forges no second verdict and moves no standing, credit, or heat writer.
  const forbidden = events(bus, 'patrol:proximity')
    .concat(events(bus, 'contraband:scanned'))
    .concat(events(bus, 'faction:repDelta'))
    .concat(events(bus, 'heat:changed'))
    .concat(events(bus, 'economy:chargeCredits'));
  assert.deepEqual(forbidden, [], 'no re-scan, no forged finding, no fine, no standing, no heat write');
  assert.equal(state.player.credits, creditsBefore);

  // Dumping is not heat-free: the pod keeps its contraband evidence stamp.
  assert.equal(pods.length, 1, 'one physical pod');
  assert.equal(pods[0].pod.data.legality, 'contraband', 'the pod is still contraband evidence');
  assert.equal(pods[0].pod.data.customsImpounded, undefined, 'not laundered into a surrender');
  assert.equal(pods[0].pod.data.jettisonedCargo, true);

  // A later pod-cone read of that body is a different scan: it must not flip the abort.
  bus.emit('contraband:scanned', {
    found: true, source: 'customs_scan_cone', podId: pods[0].pod.id,
    commodityId: CONTRABAND_ID, units: 4, factionId: 'faction_scn',
  });
  assert.equal(law._scanDumpWatch.phase, 'aborted_dump', 'the abort stands; the pod read belongs to its scanner');
  assert.equal(events(bus, 'customs:scanAborted').length, 1, 'no second abort');
});

test('LAW-10 finish path: letting the scan complete keeps the full finding', () => {
  const bus = makeBus();
  const pods = [];
  const state = makeState({ [CONTRABAND_ID]: 4 });
  const { law } = bootLaw(state, bus);
  bootCargo(state, bus, pods);

  scanSignal(bus);
  assert.equal(law._scanDumpWatch.phase, 'scanning');

  bus.emit('contraband:scanned', {
    found: true, fine: 1382,
    confiscated: [{ commodityId: CONTRABAND_ID, qty: 4 }],
    factionId: 'faction_scn', patrolId: 'patrol-1', stationId: 'station_helios', units: 4,
    bribeCost: 415,
  });

  assert.equal(law._scanDumpWatch.phase, 'completed_full', 'the verdict closes the watch as a full finding');
  assert.equal(events(bus, 'customs:scanAborted').length, 0, 'no abort, no downgrade');
  assert.equal(
    state.lawSecurity.receipts.filter((row) => row.outcome === 'scan_aborted_dump').length,
    0,
    'no suspicion receipt over a completed scan',
  );
  // The engine payload passes through verbatim — the law adds no second receipt for it.
  const resolutions = events(bus, 'law:incidentReceipt');
  assert.equal(resolutions.length, 0, 'the full finding needs no law rider');
});

test('LAW-10: an unrelated legal dump mid-scan does not abort the watch', () => {
  const bus = makeBus();
  const pods = [];
  const state = makeState({ [CONTRABAND_ID]: 4, [LEGAL_ID]: 6 });
  const { law } = bootLaw(state, bus);
  const ship = bootCargo(state, bus, pods);

  scanSignal(bus);
  const dumped = ship.jettison(LEGAL_ID, 6);
  assert.equal(dumped, 6);
  assert.equal(law._scanDumpWatch.phase, 'scanning', 'legal goods overboard are not the scanned lot');
  assert.equal(events(bus, 'customs:scanAborted').length, 0);
  assert.equal(law._scanDumpWatch.dumpedMidScan, false);

  // The scanned lot still aboard completes as the full finding.
  bus.emit('contraband:scanned', { found: true, factionId: 'faction_scn', patrolId: 'patrol-1', units: 4 });
  assert.equal(law._scanDumpWatch.phase, 'completed_full');
});

test('LAW-10: the customs deck surfaces the abort and drops the panel', () => {
  const bus = makeBus();
  const state = makeState({});
  const offers = [];
  setPromptDeck({
    offerDecision(o) { offers.push(o); return true; },
    updateDecision() { return true; },
    resolveDecision() { return true; },
  });
  const prompt = Object.create(customsPrompt);
  try {
    prompt.init({
      state,
      bus,
      helpers: { voice: { say() { return true; } } },
      registry: {
        get() {
          return {
            illicitCargo() {
              return [{
                commodityId: CONTRABAND_ID, qty: 4,
                def: { name: 'Narcotics', basePrice: 576, legality: 'contraband', fineMult: 1.2 },
              }];
            },
            scanningFaction() { return 'faction_scn'; },
          };
        },
      },
    });
    scanSignal(bus);
    assert.ok(state.ui.customsPrompt, 'the decision panel is up for the dirty scan');

    bus.emit('customs:scanAborted', {
      reason: 'dumped_mid_scan', factionId: 'faction_scn', patrolId: 'patrol-1',
      dumped: [{ commodityId: CONTRABAND_ID, amount: 4, tick: 600 }], suspicion: true,
    });
    const toasts = events(bus, 'toast');
    assert.equal(toasts.length, 1, 'one abort toast');
    assert.match(toasts[0].payload.text, /CUSTOMS SCAN ABORTED/);
    assert.match(toasts[0].payload.text, /Narcotics/);
    assert.match(toasts[0].payload.text, /suspicion noted/);
    assert.equal(toasts[0].payload.kind, 'warn');
    assert.equal(state.ui.customsPrompt, undefined, 'the offered decision is dismissed with the scan');
  } finally {
    prompt.destroy();
    setPromptDeck(null);
  }
});

test('LAW-10: destroy removes the watch listeners and sector exit drops the window', () => {
  const bus = makeBus();
  const state = makeState({ [CONTRABAND_ID]: 2 });
  const { law } = bootLaw(state, bus);
  scanSignal(bus);
  assert.equal(law._scanDumpWatch.phase, 'scanning');
  bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(law._scanDumpWatch, null, 'a jump drops the half-finished window');

  scanSignal(bus);
  assert.equal(law._scanDumpWatch.phase, 'scanning');
  law.destroy();
  bus.emit('cargo:jettisoned', { commodityId: CONTRABAND_ID, amount: 2, legality: 'contraband', holdRemaining: 0 });
  assert.equal(events(bus, 'customs:scanAborted').length, 0, 'no listener survives destroy');
});
