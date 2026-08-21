// PQ-130.10a — the §6.6 drawers, the §9 site-zoom return, and the `site:machineStatus` event.
// Authority: design/ASTEROID_WORKS_DESIGN_LAW.md §2.5, §5, §6.6, §9, §11.3.
//
// WHAT THIS FILE PROVES, AND WHAT IT DOES NOT.
//
// There is no jsdom in this repo, so nothing here renders a drawer. Two kinds of evidence are
// used, and they are kept honestly separate:
//
//   • BEHAVIOUR, proven for real — the exported drawer models are pure, so the Site drawer's four
//     operator verbs are invoked against a LIVE asteroidSites system and the owner's own state is
//     asserted afterwards. `site:machineStatus` is driven through real update() ticks.
//   • WIRING, proven by scoped source contract — that a control is bound to that model, that the
//     ledger render path never announces, that the sheet is born `hidden`. Each assertion reads a
//     NARROW slice of the module (the pq024 technique), never the whole file, so a rule cannot
//     pass because the string happens to appear somewhere else.
//
// The DOM-level fact "a closed drawer costs the default drive view zero words" is asserted by
// scripts/check-asteroid-theater.mjs, which boots the real game and walks every visible element
// under .ast-screen. It cannot be asserted here and is not claimed here.
//
// No DOM, no wall clock, seeded state only (test/AGENTS.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { generateDrillField, tileIndex } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import {
  DRAWER_TABS, drawerClock, ledgerDrawerRows, helpDrawerRows, machineModeLabel,
  transferRefusalText, siteDrawerModel,
} from '../src/ui/asteroid/asteroidScreen.js';

const SCREEN_SRC = readFileSync(new URL('../src/ui/asteroid/asteroidScreen.js', import.meta.url), 'utf8');
const CSS_SRC = readFileSync(new URL('../styles/asteroid-ops.css', import.meta.url), 'utf8');
const SITES_SRC = readFileSync(new URL('../src/systems/asteroidSites.js', import.meta.url), 'utf8');

/** The pq024 scoped-slice technique: read only the named function's body. */
function slice(src, startNeedle, endNeedle) {
  const from = src.indexOf(startNeedle);
  assert.notEqual(from, -1, `slice start missing: ${startNeedle}`);
  const to = src.indexOf(endNeedle, from + startNeedle.length);
  assert.notEqual(to, -1, `slice end missing: ${endNeedle}`);
  return src.slice(from, to);
}

// ---------------------------------------------------------------- live-system harness

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const GAS = () => ({ type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 });
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];

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
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 47 },
    entities,
    playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12,
          cmdty_electronics: 8, cmdty_purified_silica: 6,
        },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const registry = {
    get(name) {
      return name === 'automation' ? { creditPassive: (gross) => Math.round(gross * 0.5) } : null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities };
}

/** A live claim with power, a lane spine, a moded machine and a port — every verb has a subject. */
function buildSite(h, asteroidId = 42) {
  h.entities.set(asteroidId, {
    id: asteroidId, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  });
  const field = generateDrillField(asteroidId);
  for (const [c, r] of POCKET) field[c][r] = EMPTY();
  field[16][2] = GAS();
  field[16][1] = GAS();
  h.entities.get(asteroidId).data.drillCleared = POCKET.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: 14, row: 2 } };

  const ids = {};
  let res = h.sys.installMachine({ asteroidId, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(res.ok, true, 'extractor installs');
  ids.extractor = res.machineId;
  const siteId = res.siteId;
  h.state.drill.avatar = { col: 14, row: 1 };
  res = h.sys.installMachine({ asteroidId, defId: 'sm_massline_core', col: 14, row: 0 });
  assert.equal(res.ok, true, 'core installs');
  ids.core = res.machineId;
  res = h.sys.installMachine({ asteroidId, defId: 'sm_gas_tap', col: 15, row: 2 });
  assert.equal(res.ok, true, 'gas tap installs');
  ids.tap = res.machineId;
  res = h.sys.installMachine({ asteroidId, defId: 'sm_cargo_port', col: 14, row: 3 });
  assert.equal(res.ok, true, 'cargo port installs');
  ids.port = res.machineId;
  for (const [c, r] of [[14, 1], [14, 2], [15, 1]]) {
    h.sys.setOverlay(siteId, 'power', c, r, true);
    h.sys.setOverlay(siteId, 'lane', c, r, true);
  }
  return { siteId, ids };
}

const tick = (h, n) => {
  for (let i = 0; i < n; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }
};
const statusEvents = (h) => h.bus.events.filter((e) => e.name === 'site:machineStatus');
const modelFor = (h, siteId, over = {}) => siteDrawerModel({
  siteSys: h.sys,
  siteId,
  drillActive: !!(h.state.drill && h.state.drill.active),
  now: h.state.simTime,
  cargoItems: h.state.player.cargo.items,
  ...over,
});

// ==========================================================================
// 1. law §5 — site:machineStatus fires once per real transition, never on steady state
// ==========================================================================

test('site:machineStatus fires exactly once per transition and carries the previous state', () => {
  const h = makeHarness();
  const { siteId, ids } = buildSite(h);

  // A FIRST observation is an initial condition, not a transition. Four machines come up at once;
  // announcing all four would fire four simultaneous starved chimes against law §5 ("once") and
  // §8 ("one voice at a time for alert-class sounds").
  tick(h, 3);
  assert.equal(statusEvents(h).length, 0, 'the first observation of a machine is not a transition');
  const settled = h.sys.projection(siteId).machines;
  assert.equal(settled.find((m) => m.id === ids.extractor).status.state, 'running');
  assert.equal(settled.find((m) => m.id === ids.port).status.state, 'idle');

  // Steady state is silent — this is the property that keeps golden telemetry untouched.
  tick(h, 10);
  assert.equal(statusEvents(h).length, 0, 'an unchanged site emits nothing at all');

  // Sever the power spine: the two machines that draw power actually change state.
  const cut = h.sys.setOverlay(siteId, 'power', 14, 2, false);
  assert.equal(cut.ok, true);
  tick(h, 1);
  const dark = statusEvents(h).map((e) => e.payload);
  assert.equal(dark.length, 2, 'one event per machine that changed, and no others');
  const extractorDark = dark.find((p) => p.machineId === ids.extractor);
  assert.deepEqual(extractorDark, {
    siteId, machineId: ids.extractor, state: 'no-power', prev: 'running',
  }, 'the payload names the site, the machine, the new state and the state it came from');
  assert.equal(dark.find((p) => p.machineId === ids.port).prev, 'idle');
  assert.ok(!dark.some((p) => p.machineId === ids.core), 'the generator did not change and stays quiet');

  // Still dark, still silent: the chime is per transition, not per tick.
  tick(h, 6);
  assert.equal(statusEvents(h).length, 2, 'a machine that stays dark does not chime again');

  // Restore: the recovery is a transition too, and it names the fault it left.
  h.sys.setOverlay(siteId, 'power', 14, 2, true);
  tick(h, 1);
  const back = statusEvents(h).slice(2).map((e) => e.payload);
  assert.equal(back.length, 2);
  assert.deepEqual(back.find((p) => p.machineId === ids.extractor), {
    siteId, machineId: ids.extractor, state: 'running', prev: 'no-power',
  });
});

test('the emit is additive: it reads the status map the tick already built, and adds no state', () => {
  // Guards the exact shape the leaf promised — emitted BELOW the machine loop so no listener can
  // read a half-built rt.status through projection(), and gated on a previous entry existing.
  const body = slice(SITES_SRC, '  _tickSite(site, dtS, state) {', '\n  _tryLaunch(');
  assert.match(body, /const prevStatus = rt\.status \|\| EMPTY_MACHINE_STATUS;/);
  assert.match(body, /const before = prevStatus\[m\.id\];\s*\n\s*if \(before && before\.state !== status\.state\)/,
    'a first observation (no previous entry) must not count as a transition');
  const emitAt = body.indexOf("this.bus.emit('site:machineStatus'");
  const loopEndAt = body.indexOf('for (const t of statusTransitions)');
  assert.ok(loopEndAt !== -1 && emitAt > loopEndAt, 'transitions are emitted after the machine loop closes');
  assert.equal(
    (SITES_SRC.match(/site:machineStatus/g) || []).length, 1,
    'exactly one emit site for this event',
  );
});

// ==========================================================================
// 2. law §6.6 — the Site drawer RE-BINDS the four operator verbs to their owner APIs
// ==========================================================================

test('the Site drawer names the four owner APIs the context bay lost', () => {
  const h = makeHarness();
  const { siteId } = buildSite(h);
  const verbs = modelFor(h, siteId).verbs;
  assert.deepEqual(
    [verbs.export.owner, verbs.podTarget.owner, verbs.machineMode.owner, verbs.transfer.owner],
    ['setExportFlag', 'setPodTarget', 'setMachineMode', 'transferGoods'],
  );
  for (const verb of Object.values(verbs)) {
    assert.equal(typeof asteroidSites[verb.owner], 'function', `${verb.owner} is a live owner API`);
    assert.equal(typeof verb.apply, 'function');
  }
});

test('verb 1 setExportFlag: the drawer chip flips the owner export policy', () => {
  const h = makeHarness();
  const { siteId } = buildSite(h);
  tick(h, 3);
  const site = h.sys.getSite(siteId);

  const before = modelFor(h, siteId).verbs.export;
  assert.equal(before.disabled, false);
  const silicate = before.goods.find((g) => g.id === 'cmdty_silicate');
  assert.ok(silicate, 'the good this site actually produces is offered');
  assert.equal(silicate.shipped, true, 'export is on by default');
  assert.equal(silicate.name, 'Silicate rock', 'law §3.3 sentence case');

  assert.equal(before.apply('cmdty_silicate', false).ok, true);
  assert.equal(site.exportOff.cmdty_silicate, true, 'the owner record changed, not a UI copy');
  assert.equal(modelFor(h, siteId).verbs.export.goods.find((g) => g.id === 'cmdty_silicate').shipped, false);

  assert.equal(modelFor(h, siteId).verbs.export.apply('cmdty_silicate', true).ok, true);
  assert.equal(site.exportOff.cmdty_silicate, undefined);
});

test('verb 2 setPodTarget: the stepper writes the owner fleet policy and honours its ceiling', () => {
  const h = makeHarness();
  const { siteId } = buildSite(h);
  const site = h.sys.getSite(siteId);
  const verb = modelFor(h, siteId).verbs.podTarget;
  assert.equal(verb.disabled, false);
  assert.equal(verb.value, site.fleet.podTarget);
  assert.equal(verb.max, SITE_BALANCE.maxPodTarget, 'the ceiling is the owner constant, not a UI guess');

  assert.equal(verb.apply(7).ok, true);
  assert.equal(site.fleet.podTarget, 7);
  assert.equal(modelFor(h, siteId).verbs.podTarget.value, 7);

  // The owner clamps; the drawer does not re-implement the rule.
  modelFor(h, siteId).verbs.podTarget.apply(9999);
  assert.equal(site.fleet.podTarget, SITE_BALANCE.maxPodTarget);
});

test('verb 3 setMachineMode: only moded machines are offered, and the pick retools the owner', () => {
  const h = makeHarness();
  const { siteId, ids } = buildSite(h);
  const site = h.sys.getSite(siteId);
  const verb = modelFor(h, siteId).verbs.machineMode;
  assert.equal(verb.disabled, false);
  assert.deepEqual(verb.machines.map((m) => m.id), [ids.tap],
    'the extractor, core and port declare no modes and are absent — not offered and disabled');
  const tap = verb.machines[0];
  assert.deepEqual(tap.modes, ['generate', 'feedstock', 'split']);
  assert.deepEqual(tap.modeLabels, ['Generate', 'Feedstock', 'Split']);
  assert.equal(tap.mode, 'generate');

  assert.equal(verb.apply(tap.id, 'feedstock').ok, true);
  assert.equal(site.machines.find((m) => m.id === ids.tap).mode, 'feedstock');
  assert.equal(modelFor(h, siteId).verbs.machineMode.machines[0].mode, 'feedstock');

  // The owner's own refusal survives — the drawer invents no mode.
  assert.equal(modelFor(h, siteId).verbs.machineMode.apply(tap.id, 'not-a-mode').reason, 'bad-mode');
  assert.equal(site.machines.find((m) => m.id === ids.tap).mode, 'feedstock');
});

test('verb 4 transferGoods: the rover moves real cargo into and out of the lane network', () => {
  const h = makeHarness();
  const { siteId, ids } = buildSite(h);
  tick(h, 3);
  const verb = modelFor(h, siteId).verbs.transfer;
  assert.equal(verb.disabled, false, 'the rover is tethered and the machines sit on a lane');
  const extractor = verb.machines.find((m) => m.id === ids.extractor);
  assert.ok(extractor, 'a lane-connected machine is offered');
  // The four installs already spent regocrete out of the hold, so this reads the LIVE amount —
  // a literal here would only prove the fixture, not that the drawer reads the real hold.
  const held = h.state.player.cargo.items.cmdty_regocrete;
  assert.ok(held > 5 && held < 40, `installs consumed regocrete from the hold (${held})`);
  const regocrete = extractor.goods.find((g) => g.id === 'cmdty_regocrete');
  assert.equal(regocrete.onShip, held, 'the drawer reads the real hold');
  assert.equal(regocrete.onSite, 0);

  const dep = verb.apply(ids.extractor, 'cmdty_regocrete', 5, 'deposit');
  assert.equal(dep.ok, true);
  assert.equal(dep.moved, 5);
  assert.equal(h.state.player.cargo.items.cmdty_regocrete, held - 5, 'the ship hold paid for it');
  const after = modelFor(h, siteId).verbs.transfer.machines.find((m) => m.id === ids.extractor);
  assert.equal(after.goods.find((g) => g.id === 'cmdty_regocrete').onSite, 5, 'the lane store holds it');

  const wd = modelFor(h, siteId).verbs.transfer.apply(ids.extractor, 'cmdty_regocrete', 5, 'withdraw');
  assert.equal(wd.ok, true);
  assert.equal(wd.moved, 5);
  assert.equal(h.state.player.cargo.items.cmdty_regocrete, held, 'the hold got it back');
});

test('a verb that cannot act says why: no claim, and an untethered rover', () => {
  const h = makeHarness();

  // No site at all — the drawer is reachable on a virgin rock and every verb explains itself.
  const bare = siteDrawerModel({ siteSys: h.sys, siteId: null });
  assert.equal(bare.hasSite, false);
  for (const [name, verb] of Object.entries(bare.verbs)) {
    assert.equal(verb.disabled, true, `${name} is disabled with no claim`);
    assert.equal(verb.reason, 'No claim on this rock yet.', `${name} carries the reason`);
    // A disabled verb still refuses safely rather than throwing into the frame loop.
    assert.equal(verb.apply('x', 'y', 1, 'deposit').ok, false);
  }
  assert.deepEqual(bare.totals.rates, []);
  assert.equal(bare.courier.podsReady, 0);

  // A real site, but the rover has left: only the transfer verb depends on the tether.
  const { siteId } = buildSite(h);
  tick(h, 3);
  const gone = modelFor(h, siteId, { drillActive: false }).verbs;
  assert.equal(gone.transfer.disabled, true);
  assert.equal(gone.transfer.reason, 'The rover has to be tethered to this rock.');
  assert.equal(gone.export.disabled, false, 'export policy is set from anywhere');
  assert.equal(gone.podTarget.disabled, false);
  assert.equal(transferRefusalText({ ok: false, reason: 'not-tethered' }), gone.transfer.reason,
    'the refusal sentence and the disabled reason are the same voice');
});

test('the Site drawer reports the totals and courier log the owner actually holds', () => {
  const h = makeHarness();
  const { siteId, ids } = buildSite(h);
  tick(h, 3);
  const model = modelFor(h, siteId);
  const projection = h.sys.projection(siteId);

  assert.equal(model.totals.machines, 4);
  assert.equal(model.totals.running, 2, 'extractor + core');
  assert.equal(model.totals.dark, 1, 'the gas tap has no live gas contact');
  assert.equal(model.totals.exportRatePerMin, projection.exportRatePerMin);
  assert.deepEqual(model.totals.rates.map((r) => r.id), ['cmdty_silicate']);
  assert.equal(model.totals.capacity, Math.round(projection.lanes.reduce((a, l) => a + l.capacity, 0)));
  assert.equal(model.courier.podTarget, h.sys.getSite(siteId).fleet.podTarget);
  assert.deepEqual(model.courier.inFlight, [], 'nothing launched yet');

  // A courier in flight reads as one row with a mono ETA, not a sentence.
  const site = h.sys.getSite(siteId);
  site.fleet.inFlight.push({ launchT: 0, arriveT: h.state.simTime + 95, cargo: { cmdty_silicate: 12 }, lost: false });
  const flying = modelFor(h, siteId).courier.inFlight;
  assert.equal(flying.length, 1);
  assert.equal(flying[0].units, 12);
  assert.equal(flying[0].etaS, 95);
  assert.equal(drawerClock(flying[0].etaS), '01:35');
});

// ==========================================================================
// 3. law §6.6 — the Ledger is history, and it is SILENT
// ==========================================================================

test('the ledger renders the buffered events newest first, with a mono clock and a severity dot', () => {
  // Exactly the shape pushLedgerLine writes: newest first (it unshifts), kind + text + sim time.
  const buffer = [
    { kind: 'bad', text: 'Gas pocket breached — hull damaged.', t: 125.4 },
    { kind: 'good', text: '+2 Iron ore extracted.', t: 61 },
    { kind: 'warn', text: 'Hold full.', t: 5 },
    { kind: 'info', text: 'Survey resolved 3 contacts.', t: 0 },
    { kind: 'good', text: '', t: 9 },
  ];
  const rows = ledgerDrawerRows(buffer);
  assert.equal(rows.length, 4, 'a textless entry is not a row');
  assert.deepEqual(rows.map((r) => r.text), buffer.slice(0, 4).map((e) => e.text), 'order is preserved: newest first');
  assert.deepEqual(rows.map((r) => r.clock), ['02:05', '01:01', '00:05', '00:00']);
  assert.deepEqual(rows.map((r) => r.tone), ['coral', 'mint', 'gold', 'ink'],
    'severity is carried by a colour, not by an added word');
  for (const row of rows) {
    assert.ok(!/\bERROR\b|\bWARNING\b/i.test(row.text), 'the ledger adds no prose to the event text');
  }
  assert.deepEqual(ledgerDrawerRows(null), []);
  assert.deepEqual(ledgerDrawerRows(undefined), []);

  assert.equal(drawerClock(0), '00:00');
  assert.equal(drawerClock(-40), '00:00', 'a negative clock is floored, never rendered as "-1:-40"');
  assert.equal(drawerClock(3599), '59:59');
  assert.equal(drawerClock(3600), '60:00');
});

test('the ledger never speaks: nothing on its render path announces', () => {
  const render = slice(SCREEN_SRC, '    function renderLedgerPanel() {', '\n    // ---------- Help');
  assert.ok(!render.includes('announce('), 'law §6.6: the ledger drawer is silent history');
  assert.ok(!render.includes('aria-live'), 'a history feed is not a live region');
  assert.ok(render.includes('ledgerDrawerRows(ledgerBuffer)'),
    'the drawer is fed by the ledgerBuffer that .01 left with nine writers and no reader');
  assert.ok(render.includes('aw-ledger-clock') && render.includes('aw-dot'),
    'clock + severity dot, per law §6.6');
});

// ==========================================================================
// 4. law §6.6 / §2.5 — closed is display:none, and the affordance costs no words
// ==========================================================================

test('the drawer is born hidden and every session boundary forces it shut', () => {
  assert.deepEqual([...DRAWER_TABS], ['ledger', 'site', 'help']);

  const build = slice(SCREEN_SRC, "    const drawer = document.createElement('section');", '\n    const setNodeText');
  assert.match(build, /drawer\.hidden = true;/, 'the sheet starts closed, before any style runs');

  // Law §2.5 counts the DEFAULT drive view: a session must never inherit an open sheet.
  const start = slice(SCREEN_SRC, '    const startSession = () => {', '\n    const stopSession');
  assert.match(start, /forceCloseDrawer\(\);/, 'a new session starts in the default view');
  const stop = slice(SCREEN_SRC, '    const stopSession = () => {', '\n    function exit(');
  assert.match(stop, /forceCloseDrawer\(\);/, 'the sheet and its close timer die with the session');
  assert.match(stop, /document\.removeEventListener\('mousedown', onDocMouseDown, true\)/,
    'the outside-click listener is released with the session');

  const force = slice(SCREEN_SRC, '    function forceCloseDrawer() {', '\n    // Tab walks');
  assert.match(force, /clearTimeout\(drawerCloseTimer\)/, 'no ease-out timer survives into the next session');
  assert.match(force, /drawer\.hidden = true;/);
});

test('closed means display:none, not merely translated off-screen', () => {
  // A translated sheet still owns client rects, so check-asteroid-theater.mjs would count every
  // word in it against the law §2.5 budget. `!important` is required for the same reason
  // .aw-lens[hidden] needs it: a class rule with `display:flex` outranks the UA [hidden] rule.
  assert.match(CSS_SRC, /\.aw-drawer\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/);
  assert.match(CSS_SRC, /\.aw-drawer-body\s*>\s*\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
    'the two inactive tab panels are display:none too, not just visually behind');
  const sheet = slice(CSS_SRC, '.aw-drawer {', '\n.aw-drawer[hidden]');
  assert.match(sheet, /max-height:\s*280px;/, 'law §6.6 caps the sheet at 280px');
  assert.match(sheet, /bottom:\s*0;/, 'law §6.6: the bottom edge, never the middle of the board');
  assert.match(sheet, /border-radius:\s*10px 10px 0 0;/, 'law §3.4 r10 on the top corners');
  assert.match(sheet, /background:\s*var\(--aw-surface\);/, 'law §3.2 token, no literal');
  assert.match(sheet, /transition:\s*transform 200ms/, 'law §6.6 200ms ease');
  assert.match(CSS_SRC, /\.aw-drawer-grab\s*\{/, 'law §6.6 grabber handle');
});

test('the crest affordance is one icon and no visible word', () => {
  const crest = slice(SCREEN_SRC, "    const drawerBtn = document.createElement('button');", '\n    crestRight.append(');
  assert.match(crest, /setAttribute\('aria-label',/, 'the icon is named for assistive tech');
  assert.match(crest, /aria-expanded/, 'and reports whether the sheet is open');
  assert.ok(!/textContent\s*=/.test(crest), 'law §2.5: the affordance spends zero words');
  assert.match(crest, /<svg /, 'inline SVG on currentColor — a background-image glyph is stripped in forced colors');
  assert.match(crest, /stroke="currentColor"/);
  assert.match(CSS_SRC, /@media \(forced-colors: active\)[\s\S]*\.aw-drawer-key svg \{ stroke: CanvasText; \}/);
});

test('Tab and Escape belong to the drawers, and Tab is swallowed', () => {
  const keys = slice(SCREEN_SRC, '    const onKeyDown = (event) => {', 'routeAsteroidScreenKeyDown({ controller, event, exit });');
  const tab = slice(keys, "if (event.code === 'Tab') {", '      }');
  assert.match(tab, /event\.preventDefault\(\);/,
    'a live Tab would walk focus off the canvas onto a drawer control and steal the next drive key');
  assert.match(tab, /event\.stopImmediatePropagation\(\);/);
  assert.match(tab, /cycleDrawer\(event\.shiftKey \? -1 : 1\)/);

  const esc = slice(keys, "if (event.code === 'Escape' && drawerTab !== null) {", '      }');
  assert.match(esc, /closeDrawer\(\);/, 'Escape closes the sheet, not the session, while one is open');
  assert.match(esc, /event\.stopImmediatePropagation\(\);/,
    'so routeAsteroidScreenKeyDown never sees it and never calls exit()');
  assert.match(keys, /if \(drawerTab !== null && drawer\.contains\(event\.target\)\) return;/,
    'while focus is inside the sheet the rig keys belong to the sheet');

  // The outside click must treat the affordance as INSIDE, or the button toggles itself dead.
  const outside = slice(SCREEN_SRC, '    const onDocMouseDown = (ev) => {', '\n    // ---------- law §9');
  assert.match(outside, /drawerBtn\.contains\(target\)/);
  assert.match(outside, /closeDrawer\(\);/);
});

test('an open drawer stands the lens down and re-reads on a slow cadence', () => {
  const arm = slice(SCREEN_SRC, '    function armLens(delayS) {', '\n    function hideLens');
  assert.match(arm, /if \(drawerTab !== null\) return;/, 'law §6.6: the lens hides while a drawer is open');
  const open = slice(SCREEN_SRC, '    function openDrawer(tab) {', '\n    function closeDrawer');
  assert.match(open, /hideLens\(\);/);
  const frame = slice(SCREEN_SRC, '    function frame(now) {', '\n    // ---------- lifecycle');
  assert.match(frame, /if \(drawerTab !== null && drawerElapsed >= 0\.5\) refreshDrawer\(\);/,
    'content refreshes on a slow bookkeeping cadence, off the screen clock');
});

// ==========================================================================
// 5. law §9 — a producing site opens at site zoom and drops on the first input
// ==========================================================================

test('site zoom is armed only where there is status to read, and released by the first work input', () => {
  const arm = slice(SCREEN_SRC, '    function armSiteZoom() {', '\n    function releaseSiteZoom');
  assert.match(arm, /if \(!s \|\| !s\.machines\.length\) return;/,
    'a virgin rock never changes register, so nothing flickers where nothing is running');
  assert.match(arm, /renderer3d\.setZoomRegister\('site'\)/);

  const release = slice(SCREEN_SRC, '    function releaseSiteZoom(toWork) {', '\n\n    // ---------- crest alert');
  assert.match(release, /if \(!siteZoomHold\) return;/, 'the release is a one-shot');
  assert.match(release, /if \(toWork && renderer3d\) renderer3d\.setZoomRegister\('work'\)/);

  // Armed immediately after begin(), which resets the register to work.
  const start = slice(SCREEN_SRC, '      renderer3d.begin({ motionReduce });', '\n      last = performance.now();');
  assert.match(start, /armSiteZoom\(\);/);

  // Released to WORK by a drive/build key or a board pointer-down; Z and the wheel hand the
  // register to the player instead of forcing it back.
  const keys = slice(SCREEN_SRC, '    const onKeyDown = (event) => {', 'routeAsteroidScreenKeyDown({ controller, event, exit });');
  assert.match(keys, /if \(event\.code === 'KeyZ' \|\| event\.code === 'Escape'\) releaseSiteZoom\(false\);\s*\n\s*else releaseSiteZoom\(true\);/);
  const down = slice(SCREEN_SRC, '    const onMouseDown = (ev) => {', '\n    const onMouseUp');
  assert.match(down, /releaseSiteZoom\(true\);/, 'pointer-down on the board is the first work input');
  assert.match(down, /if \(consumeDrawerDismissal\(\)\) return;/,
    'the click that dismissed a sheet must not also place a machine under it');
  const menu = slice(SCREEN_SRC, '    const onContextMenu = (ev) => {', '\n    // Two zoom registers');
  assert.match(menu, /if \(consumeDrawerDismissal\(\)\) \{ ev\.preventDefault\(\); return; \}/,
    'nor dismantle one — the dismissal is consumed exactly once, by whichever handler runs');
  const wheel = slice(SCREEN_SRC, '    const onWheel = (ev) => {', '\n    const onKeyDown');
  assert.match(wheel, /releaseSiteZoom\(false\);/);
});

// ==========================================================================
// 6. law §6.6 Help + §3.3 voice
// ==========================================================================

test('Help teaches the keys once, from the resolved control map', () => {
  const rows = helpDrawerRows({ movementLabel: 'W / A / S / D', scanLabel: 'F' });
  assert.equal(rows[0].keys, 'W / A / S / D', 'movement comes from the live bindings, not a literal');
  assert.equal(rows[1].keys, 'F');
  const labels = rows.map((r) => r.label);
  assert.ok(labels.includes('Drawers'));
  assert.ok(labels.includes('Leave the rock'));
  assert.ok(labels.includes('Build mode'));
  for (const row of rows) {
    assert.equal(row.label, row.label.charAt(0).toUpperCase() + row.label.slice(1),
      'law §3.3 sentence case');
    assert.ok(row.label === row.label.toUpperCase() ? false : true, 'no shouting');
  }
  // Unbound controls fall back rather than printing "UNBOUND" at the player.
  assert.equal(helpDrawerRows(null)[0].keys, 'W / A / S / D');
});

test('mode labels read as words, never as recipe ids', () => {
  assert.equal(machineModeLabel('sr_smelt_iron'), 'Smelt iron');
  assert.equal(machineModeLabel('sr_fab_courier'), 'Assemble courier pod');
  assert.equal(machineModeLabel('feedstock'), 'Feedstock');
  assert.equal(machineModeLabel(null), '');
  assert.ok(!/sr_/.test(machineModeLabel('sr_cast_regocrete')));
});
