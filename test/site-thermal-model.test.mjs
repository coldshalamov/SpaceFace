// A06 — "Thermal model derives heat generation, conduction, cooling surfaces, and machine operating
// bands." NEW CODE: src/systems/siteThermalModel.js is an authored kernel with no predecessor.
// Nothing thermal existed before this packet (grep for thermal|heat|cooling|conduct over
// asteroidSites.js / siteProduction.js / siteLogistics.js / src/data/sites.js returns zero hits),
// so there is no legacy behaviour to characterize — these are the kernel's founding contracts.
//
// The required proofs, mapped to sections:
//   CONSERVATION / BOUNDS  → §1 (energy balance) + §2 (bounds & finiteness) + §3 (magnitude reach)
//   ORDER INDEPENDENCE     → §4
//   DEGENERATE NETWORKS    → §5
// plus the law's own design statements: §6 zero-rock ring, §7 gas is not a heatsink, §8 solid = 8
// accepted, §9 full-ring saturation, §10 dt edge cases, §11 purity, §12 the authored-constant
// invariants that keep this suite honest, and §13 the unwired proof.
//
// WHY §12 EXISTS — THE INVENTED-THRESHOLD TRAP. No thermal balance data ships anywhere in this
// codebase: SITE_BALANCE (src/data/sites.js:134-158) has no heat term, and the cooling machines are
// an unbuilt Wave 2 roster. Every magnitude in SITE_THERMAL and THERMAL_BANDS is therefore authored
// and expected to move. A test that asserted `heatPerMachine(extractor, ring, 1) === 6` would pin an
// invented constant to itself and prove nothing while blocking every future rebalance. So this suite
// asserts ORDERING, MONOTONICITY, RATIOS and STRUCTURAL claims instead. The one class of magnitude
// it does pin is the design document's own consequences — a conservative mine runs cool, a hollow
// hall does not — because those are quoted design statements, not invented numbers.
//
// Determinism rules (test/AGENTS.md): no DOM, no wall clock, no Math.random — fixtures only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SITE_THERMAL,
  THERMAL_BANDS,
  THERMAL_MODEL_VERSION,
  classifyBand,
  heatPerMachine,
  machineThermalState,
  rockSinkFor,
  stepSiteThermal,
  thermalCapacityFor,
  thermalLoad,
} from '../src/systems/siteThermalModel.js';
import { SITE_MACHINE_BY_ID, SITE_MACHINES } from '../src/data/sites.js';
import { contactProfile } from '../src/systems/siteProduction.js';
import { generateDrillField, DRILL_CONST } from '../src/systems/drill.js';

const EPS = 1e-9;

// --- Fixtures -----------------------------------------------------------------------------------

/** A contact ring expressed as COUNTS, the shape siteProduction.contactProfile emits. */
const ring = (over = {}) => ({ matrix: 0, basalt: 0, gas: 0, ores: {}, ...over });

/** The fully hollowed machine hall: every neighbour drilled away. No heatsink of any kind. */
const HOLLOW = ring();
/** A conservative mine's ring: 7 solid basalt faces, 1 hollow cell for access. */
const BASALT_7 = ring({ basalt: 7 });
const MATRIX_7 = ring({ matrix: 7 });
const ORE_7 = ring({ ores: { cmdty_ore_iron: 7 } });
/** A breached gas pocket and nothing else. Solid by contactProfile's reckoning; not a heatsink. */
const GAS_7 = ring({ gas: 7 });

const DEF = (id) => SITE_MACHINE_BY_ID.get(id);
const EXTRACTOR = DEF('sm_extractor');
const FABRICATOR = DEF('sm_fabricator');
const CARGO_PORT = DEF('sm_cargo_port');
const CORE = DEF('sm_massline_core');

const clone = (v) => structuredClone(v);

/** Every leaf number reachable in a record, with its path — for blanket finiteness sweeps. */
function numericLeaves(node, path = '$', out = []) {
  if (typeof node === 'number') out.push([path, node]);
  else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) numericLeaves(node[k], `${path}.${k}`, out);
  }
  return out;
}

function assertAllFinite(record, label) {
  for (const [path, value] of numericLeaves(record)) {
    assert.ok(Number.isFinite(value), `${label}: ${path} = ${value} is not finite`);
  }
}

// ==================================================== 1. CONSERVATION / ENERGY BALANCE

test('§1 per-machine energy balance: generated === storedDelta + dissipated', () => {
  // Heat is not conserved in the physics sense — it leaves the system into the rock. The invariant
  // that must hold is the per-step BOOK balance: everything made this step either stayed in the
  // machine or left it, and nothing was created or discarded in between.
  const cases = [
    { def: EXTRACTOR, profile: BASALT_7, powerRatio: 1, storedHeat: 0, dtS: 60 },
    { def: EXTRACTOR, profile: HOLLOW, powerRatio: 1, storedHeat: 0, dtS: 60 },
    { def: FABRICATOR, profile: MATRIX_7, powerRatio: 0.5, storedHeat: 40, dtS: 1 },
    { def: CORE, profile: ORE_7, powerRatio: 1, storedHeat: 0, dtS: 3600 },
    { def: CARGO_PORT, profile: GAS_7, powerRatio: 1, storedHeat: 500, dtS: 0.25 },
    // A machine cooling down: stored heat present, no power, a ring that can absorb it.
    { def: FABRICATOR, profile: ORE_7, powerRatio: 0, storedHeat: 200, dtS: 30 },
    // External cooling supplied (no machine supplies it yet — see the kernel's coolingRate note).
    { def: FABRICATOR, profile: HOLLOW, powerRatio: 1, coolingRate: 4, storedHeat: 10, dtS: 120 },
  ];

  for (const c of cases) {
    const r = machineThermalState(c);
    const { generated, conducted, vented, dissipated, storedBefore, storedAfter, storedDelta } = r.step;

    assert.ok(
      Math.abs(dissipated - (conducted + vented)) <= EPS,
      `${c.def.id}: dissipated ${dissipated} != conducted ${conducted} + vented ${vented}`,
    );
    assert.ok(
      Math.abs(storedDelta - (storedAfter - storedBefore)) <= EPS,
      `${c.def.id}: storedDelta does not match the stored endpoints`,
    );
    assert.ok(
      Math.abs(generated - (storedDelta + dissipated)) <= EPS,
      `${c.def.id}: generated ${generated} != storedDelta ${storedDelta} + dissipated ${dissipated}`,
    );
  }
});

test('§1 site-wide energy balance closes across a mixed site', () => {
  const snapshot = {
    dtS: 45,
    machines: [
      { id: 'm1', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, storedHeat: 12 },
      { id: 'm2', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1, storedHeat: 0 },
      { id: 'm3', defId: 'sm_refinery', profile: MATRIX_7, powerRatio: 0.4, storedHeat: 90 },
      { id: 'm4', defId: 'sm_massline_core', profile: ORE_7, powerRatio: 1, storedHeat: 3 },
      { id: 'm5', defId: 'sm_gas_tap', profile: GAS_7, powerRatio: 1, mode: 'generate', storedHeat: 7 },
      { id: 'm6', defId: 'sm_cargo_port', profile: ring({ basalt: 3, matrix: 2 }), powerRatio: 0.9, storedHeat: 0 },
    ],
  };
  const r = stepSiteThermal(snapshot);
  const t = r.totals;

  assert.equal(t.machineCount, 6);
  assert.ok(Math.abs(t.dissipated - (t.conducted + t.vented)) <= EPS, 'site dissipated split');
  assert.ok(
    Math.abs(t.storedDelta - (t.storedAfter - t.storedBefore)) <= EPS,
    'site storedDelta does not match site stored endpoints',
  );
  assert.ok(
    Math.abs(t.generated - (t.storedDelta + t.dissipated)) <= EPS,
    `site balance: generated ${t.generated} != storedDelta ${t.storedDelta} + dissipated ${t.dissipated}`,
  );

  // And the site totals really are the sum of the parts, not an independently drifting accumulator.
  const sum = (pick) => r.machines.reduce((a, m) => a + pick(m), 0);
  assert.ok(Math.abs(t.generated - sum((m) => m.step.generated)) <= EPS, 'totals.generated');
  assert.ok(Math.abs(t.conducted - sum((m) => m.step.conducted)) <= EPS, 'totals.conducted');
  assert.ok(Math.abs(t.storedAfter - sum((m) => m.step.storedAfter)) <= EPS, 'totals.storedAfter');
});

test('§1 conduction never invents heat that was not there: a cold machine stays at zero', () => {
  // A powered-down machine in a rich ring has nothing to shed. Conduction capacity is an upper
  // bound, not a draw — stored heat must floor at 0 and never go negative.
  const r = machineThermalState({ def: FABRICATOR, profile: ORE_7, powerRatio: 0, storedHeat: 0, dtS: 600 });
  assert.equal(r.step.generated, 0);
  assert.equal(r.step.conducted, 0);
  assert.equal(r.step.storedAfter, 0);
  assert.equal(r.step.storedDelta, 0);
  assert.ok(r.sink > 0, 'the ring still HAS conduction capacity; it simply goes unused');
});

test('§1 a machine cannot shed more than it holds', () => {
  const r = machineThermalState({ def: FABRICATOR, profile: ORE_7, powerRatio: 0, storedHeat: 5, dtS: 600 });
  assert.ok(r.step.conducted <= r.step.storedBefore + r.step.generated + EPS, 'over-shed');
  assert.equal(r.step.storedAfter, 0, 'a long step against a big sink drains to exactly zero');
});

// ========================================================= 2. BOUNDS & FINITENESS

test('§2 heat and sink are non-negative and finite across the whole machine catalog', () => {
  const rings = [HOLLOW, BASALT_7, MATRIX_7, ORE_7, GAS_7, ring({ matrix: 2, basalt: 3, gas: 2 })];
  const ratios = [0, 0.25, 1];
  for (const def of SITE_MACHINES) {
    for (const profile of rings) {
      for (const powerRatio of ratios) {
        const heat = heatPerMachine(def, profile, powerRatio);
        const sink = rockSinkFor(profile);
        assert.ok(Number.isFinite(heat) && heat >= 0, `${def.id} heat ${heat}`);
        assert.ok(Number.isFinite(sink) && sink >= 0, `${def.id} sink ${sink}`);
        const r = machineThermalState({ def, profile, powerRatio, dtS: 10 });
        assertAllFinite(r, `${def.id}/${powerRatio}`);
        assert.ok(r.load >= 0 && r.load <= 1, `load out of band: ${r.load}`);
        assert.ok(r.saturation >= 0 && r.saturation <= 1, `saturation out of band: ${r.saturation}`);
        assert.ok(r.step.storedAfter >= 0, 'stored heat went negative');
        assert.ok(r.step.conducted >= 0 && r.step.vented >= 0, 'negative dissipation');
      }
    }
  }
});

test('§2 malformed input is rejected with a reason and never throws', () => {
  const junk = [
    undefined, null, NaN, Infinity, -Infinity, '', 'nonsense', {}, [], true,
    { nope: 1 }, Symbol.iterator === undefined ? null : 0,
  ];

  // Every entry point must survive garbage without throwing.
  for (const j of junk) {
    assert.doesNotThrow(() => rockSinkFor(j), `rockSinkFor(${String(j)})`);
    assert.doesNotThrow(() => heatPerMachine(j, j, j, j), `heatPerMachine(${String(j)})`);
    assert.doesNotThrow(() => machineThermalState(j), `machineThermalState(${String(j)})`);
    assert.doesNotThrow(() => stepSiteThermal(j), `stepSiteThermal(${String(j)})`);
    assert.doesNotThrow(() => classifyBand(j), `classifyBand(${String(j)})`);
    assert.doesNotThrow(() => thermalLoad(j, j), `thermalLoad(${String(j)})`);

    const r = stepSiteThermal(j);
    assertAllFinite(r, `stepSiteThermal(${String(j)})`);
  }

  // NaN/Infinity in the numeric fields must not leak to any output field.
  const poisoned = stepSiteThermal({
    dtS: 30,
    machines: [
      { id: 'p1', defId: 'sm_extractor', profile: ring({ basalt: NaN, matrix: Infinity }), powerRatio: NaN, storedHeat: NaN },
      { id: 'p2', defId: 'sm_refinery', profile: ring({ basalt: 4 }), powerRatio: Infinity, storedHeat: -Infinity },
      { id: 'p3', defId: 'sm_fabricator', profile: { ores: { x: NaN } }, powerRatio: 0.5, coolingRate: NaN },
    ],
  });
  assertAllFinite(poisoned, 'poisoned');
  assert.equal(poisoned.machines.length, 3, 'poisoned numerics do not disqualify a machine');
});

test('§2 non-object machines and unknown defs land in rejected[] rather than throwing', () => {
  const r = stepSiteThermal({
    dtS: 1,
    machines: [
      null, 42, 'ship',
      { id: 'ok', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1 },
      { id: 'ghost', defId: 'sm_not_a_machine', profile: BASALT_7, powerRatio: 1 },
    ],
  });
  assert.equal(r.machines.length, 1, 'only the valid machine is solved');
  assert.equal(r.machines[0].id, 'ok');

  const reasons = r.rejected.map((x) => x.reason).sort();
  assert.deepStrictEqual(reasons, ['not-an-object', 'not-an-object', 'not-an-object', 'unknown-def']);
  assert.ok(r.rejected.some((x) => x.id === 'ghost' && x.reason === 'unknown-def'));
});

test('§2 the emitted record is deeply frozen and JSON-safe', () => {
  const r = stepSiteThermal({
    dtS: 5,
    machines: [{ id: 'a', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1 }],
  });
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.machines) && Object.isFrozen(r.machines[0]));
  assert.ok(Object.isFrozen(r.machines[0].step) && Object.isFrozen(r.totals));
  // A frozen record survives a save round-trip unchanged.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)), clone(r));
  assert.equal(r.version, THERMAL_MODEL_VERSION);
});

// ============================================================ 3. MAGNITUDE REACH

test('§3 extreme-but-finite magnitudes stay finite (the 5c1d9c0c lesson)', () => {
  // Commit 5c1d9c0c repaired r4() returning Infinity for FINITE inputs above ~1.8e304, because the
  // fixture stopped at a comfortable 1e12 — 292 orders of magnitude short of the defect. So this
  // test reaches all the way to the representable ceiling. The finiteness guard must be applied
  // AFTER every scale-round-unscale and after every rate × dt product, not merely on the inputs.
  const EXTREMES = [
    0, 1, 1e6, 1e12, Number.MAX_SAFE_INTEGER, 1e300, 1e304, 1e308,
    Number.MAX_VALUE, Number.MIN_VALUE, Number.EPSILON,
  ];

  for (const mag of EXTREMES) {
    // Synthetic defs let the power term reach magnitudes the shipped catalog never will.
    const hugeDraw = { id: 'sm_synthetic_draw', name: 'x', power: -mag };
    const hugeGen = { id: 'sm_synthetic_gen', name: 'x', power: mag };

    for (const def of [hugeDraw, hugeGen]) {
      for (const dtS of EXTREMES) {
        const r = machineThermalState({
          def,
          profile: ring({ basalt: mag, ores: { cmdty_ore_iron: mag } }),
          powerRatio: 1,
          storedHeat: mag,
          coolingRate: mag,
          dtS,
        });
        assertAllFinite(r, `def.power=${mag} dtS=${dtS}`);
        assert.ok(r.load >= 0 && r.load <= 1, `load ${r.load} out of band at ${mag}/${dtS}`);
        assert.ok(r.step.storedAfter >= 0, 'negative stored at extreme magnitude');
        assert.ok(
          r.step.storedAfter <= SITE_THERMAL.maxStored,
          `stored ${r.step.storedAfter} breached the ceiling`,
        );
        assert.ok(THERMAL_BANDS.some((b) => b.id === r.band), `band ${r.band} is not a real band`);
      }
    }
  }
});

test('§3 overflow is reported as vented, never silently discarded', () => {
  // Saturating an energy product at the ceiling would break the conservation identity if the clipped
  // excess simply vanished. It is routed into `vented` instead, so the books still close.
  const r = machineThermalState({
    def: { id: 'sm_synthetic', name: 'x', power: -1e308 },
    profile: HOLLOW,
    powerRatio: 1,
    storedHeat: SITE_THERMAL.maxStored,
    dtS: 1e308,
  });
  assertAllFinite(r, 'overflow');
  assert.ok(r.step.vented > 0, 'the clipped excess must surface as vented heat');
  const { generated, storedDelta, dissipated } = r.step;
  const scale = Math.max(1, Math.abs(generated));
  assert.ok(
    Math.abs(generated - (storedDelta + dissipated)) <= 1e-9 * scale,
    'conservation must still close (relatively) at the ceiling',
  );
});

test('§3 an unrepresentable power draw fails HOT, not cold', () => {
  // The reflexive fail-closed default (coerce non-finite to 0) would report a machine claiming an
  // infinite draw as stone cold — a free win. It must saturate upward into the worst band instead.
  const r = machineThermalState({
    def: { id: 'sm_synthetic', name: 'x', power: -Infinity },
    profile: BASALT_7,
    powerRatio: 1,
    dtS: 60,
  });
  assertAllFinite(r, 'infinite draw');
  assert.ok(r.heat > 0, 'an infinite draw must not read as zero heat');
  assert.equal(r.band, THERMAL_BANDS[THERMAL_BANDS.length - 1].id, 'must reach the worst band');
});

// ========================================================== 4. ORDER INDEPENDENCE

/** Deterministic index permutations — no Math.random anywhere in this suite. */
function permutations(list) {
  if (list.length <= 1) return [list.slice()];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const rest = list.slice(0, i).concat(list.slice(i + 1));
    for (const p of permutations(rest)) out.push([list[i], ...p]);
  }
  return out;
}

test('§4 permuting site.machines[] yields a byte-identical record', () => {
  // THIS IS A DESIGN CONSTRAINT, NOT A CONVENIENCE. Byte-identical output under permutation forces a
  // single-pass, steady-state formulation and forbids iterative thermal relaxation outright: a
  // relaxation loop's answer depends on the order machines are visited, so it could never pass here.
  const machines = [
    { id: 'm1', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, storedHeat: 12 },
    { id: 'm2', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1, storedHeat: 0 },
    { id: 'm3', defId: 'sm_refinery', profile: MATRIX_7, powerRatio: 0.4, storedHeat: 90.5 },
    { id: 'm4', defId: 'sm_massline_core', profile: ORE_7, powerRatio: 1, storedHeat: 3.25 },
    { id: 'm5', defId: 'sm_gas_tap', profile: GAS_7, powerRatio: 1, mode: 'split', storedHeat: 7 },
  ];
  const baseline = stepSiteThermal({ dtS: 33, machines });

  let checked = 0;
  for (const perm of permutations(machines)) {
    assert.deepStrictEqual(stepSiteThermal({ dtS: 33, machines: perm }), baseline);
    checked++;
  }
  assert.equal(checked, 120, 'all 5! permutations exercised');
});

test('§4 permuting the contact ring traversal order yields an identical sink', () => {
  // The ring is a SET of contacts, not a sequence. Fed as raw cells (the traversal form), every
  // ordering must read the same conduction capacity.
  const cells = [
    { kind: 'basalt', ore: null },
    { kind: 'matrix', ore: null },
    { kind: 'ore', ore: 'cmdty_ore_iron' },
    { kind: 'gas', ore: null },
    { kind: 'empty', ore: null },
    { kind: 'ore', ore: 'cmdty_ore_copper' },
  ];
  const baseline = rockSinkFor({ cells });
  assert.ok(baseline > 0);

  let checked = 0;
  for (const perm of permutations(cells)) {
    assert.deepStrictEqual(rockSinkFor({ cells: perm }), baseline);
    checked++;
  }
  assert.equal(checked, 720, 'all 6! ring orderings exercised');
});

test('§4 ore key insertion order cannot move the result', () => {
  const a = { ores: { cmdty_ore_iron: 2, cmdty_ore_copper: 3, cmdty_ore_gold: 1 } };
  const b = { ores: { cmdty_ore_gold: 1, cmdty_ore_iron: 2, cmdty_ore_copper: 3 } };
  assert.deepStrictEqual(rockSinkFor(a), rockSinkFor(b));
});

test('§4 each machine is solved independently of its neighbours', () => {
  // A machine's reading must not depend on what else is installed — that independence is what makes
  // the single-pass formulation legitimate rather than an approximation of a coupled system.
  const solo = stepSiteThermal({
    dtS: 20,
    machines: [{ id: 'm1', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, storedHeat: 5 }],
  });
  const crowded = stepSiteThermal({
    dtS: 20,
    machines: [
      { id: 'm1', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, storedHeat: 5 },
      { id: 'm2', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1, storedHeat: 800 },
      { id: 'm3', defId: 'sm_massline_core', profile: ORE_7, powerRatio: 1, storedHeat: 0 },
    ],
  });
  assert.deepStrictEqual(
    crowded.machines.find((m) => m.id === 'm1'),
    solo.machines.find((m) => m.id === 'm1'),
  );
});

// ========================================================== 5. DEGENERATE NETWORKS

test('§5 empty machine list', () => {
  const r = stepSiteThermal({ dtS: 60, machines: [] });
  assert.deepStrictEqual(r.machines, []);
  assert.equal(r.totals.machineCount, 0);
  assert.equal(r.totals.generated, 0);
  assert.equal(r.totals.dissipated, 0);
  assert.equal(r.worstBand, THERMAL_BANDS[0].id, 'a site with no machines reads nominal');
  assert.deepStrictEqual(r.rejected, []);
  assertAllFinite(r, 'empty site');
});

test('§5 a missing machines key behaves exactly like an empty list', () => {
  assert.deepStrictEqual(stepSiteThermal({ dtS: 60 }), stepSiteThermal({ dtS: 60, machines: [] }));
});

test('§5 a single machine with no network still reads a band', () => {
  // No power component, no lane, no neighbours — the isolated case A07 has to render something for.
  const r = stepSiteThermal({
    dtS: 60,
    machines: [{ id: 'lonely', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 0 }],
  });
  assert.equal(r.machines.length, 1);
  assert.equal(r.machines[0].heat, 0, 'an unpowered machine generates no draw heat');
  assert.equal(r.machines[0].band, THERMAL_BANDS[0].id, 'and therefore reads nominal');
  assert.deepStrictEqual(r.rejected, []);
});

test('§5 a machine with no power component falls to powerRatio 0 and generates no heat', () => {
  // asteroidSites.js:766: a machine off any power component gets ratio 0 unless it is a generator.
  const off = machineThermalState({ def: EXTRACTOR, profile: BASALT_7, powerRatio: 0, dtS: 60 });
  assert.equal(off.heat, 0);
  assert.equal(off.step.generated, 0);
  // A GENERATOR, by contrast, makes heat regardless of any draw ratio — it is the source, not a load.
  const gen = machineThermalState({ def: CORE, profile: BASALT_7, powerRatio: 0, dtS: 60 });
  assert.ok(gen.heat > 0, 'a generator radiates even at powerRatio 0');
});

test('§5 duplicate machine ids: one survives, the rest are reported', () => {
  const r = stepSiteThermal({
    dtS: 10,
    machines: [
      { id: 'dup', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1 },
      { id: 'dup', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1 },
      { id: 'dup', defId: 'sm_refinery', profile: MATRIX_7, powerRatio: 1 },
      { id: 'unique', defId: 'sm_cargo_port', profile: BASALT_7, powerRatio: 1 },
    ],
  });
  assert.equal(r.machines.length, 2, 'the ambiguous copies are not silently double-counted');
  assert.equal(r.rejected.filter((x) => x.reason === 'duplicate-id').length, 2);
  assert.ok(r.machines.some((m) => m.id === 'unique'));
});

test('§5 duplicate resolution is order-independent', () => {
  const machines = [
    { id: 'dup', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1 },
    { id: 'dup', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1 },
    { id: 'dup', defId: 'sm_refinery', profile: MATRIX_7, powerRatio: 1 },
  ];
  const baseline = stepSiteThermal({ dtS: 10, machines });
  for (const perm of permutations(machines)) {
    assert.deepStrictEqual(stepSiteThermal({ dtS: 10, machines: perm }), baseline);
  }
});

test('§5 anonymous machines (no id) are all solved, never collapsed together', () => {
  const r = stepSiteThermal({
    dtS: 10,
    machines: [
      { defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, col: 3, row: 4 },
      { defId: 'sm_extractor', profile: HOLLOW, powerRatio: 1, col: 9, row: 4 },
    ],
  });
  assert.equal(r.machines.length, 2, 'id-less machines are distinct installs, not duplicates');
  assert.deepStrictEqual(r.rejected, []);
});

test('§5 lane topology is irrelevant to the thermal reading', () => {
  // Power and lane networks are separate overlays (siteLogistics.js). Heat follows POWER and rock;
  // a machine cut off from every material lane is not thereby cooler.
  const withLane = machineThermalState({
    def: FABRICATOR, profile: BASALT_7, powerRatio: 1, dtS: 30, laneKey: 'lane_a', store: { x: 5 },
  });
  const noLane = machineThermalState({
    def: FABRICATOR, profile: BASALT_7, powerRatio: 1, dtS: 30, laneKey: null, store: null,
  });
  assert.deepStrictEqual(withLane, noLane);
});

test('§5 the kernel consumes a REAL contactProfile from a live drill field', () => {
  // Guards against the fixtures drifting from the shape siteProduction actually emits.
  const { COLS, ROWS } = DRILL_CONST;
  const field = generateDrillField(47);
  const col = Math.floor(COLS / 2);
  const row = Math.floor(ROWS / 2);
  const profile = contactProfile(field, col, row, COLS, ROWS);

  assert.ok(profile.solid > 0, 'precondition: the sampled cell has solid neighbours');
  const sink = rockSinkFor(profile);
  assert.ok(Number.isFinite(sink) && sink >= 0);

  const r = machineThermalState({ def: EXTRACTOR, profile, powerRatio: 1, dtS: 60 });
  assertAllFinite(r, 'live contactProfile');
  assert.ok(THERMAL_BANDS.some((b) => b.id === r.band));
});

// =========================================================== 6. ZERO-ROCK RING

test('§6 a fully hollowed hall has no heatsink and reaches the worst band', () => {
  // design/ASTEROID_OPS_VISION.md:51-56 — "the fully-hollow factory asteroid stops being a free win."
  // This is the structural claim the whole law exists to make, so it is asserted as a claim about
  // the WORST band rather than about any particular number.
  assert.equal(rockSinkFor(HOLLOW), 0, 'a hollow ring conducts nothing');

  const worst = THERMAL_BANDS[THERMAL_BANDS.length - 1].id;
  for (const def of SITE_MACHINES) {
    const r = machineThermalState({ def, profile: HOLLOW, powerRatio: 1, dtS: 60 });
    if (r.heat === 0) continue; // a machine that makes no heat is legitimately fine anywhere
    assert.equal(r.sink, 0, `${def.id}: hollow ring must give zero sink`);
    assert.equal(r.load, 1, `${def.id}: no sink means maximum load`);
    assert.equal(r.band, worst, `${def.id}: a heat-making machine in a hollow hall must fault`);
  }
});

test('§6 heat accumulates without bound-in-band in a hollow hall', () => {
  // With no sink, every joule generated stays put: the machine is a closed thermal system.
  let stored = 0;
  for (let i = 0; i < 10; i++) {
    const r = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, storedHeat: stored, dtS: 60 });
    assert.equal(r.step.conducted, 0, 'nothing can be shed');
    assert.ok(r.step.storedAfter > stored, 'stored heat must strictly rise');
    stored = r.step.storedAfter;
  }
  assert.ok(Number.isFinite(stored) && stored > 0);
});

// ======================================================= 7. GAS IS NOT A HEATSINK

test('§7 gas contacts contribute exactly zero conduction', () => {
  // contactProfile increments `solid` BEFORE classifying (siteProduction.js:34-38), so
  // solid = matrix + basalt + gas + ores. Any implementation that reached for `profile.solid` would
  // hand a breached gas pocket a heatsink it physically cannot be. This is that tripwire.
  assert.equal(rockSinkFor(GAS_7), 0, 'gas=7, rock=0 must read as ZERO sink');
  assert.equal(SITE_THERMAL.gasPerContact, 0, 'the constant itself must stay zero');

  // A gas-only ring is thermally identical to a fully hollow one, despite solid=7 vs solid=0.
  assert.equal(rockSinkFor(GAS_7), rockSinkFor(HOLLOW));
});

test('§7 gas is transparent to conduction alongside real rock', () => {
  // Adding gas contacts to a ring must not raise its conduction at all.
  const rock = ring({ matrix: 2, basalt: 3, ores: { cmdty_ore_iron: 1 } });
  const rockPlusGas = ring({ matrix: 2, basalt: 3, ores: { cmdty_ore_iron: 1 }, gas: 2 });
  assert.equal(rockSinkFor(rockPlusGas), rockSinkFor(rock), 'gas added zero conduction');
});

test('§7 a gas tap on a gas-only ring is the hottest thing on the site', () => {
  // Emergent, and exactly the design intent: the gas tap converts gas contacts into megawatts
  // (CONTACT_YIELD.gasPowerPerContact) while those same contacts conduct nothing away. It is the
  // machine that most needs the unbuilt Coolant Loop, and it says so without any special-casing.
  const tap = machineThermalState({ def: DEF('sm_gas_tap'), profile: GAS_7, powerRatio: 1, mode: 'generate', dtS: 60 });
  assert.ok(tap.heat > 0, 'generating from gas makes heat');
  assert.equal(tap.sink, 0, 'and the gas it sits in cannot take it back');
  assert.equal(tap.band, THERMAL_BANDS[THERMAL_BANDS.length - 1].id);

  // Mode is real: feedstock mode makes no power, and therefore runs cooler than generate mode.
  const feed = machineThermalState({ def: DEF('sm_gas_tap'), profile: GAS_7, powerRatio: 1, mode: 'feedstock', dtS: 60 });
  const split = machineThermalState({ def: DEF('sm_gas_tap'), profile: GAS_7, powerRatio: 1, mode: 'split', dtS: 60 });
  assert.ok(feed.heat < split.heat, 'feedstock < split');
  assert.ok(split.heat < tap.heat, 'split < generate');
});

// ==================================================== 8. SOLID = 8 IS ACCEPTED

test('§8 a ring with 8 solid contacts is accepted, not asserted away', () => {
  // test/asteroid-contact-ring-law.test.mjs:148-153 records that solid <= 7 is EMERGENT, not
  // enforced: canInstall only requires the host tile be empty, and a remote install into a natural
  // pocket would read solid = 8. An assert here would turn that latent content change into a crash.
  const full = ring({ basalt: 8 });
  const sink = rockSinkFor(full);
  assert.ok(Number.isFinite(sink) && sink > 0);
  assert.ok(sink > rockSinkFor(BASALT_7), 'the eighth contact conducts like any other');

  const r = machineThermalState({ def: EXTRACTOR, profile: full, powerRatio: 1, dtS: 60 });
  assertAllFinite(r, 'solid=8');
  assert.ok(THERMAL_BANDS.some((b) => b.id === r.band));

  // Nor is the ring capped at 8: an over-full ring is degenerate but must stay finite and monotone.
  const over = ring({ basalt: 40 });
  assert.ok(rockSinkFor(over) > sink);
  assertAllFinite(machineThermalState({ def: EXTRACTOR, profile: over, powerRatio: 1, dtS: 60 }), 'solid=40');
});

// ====================================================== 9. FULL RING SATURATION

test('§9 a full rock ring pins the cool end against the hollow-hall hot end', () => {
  for (const def of SITE_MACHINES) {
    const hot = machineThermalState({ def, profile: HOLLOW, powerRatio: 1, dtS: 60 });
    if (hot.heat === 0) continue;
    for (const cool of [BASALT_7, MATRIX_7, ORE_7]) {
      const r = machineThermalState({ def, profile: cool, powerRatio: 1, dtS: 60 });
      assert.ok(r.load < hot.load, `${def.id}: a solid ring must read strictly cooler than a hollow one`);
      assert.ok(r.bandIndex <= hot.bandIndex, `${def.id}: and never in a hotter band`);
      assert.ok(r.step.conducted > 0, `${def.id}: a solid ring must actually shed heat`);
    }
  }
});

test('§9 conduction is monotone in solid contact count', () => {
  let prev = -1;
  for (let n = 0; n <= 8; n++) {
    const sink = rockSinkFor(ring({ basalt: n }));
    assert.ok(sink > prev, `sink must strictly rise from ${n - 1} to ${n} contacts`);
    prev = sink;
  }
});

test('§9 load is monotone decreasing in sink and monotone increasing in heat', () => {
  let prevLoad = Infinity;
  for (let n = 0; n <= 8; n++) {
    const r = machineThermalState({ def: FABRICATOR, profile: ring({ basalt: n }), powerRatio: 1, dtS: 60 });
    assert.ok(r.load < prevLoad, `more rock must lower the load (n=${n})`);
    prevLoad = r.load;
  }

  let prevHeatLoad = -Infinity;
  for (const ratio of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    const r = machineThermalState({ def: FABRICATOR, profile: BASALT_7, powerRatio: ratio, dtS: 60 });
    assert.ok(r.load >= prevHeatLoad, `more served power must not lower the load (ratio=${ratio})`);
    prevHeatLoad = r.load;
  }
});

test('§9 external cooling substitutes for rock', () => {
  // The Radiator Mast and Coolant Loop do not exist yet (VISION:90), so this is the parameter they
  // will land on. Supplying cooling must be able to rescue a hollow-hall machine.
  const bare = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, dtS: 60 });
  assert.equal(bare.band, THERMAL_BANDS[THERMAL_BANDS.length - 1].id);

  const cooled = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, coolingRate: 40, dtS: 60 });
  assert.ok(cooled.load < bare.load, 'cooling must lower the load');
  assert.ok(cooled.bandIndex < bare.bandIndex, 'and can pull a machine out of fault');
  assert.ok(cooled.step.conducted > 0, 'cooling actually sheds energy');
});

test('§9 the design consequence holds: a conservative mine runs cool, a dense hall does not', () => {
  // Quoted design statement (VISION:51-56), NOT an invented magnitude: "a conservative mine runs
  // cool by nature", while "dense machine halls are an engineering achievement". If a rebalance ever
  // makes a lone extractor in a full ring uncomfortable, that is a design change and should be a
  // conscious one — this is the tripwire, and it is the only place a band value is pinned.
  const mine = machineThermalState({ def: EXTRACTOR, profile: BASALT_7, powerRatio: 1, dtS: 60 });
  assert.equal(mine.band, 'nominal', 'a lone extractor in solid rock must be comfortable');

  const hall = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, dtS: 60 });
  assert.equal(hall.band, 'fault', 'the hollowed-out factory must not be free');
});

// ========================================================== 10. DT EDGE CASES

test('§10 dt = 0 is a no-op that still classifies', () => {
  const r = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, storedHeat: 55, dtS: 0 });
  assert.equal(r.step.generated, 0);
  assert.equal(r.step.conducted, 0);
  assert.equal(r.step.vented, 0);
  assert.equal(r.step.storedDelta, 0);
  assert.equal(r.step.storedAfter, 55, 'stored heat is untouched by a zero-length step');
  // The band is a steady-state property and is still reported for a zero step.
  assert.equal(r.band, THERMAL_BANDS[THERMAL_BANDS.length - 1].id);
  assert.ok(r.heat > 0, 'the RATE is non-zero even though the step moved no energy');
});

test('§10 a negative dt is rejected and degrades to a no-op', () => {
  const r = stepSiteThermal({
    dtS: -60,
    machines: [{ id: 'a', defId: 'sm_fabricator', profile: HOLLOW, powerRatio: 1, storedHeat: 20 }],
  });
  assert.ok(r.rejected.some((x) => x.reason === 'negative-dt'), 'must report the bad dt');
  assert.equal(r.dtS, 0, 'and must not run time backwards');
  assert.equal(r.machines[0].step.storedAfter, 20, 'stored heat is unchanged');
  assert.equal(r.totals.generated, 0);
  assertAllFinite(r, 'negative dt');
});

test('§10 a non-finite dt is rejected', () => {
  for (const bad of [NaN, Infinity, -Infinity, 'soon']) {
    const r = stepSiteThermal({ dtS: bad, machines: [] });
    assert.ok(r.rejected.some((x) => x.reason === 'invalid-dt'), `dtS=${String(bad)}`);
    assert.equal(r.dtS, 0);
  }
});

test('§10 one large catch-up step lands in the same band as many small steps', () => {
  // The offline-catch-up guard. The band is derived from a ratio of RATES, so it is dt-invariant by
  // construction — but this test builds both paths for real and compares them rather than asserting
  // the property it is meant to be checking.
  const TOTAL = 600;
  const STEPS = 600;

  for (const def of SITE_MACHINES) {
    for (const profile of [HOLLOW, BASALT_7, MATRIX_7, ORE_7]) {
      const big = machineThermalState({ def, profile, powerRatio: 1, storedHeat: 0, dtS: TOTAL });

      let stored = 0;
      let small = null;
      for (let i = 0; i < STEPS; i++) {
        small = machineThermalState({ def, profile, powerRatio: 1, storedHeat: stored, dtS: TOTAL / STEPS });
        stored = small.step.storedAfter;
      }

      assert.equal(big.band, small.band, `${def.id}/${JSON.stringify(profile)}: band diverged`);
      assert.ok(Number.isFinite(stored), 'accumulated stored heat must stay finite');
      // The accumulated stored heat must also agree: the dynamics are linear in dt under constant
      // rates, so chunking must not change where the machine ends up.
      const scale = Math.max(1, Math.abs(big.step.storedAfter));
      assert.ok(
        Math.abs(big.step.storedAfter - stored) <= 1e-6 * scale,
        `${def.id}: stored heat diverged, ${big.step.storedAfter} vs ${stored}`,
      );
    }
  }
});

test('§10 an enormous catch-up step stays bounded', () => {
  const r = machineThermalState({ def: FABRICATOR, profile: HOLLOW, powerRatio: 1, storedHeat: 0, dtS: 1e12 });
  assertAllFinite(r, 'huge dt');
  assert.ok(r.step.storedAfter <= SITE_THERMAL.maxStored);
  assert.equal(r.band, THERMAL_BANDS[THERMAL_BANDS.length - 1].id, 'band is unaffected by step size');
});

// ================================================================== 11. PURITY

test('§11 every entry point leaves its inputs untouched', () => {
  const profile = ring({ matrix: 2, basalt: 3, gas: 1, ores: { cmdty_ore_iron: 2 } });
  const cellProfile = {
    cells: [
      { kind: 'basalt', ore: null },
      { kind: 'ore', ore: 'cmdty_ore_iron' },
      { kind: 'empty', ore: null },
    ],
  };
  const def = clone(EXTRACTOR);
  const snapshot = {
    dtS: 42,
    machines: [
      { id: 'm1', defId: 'sm_extractor', profile: clone(profile), powerRatio: 0.8, storedHeat: 11, carry: { a: 1 } },
      { id: 'm2', defId: 'sm_gas_tap', profile: clone(profile), powerRatio: 1, mode: 'split', storedHeat: 4 },
      { id: 'm3', defId: 'sm_unknown', profile: clone(profile), powerRatio: 1 },
      null,
    ],
  };

  const beforeProfile = clone(profile);
  const beforeCells = clone(cellProfile);
  const beforeDef = clone(def);
  const beforeSnapshot = clone(snapshot);

  rockSinkFor(profile);
  rockSinkFor(cellProfile);
  heatPerMachine(def, profile, 1, 'generate');
  machineThermalState({ def, profile, powerRatio: 0.5, storedHeat: 3, dtS: 9 });
  stepSiteThermal(snapshot);

  assert.deepStrictEqual(profile, beforeProfile, 'rockSinkFor/heatPerMachine mutated the profile');
  assert.deepStrictEqual(cellProfile, beforeCells, 'the cells form was mutated');
  assert.deepStrictEqual(def, beforeDef, 'the machine def was mutated');
  assert.deepStrictEqual(snapshot, beforeSnapshot, 'stepSiteThermal mutated its snapshot');
});

test('§11 the shipped catalog is never mutated by a thermal pass', () => {
  const before = clone(SITE_MACHINES);
  stepSiteThermal({
    dtS: 60,
    machines: SITE_MACHINES.map((d, i) => ({
      id: `m${i}`, defId: d.id, profile: BASALT_7, powerRatio: 1,
    })),
  });
  assert.deepStrictEqual(clone(SITE_MACHINES), before);
});

test('§11 repeated calls with the same input return equal records', () => {
  const snapshot = {
    dtS: 17,
    machines: [
      { id: 'a', defId: 'sm_extractor', profile: BASALT_7, powerRatio: 1, storedHeat: 5 },
      { id: 'b', defId: 'sm_refinery', profile: MATRIX_7, powerRatio: 0.3, storedHeat: 0 },
    ],
  };
  assert.deepStrictEqual(stepSiteThermal(snapshot), stepSiteThermal(clone(snapshot)));
});

// ============================================ 12. AUTHORED-CONSTANT INVARIANTS

test('§12 the band table is well formed and strictly ordered', () => {
  assert.ok(THERMAL_BANDS.length >= 2);
  assert.equal(THERMAL_BANDS[0].minLoad, 0, 'the coolest band must start at zero');

  const ids = new Set();
  let prev = -Infinity;
  for (const b of THERMAL_BANDS) {
    assert.equal(typeof b.id, 'string');
    assert.equal(typeof b.label, 'string');
    assert.ok(Number.isFinite(b.minLoad) && b.minLoad >= 0 && b.minLoad <= 1, `${b.id} threshold`);
    assert.ok(b.minLoad > prev || prev === -Infinity, `${b.id} thresholds must strictly ascend`);
    prev = b.minLoad;
    assert.ok(!ids.has(b.id), `duplicate band id ${b.id}`);
    ids.add(b.id);
    assert.ok(Object.isFrozen(b));
  }
  assert.ok(Object.isFrozen(THERMAL_BANDS) && Object.isFrozen(SITE_THERMAL));
});

test('§12 classifyBand covers [0,1] and agrees with the reported load', () => {
  for (let i = 0; i <= 100; i++) {
    const load = i / 100;
    const id = classifyBand(load);
    assert.ok(THERMAL_BANDS.some((b) => b.id === id), `load ${load} produced ${id}`);
  }
  assert.equal(classifyBand(0), THERMAL_BANDS[0].id);
  assert.equal(classifyBand(1), THERMAL_BANDS[THERMAL_BANDS.length - 1].id);
  // Out-of-range and junk clamp rather than inventing a band.
  assert.equal(classifyBand(-5), THERMAL_BANDS[0].id);
  assert.equal(classifyBand(99), THERMAL_BANDS[THERMAL_BANDS.length - 1].id);

  // The band a record reports must be exactly what its own reported load classifies to — no drift
  // between the rounded display value and the label.
  for (const def of SITE_MACHINES) {
    for (const profile of [HOLLOW, BASALT_7, MATRIX_7, ORE_7, GAS_7]) {
      const r = machineThermalState({ def, profile, powerRatio: 1, dtS: 10 });
      assert.equal(r.band, classifyBand(r.load), `${def.id} band/load disagreement`);
      assert.equal(r.bandIndex, THERMAL_BANDS.findIndex((b) => b.id === r.band));
    }
  }
});

test('§12 conduction constants keep their design ORDER: ore > basalt > matrix > gas', () => {
  // Metal conducts better than dense rock, dense rock better than porous rock, gas not at all.
  // The ORDER is the design statement; the magnitudes are authored and free to move.
  assert.ok(SITE_THERMAL.orePerContact > SITE_THERMAL.basaltPerContact, 'ore > basalt');
  assert.ok(SITE_THERMAL.basaltPerContact > SITE_THERMAL.matrixPerContact, 'basalt > matrix');
  assert.ok(SITE_THERMAL.matrixPerContact > SITE_THERMAL.gasPerContact, 'matrix > gas');
  assert.equal(SITE_THERMAL.gasPerContact, 0);

  // And the order survives into the actual sink readings.
  assert.ok(rockSinkFor(ORE_7) > rockSinkFor(BASALT_7));
  assert.ok(rockSinkFor(BASALT_7) > rockSinkFor(MATRIX_7));
  assert.ok(rockSinkFor(MATRIX_7) > rockSinkFor(GAS_7));
});

test('§12 generation runs cooler per MW than draw, and heat is anchored to the draw unit', () => {
  assert.equal(SITE_THERMAL.heatPerMWDraw, 1, 'the heat unit is DEFINED by drawn MW');
  assert.ok(
    SITE_THERMAL.heatPerMWGen < SITE_THERMAL.heatPerMWDraw,
    'a turbine sheds part of its waste with the exhaust; gen must be the cooler channel per MW',
  );
  assert.ok(SITE_THERMAL.heatPerMWGen > 0, 'but generation is not free');
});

test('§12 heat is proportional to real installed power, not a per-machine table', () => {
  // The anti-invention proof: heat ordering across the catalog must follow |def.power| ordering,
  // which is shipped data. No machine may carry a bespoke thermal fudge.
  const draws = SITE_MACHINES
    .filter((d) => d.power < 0)
    .map((d) => ({ id: d.id, mw: Math.abs(d.power), heat: heatPerMachine(d, HOLLOW, 1) }));
  assert.ok(draws.length >= 3, 'precondition: several drawing machines exist');

  for (const a of draws) {
    for (const b of draws) {
      if (a.mw === b.mw) continue;
      const hotter = a.mw > b.mw ? a : b;
      const cooler = a.mw > b.mw ? b : a;
      assert.ok(hotter.heat > cooler.heat, `${hotter.id} draws more MW than ${cooler.id} but is not hotter`);
    }
    // Exact proportionality to the shipped power figure.
    assert.ok(Math.abs(a.heat - a.mw * SITE_THERMAL.heatPerMWDraw) <= EPS, `${a.id} heat is not derived from def.power`);
  }
});

test('§12 thermal capacity is positive, finite and monotone in installed power', () => {
  let prev = -1;
  for (const mw of [0, 1, 4, 8, 12, 1000]) {
    const cap = thermalCapacityFor({ id: 'x', power: -mw });
    assert.ok(Number.isFinite(cap) && cap > 0, `capacity ${cap} at ${mw} MW`);
    assert.ok(cap > prev, 'capacity must rise with installed power');
    prev = cap;
  }
  assert.ok(thermalCapacityFor(null) > 0, 'a missing def still yields a positive floor');
  assert.equal(thermalCapacityFor({ power: -4 }), thermalCapacityFor({ power: 4 }), 'sign of power is irrelevant to mass');
});

test('§12 thermalLoad degenerates in the HOT direction', () => {
  assert.equal(thermalLoad(0, 0), 0, 'no heat and no sink is nominal, not a fault');
  assert.equal(thermalLoad(0, 100), 0, 'no heat is nominal');
  assert.equal(thermalLoad(5, 0), 1, 'heat with no sink is maximal');
  assert.equal(thermalLoad(1, 1), 0.5, 'a matched ring sits exactly midway');
  assert.ok(thermalLoad(NaN, NaN) >= 0 && thermalLoad(NaN, NaN) <= 1);
});

// ============================================================= 13. UNWIRED

test('§13 nothing in src/ imports this kernel', () => {
  // The A01/A08 precedent: an unwired kernel is provably hash-inert, so landing it cannot move a
  // single golden fixture. A07 is the packet that gets to wire it.
  const here = fileURLToPath(new URL('.', import.meta.url));
  const srcRoot = join(here, '..', 'src');

  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(m?js)$/.test(entry)) continue;
      if (full.endsWith('siteThermalModel.js')) continue;
      const text = readFileSync(full, 'utf8');
      if (text.includes('siteThermalModel')) offenders.push(full);
    }
  };
  walk(srcRoot);

  assert.deepStrictEqual(offenders, [], `A06 must stay unwired; importers found: ${offenders.join(', ')}`);
});

test('§13 the kernel imports no Three.js, no DOM and no clock', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const text = readFileSync(join(here, '..', 'src', 'systems', 'siteThermalModel.js'), 'utf8');
  const body = text.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, ''); // strip comment lines

  for (const banned of ['three', 'document', 'window', 'Math.random', 'Date.now', 'new Date']) {
    assert.ok(!body.includes(banned), `kernel must not reference ${banned}`);
  }
  // And it must not reach for the player's wanted-level heat system.
  assert.ok(!body.includes("systems/heat.js"), 'must not import the player heat scalar');
});
