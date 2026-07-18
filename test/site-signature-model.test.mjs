// Packet A08 — contract tests for the pure operating-site signature kernel.
//
// NEW CODE, NOT A DEFECT AND NOT A CHARACTERIZATION. No operating-site emission model existed at
// base 7a250289; the first run of this file was red only in the trivial "module does not exist"
// sense (ERR_MODULE_NOT_FOUND on the import below). Nothing shipped was wrong, because nothing
// shipped answered this question at all. Do not read the red→green transition here as a repaired
// defect.
//
// WHICH "signature" this is (three unrelated vocabularies already exist in the tree):
//   • NOT src/systems/ambushSignatures.js — those are encounter TELLS telegraphed before an
//     encounterDirector ambush fires.
//   • NOT src/systems/signatureAdapters.js — those are AUDIO cue signatures (tether.strain etc).
//   • NOT a duplicate of asteroidFormationModel.js `sensorSignature` — that is the DORMANT rock's
//     own loudness (mass + material only). It is the BACKGROUND term this model sits on top of.
//
// WHAT IS ASSERTED: invariants, never magnitudes. The five contributors have no shipped
// relative-loudness data, so every authored weight is expected to be rebalanced at A09. These
// tests are written so that rebalancing cannot falsify them — they pin ordering, monotonicity,
// the A05 irreversibility floor, determinism, and fail-closed behaviour.
//
// Determinism per test/AGENTS.md: pure fixtures, no wall clock, no DOM, no RNG.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSiteSignature,
  SIGNATURE_MODEL_VERSION,
  SIGNATURE_GRID,
  SIGNATURE_WEIGHTS,
  SIGNATURE_GEOLOGY,
  SIGNATURE_CONTACT,
  SIGNATURE_POWER,
  SIGNATURE_MACHINERY,
  SIGNATURE_STATE_LOUDNESS,
  SIGNATURE_TRANSPORT,
  SIGNATURE_MASKING,
} from '../src/systems/siteSignatureModel.js';

// --- fixture helpers ----------------------------------------------------------------------------

/** `n` cleared cells starting at `startRow`, filling rows left-to-right across the grid. */
function clearedRun(n, startRow = 0) {
  const out = [];
  const start = startRow * SIGNATURE_GRID.cols;
  for (let i = 0; i < n; i++) out.push(start + i);
  return out;
}

function contact({ matrix = 0, basalt = 0, gas = 0, ores = {} } = {}) {
  const solid = matrix + basalt + gas + Object.values(ores).reduce((a, b) => a + b, 0);
  return { matrix, basalt, gas, ores, solid, empty: Math.max(0, 8 - solid) };
}

function machine(id, defId, { powerRatio = 1, state = 'running' } = {}) {
  return { id, defId, powerRatio, status: { state, limit: null, ratePerMin: {} } };
}

/** A representative working site: bored geology, live power, running machines, exporting. */
function workingSite(over = {}) {
  return {
    cleared: clearedRun(40),
    contacts: [contact({ matrix: 4, basalt: 2 })],
    power: [{ key: 'p0', gen: 12, draw: 10 }],
    machines: [
      machine('m1', 'sm_massline_core'),
      machine('m2', 'sm_extractor'),
    ],
    transport: { exportRatePerMin: 4, inFlightCount: 1 },
    masking: 0,
    background: 0,
    ...over,
  };
}

function shuffled(arr, step = 3) {
  // Deterministic reordering (no RNG): stride-walk the array.
  const out = [];
  for (let i = 0; i < step; i++) for (let j = i; j < arr.length; j += step) out.push(arr[j]);
  return out;
}

function assertDeepFrozen(value, path = 'record') {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} must be frozen`);
  for (const key of Object.keys(value)) assertDeepFrozen(value[key], `${path}.${key}`);
}

/** Every numeric leaf must be finite and, where it is a rating, inside [0,1]. */
function assertFiniteRecord(rec, label) {
  const walk = (v, path) => {
    if (typeof v === 'number') {
      assert.equal(Number.isFinite(v), true, `${label}: ${path} must be finite, got ${v}`);
      assert.equal(Object.is(v, -0), false, `${label}: ${path} must not be -0`);
      return;
    }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(rec, label);
  for (const k of ['total', 'emitted', 'floor', 'background', 'masking', 'attenuation']) {
    assert.ok(rec[k] >= 0 && rec[k] <= 1, `${label}: ${k} must be in [0,1], got ${rec[k]}`);
  }
  for (const k of Object.keys(rec.sources)) {
    assert.ok(rec.sources[k] >= 0 && rec.sources[k] <= 1,
      `${label}: sources.${k} must be in [0,1], got ${rec.sources[k]}`);
  }
}

const total = (over) => buildSiteSignature(workingSite(over)).total;

// --- module shape -------------------------------------------------------------------------------

test('A08: authored parameters are all named, exported and frozen', () => {
  assert.equal(typeof SIGNATURE_MODEL_VERSION, 'number');
  assert.ok(SIGNATURE_MODEL_VERSION >= 1);
  for (const [name, obj] of Object.entries({
    SIGNATURE_GRID, SIGNATURE_WEIGHTS, SIGNATURE_GEOLOGY, SIGNATURE_CONTACT,
    SIGNATURE_POWER, SIGNATURE_MACHINERY, SIGNATURE_STATE_LOUDNESS,
    SIGNATURE_TRANSPORT, SIGNATURE_MASKING,
  })) {
    assert.equal(Object.isFrozen(obj), true, `${name} must be frozen`);
  }
  // The grid mirrors the drill cross-section so depth attenuation is anchored, not invented.
  assert.equal(SIGNATURE_GRID.cols, 28);
  assert.equal(SIGNATURE_GRID.rows, 45);
});

test('A08: source weights form a partition of unity so no source can saturate the model alone', () => {
  const keys = Object.keys(SIGNATURE_WEIGHTS).sort();
  assert.deepEqual(keys, ['geology', 'machinery', 'power', 'transport']);
  const sum = keys.reduce((a, k) => a + SIGNATURE_WEIGHTS[k], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `weights must sum to 1, got ${sum}`);
  for (const k of keys) assert.ok(SIGNATURE_WEIGHTS[k] > 0, `${k} weight must be positive`);
});

// --- background ordering ------------------------------------------------------------------------

test('A08: an unbuilt, unbored site emits nothing beyond its dormant rock background', () => {
  const bare = buildSiteSignature({ cleared: [], machines: [], power: [], transport: {} });
  assert.equal(bare.total, 0, 'no formation term supplied => exactly 0, no phantom emission');
  assert.equal(bare.sources.geology, 0);
  assert.equal(bare.sources.power, 0);
  assert.equal(bare.sources.machinery, 0);
  assert.equal(bare.sources.transport, 0);

  // A01 hands us the dormant rock's own sensorSignature; an untouched site collapses to exactly it.
  const dormant = buildSiteSignature({ background: 0.45, cleared: [], machines: [] });
  assert.equal(dormant.total, 0.45);
  assert.equal(dormant.emitted, 0);
});

test('A08: an operating site never reads below the untouched rock it sits in', () => {
  for (const background of [0, 0.1, 0.45, 0.85, 1]) {
    for (const masking of [0, 0.5, 1]) {
      const rec = buildSiteSignature(workingSite({ background, masking }));
      assert.ok(rec.total >= rec.background - 1e-9,
        `total ${rec.total} must not fall below background ${rec.background} (masking ${masking})`);
    }
  }
});

// --- monotonicity, one channel at a time ---------------------------------------------------------
// Each test varies exactly ONE snapshot channel. Fixtures are spaced widely so the gradient
// survives the record's 4dp rounding — a one-cell step could legitimately round flat.

test('A08: signature is strictly increasing in exposed geology', () => {
  const a = total({ cleared: clearedRun(5) });
  const b = total({ cleared: clearedRun(60) });
  const c = total({ cleared: clearedRun(220) });
  assert.ok(a < b, `5 cells (${a}) must read quieter than 60 (${b})`);
  assert.ok(b < c, `60 cells (${b}) must read quieter than 220 (${c})`);
});

test('A08: depth attenuates — a surface bore vents louder than the same bore run deep', () => {
  const surface = total({ cleared: clearedRun(40, 0) });
  const deep = total({ cleared: clearedRun(40, SIGNATURE_GRID.rows - 2) });
  assert.ok(surface > deep,
    `a bore at row 0 (${surface}) must read louder than the same cell count at depth (${deep})`);
});

test('A08: a breached gas pocket and a live ore face read louder than inert silicate', () => {
  const matrix = total({ contacts: [contact({ matrix: 6 })] });
  const basalt = total({ contacts: [contact({ basalt: 6 })] });
  const ore = total({ contacts: [contact({ ores: { cmdty_ore_iron: 6 } })] });
  const gas = total({ contacts: [contact({ gas: 6 })] });
  assert.ok(gas > ore, `gas (${gas}) must read louder than ore (${ore})`);
  assert.ok(ore > matrix, `ore (${ore}) must read louder than silicate matrix (${matrix})`);
  assert.ok(matrix > basalt, `matrix (${matrix}) must read louder than dense basalt (${basalt})`);
  assert.ok(basalt > total({ contacts: [] }), 'any solid contact must read louder than none');
});

test('A08: signature is strictly increasing in power, on both the generation and draw channels', () => {
  const quiet = total({ power: [{ key: 'p0', gen: 0, draw: 0 }] });
  const gen = total({ power: [{ key: 'p0', gen: 40, draw: 0 }] });
  const draw = total({ power: [{ key: 'p0', gen: 0, draw: 40 }] });
  assert.ok(gen > quiet, `generating 40MW (${gen}) must read louder than a dead network (${quiet})`);
  assert.ok(draw > quiet, `drawing 40MW (${draw}) must read louder than a dead network (${quiet})`);
  assert.ok(total({ power: [{ key: 'p0', gen: 80, draw: 0 }] }) > gen, 'more generation is louder');
});

test('A08: signature is strictly increasing in running machinery', () => {
  const one = total({ machines: [machine('m1', 'sm_extractor')] });
  const three = total({
    machines: [
      machine('m1', 'sm_extractor'),
      machine('m2', 'sm_refinery'),
      machine('m3', 'sm_fabricator'),
    ],
  });
  assert.ok(one < three, `one running machine (${one}) must read quieter than three (${three})`);
  assert.ok(total({ machines: [] }) < one, 'an empty bore must read quieter than a working one');
});

test('A08: signature is strictly increasing in transport activity', () => {
  const idle = total({ transport: { exportRatePerMin: 0, inFlightCount: 0 } });
  const hauling = total({ transport: { exportRatePerMin: 12, inFlightCount: 0 } });
  const flying = total({ transport: { exportRatePerMin: 0, inFlightCount: 4 } });
  assert.ok(hauling > idle, `a site pushing goods (${hauling}) must beat a stockpiling one (${idle})`);
  assert.ok(flying > idle, `couriers in flight (${flying}) must beat a silent site (${idle})`);
});

test('A08: signature is non-increasing in masking, and strictly decreasing while there is band to cut', () => {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const values = steps.map((masking) => total({ masking }));
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] <= values[i - 1] + 1e-9,
      `masking ${steps[i]} (${values[i]}) must not exceed masking ${steps[i - 1]} (${values[i - 1]})`);
  }
  assert.ok(values[values.length - 1] < values[0], 'full masking must strictly beat none');
});

// --- the A05 exception: exposure is irreversible, so it is a floor -------------------------------

test('A08: EXCEPTION — masking cannot silence exposed geology, because hollowing is irreversible', () => {
  // The law: design/ASTEROID_SITES_BRIEF.md §1 via test/asteroid-contact-ring-law.test.mjs —
  // hollowing permanently removes contact, and drill.js:441 exempts site rocks from
  // recoverClearedGeometry so a bore never heals. A cut you cannot take back is a tell you
  // cannot take back. This is the ONLY sanctioned break in the masking monotonicity above.
  const bored = buildSiteSignature(workingSite({ cleared: clearedRun(120), masking: 1 }));
  assert.ok(bored.total > 0, 'a fully masked but hollowed site must still read above zero');
  assert.ok(bored.floor > 0, 'the unmaskable floor must be positive when geology is exposed');
  assert.ok(bored.emitted >= bored.floor - 1e-9, 'emission may never fall through its own floor');

  // ...and the floor scales with how much rock was removed.
  const small = buildSiteSignature(workingSite({ cleared: clearedRun(10), masking: 1 }));
  const large = buildSiteSignature(workingSite({ cleared: clearedRun(300), masking: 1 }));
  assert.ok(large.floor > small.floor,
    `a bigger bore must raise the unmaskable floor (${small.floor} -> ${large.floor})`);
  assert.ok(large.total > small.total, 'and therefore raise the fully-masked signature too');

  // A site that never broke ground has no floor to stand on — masking works fully there.
  const pristine = buildSiteSignature(workingSite({ cleared: [], contacts: [], masking: 1 }));
  assert.equal(pristine.floor, 0, 'no exposure => no irreversibility floor');
});

test('A08: an unpowered machine set does not read as a running one', () => {
  const machines = [machine('m1', 'sm_extractor'), machine('m2', 'sm_refinery')];
  const running = buildSiteSignature(workingSite({
    machines: machines.map((m) => ({ ...m, powerRatio: 1 })),
  }));
  const dead = buildSiteSignature(workingSite({
    machines: machines.map((m) => ({ ...m, powerRatio: 0, status: { state: 'no-power' } })),
  }));
  assert.notEqual(running.total, dead.total, 'identical hardware must not read identically when dead');
  assert.ok(running.total > dead.total, `running (${running.total}) must beat no-power (${dead.total})`);
  assert.ok(dead.sources.machinery > 0, 'installed hardware is still a physical object, not vacuum');

  // The two counterplay channels A09 needs, each isolated so neither can mask a gap in the other.
  // (a) run STATE alone, holding powerRatio fixed at 1.
  const idleState = total({ machines: [machine('m1', 'sm_extractor', { state: 'idle', powerRatio: 1 })] });
  const liveState = total({ machines: [machine('m1', 'sm_extractor', { state: 'running', powerRatio: 1 })] });
  assert.ok(liveState > idleState,
    `state running (${liveState}) must read louder than state idle (${idleState}) at equal power`);

  // (b) powerRATIO alone, holding the reported state fixed at 'running'. The packet names this
  //     case explicitly: identical machine set, powerRatio 0 vs 1, must differ strictly.
  const starved = total({ machines: [machine('m1', 'sm_extractor', { state: 'running', powerRatio: 0 })] });
  const fed = total({ machines: [machine('m1', 'sm_extractor', { state: 'running', powerRatio: 1 })] });
  assert.ok(fed > starved,
    `powerRatio 1 (${fed}) must read louder than powerRatio 0 (${starved}) at equal reported state`);
  const half = total({ machines: [machine('m1', 'sm_extractor', { state: 'running', powerRatio: 0.5 })] });
  assert.ok(half > starved && half < fed, 'and the power ratio gradient is continuous between them');
});

// --- deterministic aggregation --------------------------------------------------------------------

test('A08: aggregation is order independent across every input list', () => {
  const base = workingSite({
    cleared: clearedRun(80),
    contacts: [
      contact({ matrix: 3, ores: { cmdty_ore_iron: 1, cmdty_ore_copper: 2 } }),
      contact({ basalt: 2, gas: 1 }),
    ],
    power: [{ key: 'p0', gen: 12, draw: 6 }, { key: 'p1', gen: 8, draw: 10 }],
    machines: [
      machine('m1', 'sm_massline_core'),
      machine('m2', 'sm_extractor'),
      machine('m3', 'sm_refinery', { state: 'throttled' }),
      machine('m4', 'sm_cargo_port'),
      machine('m5', 'sm_gas_tap'),
    ],
  });
  const expected = buildSiteSignature(base);

  const reordered = {
    ...base,
    cleared: shuffled(base.cleared, 7),
    contacts: [
      // same counts, ore keys inserted in the opposite order
      { ...base.contacts[1] },
      { ...base.contacts[0], ores: { cmdty_ore_copper: 2, cmdty_ore_iron: 1 } },
    ],
    power: [base.power[1], base.power[0]],
    machines: shuffled(base.machines, 2),
  };
  assert.deepStrictEqual(buildSiteSignature(reordered), expected,
    'shuffling machines, cleared cells, contact ore keys and power networks must be byte-identical');
});

test('A08: repeated calls on the same input are identical, and the record is deeply frozen', () => {
  const snap = workingSite();
  const a = buildSiteSignature(snap);
  const b = buildSiteSignature(snap);
  assert.deepStrictEqual(a, b);
  assertDeepFrozen(a);
  assert.equal(a.version, SIGNATURE_MODEL_VERSION);
});

test('A08: float aggregation is stable under regrouping, to the declared precision', () => {
  // Same logical site, contributions grouped differently. What this pins is that the model reads
  // TOTALS, not per-network structure — three small networks and one big one describe the same
  // site and must read the same. (It does NOT pin stableSum's sort: with only non-negative terms
  // the accumulation-order spread is ~1e-18, far under the 1e-4 the record rounds to. See the
  // honest note on stableSum in the kernel.)
  const single = buildSiteSignature(workingSite({ power: [{ key: 'p0', gen: 0.3, draw: 0.6 }] }));
  const split = buildSiteSignature(workingSite({
    power: [
      { key: 'a', gen: 0.1, draw: 0.2 },
      { key: 'b', gen: 0.2, draw: 0.1 },
      { key: 'c', gen: 0, draw: 0.3 },
    ],
  }));
  assert.equal(split.total, single.total, 'regrouped power must agree at the model precision');

  const oneList = buildSiteSignature(workingSite({ cleared: clearedRun(30) }));
  const twoLists = buildSiteSignature(workingSite({
    cleared: [...clearedRun(30).slice(15), ...clearedRun(30).slice(0, 15)],
  }));
  assert.equal(twoLists.total, oneList.total);
});

// --- degenerate and adversarial input ------------------------------------------------------------

test('A08: degenerate snapshots fail closed instead of throwing or leaking NaN', () => {
  const cases = {
    null: null,
    undefined: undefined,
    number: 42,
    string: 'site',
    emptyObject: {},
    emptyLists: { cleared: [], contacts: [], power: [], machines: [], transport: {} },
    wrongTypes: {
      cleared: 'nope', contacts: 7, power: 'x', machines: {}, transport: [], masking: {}, background: [],
    },
    unknownDefIds: { machines: [machine('m1', 'sm_not_a_machine'), machine('m2', null)] },
    duplicateIds: {
      machines: [machine('m1', 'sm_extractor'), machine('m1', 'sm_extractor'), machine('m1', 'sm_refinery')],
    },
    outOfRangeCells: {
      cleared: [-1, -0, 0, SIGNATURE_GRID.cols * SIGNATURE_GRID.rows, 1e9, NaN, Infinity, 'x', null],
    },
    negativePower: { power: [{ key: 'p', gen: -50, draw: -50 }] },
    nanEverywhere: {
      cleared: [NaN, Infinity, -Infinity],
      contacts: [{ matrix: NaN, basalt: Infinity, gas: -Infinity, ores: { o: NaN }, solid: NaN }],
      power: [{ key: 'p', gen: NaN, draw: Infinity }],
      machines: [{ id: 'm', defId: 'sm_extractor', powerRatio: NaN, status: { state: 42 } }],
      transport: { exportRatePerMin: NaN, inFlightCount: -Infinity },
      masking: NaN,
      background: NaN,
    },
    negativeZero: {
      power: [{ key: 'p', gen: -0, draw: -0 }],
      transport: { exportRatePerMin: -0, inFlightCount: -0 },
      masking: -0,
      background: -0,
    },
    maskingBelowZero: workingSite({ masking: -1 }),
    maskingAboveOne: workingSite({ masking: 2 }),
    maskingNaN: workingSite({ masking: NaN }),
    hugeGrid: { grid: { cols: 0, rows: -5 }, cleared: [0, 1, 2] },
  };
  for (const [label, snap] of Object.entries(cases)) {
    const rec = buildSiteSignature(snap);
    assertFiniteRecord(rec, label);
    assert.equal(rec.version, SIGNATURE_MODEL_VERSION, `${label}: version must survive`);
  }

  // Masking clamps rather than inverting: out-of-band masking behaves as its nearest legal value.
  assert.equal(total({ masking: -1 }), total({ masking: 0 }));
  assert.equal(total({ masking: 2 }), total({ masking: 1 }));
  assert.equal(total({ masking: NaN }), total({ masking: 0 }),
    'unreadable masking must not grant free stealth');
});

test('A08: finite-but-enormous inputs stay finite (the 5c1d9c0c overflow lesson)', () => {
  // A01 shipped an r4() that checked Number.isFinite on the INPUT then scaled by 1e4, so finite
  // inputs above ~1.8e304 returned Infinity from a function documented to return finite values.
  // Its degenerate test capped at 1e12 — 292 orders of magnitude short. Cover the real range.
  const magnitudes = [1e12, 1e300, 1e305, Number.MAX_VALUE, -1e305, -Number.MAX_VALUE];
  for (const v of magnitudes) {
    const rec = buildSiteSignature({
      cleared: [0, 1, 2],
      contacts: [{ matrix: v, basalt: v, gas: v, ores: { o: v }, solid: v }],
      power: [{ key: 'p', gen: v, draw: v }],
      machines: [{ id: 'm', defId: 'sm_extractor', powerRatio: v }],
      transport: { exportRatePerMin: v, inFlightCount: v },
      masking: v,
      background: v,
    });
    assertFiniteRecord(rec, `magnitude ${v}`);
  }
});

test('A08: the kernel is pure — it mutates nothing the caller handed it', () => {
  const snap = workingSite({
    cleared: clearedRun(40),
    contacts: [contact({ matrix: 3, gas: 1, ores: { cmdty_ore_iron: 2 } })],
    power: [{ key: 'p0', gen: 12, draw: 6 }, { key: 'p1', gen: 0, draw: 4 }],
    machines: [machine('m1', 'sm_massline_core'), machine('m2', 'sm_extractor')],
    background: 0.3,
    masking: 0.4,
  });
  const before = structuredClone(snap);
  buildSiteSignature(snap);
  assert.deepStrictEqual(snap, before, 'the caller snapshot must be untouched');
});

test('A08: the record reports the detail A09 needs to attribute a reading to a cause', () => {
  const rec = buildSiteSignature(workingSite({
    cleared: clearedRun(40),
    power: [{ key: 'p0', gen: 12, draw: 10 }],
    transport: { exportRatePerMin: 4, inFlightCount: 1 },
  }));
  assert.equal(rec.detail.exposedCells, 40);
  assert.equal(rec.detail.powerGenMW, 12);
  assert.equal(rec.detail.powerDrawMW, 10);
  assert.equal(rec.detail.machineCount, 2);
  assert.equal(rec.detail.exportRatePerMin, 4);
  assert.equal(rec.detail.inFlightCount, 1);
  // Duplicate cells are counted once — the bore is a set, not a log.
  const deduped = buildSiteSignature({ cleared: [5, 5, 5, 6] });
  assert.equal(deduped.detail.exposedCells, 2);
});
