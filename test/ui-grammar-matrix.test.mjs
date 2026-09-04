// ui-grammar-matrix.test.mjs — PQ-180. Proves the grammar matrix's floor actually bites, and that
// a proxy observation can never be mistaken for a rule passing.
//
// Every assertion here runs on synthetic measurements. That is the point: if proving "a 10 px label
// goes red" required a booted game and a GPU window, nobody would ever prove it, and a matrix whose
// floor was quietly broken would print a column of greens. No test asserts on a surface NAME — the
// rules must hold for any row, or they are not rules.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
import { buildFramePlan, frameFileName } from '../scripts/capture-ui-matrix.mjs';

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
  assert.match(row.cells['reference-frames'].detail, /capture:ui-matrix -- --update/);
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

test('one boot visits key routes before fixtures, docking late, and anything destructive last', () => {
  const order = orderForOneBoot(AUTOMATABLE_SURFACES).map((s) => s.id);
  const at = (id) => order.indexOf(id);
  const destructive = AUTOMATABLE_SURFACES.filter((s) => s.destructive);
  for (const s of destructive) assert.equal(at(s.id), order.length - 1, `${s.id} is not last`);
  for (const s of AUTOMATABLE_SURFACES) {
    if (s.entry.kind !== 'key') continue;
    assert.ok(at(s.id) < at('station-dock'), `${s.id} runs after docking`);
    for (const d of destructive) assert.ok(at(s.id) < at(d.id), `${s.id} runs after ${d.id}`);
  }
  for (const s of AUTOMATABLE_SURFACES) {
    if (s.entry.kind !== 'nested') continue;
    assert.ok(at(s.entry.parent) < at(s.id), `${s.id} runs before its parent ${s.entry.parent}`);
  }
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
