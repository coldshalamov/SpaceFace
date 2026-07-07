#!/usr/bin/env node
// T8g backend gate: War Overlay.
//
// Proves the territory-war readout is backed by shipped systems: sectorSim injects offscreen
// contested pressure through factions, factions remains the conflict/sector-owner writer, and the
// starmap reads the shared sectorSignalFor contract for owner, influence, and contest display.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FACTION_META } from '../src/data/factions.js';
import { SECTORS } from '../src/data/sectors.js';
import { factions as factionsBase } from '../src/systems/factions.js';
import { sectorSim as sectorSimBase, sectorSignalFor } from '../src/systems/sectorSim.js';

const STARMAP_SOURCE = readFileSync(new URL('../src/ui/screens/starmap.js', import.meta.url), 'utf8');
const PAIR_KEY = 'faction_reach:faction_scn';
const CONTESTED_SECTOR = 'sector_helios_prime';

assert.equal(typeof window, 'undefined', 'this check must run headless');

withDeterminismGuard(() => {
  testFactionsOwnWarStateAndTerritoryFlip();
  testSectorSimInjectsOnlyThroughFactionApi();
  testStarmapWarOverlayReadsSectorSignal();
});

console.log('PASS  check:war-overlay');

function testFactionsOwnWarStateAndTerritoryFlip() {
  const h = makeFactionHarness();
  h.state.world.sectors[CONTESTED_SECTOR].owner = 'faction_reach';

  h.sys.addOffscreenTension(PAIR_KEY, 76, 'check_sector_field');
  const conflict = h.state.conflicts[PAIR_KEY];
  assert.ok(conflict, 'offscreen tension creates a conflict ledger row');
  assert.equal(conflict.state, 'war', 'offscreen tension crosses the real war threshold');
  assert.equal(conflict.playerLean, 0, 'offscreen tension does not credit the player');
  assert.equal(h.sys.contestedSectorFor(PAIR_KEY), CONTESTED_SECTOR,
    'factions exposes the private contested sector allowlist through its sanctioned API');
  assert.equal(h.events.some((e) =>
    e.event === 'conflict:warDeclared' &&
    e.payload.pairKey === PAIR_KEY &&
    e.payload.sides.includes('faction_reach') &&
    e.payload.sides.includes('faction_scn')), true,
  'war declaration event is emitted from factions');

  conflict.playerLean = 1;
  conflict.momentum = 90;
  h.sys._onDayTick(1);

  assert.equal(h.state.world.sectors[CONTESTED_SECTOR].owner, 'faction_scn',
    'war resolution writes the contested sector owner through factions');
  assert.equal(conflict.tension, 50, 'resolved wars reset to the tense threshold band');
  assert.equal(conflict.momentum, 0, 'resolved wars clear accumulated momentum');
  assert.equal(h.events.some((e) =>
    e.event === 'conflict:flip' &&
    e.payload.pairKey === PAIR_KEY &&
    e.payload.sectorId === CONTESTED_SECTOR &&
    e.payload.newOwner === 'faction_scn'), true,
  'territory flips emit a conflict:flip receipt');

  const signal = sectorSignalFor(h.state, CONTESTED_SECTOR);
  assert.equal(signal.ownerId, 'faction_scn',
    'sectorSignalFor reads the runtime owner written by factions');
}

function testSectorSimInjectsOnlyThroughFactionApi() {
  const calls = [];
  const state = makeBaseState();
  state.world.sectors[CONTESTED_SECTOR].owner = 'faction_scn';
  state.sectorSim = {
    sectors: {},
    impulses: [],
    meta: { rngSeed: 0, lastTickSimT: 0, lastWallT: 0, nextImpulseSeq: 1 },
    field: {
      version: 1,
      epochDays: 0,
      nodes: {
        [CONTESTED_SECTOR]: {
          danger: 0.72,
          pricePressure: 0,
          influence: { faction_reach: 0.49, faction_scn: 0.48, faction_dmc: 0.03 },
          dominantFactionId: 'faction_reach',
          dominantInfluence: 0.49,
          contestMargin: 0.01,
          trend: { danger: 0, pricePressure: 0, influence: 0.06 },
          driver: {
            danger: 'structural_baseline',
            pricePressure: 'market_balance',
            influence: 'contested_influence',
          },
        },
      },
    },
  };

  const registry = {
    get(name) {
      if (name !== 'factions') return null;
      return {
        contestedSectorFor(pairKey) {
          return pairKey === PAIR_KEY ? CONTESTED_SECTOR : null;
        },
        addOffscreenTension(pairKey, delta, reason) {
          calls.push({ pairKey, delta, reason });
        },
      };
    },
  };

  const sys = { ...sectorSimBase };
  sys.init({ state, bus: makeBus([]), helpers: {}, registry });
  sys._injectConflictTension(2);

  assert.deepEqual(state.conflicts, {}, 'sectorSim does not write conflict state directly');
  assert.equal(calls.length, 1, 'only the contested pair exposed by factions receives tension');
  assert.equal(calls[0].pairKey, PAIR_KEY);
  assert.equal(calls[0].reason, 'sector_field');
  assert.ok(calls[0].delta > 6 && calls[0].delta < 8,
    'offscreen tension includes danger, contest parity, and elapsed days');

  const signal = sys.signal(CONTESTED_SECTOR);
  assert.equal(signal.ownerId, 'faction_scn', 'sectorSignalFor preserves runtime owner');
  assert.equal(signal.dominantFactionId, 'faction_reach',
    'sectorSignalFor keeps modeled dominant influence separate from runtime owner');
  assert.equal(signal.driver.influence, 'contested_influence',
    'war overlay receives the contested influence driver from the field');
}

function testStarmapWarOverlayReadsSectorSignal() {
  const checks = [
    [/import \{[\s\S]*sectorSignalFor,[\s\S]*forecastTransitFor,[\s\S]*\} from '..\/..\/systems\/sectorSim\.js';/,
      'starmap imports the shared sector signal contract'],
    [/const DRIVER_LABEL = Object\.freeze\(\{[\s\S]*contested_influence: 'contested influence'[\s\S]*territorial_shift: 'territorial shift'[\s\S]*territory_flip: 'resolved territory flip'/,
      'war and influence drivers have player-facing labels'],
    [/signal && signal\.contestMargin < 0\.16[\s\S]*rgba\(192,139,255,\.78\)/,
      'canvas marks contested low-margin sectors'],
    [/const dominant = signal && signal\.dominantFactionId \|\| s\.factionId;[\s\S]*const core = factionColor\(dominant\);/,
      'node color follows modeled dominant influence'],
    [/factionName\(signal\.dominantFactionId\)\} influence \$\{pct\(signal\.dominantInfluence\)\}/,
      'tooltip reports dominant influence percentage'],
    [/Object\.entries\(signal\.influence \|\| \{\}\)[\s\S]*sm-influence-row[\s\S]*sm-bar/,
      'sidebar renders sorted influence bars from sectorSignalFor'],
    [/factionColor\(signal\.ownerId\)[\s\S]*owner \$\{escapeHtml\(factionName\(signal\.ownerId\)\)\}/,
      'sidebar displays runtime owner separately from dominant influence'],
    [/Driven by \$\{escapeHtml\(driverLabel\(signal\.driver\.influence\)\)\}\. Low margin raises conflict tension; the factions system remains the territory owner\./,
      'sidebar explains the conflict tension boundary and single writer'],
  ];
  for (const [pattern, label] of checks) {
    if (!pattern.test(STARMAP_SOURCE)) throw new Error(`starmap war-overlay source contract failed: ${label}`);
  }
}

function makeFactionHarness() {
  const state = makeBaseState();
  const events = [];
  const bus = makeBus(events);
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: { queryRadius: () => [] } });
  sys.newGame();
  return { state, events, bus, sys };
}

function makeBaseState() {
  const factions = {};
  for (const f of FACTION_META) {
    factions[f.id] = {
      rep: f.startingRep || 0,
      tier: 'Neutral',
      aggro: false,
      bribesPaid: 0,
      lastDelta: { value: 0, reason: 'init', t: 0 },
      knownContrabandStrikes: 0,
      discoveredHostileBy: 0,
      power: 10,
      powerNonce: 0,
    };
  }
  return {
    simTime: 123,
    meta: { seed: 'check-war-overlay' },
    world: {
      currentSectorId: CONTESTED_SECTOR,
      sectors: Object.fromEntries(SECTORS.map((sector) => [sector.id, { owner: sector.factionId || null }])),
    },
    factions,
    conflicts: {},
    entityList: [],
  };
}

function makeBus(events) {
  const handlers = new Map();
  return {
    on(event, fn) {
      const list = handlers.get(event) || [];
      list.push(fn);
      handlers.set(event, list);
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

function withDeterminismGuard(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random is forbidden in check:war-overlay'); };
  Date.now = () => { throw new Error('Date.now is forbidden in check:war-overlay'); };
  try {
    fn();
  } finally {
    Math.random = random;
    Date.now = now;
  }
}
