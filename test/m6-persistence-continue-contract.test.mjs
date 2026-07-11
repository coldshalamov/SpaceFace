// Static / focused contract for M6 cold title-Continue persistence check.
// Fast, no browser runtime. Verifies:
//   - required public selectors + marks are declared and referenced
//   - forbidden injection / fake dock-accept-load / localStorage writes are absent
//   - check reuses visual probe server, Playwright loader, public route, issue collector
//
// Run: node --test test/m6-persistence-continue-contract.test.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  M6_REQUIRED_MARKS,
  M6_SELECTORS,
  M6_SCREENSHOTS,
  stableStringify,
  writeM6Evidence,
} from '../scripts/lib/m6PersistenceContinue.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const LIB_PATH = path.join(ROOT, 'scripts', 'lib', 'm6PersistenceContinue.mjs');
const CHECK_PATH = path.join(ROOT, 'scripts', 'check-m6-persistence-continue.mjs');

const [libSource, checkSource] = await Promise.all([
  readFile(LIB_PATH, 'utf8'),
  readFile(CHECK_PATH, 'utf8'),
]);
const combined = `${libSource}\n${checkSource}`;

test('M6 persistence files exist (bounded new-file surface)', () => {
  assert.equal(existsSync(LIB_PATH), true, 'helper lib must exist');
  assert.equal(existsSync(CHECK_PATH), true, 'check script must exist');
});

test('check reuses public visual-probe / Playwright / route helpers', () => {
  assert.match(checkSource, /acquireVisualProbeServer/, 'must reuse visual probe server');
  assert.match(checkSource, /loadPlaywright/, 'must reuse Playwright loader');
  assert.match(checkSource, /runBrowserPublicRoute/, 'must reuse public route helper');
  assert.match(checkSource, /collectPageIssues/, 'must collect page issues');
  assert.match(checkSource, /createCanonicalUrlTracker|inspectCanonicalRootUrl/,
    'must track canonical URL');
  assert.match(checkSource, /closeOwnedResources/, 'must use owned cleanup');
  assert.match(checkSource, /runM6PersistenceContinue/, 'must call the M6 helper');
  assert.match(checkSource, /writeM6Evidence/, 'must write content-hashed evidence');
});

test('required public selectors are declared and used', () => {
  assert.equal(M6_SELECTORS.stationScreen, '[data-screen="station"]');
  assert.equal(
    M6_SELECTORS.missionsTab,
    '[data-screen="station"] [role="tab"][data-tab="missions"]',
  );
  assert.equal(M6_SELECTORS.missionsPanel, '[data-screen="station"] .st-missions');
  assert.match(M6_SELECTORS.acceptButton, /data-act="accept"/);
  assert.match(M6_SELECTORS.acceptButtonPreferred, /st-mission-accept|st-ops-btn--accept/);
  assert.equal(M6_SELECTORS.mainMenu, '[data-screen="mainMenu"]');
  assert.equal(M6_SELECTORS.saveEnvelopeKey, 'sf.save.quick');
  assert.equal(M6_SELECTORS.saveSlot, 'quick');
  assert.deepEqual(M6_SELECTORS.continueRole, {
    role: 'button',
    name: 'Continue',
    exact: true,
  });

  for (const fragment of [
    'data-tab="missions"',
    'data-act="accept"',
    'sf.save.quick',
    "name: 'Continue'",
    "keyboard.press('F5')",
    'page.reload',
  ]) {
    assert.ok(
      combined.includes(fragment),
      `source must reference public path fragment: ${fragment}`,
    );
  }
});

test('required marks are frozen and asserted by the helper', () => {
  assert.deepEqual([...M6_REQUIRED_MARKS], [
    'mission-tab-opened',
    'mission-accepted',
    'one-active-mission',
    'undocked',
    'save-written',
    'envelope-matches-ram',
    'cold-reloaded',
    'title-continue-clicked',
    'save-loaded-flight',
    'economy-restored-continue',
    'mission-restored-continue',
    'tracked-mission-rebound',
  ]);
  for (const mark of M6_REQUIRED_MARKS) {
    assert.ok(
      libSource.includes(`'${mark}'`) || libSource.includes(`"${mark}"`),
      `helper must emit mark ${mark}`,
    );
  }
  assert.match(libSource, /M6_REQUIRED_MARKS/, 'helper validates mark set');
  assert.match(checkSource, /M6_REQUIRED_MARKS/, 'check re-validates mark set');
});

test('screenshots are content-hashed evidence surfaces', () => {
  assert.ok(Object.keys(M6_SCREENSHOTS).length >= 4, 'at least four M6 screenshots');
  assert.match(libSource, /createHash\(['"]sha256['"]\)/, 'evidence uses sha256 digests');
  assert.match(libSource, /contentHash/, 'evidence publishes contentHash');
  assert.match(libSource, /stableStringify|sortKeys/, 'content hash uses stable JSON');
  assert.equal(typeof stableStringify({ b: 1, a: 2 }), 'string');
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});

test('evidence report uses a truthful detached SHA-256 receipt', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'sf-m6-persist-evidence-'));
  try {
    await writeFile(path.join(root, 'frame.png'), Buffer.from([1, 2, 3, 4]));
    const written = await writeM6Evidence({
      root,
      outputDir: root,
      screenshots: ['frame.png'],
      evidence: {
        schema: 'spaceface.m6PersistenceContinue.v1',
        taskId: 'contract-test',
        pass: true,
        inputSource: 'keyboard-mouse',
        injectedState: false,
        marks: [], markNames: [], preSave: {}, envelope: {}, postContinue: {},
        urlChecks: [], route: {}, checks: [], errors: {}, cleanup: {},
      },
    });
    const reportBytes = await readFile(written.reportPath);
    const actualSha = createHash('sha256').update(reportBytes).digest('hex');
    assert.equal(written.reportSha256, actualSha, 'returned hash must match final report bytes');
    assert.equal(await readFile(written.receiptPath, 'utf8'), `${actualSha}  evidence.json\n`);
    const report = JSON.parse(reportBytes.toString('utf8'));
    assert.equal(report.artifacts.some((artifact) => artifact.name === 'evidence.json'), false,
      'report may not make an impossible self-hash claim');
    assert.equal(report.artifacts[0].name, 'frame.png');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('forbids state injection and fake dock / accept / load paths', () => {
  const forbidden = [
    ['direct dock injection', /bus\.emit\s*\(\s*['"]dock:docked['"]/],
    ['direct accept emission', /bus\.emit\s*\(\s*['"]ui:acceptMission['"]/],
    ['direct game:load emission by probe', /bus\.emit\s*\(\s*['"]game:load['"]/],
    ['direct game:save emission by probe', /bus\.emit\s*\(\s*['"]game:save['"]/],
    ['direct game:new emission', /bus\.emit\s*\(\s*['"]game:new['"]/],
    ['mission board seeding', /missions\.boards\[[^\]]+\]\s*=/],
    ['board slots unshift/seed', /\.slots\s*\.\s*unshift\s*\(/],
    ['localStorage write', /localStorage\.setItem\s*\(/],
    ['sessionStorage seed', /sessionStorage\.setItem\s*\(/],
    ['addInitScript injection', /\baddInitScript\s*\(/],
    ['load intercept / swallow', /__sfContinueProbe|originalEmit|bus\.emit\s*=/],
    ['evaluate-synthesized UI click', /document\.querySelector[^\n;]*\.click\s*\(/],
    ['fixed shared game ports', /\b(?:8123|8160|41788)\b/],
    ['SAFE-001 coupling', /SAFE-001/],
    ['golden rewrite surface', /test\/.*\.expected\.json/],
    ['releaseSoak mutation', /releaseSoak(Probe|Contracts)/],
    ['package.json mutation', /package\.json/],
  ];
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(combined, pattern, `M6 persistence forbids ${label}`);
  }
});

test('read-only observation of save envelope is allowed; writes are not', () => {
  assert.match(libSource, /localStorage\.getItem/, 'may read sf.save.quick');
  assert.doesNotMatch(libSource, /localStorage\.setItem/, 'must not write localStorage');
  assert.doesNotMatch(checkSource, /localStorage\.setItem/, 'check must not write localStorage');
  assert.match(libSource, /save:completed/, 'observes real save:completed');
  assert.match(libSource, /save:loaded/, 'observes real save:loaded');
  assert.match(libSource, /bus\.once\s*\(\s*['"]save:completed['"]/,
    'subscribes once — does not emit save events');
  assert.match(libSource, /bus\.once\s*\(\s*['"]save:loaded['"]/,
    'subscribes once — does not emit load events');
});

test('economy + mission identity fields are compared across RAM, envelope, and Continue', () => {
  for (const field of [
    'credits',
    'cargoItems',
    'objectiveProgress',
    'objectiveTarget',
    'trackedMissionId',
  ]) {
    assert.ok(libSource.includes(field), `helper must compare field ${field}`);
  }
  assert.match(libSource, /activeCount/, 'asserts active mission cardinality');
  assert.match(libSource, /deepEqual\(liveEconomy,\s*ramEconomy\)|deepEqual\(.*economy/,
    'deep-compares economy across cold continue');
  assert.match(libSource, /exactly one active mission/i,
    'documents the one-active-mission contract');
});

test('public F5 and real title Continue (not F9 in-session load)', () => {
  assert.match(libSource, /keyboard\.press\(['"]F5['"]\)/, 'public F5 quick-save');
  assert.doesNotMatch(libSource, /keyboard\.press\(['"]F9['"]\)/,
    'cold path must not use F9; Continue owns load');
  assert.match(libSource, /getByRole\(['"]button['"],\s*\{\s*name:\s*['"]Continue['"]/,
    'clicks real title Continue control');
  assert.match(libSource, /page\.reload\s*\(/, 'cold reloads before Continue');
  assert.match(checkSource, /injectedState:\s*false/, 'declares no injected state');
  assert.match(checkSource, /inputSource:\s*['"]keyboard-mouse['"]/,
    'declares keyboard-mouse input source');
});

test('does not touch forbidden production lanes', () => {
  assert.doesNotMatch(combined, /from ['"].*src\/(systems|render|ui|save)\//,
    'must not import production systems to mutate them');
  assert.doesNotMatch(combined, /src\/systems\/input\.js/,
    'must not touch locked input.js');
  assert.doesNotMatch(combined, /flightV3|tacticalAI|renderer\.js/,
    'must not couple to flight/AI/renderer internals');
});
