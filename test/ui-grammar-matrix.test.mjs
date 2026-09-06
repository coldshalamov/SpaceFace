// ui-grammar-matrix.test.mjs — PQ-180. Proves the grammar matrix's floor actually bites, and that
// a proxy observation can never be mistaken for a rule passing.
//
// Every assertion here runs on synthetic measurements. That is the point: if proving "a 10 px label
// goes red" required a booted game and a GPU window, nobody would ever prove it, and a matrix whose
// floor was quietly broken would print a column of greens. No test asserts on a surface NAME — the
// rules must hold for any row, or they are not rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  ADMITTED_OWNER_PACKETS,
  ARCHETYPES,
  AUTOMATABLE_SURFACES,
  CAPTURE_SURFACES,
  IMPLEMENTED_ENTRY_KINDS,
  REACHABLE_CANDIDATES,
  SHIPPING_SURFACES,
  SURFACES,
  auditManifest,
  orderForOneBoot,
} from '../scripts/ui-grammar-surfaces.mjs';
import { THRESHOLDS } from '../scripts/ui-grammar-thresholds.mjs';
import {
  MEASUREMENT_PASSES,
  PASS_STATUSES,
  RULE_IDS,
  RULE_SEAM_OWNERS,
  RULES,
  evaluateMatrix,
  evaluateSurface,
  ownershipRows,
} from '../scripts/lib/ui-grammar-measure.mjs';
import {
  MATRIX_VIEWPORTS,
  NEUTRAL_GROUND_HEX,
  UI_FRAME_REFERENCE_DIR,
  UI_MATRIX_GROUND,
  UI_MATRIX_SEED,
  buildFramePlan,
  frameFileName,
  isFrameCurrent,
  labelCandidates,
  normalizeFrameFilter,
} from '../scripts/capture-ui-matrix.mjs';
import { PSEUDO_LOCALE, pseudoLocalize } from '../src/localization/runtime.js';
import {
  FLOORS_FILE,
  MIN_FLOOR,
  buildCoverageReport,
  decideExit,
  deriveFloor,
  diffPng,
  floorForSurface,
  formatCoverageReport,
  invalidateFloorCache,
  isCaptureReachable,
  judgeFrames,
  loadFloors,
  remedyForSurface,
} from '../scripts/lib/ui-frame-regression.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// --------------------------------------------------------------------------------- fixtures

/** A probe result that satisfies every DIRECTLY MEASURABLE rule. Each test breaks one field. */
function goodProbe(overrides = {}) {
  return {
    surfaceId: 'fixture',
    found: true,
    rootSelector: '[data-screen="fixture"]',
    nodeCount: 400,
    visibleTextNodes: 40,
    textChars: 500,
    textSample: 'label | value |',
    minFontPx: 13,
    minFontSample: { px: 13, text: 'label', path: 'div.x' },
    distinctFontSizes: 4,
    numeralNodes: 5,
    nonTabularNumeralNodes: 0,
    nonTabularSample: null,
    dataStates: ['EMPTY', 'LOADING', 'ERROR', 'DENIED'],
    whyNodes: 3,
    focusables: 6,
    clipped: [],
    contentWidth: 1400,
    viewportWidth: 1920,
    infiniteAnimations: 0,
    memorySeam: 'ctx.screenMemory',
    memoryKeys: ['tab', '__scroll'],
    localeAttr: null,
    ...overrides,
  };
}

function allPasses(overrides = {}) {
  const passes = {};
  for (const pass of MEASUREMENT_PASSES) {
    const extra = pass.id === 'ultrawide'
      ? { viewportWidth: 2560, contentWidth: 1800 }
      : pass.id === 'pseudo'
        // pseudo must be WITNESSED: the qps-ploc pass carries visibly more text than its English
        // counterpart at the same width.
        ? { textChars: 720, localeAttr: 'qps-ploc' }
        : {};
    passes[pass.id] = goodProbe({ ...extra, ...(overrides[pass.id] || {}) });
  }
  return passes;
}

const GOOD_SURFACE = Object.freeze({
  id: 'fixture',
  title: 'Fixture surface',
  archetype: 'INSTRUMENT',
  ownerFile: 'src/ui/screens/fixture.js',
  screenId: 'fixture',
  scope: 'shipping',
  status: 'live',
  owner: null,
  root: ['[data-screen="fixture"]'],
  checks: ['check:wcag-contrast', 'check:entity-links'],
  entry: { kind: 'key', key: 'F8', evidence: 'public-route', detail: 'F8 in flight' },
});

const FULL_FRAMES = { expected: 12, present: 12 };

function judge(surfaceOverrides = {}, passOverrides = {}, frames = FULL_FRAMES) {
  return evaluateSurface({
    surface: { ...GOOD_SURFACE, ...surfaceOverrides },
    passes: allPasses(passOverrides),
    thresholds: THRESHOLDS,
    frames,
  });
}

const MEASURED_RULES = ['reachable', 'type-floor', 'tabular-numerals', 'dom-budget', 'safe-frame', 'pseudo-loc', 'reference-frames'];
const isPass = (status) => PASS_STATUSES.includes(status);

// --------------------------------------------------------------------------------- the pass rule

test('a proxy observation never passes: every non-measured rule stays unproven on a perfect surface', () => {
  const row = judge();
  for (const id of MEASURED_RULES) {
    assert.ok(isPass(row.cells[id].status), `${id} should be measurable, was ${row.cells[id].status}`);
  }
  for (const id of RULE_IDS) {
    if (MEASURED_RULES.includes(id)) continue;
    const { status } = row.cells[id];
    assert.ok(
      status === 'unproven' || status === 'unmeasured' || status === 'n/a',
      `${id} was ${status}; a rule with no direct measurement must never pass`,
    );
  }
  assert.equal(row.status, 'red', 'a surface with unexercised rules is not finished');
});

test('the observation is retained in the detail even though the cell does not pass', () => {
  const row = judge({}, { base: { focusables: 7, whyNodes: 2, dataStates: ['EMPTY'] } });
  assert.equal(row.cells.keyboard.status, 'unproven');
  assert.match(row.cells.keyboard.detail, /7 visible focusable/);
  assert.match(row.cells['disclosure-tiers'].detail, /2 tier-2/);
  assert.match(row.cells['data-states'].detail, /EMPTY/);
});

test('listing a check name in the manifest does not pass contrast or links', () => {
  const withChecks = judge({ checks: ['check:wcag-contrast', 'check:entity-links'] });
  const withoutChecks = judge({ checks: [] });
  for (const row of [withChecks, withoutChecks]) {
    assert.equal(row.cells.contrast.status, 'unproven');
    assert.equal(row.cells['entity-links'].status, 'unproven');
  }
});

test('screen memory is never green from a non-empty bag alone', () => {
  assert.equal(judge({}, { base: { memoryKeys: ['tab', 'filter'] } }).cells['screen-memory'].status, 'unproven');
  assert.equal(judge({}, { base: { memoryKeys: [] } }).cells['screen-memory'].status, 'unproven');
});

test('the UI frame budget is unmeasured, not a fast-looking pass', () => {
  const row = judge();
  assert.equal(row.cells['ui-frame-ms'].status, 'unmeasured');
  assert.match(row.cells['ui-frame-ms'].detail, /would change the cadence/);
});

// --------------------------------------------------------------------------------- deliberate violations

test('a deliberately too-small font goes red on the type floor', () => {
  const row = judge({}, { base: { minFontPx: THRESHOLDS.minFontPx - 1 } });
  assert.equal(row.cells['type-floor'].status, 'red');
  assert.match(row.cells['type-floor'].detail, /11(\.00)?px < 12px/);
});

test('a font exactly at the floor passes; one hair under does not', () => {
  assert.equal(judge({}, { base: { minFontPx: 12 } }).cells['type-floor'].status, 'green');
  assert.equal(judge({}, { base: { minFontPx: 11.9 } }).cells['type-floor'].status, 'red');
});

test('a surface over the DOM budget goes red', () => {
  const row = judge({}, { base: { nodeCount: THRESHOLDS.maxSurfaceDomNodes + 1 } });
  assert.equal(row.cells['dom-budget'].status, 'red');
  assert.match(row.cells['dom-budget'].detail, /1501 nodes > 1500/);
});

test('non-tabular figures go red', () => {
  const row = judge({}, {
    base: { nonTabularNumeralNodes: 3, nonTabularSample: { path: 'span.v', text: '12,400 cr' } },
  });
  assert.equal(row.cells['tabular-numerals'].status, 'red');
});

test('an ultrawide surface that stretches instead of clamping goes red', () => {
  const row = judge({}, { ultrawide: { viewportWidth: 2560, contentWidth: 2560 } });
  assert.equal(row.cells['safe-frame'].status, 'red');
  assert.match(row.cells['safe-frame'].detail, /stretched, not clamped/);
});

test('clipping at any measured width goes red', () => {
  const row = judge({}, {
    narrow: { clipped: [{ path: 'div.label', scrollWidth: 220, clientWidth: 180, text: 'Settings' }] },
  });
  assert.equal(row.cells['safe-frame'].status, 'red');
});

// --------------------------------------------------------------------------------- pseudo-localization

test('pseudo-loc is unproven when the locale flag is set but no expansion is witnessed', () => {
  const row = judge({}, { pseudo: { textChars: 500, localeAttr: 'qps-ploc' } });
  assert.equal(row.cells['pseudo-loc'].status, 'unproven');
  assert.match(row.cells['pseudo-loc'].detail, /A locale flag is not expansion/);
});

test('pseudo-loc goes green only when the text actually grew and nothing clips', () => {
  assert.equal(judge().cells['pseudo-loc'].status, 'green');
  const clipped = judge({}, {
    pseudo: { textChars: 720, clipped: [{ path: 'div.l', scrollWidth: 220, clientWidth: 180, text: 'x' }] },
  });
  assert.equal(clipped.cells['pseudo-loc'].status, 'red');
});

// --------------------------------------------------------------------------------- reachability

test('an unreachable surface is red on reachability and never green on a runtime rule', () => {
  const row = evaluateSurface({
    surface: { ...GOOD_SURFACE, owner: 'PQ-181', ownerLeaf: 'meta-shell', entry: { kind: 'none', evidence: 'none', detail: 'no route exists' } },
    passes: {},
    thresholds: THRESHOLDS,
    frames: FULL_FRAMES,
  });
  assert.equal(row.cells.reachable.status, 'red');
  assert.equal(row.status, 'red');
  for (const id of RULE_IDS) {
    // reference-frames counts PNGs on disk, which is true independently of reachability.
    if (id === 'reference-frames') continue;
    assert.notEqual(row.cells[id].status, 'green', `${id} greened without a measurement`);
  }
});

test('a fixture-opened surface can be measured but NEVER greens reachability', () => {
  const row = judge({
    owner: 'PQ-162',
    ownerLeaf: 'station-screens',
    entry: { kind: 'fixture', fixture: 'dock', evidence: 'fixture', detail: 'bus dock event' },
  });
  assert.equal(row.cells.reachable.status, 'red');
  assert.match(row.cells.reachable.detail, /environmental state, not a player route/);
  assert.equal(row.cells['type-floor'].status, 'green', 'the fixture still unlocks real measurement');
  assert.equal(row.measured, true);
  assert.equal(row.openedOnPublicRoute, false);
});

test('a public route that fails to open is red, not unproven', () => {
  const row = evaluateSurface({
    surface: GOOD_SURFACE,
    passes: { base: { found: false, error: 'timeout' } },
    thresholds: THRESHOLDS,
    frames: FULL_FRAMES,
  });
  assert.equal(row.cells.reachable.status, 'red');
  assert.match(row.cells.reachable.detail, /timeout/);
});

// --------------------------------------------------------------------------------- coverage

test('missing reference frames go red and name the remedy', () => {
  const row = judge({}, {}, { expected: 12, present: 4 });
  assert.equal(row.cells['reference-frames'].status, 'red');
  // The remedy names --fill-missing for THIS surface, not --update. PQ-180 .03: --update rewrites
  // every reference in the baseline, including the five whose diff floors were calibrated against
  // the exact bytes on disk, so it can never be the remedy printed for one surface with a gap.
  assert.match(row.cells['reference-frames'].detail, /--fill-missing --only=/);
  assert.doesNotMatch(row.cells['reference-frames'].detail, /-- --update/);
});

// --------------------------------------------------------------------------------- ownership

test('every failing cell carries an owner packet AND a leaf', () => {
  const matrix = evaluateMatrix({ surfaces: SHIPPING_SURFACES, measurements: {}, thresholds: THRESHOLDS, frames: {} });
  const rows = ownershipRows(matrix);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(row.packet, `${row.surface}.${row.rule} has no owner packet`);
    assert.ok(row.leaf, `${row.surface}.${row.rule} has no owner leaf`);
    assert.ok(ADMITTED_OWNER_PACKETS.includes(row.packet), `${row.surface}.${row.rule}: ${row.packet} is not admitted`);
  }
});

test('links are PQ-183 and UI performance is PQ-184 even when another packet owns the screen', () => {
  const row = judge({ owner: 'PQ-162', ownerLeaf: 'station-screens' });
  assert.equal(row.cells['entity-links'].owner.packet, 'PQ-183');
  assert.equal(row.cells['ui-frame-ms'].owner.packet, 'PQ-184');
  assert.ok(row.cells['entity-links'].owner.leaf);
  assert.ok(row.cells['ui-frame-ms'].owner.leaf);
});

test('a measured defect belongs to the surface owner; an unowned one falls to PQ-180 .02', () => {
  const owned = judge({ owner: 'PQ-168', ownerLeaf: 'chart' }, { base: { minFontPx: 8 } });
  assert.equal(owned.cells['type-floor'].owner.packet, 'PQ-168');
  const orphan = judge({ owner: null }, { base: { minFontPx: 8 } });
  assert.equal(orphan.cells['type-floor'].owner.packet, 'PQ-180');
  assert.equal(orphan.cells['type-floor'].owner.leaf, '.02');
});

test('every rule that cannot be measured names the seam and its owner', () => {
  for (const rule of RULES) {
    if (rule.kind !== 'seam') continue;
    assert.ok(RULE_SEAM_OWNERS[rule.id], `${rule.id} has no seam owner`);
    assert.ok(RULE_SEAM_OWNERS[rule.id].why, `${rule.id} does not say why it cannot be measured`);
  }
});

// --------------------------------------------------------------------------------- packet rule coverage

test('every rule the packet names is a column', () => {
  for (const required of [
    'type-roles', 'colour-on-state', 'motion-contract', 'layout-skeleton', 'disclosure-tiers',
    'load-bearing-names', 'gamepad', 'keyboard', 'data-states', 'entity-links', 'screen-memory',
    'safe-frame', 'pseudo-loc', 'forced-colors', 'reduce-motion', 'type-floor', 'tabular-numerals',
    'dom-budget', 'ui-frame-ms', 'reference-frames',
  ]) {
    assert.ok(RULE_IDS.includes(required), `the packet names "${required}" but it is not a column`);
  }
});

// --------------------------------------------------------------------------------- the manifest

test('the manifest is internally sound', () => {
  assert.deepEqual(auditManifest(SURFACES), []);
});

test('the floor of 30 counts REAL surfaces, not rows for missing or route-less screens', () => {
  assert.ok(REACHABLE_CANDIDATES.length >= THRESHOLDS.minManifestSurfaces,
    `${REACHABLE_CANDIDATES.length} real candidates, floor is ${THRESHOLDS.minManifestSurfaces}`);
  for (const s of REACHABLE_CANDIDATES) {
    assert.ok(s.ownerFile, `${s.id} counted as real but has no module`);
    assert.ok(IMPLEMENTED_ENTRY_KINDS.includes(s.entry.kind), `${s.id} counted as real but has no opener`);
  }
  const fake = SHIPPING_SURFACES.filter((s) => !s.ownerFile || s.status === 'legacy');
  for (const s of fake) {
    assert.ok(!REACHABLE_CANDIDATES.includes(s), `${s.id} (${s.status}) must not count toward the floor`);
  }
});

test('a manifest that drops below the real-surface floor is reported as malformed', () => {
  const tiny = SURFACES.slice(0, 5);
  const problems = auditManifest(tiny);
  assert.ok(problems.some((p) => /real surfaces/.test(p)), problems.join('; '));
});

test('every surface id is unique and every archetype is known', () => {
  const ids = SURFACES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of SURFACES) assert.ok(ARCHETYPES.includes(s.archetype), s.id);
});

test('every surface not on a public route names an admitted owner packet and a leaf', () => {
  for (const s of SHIPPING_SURFACES) {
    if (s.entry.evidence === 'public-route') continue;
    assert.ok(s.owner, `${s.id} has no owner`);
    assert.ok(s.ownerLeaf, `${s.id} has no owner leaf`);
    assert.ok(ADMITTED_OWNER_PACKETS.includes(s.owner), `${s.id}: ${s.owner} is not admitted`);
  }
});

test('every owner file named by a surface exists on disk', () => {
  for (const s of SURFACES) {
    if (!s.ownerFile) continue;
    assert.ok(existsSync(path.join(ROOT, s.ownerFile)), `${s.id}: missing ${s.ownerFile}`);
  }
});

test('a surface is only automatable when an opener kind is actually implemented', () => {
  for (const s of AUTOMATABLE_SURFACES) {
    assert.ok(IMPLEMENTED_ENTRY_KINDS.includes(s.entry.kind), `${s.id}: ${s.entry.kind}`);
    assert.ok(s.ownerFile, `${s.id} has no module to open`);
  }
  for (const s of SHIPPING_SURFACES) {
    if (AUTOMATABLE_SURFACES.includes(s)) continue;
    assert.ok(!s.ownerFile || !IMPLEMENTED_ENTRY_KINDS.includes(s.entry.kind), `${s.id} should be automatable`);
  }
});

test('evaluateMatrix never skips a surface it has no measurement for', () => {
  const matrix = evaluateMatrix({ surfaces: SHIPPING_SURFACES, measurements: {}, thresholds: THRESHOLDS, frames: {} });
  assert.equal(matrix.total, SHIPPING_SURFACES.length);
  assert.equal(matrix.green, 0, 'a matrix with zero measurements must have zero green rows');
  assert.equal(matrix.measuredSurfaces, 0);
  assert.equal(matrix.openedOnPublicRoute, 0);
});

// --------------------------------------------------------------------------------- the frame plan

test('the frame plan covers EVERY shipping surface x 4 modes x 3 widths, with unique names', () => {
  const plan = buildFramePlan();
  assert.equal(plan.length, SHIPPING_SURFACES.length * 4 * 3);
  assert.equal(CAPTURE_SURFACES.length, SHIPPING_SURFACES.length, 'no surface may be dropped from the plan');
  const names = plan.map(frameFileName);
  assert.equal(new Set(names).size, names.length);
  const widths = new Set(plan.map((p) => p.width));
  assert.deepEqual([...widths].sort((a, b) => a - b), [...THRESHOLDS.responsiveWidths]);
});

test('an overlay that lives inside the flight frame is still planned for frames', () => {
  const planned = new Set(buildFramePlan().map((p) => p.surface));
  for (const id of ['power-rail', 'comms-radial', 'wingman-radial']) {
    assert.ok(planned.has(id), `${id} was excluded from the reference matrix`);
  }
});

test('the five originally captured surfaces keep their reference file names', () => {
  const names = new Set(buildFramePlan().map(frameFileName));
  for (const legacy of ['flight', 'ship', 'footprint', 'range', 'chart']) {
    assert.ok(names.has(`${legacy}-default-1920x1080.png`), `${legacy} reference name changed`);
  }
});

test('every surface with a route has at least one root selector', () => {
  for (const s of AUTOMATABLE_SURFACES) {
    if (s.id === 'flight') continue;
    assert.ok(s.root.length > 0, `${s.id} has no root selector`);
  }
});

// --------------------------------------------------------------------------------- boot ordering

test('one boot visits key routes before fixtures, docking late, and anything that leaves the session elsewhere in a boot of its own', () => {
  const order = orderForOneBoot(AUTOMATABLE_SURFACES).map((s) => s.id);
  const at = (id) => order.indexOf(id);
  const destructive = AUTOMATABLE_SURFACES.filter((s) => s.destructive);
  // Two reasons a surface may not share a boot, and they are different: `destructive` ENDS the run,
  // `isolatedBoot` leaves it somewhere else — Asteroid Works parks the hull against a rock, the
  // claims board flies to another sector. Either way nothing may be photographed after them here.
  const ownBoot = AUTOMATABLE_SURFACES.filter((s) => s.destructive || s.isolatedBoot);
  assert.ok(ownBoot.length >= 3, 'game-over, asteroid-works and base all need boots of their own');
  for (const s of destructive) assert.equal(at(s.id), order.length - 1, `${s.id} is not last`);
  for (const s of ownBoot) {
    for (const other of AUTOMATABLE_SURFACES) {
      if (other.destructive || other.isolatedBoot) continue;
      assert.ok(at(other.id) < at(s.id), `${other.id} shares a boot but is scheduled after ${s.id}`);
    }
  }
  for (const s of AUTOMATABLE_SURFACES) {
    // The docking rule governs the SHARED boot: a surface with a boot to itself never meets it.
    if (s.entry.kind !== 'key' || s.destructive || s.isolatedBoot) continue;
    assert.ok(at(s.id) < at('station-dock'), `${s.id} runs after docking`);
    for (const d of destructive) assert.ok(at(s.id) < at(d.id), `${s.id} runs after ${d.id}`);
  }
  for (const s of AUTOMATABLE_SURFACES) {
    if (s.entry.kind !== 'nested') continue;
    assert.ok(at(s.entry.parent) < at(s.id), `${s.id} runs before its parent ${s.entry.parent}`);
  }
});

test('Asteroid Works takes one boot per media mode, and a filtered own-boot run skips the shared session', () => {
  // Latching reels the hull into the rock. A second mode in that same boot photographs the
  // aftermath and cannot re-latch. The claims board only changes sector, so it may still share a
  // boot across media modes. The grouping expression is the whole decision.
  const capture = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  assert.match(capture, /surface\.destructive \|\| surface\.id === 'asteroid-works'/,
    'Asteroid Works must boot once per mode the way a destructive surface does');
  assert.doesNotMatch(capture, /const groups = surface\.destructive\s*\n\s*\?/,
    'the old grouping (destructive-only) would put three media modes in one Asteroid Works boot');
  assert.match(capture, /const sharedWork = flightIncluded/,
    'a --only=asteroid-works run must not pay for a shared boot that has nothing to photograph');
  assert.match(capture,
    /captures\.push\(\{ name: frameName, path: path\.join\(UI_FRAME_REFERENCE_DIR, frameName\), reference: 'kept' \}\)/,
    'a kept fill-missing frame must point at the committed reference, not at an output file this run never wrote');
});

// --------------------------------------------------------------------------------- thresholds + baseline

test('the thresholds file is the only source of the floor numbers', () => {
  assert.equal(THRESHOLDS.minFontPx, 12);
  assert.equal(THRESHOLDS.pseudoLocGrowth, 0.4);
  assert.deepEqual([...THRESHOLDS.responsiveWidths], [1280, 1920, 2560]);
  assert.equal(THRESHOLDS.maxSurfaceDomNodes, 1500);
  assert.equal(THRESHOLDS.maxUiFrameMs, 2);
  assert.deepEqual([...THRESHOLDS.requiredDataStates], ['EMPTY', 'LOADING', 'ERROR', 'DENIED']);
});

test('every rule has a label and a cited source', () => {
  for (const rule of RULES) {
    assert.ok(rule.label, rule.id);
    assert.ok(rule.source, rule.id);
  }
  assert.equal(new Set(RULE_IDS).size, RULE_IDS.length);
});

test('the committed baseline is an observation record, not an allowance', () => {
  const file = path.join(ROOT, 'test', 'ui-grammar-baseline.json');
  assert.ok(existsSync(file), 'baseline missing');
  const baseline = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(baseline.packet, 'PQ-180');
  assert.equal(typeof baseline.measured, 'boolean');
  assert.match(baseline.note, /never suppresses an exit code/);
  if (!baseline.measured) {
    // `reference-frames` is decidable from files on disk with no browser, so it may legitimately be
    // green in a static run. Every RUNTIME rule must not be.
    for (const [id, row] of Object.entries(baseline.surfaces)) {
      for (const [ruleId, status] of Object.entries(row.cells)) {
        if (ruleId === 'reference-frames') continue;
        assert.notEqual(status, 'green', `${id}.${ruleId} is green in an unmeasured baseline`);
      }
    }
    assert.equal(baseline.totals.measuredSurfaces, 0);
  }
  for (const id of Object.keys(baseline.surfaces)) {
    assert.ok(SHIPPING_SURFACES.some((s) => s.id === id), `baseline names unknown surface ${id}`);
  }
});

test('the browser probe is read-only and self-contained', async () => {
  const { surfaceProbe } = await import('../scripts/lib/ui-grammar-measure.mjs');
  const source = surfaceProbe.toString();
  // Calling refresh()/ui.frame() to "measure" the frame cost would step the very cadence it claims
  // to observe, and clicking or writing DOM would change what the next surface is measured against.
  assert.ok(!/\.refresh\(|ui\.frame\(|\.click\(|innerHTML|setAttribute|\.remove\(/.test(source),
    'the probe must not call into game code or mutate the DOM');
  // Playwright serializes this function into the page: an outer reference would arrive undefined.
  assert.ok(!/THRESHOLDS|RULE_IDS|RULE_SEAM_OWNERS/.test(source), 'the probe must not close over module scope');
  assert.match(source, /hiddenSelfOrAncestor/, 'visibility must consider hidden ANCESTORS, not just the node');
});

test('the game-over fixture uses the event the UI actually listens for', async () => {
  const capture = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  const uiRoot = readFileSync(path.join(ROOT, 'src', 'ui', 'uiRoot.js'), 'utf8');
  const fixtureBlock = capture.slice(capture.indexOf("case 'player-death'"), capture.indexOf("case 'player-death'") + 700);
  const emitted = /bus\.emit\('([^']+)'/.exec(fixtureBlock);
  assert.ok(emitted, 'the player-death fixture must emit an event');
  assert.ok(
    uiRoot.includes(`bus.on('${emitted[1]}'`),
    `the fixture emits "${emitted[1]}" but uiRoot.js does not subscribe to it — the surface would never open`,
  );
});

test('surface entry keys are pressed verbatim, matching the binding key case', () => {
  const capture = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  assert.ok(!/toUpperCase\(\)/.test(capture.slice(capture.indexOf('function normalizeKey'), capture.indexOf('function normalizeKey') + 400)),
    'upper-casing a key asks for a shifted press the player never makes');
});

test('the matrix CLI has no success path that ignores failing cells', () => {
  const source = readFileSync(path.join(ROOT, 'scripts', 'check-ui-grammar-matrix.mjs'), 'utf8');
  assert.ok(!/regressions-only/.test(source), 'a --regressions-only success path would let a fully red matrix exit 0');
  assert.match(source, /if \(matrix\.red > 0\) failures\.push/);
  assert.match(source, /minManifestSurfaces/, 'the exit must also require the measured-surface floor');
});

// ================================================================= PQ-180 .03 reference frames
//
// The frame matrix is the packet's own answer to "Passing a surface because a check is green:
// three defects in this program were invisible to every check and visible on screen; the reference
// frames are the proof." So these tests hold three things: the plan covers every surface at every
// mode and width, a frame that is missing SAYS SO with an owner and a remedy, and a frame that has
// actually changed goes red.

test('the frame plan is the whole matrix and a filter can never narrow what is judged', () => {
  const full = buildFramePlan();
  assert.equal(full.length, SHIPPING_SURFACES.length * 4 * 3);
  const surfaces = new Set(full.map((e) => e.surface));
  for (const surface of SHIPPING_SURFACES) {
    assert.ok(surfaces.has(surface.id), `${surface.id} is not in the reference-frame plan`);
    const forSurface = full.filter((e) => e.surface === surface.id);
    assert.equal(forSurface.length, 12, `${surface.id} is not covered at 4 modes x 3 widths`);
    assert.deepEqual(
      [...new Set(forSurface.map((e) => e.mode))].sort(),
      ['default', 'forced-colors', 'pseudo-localized', 'reduced-motion'],
    );
    assert.deepEqual(
      [...new Set(forSurface.map((e) => e.width))].sort((a, b) => a - b),
      [...THRESHOLDS.responsiveWidths],
    );
  }
  // A filtered capture writes fewer frames; it must never be able to shrink the judged matrix.
  const narrowed = buildFramePlan({ surfaces: ['flight'], modes: ['default'], viewports: ['1280'] });
  assert.equal(narrowed.length, 1);
  assert.equal(buildFramePlan().length, full.length);
});

test('the capture widths are the thresholds file widths, not a second declaration', () => {
  assert.deepEqual(
    MATRIX_VIEWPORTS.map((v) => v.width).sort((a, b) => a - b),
    [...THRESHOLDS.responsiveWidths],
  );
});

test('the pseudo-localized pass boots the game OWN pseudo-locale', () => {
  const pseudo = buildFramePlan().filter((e) => e.mode === 'pseudo-localized');
  assert.equal(pseudo.length, SHIPPING_SURFACES.length * 3);
  assert.equal(PSEUDO_LOCALE, 'qps-ploc');
});

// --------------------------------------------------------------------------------- missing rows

test('a planned frame with no reference PNG is an explicit MISSING row with an owner and a remedy', () => {
  const plan = buildFramePlan();
  // Nothing on disk: every planned frame must be reported, never silently dropped.
  const coverage = buildCoverageReport({
    plan,
    referenceDir: '/nowhere',
    frameFileName,
    surfaces: SHIPPING_SURFACES,
    exists: () => false,
  });
  assert.equal(coverage.missing.length, plan.length);
  assert.equal(coverage.present, 0);
  assert.equal(coverage.surfaces, SHIPPING_SURFACES.length);
  for (const row of coverage.missing) {
    assert.ok(row.owner, `${row.file} has no owner packet`);
    assert.ok(ADMITTED_OWNER_PACKETS.includes(row.owner), `${row.file}: ${row.owner} is not an admitted packet`);
    assert.ok(row.ownerLeaf, `${row.file} has no owner leaf`);
    assert.ok(row.remedy && row.remedy.length > 12, `${row.file} has no remedy`);
  }
});

test('the coverage line names frames, the full matrix and the surface count', () => {
  const plan = buildFramePlan();
  const coverage = buildCoverageReport({
    plan, referenceDir: '/nowhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: () => false,
  });
  const text = formatCoverageReport(coverage, SHIPPING_SURFACES);
  assert.match(
    text,
    new RegExp(`reference-frame coverage: 0/${plan.length} frames over ${SHIPPING_SURFACES.length} shipping surfaces`),
  );
  assert.match(text, /MISS/);
  assert.match(text, /remedy:/);
});

test('a missing frame says WHY: no opener, a named capture failure, or an upstream surface that jammed', () => {
  const noOpener = SHIPPING_SURFACES.find((s) => s.entry.kind === 'none');
  assert.ok(noOpener, 'the manifest should still carry at least one surface with no opener');
  assert.match(remedyForSurface(noOpener), /no opener exists/);

  const openable = SHIPPING_SURFACES.find((s) => s.entry.kind === 'key');
  assert.match(remedyForSurface(openable), /--fill-missing --only=/);
  assert.match(
    remedyForSurface(openable, { reason: 'ship visible timeout (20000ms)' }),
    /capture failed: ship visible timeout/,
  );
  assert.match(
    remedyForSurface(openable, { skipped: true, reason: 'skipped: station-dock did not close, so this surface was never opened in this pass' }),
    /station-dock did not close/,
  );
});

test('a live capture failure reaches the missing row for that exact frame', () => {
  const plan = buildFramePlan({ surfaces: ['station-market'], modes: ['default'], viewports: ['1920'] });
  const coverage = buildCoverageReport({
    plan,
    referenceDir: '/nowhere',
    frameFileName,
    surfaces: SHIPPING_SURFACES,
    exists: () => false,
    failures: [{
      surface: 'station-market',
      mode: 'default',
      viewport: { width: 1920, height: 1080 },
      reason: 'station-market visible timeout (20000ms)',
    }],
  });
  assert.equal(coverage.missing.length, 1);
  assert.match(coverage.missing[0].remedy, /station-market visible timeout/);
});

// --------------------------------------------------------------------------------- the floors

test('every shipping surface carries a diff floor, and an unlisted one takes the strictest', () => {
  const floors = loadFloors();
  for (const surface of SHIPPING_SURFACES) {
    const record = floors.surfaces[surface.id];
    assert.ok(record, `${surface.id} has no calibrated floor entry`);
    assert.ok(
      Number.isFinite(record.floor) && record.floor >= MIN_FLOOR,
      `${surface.id} floor is not a number at or above the minimum`,
    );
  }
  assert.equal(floorForSurface('a-surface-that-does-not-exist', floors), MIN_FLOOR);
});

test('a pin is a measurement, so it names the ground it was measured over', () => {
  // The five floors measured on 2026-08-20 were measured with the live 3D picture behind the
  // interface — `flight` at 10% carries the note "a live world legitimately moves behind the HUD",
  // which is why the number is that large. A reference frame now photographs the interface over a
  // flat neutral ground, and holding 10% there would mean 276,000 changed pixels at 2560x1080
  // counted as "at rest": the gate reading green straight through the regressions it exists to catch.
  //
  // So a pin carries the ground it belongs to. It holds while that ground is what the harness shoots
  // over, and lapses when the ground changes — which can only ever TIGHTEN a floor. Whether a given
  // surface is still pinned today depends on whether it has been re-calibrated since; what must
  // never happen is a pin with no ground on it, holding a number nobody can date.
  const floors = loadFloors();
  for (const id of ['footprint', 'range', 'ship', 'chart', 'flight']) {
    const record = floors.surfaces[id];
    assert.ok(record, `${id} must carry a floor record`);
    assert.ok(record.pinnedGround, `${id} was pinned once, so it must name the ground it was pinned over`);
    if (record.pinned) {
      assert.equal(record.pinnedGround, 'live-3d',
        `${id} still holds its 2026-08-20 pin, which was measured over the live 3D picture`);
    }
  }

  const check = readFileSync(path.join(ROOT, 'scripts', 'check-visual-regression.mjs'), 'utf8');
  assert.match(check, /const pinHolds = record\.pinned && pinnedGround === UI_MATRIX_GROUND;/,
    'the pin must be conditional on the ground, not on the flag alone');
  assert.match(check, /record\.pinLapsed = \{/, 'a lapsed pin must record the number it used to hold');
});

test('a floor is derived from measured rest variance by one stated rule, never chosen', () => {
  // Replayed against the 2026-08-20 measurements the rule reproduces four of the five floors.
  assert.equal(deriveFloor(0), 0.005);        // footprint measured 0.00%
  assert.equal(deriveFloor(0.0005), 0.005);   // range measured 0.05%
  assert.equal(deriveFloor(0.0245), 0.03);    // ship measured 2.45%
  assert.equal(deriveFloor(0.04), 0.05);      // chart measured 4%
  // Monotone: a surface that measures worse can never end up with a tighter floor, and a floor
  // always absorbs the variance it was derived from.
  let previous = 0;
  for (let step = 0; step <= 200; step += 1) {
    const measured = step / 1000;
    const floor = deriveFloor(measured);
    assert.ok(floor >= previous, `floor went down at measured=${measured}`);
    assert.ok(floor >= measured, `floor ${floor} is below the variance ${measured} it must absorb`);
    previous = floor;
  }
});

// --------------------------------------------------------------------------------- perturbation

test('a deliberately perturbed frame goes red; an identical one stays green', async (t) => {
  // Built and destroyed in a temp dir. A perturbed frame must never touch the committed baseline —
  // the golden law in test/ui-frame-references/README.md is that references change only when the
  // visual change was intended.
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-ui-frame-perturb-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const width = 320;
  const height = 180;
  const base = new PNG({ width, height });
  for (let i = 0; i < base.data.length; i += 4) {
    base.data[i] = 18; base.data[i + 1] = 22; base.data[i + 2] = 28; base.data[i + 3] = 255;
  }
  const referencePath = path.join(dir, 'reference.png');
  const identicalPath = path.join(dir, 'identical.png');
  const perturbedPath = path.join(dir, 'perturbed.png');
  writeFileSync(referencePath, PNG.sync.write(base));
  writeFileSync(identicalPath, PNG.sync.write(base));

  // Repaint 12% of the pixels: above the loosest floor any surface carries, so this is red
  // everywhere in the matrix, not only on the deterministic instruments.
  const perturbed = new PNG({ width, height });
  base.data.copy(perturbed.data);
  const changeCount = Math.round(width * height * 0.12);
  for (let p = 0; p < changeCount; p += 1) {
    const i = p * 4;
    perturbed.data[i] = 240; perturbed.data[i + 1] = 96; perturbed.data[i + 2] = 32;
  }
  writeFileSync(perturbedPath, PNG.sync.write(perturbed));

  const same = diffPng(referencePath, identicalPath, 8);
  assert.equal(same.ratio, 0, 'an identical frame must diff to zero');
  assert.ok(same.ratio <= floorForSurface('footprint'), 'an identical frame must pass the strictest floor');

  const changed = diffPng(referencePath, perturbedPath, 8);
  assert.ok(changed.ratio > 0.11 && changed.ratio < 0.13, `expected ~12% changed, got ${changed.ratio}`);
  const floors = loadFloors();
  for (const surface of SHIPPING_SURFACES) {
    const floor = floorForSurface(surface.id, floors);
    assert.ok(changed.ratio > floor, `a 12% repaint must be red on ${surface.id} (floor ${floor})`);
  }

  // A frame that was never produced is total difference, so it can never masquerade as a pass.
  const absent = diffPng(referencePath, path.join(dir, 'never-captured.png'), 8);
  assert.equal(absent.ratio, 1);
  assert.equal(absent.dimensionsMatch, false);
});

test('the reference directory the check reads is the one the capture writes', () => {
  assert.equal(UI_FRAME_REFERENCE_DIR, path.join(ROOT, 'test', 'ui-frame-references'));
  assert.ok(existsSync(UI_FRAME_REFERENCE_DIR));
  assert.ok(existsSync(FLOORS_FILE));
});

// ------------------------------------------------- reachable vs owed, and the exit rule
//
// The line the exit code draws. PQ-180 .03 asks the check to fail on a REACHABLE frame that is
// missing. It does not ask it to fail forever on a screen nobody has built: credits, statistics and
// photo mode have `ownerFile: null` and no route into them, and a gate that is red on arrival for
// that reason is the gate agents learn to ignore — the handoff says exactly that about
// `check:ui:grammar-matrix`. So those rows stay in the table with their packet and their leaf, in
// full, and they are a bill rather than a failure.

test('a missing frame on a surface the harness can open is a FAILURE; one with no route at all is OWED', () => {
  const plan = buildFramePlan();
  const coverage = buildCoverageReport({
    plan, referenceDir: '/nowhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: () => false,
  });

  // Every planned frame is still reported. The split never shortens the table.
  assert.equal(coverage.missing.length, plan.length);
  assert.equal(coverage.missingReachable.length + coverage.missingUnreachable.length, plan.length);

  // The owed set is exactly the manifest's own route-less surfaces, not a hand-written list.
  const routeless = SHIPPING_SURFACES
    .filter((s) => !AUTOMATABLE_SURFACES.some((a) => a.id === s.id))
    .map((s) => s.id)
    .sort();
  assert.ok(routeless.length > 0, 'the manifest should still carry route-less surfaces to owe');
  assert.deepEqual([...coverage.unreachableSurfaces].sort(), routeless);
  for (const id of routeless) {
    const surface = SHIPPING_SURFACES.find((s) => s.id === id);
    assert.ok(
      surface.entry.kind === 'none' || !surface.ownerFile,
      `${id} is owed but it has both a module and an implemented opener — it should be shootable`,
    );
  }

  // A surface the harness CAN open is never owed, however it is opened. A fixture is enough to
  // PHOTOGRAPH a screen; it is never evidence a player can reach it, and the grammar matrix keeps
  // that reachability cell red either way.
  for (const id of ['station-market', 'game-over', 'crucible-draft', 'comms-radial']) {
    assert.ok(isCaptureReachable(id), `${id} has an opener, so a missing frame for it must be a failure`);
    assert.ok(!coverage.unreachableSurfaces.includes(id));
  }

  // Both halves carry an owner, a leaf and a remedy. Being non-fatal is not being silent.
  for (const row of coverage.missingUnreachable) {
    assert.ok(ADMITTED_OWNER_PACKETS.includes(row.owner), `${row.file}: ${row.owner} is not an admitted packet`);
    assert.ok(row.ownerLeaf, `${row.file} has no owner leaf`);
    assert.match(row.remedy, /no opener exists|never photographed|capture failed|skipped/);
  }

  const text = formatCoverageReport(coverage, SHIPPING_SURFACES);
  assert.match(text, /MISSING and shootable — the check FAILS on these/);
  assert.match(text, /OWED — no route opens these/);
});

test('the exit rule fails on a reachable gap and on a diff, and never on an owed frame alone', () => {
  const plan = buildFramePlan();
  const allMissing = buildCoverageReport({
    plan, referenceDir: '/nowhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: () => false,
  });
  const green = { failures: [] };

  const withGaps = decideExit({ coverage: allMissing, repeatability: green, visual: green });
  assert.equal(withGaps.code, 1);
  assert.match(withGaps.reasons.join(' '), /missing reference frame\(s\) on surfaces the harness can open/);

  // ONLY owed frames: green.
  const owedOnly = { ...allMissing, missingReachable: [], missingUnreachable: allMissing.missing };
  assert.equal(decideExit({ coverage: owedOnly, repeatability: green, visual: green }).code, 0);

  // A frame over its floor is red whatever the coverage says, and so is one that was still moving.
  const oneBad = { failures: [{ name: 'ship-default-1920x1080.png', surface: 'ship', ratio: 0.9, floor: 0.03 }] };
  assert.equal(decideExit({ coverage: owedOnly, repeatability: green, visual: oneBad }).code, 1);
  assert.equal(decideExit({ coverage: owedOnly, repeatability: oneBad, visual: green }).code, 1);
});

test('the check CLI exits on the shared rule, not on a second copy of it', () => {
  const source = readFileSync(path.join(ROOT, 'scripts', 'check-visual-regression.mjs'), 'utf8');
  assert.match(source, /decideExit\(\{ coverage, repeatability, visual \}\)/);
  assert.match(source, /judgeFrames\(\{/, 'both tables must come from the shared judge');
  // The capture writes into a temp dir it deletes first. The cross-variance sample now defaults to
  // the committed baseline, so one wrong call would erase the whole reference set.
  assert.match(source, /refusing to capture into the committed reference directory/);
});

test('--coverage-only judges the committed baseline without recapturing', () => {
  const source = readFileSync(path.join(ROOT, 'scripts', 'check-visual-regression.mjs'), 'utf8');
  assert.match(source, /if \(arg === '--coverage-only'\) \{ parsed\.coverageOnly = true/);
  assert.match(source, /args\.coverageOnly \|\| !!args\.fromDirs/,
    'coverage-only must skip the capture the same way --from-dirs does');
  assert.match(source, /if \(args\.coverageOnly\)/,
    'coverage-only must not run rest-twin or visual judges against an empty temp dir');
});

// ------------------------------------------------- the perturbation, through the real judge

test('a deliberately perturbed frame turns the check red through the same judge it exits on', async (t) => {
  // The synthetic diff test above proves diffPng counts pixels. This one proves the CHECK acts on
  // it: the same judgeFrames/decideExit pair check-visual-regression.mjs calls, over a real plan
  // with real files, so a green exit on a changed frame cannot hide behind a wrapper.
  //
  // Everything lives in a temp dir. A perturbed frame must never touch the committed baseline — the
  // golden law in test/ui-frame-references/README.md is that references change only when the visual
  // change was intended.
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-ui-frame-judge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const referenceDir = path.join(dir, 'reference');
  const cleanDir = path.join(dir, 'clean');
  const dirtyDir = path.join(dir, 'dirty');
  for (const d of [referenceDir, cleanDir, dirtyDir]) mkdirSync(d, { recursive: true });

  // Two frames on `footprint` — the surface with the strictest floor in the matrix — so nothing
  // here passes on slack.
  const miniPlan = [
    { surface: 'footprint', mode: 'default', viewport: '1280x720', width: 320, height: 180 },
    { surface: 'footprint', mode: 'forced-colors', viewport: '1280x720', width: 320, height: 180 },
  ];
  const paint = (width, height, changedFraction) => {
    const png = new PNG({ width, height });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = 18; png.data[i + 1] = 22; png.data[i + 2] = 28; png.data[i + 3] = 255;
    }
    const changed = Math.round(width * height * changedFraction);
    for (let p = 0; p < changed; p += 1) {
      const i = p * 4;
      png.data[i] = 240; png.data[i + 1] = 96; png.data[i + 2] = 32;
    }
    return PNG.sync.write(png);
  };
  for (const entry of miniPlan) {
    const name = frameFileName(entry);
    writeFileSync(path.join(referenceDir, name), paint(entry.width, entry.height, 0));
    writeFileSync(path.join(cleanDir, name), paint(entry.width, entry.height, 0));
    writeFileSync(path.join(dirtyDir, name), paint(entry.width, entry.height, 0));
  }
  // Perturb exactly ONE of the two frames, by 4% — far above footprint's measured 0.5% floor and far
  // below "the whole screen changed", so this is the size of defect the matrix exists to catch.
  const perturbed = frameFileName(miniPlan[1]);
  writeFileSync(path.join(dirtyDir, perturbed), paint(miniPlan[1].width, miniPlan[1].height, 0.04));

  const floors = loadFloors();
  const green = judgeFrames({ plan: miniPlan, referenceDir, candidateDir: cleanDir, floors, frameFileName });
  assert.equal(green.rows.length, 2, 'both frames must be judged');
  assert.equal(green.failures.length, 0, 'an unchanged capture must be green');

  const red = judgeFrames({ plan: miniPlan, referenceDir, candidateDir: dirtyDir, floors, frameFileName });
  assert.equal(red.rows.length, 2);
  assert.equal(red.failures.length, 1, 'exactly the perturbed frame must fail');
  assert.equal(red.failures[0].name, perturbed);
  assert.ok(red.failures[0].ratio > 0.039 && red.failures[0].ratio < 0.041, `expected ~4%, got ${red.failures[0].ratio}`);
  assert.equal(red.failures[0].floor, 0.005);

  const fullCoverage = { missing: [], missingReachable: [], missingUnreachable: [] };
  assert.equal(decideExit({ coverage: fullCoverage, repeatability: green, visual: green }).code, 0);
  const decision = decideExit({ coverage: fullCoverage, repeatability: green, visual: red });
  assert.equal(decision.code, 1, 'a perturbed frame must exit non-zero');
  assert.match(decision.reasons.join(' '), /differ from their reference by more than the surface floor/);
});

// ------------------------------------------------- the pseudo-localised route

test('the pseudo-localised label the harness looks for is the one the GAME renders', () => {
  // Four surfaces lost their entire pseudo-localised column to this. The harness matched control
  // labels by stripping accents, but pseudoLocalize maps t, d, h, p, b, f, m and q onto letters with
  // a STROKE, which have no NFD decomposition — so the harness's own normalizer deleted them instead
  // of folding them back to ASCII. "Settings" renders as a string that normalizes to "seeiings", and
  // "settings" is not a substring of that.
  const strip = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

  const rendered = pseudoLocalize('Settings');
  assert.ok(!strip(rendered).includes(strip('Settings')), 'this test is pointless if accent-stripping already matched');

  // The fix asks the game what the label becomes. It never loosens the matcher until something hits.
  const candidates = labelCandidates('Settings');
  assert.ok(candidates.includes('Settings'), 'the English label must stay a candidate');
  assert.ok(candidates.includes(rendered), 'the game own pseudo-localised label must be a candidate');
  assert.ok(candidates.some((candidate) => strip(rendered).includes(strip(candidate))));

  // Every text-matched entry route in the manifest, not just the one that was noticed.
  const textRoutes = SHIPPING_SURFACES.filter((s) => s.entry && s.entry.text);
  assert.ok(textRoutes.length >= 4, 'the manifest should still route several surfaces by label');
  for (const surface of textRoutes) {
    const list = labelCandidates(surface.entry.text);
    const renderedHere = pseudoLocalize(surface.entry.text);
    assert.ok(
      list.some((candidate) => strip(renderedHere).includes(strip(candidate))),
      `${surface.id}: no candidate matches what the game renders for "${surface.entry.text}"`,
    );
  }
});

test('a filter narrows the menu phase too, and normalizing it twice cannot undo it', () => {
  // The filter is normalized once in captureUiMatrix and handed on to the menu-phase capture. When
  // normalizeFrameFilter was not idempotent the second pass turned every Set back into null, the
  // menu phase ignored --only= and re-photographed the title and new-game screens on every filtered
  // run — which under --update would have rewritten two references nobody asked to re-shoot.
  const once = normalizeFrameFilter({ surfaces: ['settings'], modes: ['pseudo-localized'], viewports: ['1280'] });
  const twice = normalizeFrameFilter(once);
  assert.deepEqual([...twice.surfaces], ['settings']);
  assert.deepEqual([...twice.modes], ['pseudo-localized']);
  assert.deepEqual([...twice.viewports], ['1280']);
  assert.deepEqual(normalizeFrameFilter(normalizeFrameFilter(null)), { surfaces: null, modes: null, viewports: null });
});

// ------------------------------------------------- the floors cache

test('calibrating and then judging in one process cannot read the pre-calibration floors', () => {
  const before = loadFloors();
  assert.equal(loadFloors(), before, 'floors are memoised');
  invalidateFloorCache();
  const after = loadFloors();
  assert.notEqual(after, before, 'invalidateFloorCache must force a re-read');
  assert.deepEqual(after.surfaces.ship, before.surfaces.ship, 'a re-read of an unchanged file must agree with itself');

  const source = readFileSync(path.join(ROOT, 'scripts', 'check-visual-regression.mjs'), 'utf8');
  const calibrateAt = source.indexOf('calibrated floors written');
  const invalidateAt = source.indexOf('invalidateFloorCache()');
  const judgeAt = source.indexOf('const floors = loadFloors();');
  assert.ok(calibrateAt > 0 && invalidateAt > calibrateAt && judgeAt > invalidateAt,
    'the check must invalidate between writing the floors and judging against them');
});

// ------------------------------------------------- the capture cannot lose a whole run

test('a capture that completes does not throw on its own bookkeeping', () => {
  // `uniqueCaptures` was declared below the two statements that read it. `const` is not hoisted, so
  // every COMPLETE run threw a ReferenceError after the browser and the server had been torn down,
  // and the check answered that by re-shooting the whole matrix three times.
  const source = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  const declaredAt = source.indexOf('const uniqueCaptures =');
  assert.ok(declaredAt > 0, 'uniqueCaptures must still exist');
  // Structural, not a list of known readers: the FIRST mention in the file must be the declaration.
  // A list would go stale the moment a reader is added or removed, and quietly stop guarding.
  const firstMention = source.indexOf('uniqueCaptures');
  assert.equal(
    firstMention,
    declaredAt + 'const '.length,
    'something reads uniqueCaptures before the const that declares it',
  );
  // A boot that never comes up costs its own width, and says so, instead of aborting the matrix.
  assert.match(source, /function recordBootFailure/);
  assert.match(source, /recordBootFailure\(\{ failures, surfaces: allPlannedSurfaces/);
  // --update prunes against the PLAN. Pruning against this run's captures would delete a good
  // reference because one run could not open its surface — an hour of capture lost to a timeout.
  assert.match(source, /pruneStaleReferencePngs\(new Set\(plan\.map/);
  assert.doesNotMatch(source, /pruneStaleReferencePngs\(new Set\(uniqueCaptures/);
});

// ------------------------------------------------- one universe, not four hundred and eighty

test('every reference frame is photographed in the SAME universe, and the boot proves it', () => {
  // The defect this pins was invisible and total. `resetRunState` seeds a new game with
  // `Date.now() ^ Math.random()` when the seed field is blank (src/main.js), so every boot built a
  // different galaxy — different market prices, different contracts, different traffic, different
  // missions. Every reference frame was therefore a photograph of a universe no later run would
  // ever see again, and diffing against it could only be made green by a floor wide enough to hide
  // a real regression inside. The frames looked perfect the whole time.
  //
  // The harness now types a seed into `#sf-ng-seed`, the field a player types one into, and then
  // READS IT BACK from the running game. Typing without checking is how this survived once already.
  assert.equal(UI_MATRIX_SEED, 47, 'the matrix seed is the repo canonical fixture seed');
  assert.ok(Number.isSafeInteger(UI_MATRIX_SEED) && UI_MATRIX_SEED > 0 && UI_MATRIX_SEED <= 0xffffffff,
    'parseUniverseSeed in src/ui/screens/newGame.js only accepts 1..0xffffffff');

  const source = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  assert.match(source, /sf-ng-seed/, 'the seed must be set through the field the player uses');
  assert.match(source, /state\.meta \? state\.meta\.seed : null/, 'the boot must read the seed back');
  assert.match(source, /if \(actualSeed !== UI_MATRIX_SEED\)/, 'a boot with the wrong seed must fail, not photograph');

  const setAt = source.indexOf('setUniverseSeed(page, UI_MATRIX_SEED)');
  const menuAt = source.indexOf("menuPhase(page, 'new-game')");
  assert.ok(setAt > 0 && menuAt > setAt,
    'the seed must be set BEFORE the new-game screen is photographed, or that frame is not deterministic either');
});

// ------------------------------------------------- a frame is coverage only while it is comparable

test('a frame photographed in another universe is MISSING, never quietly counted as coverage', () => {
  // This is the difference between a resumable baseline and a lie. A half-re-shot baseline diffs a
  // frame from the old random-universe era against a seed-pinned capture and reads 5-40 % changed —
  // indistinguishable from a real regression, and the calibration would bank it as that surface's
  // floor. So provenance decides coverage: same seed, or missing.
  const plan = buildFramePlan({ surfaces: ['footprint'], modes: ['default'], viewports: ['1280'] });
  assert.equal(plan.length, 1);
  const file = frameFileName(plan[0]);
  const onDisk = () => true;

  const current = buildCoverageReport({
    plan, referenceDir: '/anywhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: onDisk,
    provenance: { seed: UI_MATRIX_SEED, frames: { [file]: { seed: UI_MATRIX_SEED } } },
    expectedSeed: UI_MATRIX_SEED,
  });
  assert.equal(current.present, 1, 'a frame shot in the current universe is coverage');
  assert.equal(current.missing.length, 0);
  assert.equal(current.staleFrames.length, 0);

  const otherUniverse = buildCoverageReport({
    plan, referenceDir: '/anywhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: onDisk,
    provenance: { seed: 999, frames: { [file]: { seed: 999 } } },
    expectedSeed: UI_MATRIX_SEED,
  });
  assert.equal(otherUniverse.present, 0, 'a frame from another seed is not coverage');
  assert.equal(otherUniverse.staleFrames.length, 1);
  assert.equal(otherUniverse.missingReachable.length, 1, 'and it is a failure, because footprint is shootable');
  assert.match(otherUniverse.staleFrames[0].remedy, /photographed in a different universe/);
  assert.match(otherUniverse.staleFrames[0].remedy, /--update --only=footprint/);

  // No record at all is the same answer. Nothing is known to be current, which is the safe reading.
  const unrecorded = buildCoverageReport({
    plan, referenceDir: '/anywhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: onDisk,
    provenance: { seed: null, frames: {} },
    expectedSeed: UI_MATRIX_SEED,
  });
  assert.equal(unrecorded.present, 0);
  assert.equal(unrecorded.staleFrames.length, 1);
  assert.match(unrecorded.staleFrames[0].remedy, /seed unrecorded/);

  assert.match(formatCoverageReport(otherUniverse, SHIPPING_SURFACES), /STALE — 1 frame\(s\) are on disk/);
});

test('a stale frame is never diffed, so it can never be reported as a regression', () => {
  // The other half of the rule. Counting it missing but still diffing it would print exactly the
  // false red the provenance record exists to prevent.
  const { PNG } = createRequire(import.meta.url)('pngjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-ui-frame-stale-'));
  const referenceDir = path.join(dir, 'reference');
  const candidateDir = path.join(dir, 'candidate');
  mkdirSync(referenceDir); mkdirSync(candidateDir);

  const entry = { surface: 'footprint', mode: 'default', viewport: '1280x720', width: 320, height: 180 };
  const name = frameFileName(entry);
  const paint = (value) => {
    const png = new PNG({ width: 320, height: 180 });
    for (let i = 0; i < png.data.length; i += 4) {
      png.data[i] = value; png.data[i + 1] = value; png.data[i + 2] = value; png.data[i + 3] = 255;
    }
    return PNG.sync.write(png);
  };
  // Two completely different pictures: an old-universe reference against a current capture.
  writeFileSync(path.join(referenceDir, name), paint(20));
  writeFileSync(path.join(candidateDir, name), paint(220));

  const floors = loadFloors();
  const judged = judgeFrames({ plan: [entry], referenceDir, candidateDir, floors, frameFileName });
  assert.equal(judged.failures.length, 1, 'without the skip this is a 100% regression');

  const skipped = judgeFrames({
    plan: [entry], referenceDir, candidateDir, floors, frameFileName, skipFrames: new Set([name]),
  });
  assert.equal(skipped.rows.length, 0, 'a stale frame is not judged at all');
  assert.equal(skipped.failures.length, 0, 'and so cannot masquerade as a regression');
  rmSync(dir, { recursive: true, force: true });
});

test('the check reads provenance, and the capture writes it as it goes', () => {
  const check = readFileSync(path.join(ROOT, 'scripts', 'check-visual-regression.mjs'), 'utf8');
  assert.match(check, /provenance: readReferenceProvenance\(\)/);
  assert.match(check, /expectedSeed: UI_MATRIX_SEED/);
  assert.match(check, /expectedGround: UI_MATRIX_GROUND/);
  assert.match(check, /skipFrames: notCurrent/, 'coverage and the diff table must agree on what is current');

  const capture = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  // Written per frame, not at the end: a full matrix takes hours, and a record written only after
  // the last frame turns any interruption into a baseline whose provenance is unknown.
  const promoteAt = capture.indexOf('recordReferenceProvenance(name, provenance)');
  assert.ok(promoteAt > 0, 'the promote path must record provenance');
  assert.match(capture, /const current = existsSync\(target\)\s+&& !!provenance && isFrameCurrent\(provenance\.frames\[name\]\);/,
    '--fill-missing must re-shoot a frame that is present but not comparable — wrong universe OR wrong ground');
});

// ------------------------------------------------- the ground a reference frame is shot over

test('a reference frame photographs the interface over a neutral ground, and both halves of the 3D picture are hidden', () => {
  // The decision this pins: the matrix measures the INTERFACE. Type roles and the 12 px floor,
  // tabular numerals, colour spent on state, the layout skeleton, clipping at +40 %, forced-colours
  // and reduce-motion are every one of them properties of the interface layer. None of them is a
  // property of the starfield behind it, and the 3D picture already has its own instruments.
  //
  // Photographing the live picture costs the matrix its reason to exist: the world legitimately
  // moves, so the floor has to be widened until a real interface regression fits inside it. `flight`
  // carried a 10 % floor for exactly that reason.
  //
  // The game's 3D picture reaches the screen TWO ways, and both are ground: `#gl-canvas`, the live
  // WebGL surface, and the `#screens` cinematic plate, which is the same picture pre-rendered.
  // Calling one ground and the other interface would be incoherent.
  const source = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  assert.match(source, /#gl-canvas \{ opacity: 0 !important; \}/,
    'the live picture is hidden with opacity, so the canvas keeps its box and its hit-testing '
    + '(src/systems/input.js binds to #gl-canvas; autoTargetAssist reads its rect)');
  assert.doesNotMatch(source, /#gl-canvas \{[^}]*display: none/,
    'display:none would resize the renderer and change what the game is doing, not just what is filmed');
  assert.match(source, /#screens \{ background-image: none !important; \}/,
    'the baked half of the picture is hidden too, and ONLY its image — the readability scrim above it '
    + 'is interface and stays');

  // What is NOT hidden: every canvas the interface owns. The radar dial, the chart, the ship stage's
  // hull preview and the portraits are drawn to canvases and are part of the picture being measured.
  // A blanket `canvas { ... }` rule would erase them and nobody would see it in a coverage number.
  assert.doesNotMatch(source, /\n\s*canvas \{/, 'the rule is per element, never every canvas on the page');

  // The ground token carries the hex. A silent change to the colour would move every diff in the
  // matrix with nothing anywhere saying so — the unpinned-seed failure, one layer down.
  assert.match(UI_MATRIX_GROUND, /^neutral-[0-9a-f]{6}$/);
  assert.equal(UI_MATRIX_GROUND, `neutral-${NEUTRAL_GROUND_HEX.slice(1)}`);

  // Applied at the top of the boot. The title and new-game frames are shot inside menuPhase, which
  // runs later in the same openBoot; a ground applied after them would leave two frames on the old one.
  const groundAt = source.indexOf('await applyNeutralGround(page);');
  const titleAt = source.indexOf("if (menuPhase) await menuPhase(page, 'title');");
  assert.ok(groundAt > 0 && titleAt > groundAt,
    'the ground must be established before the first frame of the boot');
});

test('a frame shot over another ground is MISSING, never quietly counted as coverage', () => {
  // The same law as the seed, for the same reason. A frame from the live-ground era, diffed against
  // a current capture, differs by 40-90 % for reasons that have nothing to do with the interface —
  // and the calibration would bank that as the surface's floor.
  const plan = buildFramePlan({ surfaces: ['footprint'], modes: ['default'], viewports: ['1280'] });
  const file = frameFileName(plan[0]);
  const onDisk = () => true;
  const report = (record) => buildCoverageReport({
    plan, referenceDir: '/anywhere', frameFileName, surfaces: SHIPPING_SURFACES, exists: onDisk,
    provenance: { seed: UI_MATRIX_SEED, ground: UI_MATRIX_GROUND, frames: { [file]: record } },
    expectedSeed: UI_MATRIX_SEED,
    expectedGround: UI_MATRIX_GROUND,
  });

  const current = report({ seed: UI_MATRIX_SEED, ground: UI_MATRIX_GROUND });
  assert.equal(current.present, 1, 'the right universe over the right ground is coverage');

  const otherGround = report({ seed: UI_MATRIX_SEED, ground: 'live-3d' });
  assert.equal(otherGround.present, 0, 'the right universe over the WRONG ground is not coverage');
  assert.equal(otherGround.staleFrames.length, 1);
  assert.equal(otherGround.staleFrames[0].staleReason, 'ground');
  assert.equal(otherGround.missingReachable.length, 1, 'and it is a failure, because footprint is shootable');
  assert.match(otherGround.staleFrames[0].remedy, /photographed over a different ground/);
  assert.match(otherGround.staleFrames[0].remedy, /--update --only=footprint/);

  // Unrecorded is the same answer: every frame from before the ground was pinned was shot over the
  // live picture, and nothing is known to be current.
  const unrecorded = report({ seed: UI_MATRIX_SEED });
  assert.equal(unrecorded.present, 0);
  assert.match(unrecorded.staleFrames[0].remedy, /unrecorded — the live 3D picture/);

  // A wrong seed is still reported as a wrong seed, not swallowed by the ground row.
  const otherSeed = report({ seed: 999, ground: UI_MATRIX_GROUND });
  assert.equal(otherSeed.staleFrames[0].staleReason, 'seed');
  assert.match(otherSeed.staleFrames[0].remedy, /photographed in a different universe/);

  const line = formatCoverageReport(otherGround, SHIPPING_SURFACES);
  assert.match(line, /0 from another universe, 1 over another ground/);
});

test('a frame is current only when the universe AND the ground both match', () => {
  assert.equal(isFrameCurrent({ seed: UI_MATRIX_SEED, ground: UI_MATRIX_GROUND }), true);
  assert.equal(isFrameCurrent({ seed: UI_MATRIX_SEED, ground: 'live-3d' }), false);
  assert.equal(isFrameCurrent({ seed: UI_MATRIX_SEED }), false, 'an unrecorded ground is the live picture');
  assert.equal(isFrameCurrent({ seed: 999, ground: UI_MATRIX_GROUND }), false);
  assert.equal(isFrameCurrent(null), false);
});

test('the provenance record carries the ground for every frame, and so does the file it writes', () => {
  const capture = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');
  assert.match(capture, /ground: UI_MATRIX_GROUND,\s*\n\s*capturedAt:/,
    'every promoted frame records the ground it was shot over, beside the seed');
  assert.match(capture, /ground: provenance\.ground,/, 'and the file states the run ground once at the top');

  const file = path.join(UI_FRAME_REFERENCE_DIR, 'provenance.json');
  if (!existsSync(file)) return; // an empty baseline is a legitimate state; the coverage table says so
  const record = JSON.parse(readFileSync(file, 'utf8'));
  const frames = Object.entries(record.frames || {});
  if (!frames.length) return;
  // Not an assertion that the baseline is complete — that is the check's job, and a partly re-shot
  // baseline is a legitimate state. This asserts only that nothing reads as current that is not.
  for (const [name, entry] of frames) {
    if (entry.ground === UI_MATRIX_GROUND && entry.seed === UI_MATRIX_SEED) continue;
    assert.notEqual(isFrameCurrent(entry), true, `${name} must not read as current`);
  }
});

test('a REAL committed frame, perturbed, goes red — and the same frame unchanged stays green', async (t) => {
  // The synthetic proof above shows the judge counts pixels. This one runs it against the actual
  // baseline on disk: a committed reference frame, at its real size, over the real neutral ground,
  // with its real floor. Nothing is written into the baseline — the perturbation lives in a temp
  // directory, because the golden law is that a reference changes only when the change was intended.
  const provenanceFile = path.join(UI_FRAME_REFERENCE_DIR, 'provenance.json');
  if (!existsSync(provenanceFile)) return;
  const provenance = JSON.parse(readFileSync(provenanceFile, 'utf8'));
  const plan = buildFramePlan();
  const byName = new Map(plan.map((entry) => [frameFileName(entry), entry]));
  const picked = Object.entries(provenance.frames || {})
    .filter(([name, entry]) => isFrameCurrent(entry)
      && byName.has(name)
      && existsSync(path.join(UI_FRAME_REFERENCE_DIR, name)))
    .map(([name]) => name)
    .sort()[0];
  if (!picked) return; // nothing shot yet; the coverage table is what reports that
  const entry = byName.get(picked);

  const { PNG } = createRequire(import.meta.url)('pngjs');
  const dir = mkdtempSync(path.join(tmpdir(), 'sf-ui-frame-real-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cleanDir = path.join(dir, 'clean');
  const dirtyDir = path.join(dir, 'dirty');
  mkdirSync(cleanDir); mkdirSync(dirtyDir);

  const bytes = readFileSync(path.join(UI_FRAME_REFERENCE_DIR, picked));
  writeFileSync(path.join(cleanDir, picked), bytes);

  // The perturbation is the size of defect this matrix exists to catch: a band of pixels well above
  // the surface's floor and nowhere near "the whole screen changed" — a control that moved, a panel
  // that grew, a colour that stopped meaning a state.
  const floor = floorForSurface(entry.surface);
  const png = PNG.sync.read(bytes);
  const target = Math.min(0.9, Math.max(floor * 4, 0.02));
  const rows = Math.max(1, Math.round(png.height * target));
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = ((y * png.width) + x) << 2;
      png.data[i] = 255 - png.data[i];
      png.data[i + 1] = 255 - png.data[i + 1];
      png.data[i + 2] = 255 - png.data[i + 2];
    }
  }
  writeFileSync(path.join(dirtyDir, picked), PNG.sync.write(png));

  const floors = loadFloors();
  const green = judgeFrames({
    plan: [entry], referenceDir: UI_FRAME_REFERENCE_DIR, candidateDir: cleanDir, floors, frameFileName,
  });
  assert.equal(green.rows.length, 1, `${picked} must be judged`);
  assert.equal(green.failures.length, 0, 'a byte-identical capture of a committed frame must be green');

  const red = judgeFrames({
    plan: [entry], referenceDir: UI_FRAME_REFERENCE_DIR, candidateDir: dirtyDir, floors, frameFileName,
  });
  assert.equal(red.failures.length, 1, `${picked} perturbed by ~${(target * 100).toFixed(1)}% must fail`);
  assert.ok(red.failures[0].ratio > floor,
    `the perturbation (${(red.failures[0].ratio * 100).toFixed(3)}%) must exceed the surface floor `
    + `(${(floor * 100).toFixed(3)}%) — otherwise this proves nothing`);

  const fullCoverage = { missing: [], missingReachable: [], missingUnreachable: [] };
  assert.equal(decideExit({ coverage: fullCoverage, repeatability: green, visual: green }).code, 0);
  assert.equal(decideExit({ coverage: fullCoverage, repeatability: green, visual: red }).code, 1,
    'and the check exits non-zero on it');
});

test('every path that promotes a frame carries the provenance record with it', () => {
  // The defect this pins cost a whole capture run and had exactly one symptom: a coverage number
  // that would not move. The primary-boot `captureModeSet` call — the one responsible for roughly
  // 270 of the 408 frames — was missing its `provenance` argument. Every frame it promoted was
  // copied into the baseline correctly and recorded nowhere, so each one read as STALE on every
  // later run, and the check could never go green no matter how many times the matrix was shot.
  //
  // It was invisible because promoting and recording were two statements and only one of them was
  // guarded. So the promote path now REFUSES to write a frame it cannot record, and every call site
  // is checked here — a capture that costs hours must fail in its first seconds, not at the end.
  const source = readFileSync(path.join(ROOT, 'scripts', 'capture-ui-matrix.mjs'), 'utf8');

  assert.match(source, /if \(!provenance\) \{\s*\n\s*throw new Error\(`refusing to promote/,
    'promoting a frame with no provenance record must throw, not write a permanently stale frame');

  // Every call that can promote must hand the record along. `promoteReference` is what turns a
  // capture into a baseline write; wherever it is passed, `provenance` must be passed too.
  const calls = [...source.matchAll(/await\s+capture(?:ModeSet|SurfaceScreenshot)\(\{[\s\S]*?\n\s*\}\)/g)]
    .map((match) => match[0]);
  assert.ok(calls.length >= 4, `expected the capture call sites to be found, saw ${calls.length}`);
  for (const call of calls) {
    if (!/promoteReference/.test(call)) continue;
    assert.match(call, /provenance/,
      `a capture call that can promote a reference must pass provenance:\n${call}`);
  }
});
