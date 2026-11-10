// PQ-207.00 equivalence harness (scratch): the refactored ledger must return byte-identical pages
// for the same state, and the presence probe must agree with the old page-0 window wherever the
// two questions coincide. Deleted after the receipt.
import { buildShipLedger as newBuild, shipLedgerHasFactOutside } from './src/systems/shipLedger.js';
import { buildShipLedger as oldBuild } from './src/systems/scratch-old-shipLedger.mjs';
import { defaultLivingHull, livingHullWithScar, livingHullWithRenown } from './src/core/livingHull.js';

const HULL_TYPES = new Set(['scar', 'patch']);
const PAGE = { page: 0, pageSize: 24 };

function scar(band, facing, tick) {
  return { cause: 'weapon', surface: 'weapon', band, facing, atT: tick, tick, id: `weapon:${tick}:${facing}` };
}

function tradeRows(n, dupEvery = 0) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      side: i % 2 ? 'sell' : 'buy',
      commodityId: 'iron_ore',
      stationId: 'station_helios',
      qty: 4 + (i % 7),
      total: 1200 + i * 13,
      seenAt: 600 + i * 30,
    });
    if (dupEvery && i % dupEvery === 0) rows.push({ ...rows[rows.length - 1] });
  }
  return rows;
}

function lossRows(n) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      lossId: `loss:ship_wasp:${i}`,
      source: 'combat',
      assetId: 'ship_wasp',
      shipDefId: 'ship_wasp',
      sectorId: 'sector_helios_prime',
      cargoHint: 'ore',
      t: 100 + i * 40,
      killedByPlayer: i % 3 === 0,
    });
  }
  return rows;
}

function richState(overrides = {}) {
  let hull = defaultLivingHull(0);
  hull = livingHullWithScar(hull, scar('hard', 'bow', 12), 12);
  hull = livingHullWithScar(hull, scar('graze', 'stern', 40), 40);
  hull = livingHullWithRenown(hull, { id: 'r1', act: 'kill', factionId: 'faction_concord', sectorId: 'sector_helios_prime', atT: 90 }, 90);
  return {
    meta: { seed: 4242 },
    player: {
      credits: 5000,
      heat: 0,
      activeShipIndex: 0,
      tradeLedger: tradeRows(240),
      sessionSinks: [{ id: 'sink:1', kind: 'repair', cause: 'gunfire', at: 700, amount: 420 }],
      uniqueWrecks: {
        bearings: {
          wreck_a: { wreckId: 'wreck_a', heardAtS: 300, fixedAtS: 640, phase: 'fixed', radius: 120, sectorId: 'sector_helios_prime', sourceRef: 'bar' },
          wreck_b: { wreckId: 'wreck_b', heardAtS: 900, phase: 'rumor', sectorId: 'sector_helios_prime' },
        },
      },
      ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: hull }],
    },
    lossLedger: { entries: lossRows(40) },
    story: {
      beatIndex: 4,
      flags: { beat_0_done: true, beat_1_done: true, beat_2_done: true, beat_3_done: true },
      receipts: [{ kind: 'story:beatAdvanced', fromIndex: 3, toIndex: 4, at_s: 40 }],
      recoveredNames: [{ id: 'n1', name: 'Ada Venn', recoveredAt: 1200 }],
      titlesSeen: [{ id: 't1', title: 'Passing Title', seenAt: 800 }],
      titles: { stuntIncidents: [{ id: 'st1', rootId: 'root1', tick: 3000, name: 'Thrown Hull', shipName: 'Kestrel', targetName: 'tower', outcome: 'stuck', visibility: 'witnessed', witnesses: [], chain: [], reports: [], titleIds: [], trickId: 'throw' }] },
      depthProgramEncounters: {
        completed: { depth_h1_distress_from_inside: true },
        history: [{ shapeId: 'depth_h1_distress_from_inside', tick: 200, at: 500, outcome: 'spared' }],
      },
    },
    missions: { receipts: [{ id: 'm1', type: 'tow_recovery', outcome: 'completed', at_s: 60, completionMethod: 'sling_in' }] },
    scenario: { evidence: { events: [{ type: 'tether:attached', tick: 12, simTime: 0.2, targetActorId: 'evidence_spindle_47a' }] } },
    encounterDirector: { escalationSeeds: [{ id: 'e1', cause: 'witness', beat: 'bounty', arrivedAt: 1500, place: { name: 'Ceres' } }] },
    world: {
      vestaOreCache: { recordId: 'rec_v', receipt: { id: 'vesta:1', choiceId: 'kept', outcome: 'recorded', resolvedAt: 1700 } },
    },
    ui: { marketNews: { log: [], lastCard: null } },
    ...overrides,
  };
}

const states = {
  rich: richState(),
  duplicateHeavy: richState({ player: { ...richState().player, tradeLedger: tradeRows(60, 5) } }),
  empty: {},
  noFacts: richState({ player: { ...richState().player, tradeLedger: [], sessionSinks: [], uniqueWrecks: {} }, lossLedger: { entries: [] }, story: {}, missions: {}, scenario: {}, encounterDirector: {}, world: {} }),
  hugeTrades: richState({ player: { ...richState().player, tradeLedger: tradeRows(900) } }),
  capOverflow: richState({ player: { ...richState().player, tradeLedger: tradeRows(700) }, lossLedger: { entries: lossRows(200) } }),
};

let failures = 0;
for (const [name, state] of Object.entries(states)) {
  const before = JSON.stringify(oldBuild(state, PAGE));
  const after = JSON.stringify(newBuild(state, PAGE));
  const same = before === after;
  if (!same) failures += 1;
  const oldWindow = oldBuild(state, PAGE).entries.some((e) => !HULL_TYPES.has(e.type));
  const probe = shipLedgerHasFactOutside(state, HULL_TYPES);
  const fullPage = newBuild(state, PAGE).entries.length;
  console.log(`${name.padEnd(16)} page-identical=${same ? 'yes' : 'NO'}  rows=${String(fullPage).padStart(3)}  oldWindow=${oldWindow}  probe=${probe}  agree=${oldWindow === probe}`);
  if (!same) {
    console.log('  OLD:', before.slice(0, 400));
    console.log('  NEW:', after.slice(0, 400));
  }
}

// Every family in isolation: a state whose only fact is that family must probe true.
const familyStates = {
  lossesOnly: richState({ player: { ...richState().player, tradeLedger: [], sessionSinks: [], uniqueWrecks: {} }, story: {}, missions: {}, scenario: {}, encounterDirector: {}, world: {} }),
  titlesOnly: richState({ player: { ...richState().player, tradeLedger: [], sessionSinks: [], uniqueWrecks: {}, ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: defaultLivingHull(0) }] }, lossLedger: { entries: [] }, story: { titlesSeen: [{ id: 't9', title: 'Only Title', seenAt: 900 }] }, missions: {}, scenario: {}, encounterDirector: {}, world: {} }),
  scarsOnly: richState({ player: { ...richState().player, tradeLedger: [], sessionSinks: [], uniqueWrecks: {} }, lossLedger: { entries: [] }, story: {}, missions: {}, scenario: {}, encounterDirector: {}, world: {} }),
  sinkOnly: richState({ player: { ...richState().player, tradeLedger: [], uniqueWrecks: {} }, lossLedger: { entries: [] }, story: {}, missions: {}, scenario: {}, encounterDirector: {}, world: {} }),
  evidenceOnly: richState({ player: { ...richState().player, tradeLedger: [], sessionSinks: [], uniqueWrecks: {}, ownedShips: [{ defId: 'ship_kestrel', fittings: [], livingHull: defaultLivingHull(0) }] }, lossLedger: { entries: [] }, story: {}, missions: {}, scenario: {}, encounterDirector: {} }),
};
for (const [name, state] of Object.entries(familyStates)) {
  const probe = shipLedgerHasFactOutside(state, HULL_TYPES);
  const full = newBuild(state, PAGE).entries;
  const expected = full.some((e) => !HULL_TYPES.has(e.type));
  if (probe !== expected) failures += 1;
  console.log(`family ${name.padEnd(14)} probe=${probe} pageHasFact=${expected} ${probe === expected ? 'ok' : 'MISMATCH'}`);
}

console.log(failures ? `FAILURES: ${failures}` : 'ALL EQUIVALENT');
