// Harness self-check and the loadout census. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessTree, parseLsTree, quoteLoadError, needsHash, gitBlobOid, renderEnvironmentAbort, STALE_BANNER, verifyHarnessEnvironment, isHarnessOutput, isRouteServed,
} from '../scripts/player-truth/environment.mjs';
import { classifyOfferRead, fittedClaimFromText, explanationThePlayerSees, fittedSentenceThePlayerSees } from '../scripts/player-truth/routes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('parseLsTree reads blob size and path', () => {
  const rows = parseLsTree('100644 blob abcdef 12\tassets/a.txt\n120000 tree 000  -\tdesign\n100644 blob abcdef 9\tdesign/b.md\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].size, 12);
  assert.equal(rows[0].oid, 'abcdef');
  assert.equal(rows[1].path, 'design/b.md');
});

test('quoteLoadError returns the player sentence and ignores ordinary text', () => {
  const q = quoteLoadError('boot\nThe authored starter ship could not be loaded. Retry Launch; saved games are unchanged.\nstack');
  assert.equal(q, 'The authored starter ship could not be loaded. Retry Launch; saved games are unchanged.');
  assert.equal(quoteLoadError('The opening scenario could not be loaded today'), 'The opening scenario could not be loaded');
  assert.equal(quoteLoadError('SpaceFace could not finish starting'), 'SpaceFace could not finish starting');
  assert.equal(quoteLoadError('Launch round 1'), null);
});

test('assessTree reports missing, size, and hash, and ignores extra files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pt-env-'));
  try {
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'assets/ok.txt'), 'hello');
    writeFileSync(path.join(dir, 'assets/bad-size.txt'), 'nope');
    writeFileSync(path.join(dir, 'assets/bad-hash.txt'), 'hello');
    writeFileSync(path.join(dir, 'assets/extra.txt'), 'ignored');
    const hello = gitBlobOid(Buffer.from('hello'));
    const entries = [
      { path: 'assets/ok.txt', oid: hello, size: 5 },
      { path: 'assets/missing.txt', oid: 'abc', size: 1 },
      { path: 'assets/bad-size.txt', oid: hello, size: 5 },
      { path: 'assets/bad-hash.txt', oid: 'deadbeef', size: 5 },
    ];
    const out = assessTree(entries, { root: dir });
    assert.equal(out.ok, false);
    const kinds = Object.fromEntries(out.problems.map((p) => [p.path, p.kind]));
    assert.equal(kinds['assets/missing.txt'], 'missing');
    assert.equal(kinds['assets/bad-size.txt'], 'size');
    assert.equal(kinds['assets/bad-hash.txt'], 'hash');
    assert.equal(kinds['assets/ok.txt'], undefined);
    assert.equal(kinds['assets/extra.txt'], undefined);
    const md = renderEnvironmentAbort({ problems: out.problems, commit: 'abc', checked: 4, hashed: out.hashed });
    assert.match(md, new RegExp(STALE_BANNER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(md, /not a gameplay FAIL/);
    assert.match(md, /assets\/missing\.txt: missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('needsHash covers small files, manifests, and starter glbs only', () => {
  assert.equal(needsHash('design/a.md', 100), true);
  assert.equal(needsHash('assets/big.bin', 1024 * 1024), false);
  assert.equal(needsHash('assets/ships/release/render-packages/kestrel/render-package.json', 180040), true);
  assert.equal(needsHash('assets/ships/release/render-packages/kestrel/render.glb', 1559940), true);
  assert.equal(needsHash('assets/ships/release/render-packages/kestrel-lod1/render.glb', 100000), true);
  assert.equal(needsHash('assets/ships/release/render-packages/wasp-frag-aft/render.glb', 100000), false);
});

test('classifyOfferRead separates an empty shelf from a missed selector', () => {
  const empty = classifyOfferRead({ cards: [], allCount: 0, sub: 'Wave 0 cleared. Nothing new fits this hull.', emptyText: 'No equipment matches this search.' });
  assert.equal(empty.offerSource, 'game-empty');
  assert.match(empty.offerQuote, /Nothing new fits/);
  assert.match(empty.offerQuote, /No equipment matches/);
  const miss = classifyOfferRead({ cards: [], allCount: 4, sub: 'Fit out before round 1' });
  assert.equal(miss.offerSource, 'harness-miss');
  const stray = classifyOfferRead({ cards: [], allCount: 0, strayNames: ['Cargo Scanner S'] });
  assert.equal(stray.offerSource, 'harness-miss');
  assert.equal(classifyOfferRead({ cards: [{ name: 'Pulse' }] }).offerSource, 'cards');
  assert.equal(classifyOfferRead({ cards: [], allCount: null, sub: '', emptyText: '' }).offerSource, 'harness-miss');
  assert.equal(fittedClaimFromText('Ricochet Runner Hornet · 4/8 fitted'), 4);
  assert.equal(fittedClaimFromText('hornet · 4 hardpoints fitted'), 4);
  assert.equal(fittedClaimFromText('A starter blurb with no count.'), 0);
});

test('an explanation is the sentence the player can see', () => {
  const lit = explanationThePlayerSees({
    blurb: 'A pulse laser for the hardpoint.', blurbVisible: false, lit: true,
    reading: 'A pulse laser for the hardpoint.', readingVisible: true, litBlurb: 'A pulse laser for the hardpoint.',
  });
  assert.equal(lit.surface, 'reading');
  assert.equal(lit.desc, 'A pulse laser for the hardpoint.');
  const other = explanationThePlayerSees({
    blurb: 'Reads what a hull carries in the hold.', blurbVisible: false, lit: false,
    reading: 'A pulse laser for the hardpoint.', readingVisible: true, litBlurb: 'A pulse laser for the hardpoint.',
  });
  assert.equal(other.surface, 'reading');
  assert.match(other.desc, /hull carries/);
  const hidden = explanationThePlayerSees({
    blurb: 'Reads what a hull carries in the hold.', blurbVisible: false, lit: false,
    reading: '', readingVisible: false, litBlurb: '',
  });
  assert.equal(hidden.desc, '');
  assert.equal(hidden.surface, 'none');
  const onCard = explanationThePlayerSees({ blurb: 'Printed on the card itself.', blurbVisible: true, lit: false, reading: '', readingVisible: false });
  assert.equal(onCard.surface, 'card');
  const stale = explanationThePlayerSees({
    blurb: 'A pulse laser for the hardpoint.', blurbVisible: false, lit: true,
    reading: 'Reads what a hull carries in the hold.', readingVisible: true,
    litBlurb: 'A pulse laser for the hardpoint.',
  });
  assert.equal(stale.desc, '');
  assert.equal(stale.surface, 'reading-mismatch');
  assert.match(stale.panel, /hull carries/);
  const noBlurb = explanationThePlayerSees({
    blurb: '', blurbVisible: false, lit: true,
    reading: 'A pulse laser for the hardpoint.', readingVisible: true, litBlurb: '',
  });
  assert.equal(noBlurb.surface, 'reading');
  assert.equal(noBlurb.desc, 'A pulse laser for the hardpoint.');
  const unproven = fittedSentenceThePlayerSees({ contrast: 'Hits harder than the fitted gun.', clipped: false, visible: false });
  assert.equal(unproven.desc, '');
  assert.equal(unproven.surface, 'none');
  const inferred = fittedSentenceThePlayerSees({ contrast: 'Hits harder than the fitted gun.', clipped: false, visible: false, selectedShowsOwn: true });
  assert.equal(inferred.surface, 'row-on-select');
  assert.match(inferred.desc, /Hits harder/);
  assert.equal(fittedSentenceThePlayerSees({ contrast: 'Hits harder than the fitted gun.', clipped: false, visible: true }).surface, 'row');
  assert.equal(fittedSentenceThePlayerSees({ contrast: 'Hits harder than the fitted gun.', clipped: true, visible: false, selectedShowsOwn: true }).desc, '');
  assert.equal(fittedSentenceThePlayerSees({ contrast: 'Hits harder than the fitted gun.', clipped: true, visible: false }).surface, 'clipped');
});

test('the harness scoreboard is not a route file', () => {
  assert.equal(isHarnessOutput('design/program/player-truth/SUMMARY.md'), true);
  assert.equal(isHarnessOutput('design/program/player-truth/adventure/verdict.md'), true);
  assert.equal(isHarnessOutput('assets/ships/release/render-packages/kestrel/render.glb'), false);
  assert.equal(isHarnessOutput('design/specs/03-economy-trading.md'), false);
});

test('only assets/ is graded: a design doc on the branch is not an environment abort', () => {
  assert.equal(isRouteServed('assets/ships/release/render-packages/kestrel/render-package.json'), true);
  assert.equal(isRouteServed('design/specs/03-economy-trading.md'), false);
  assert.equal(isRouteServed('design/program/DEMO_READINESS_2026-09-20.md'), false);
});

test('this worktree\'s served assets match HEAD', async () => {
  const { startBenchServer } = await import('../scripts/lib/benchServer.mjs');
  const server = await startBenchServer();
  try {
    const env = await verifyHarnessEnvironment({ root: ROOT, baseUrl: server.baseUrl });
    const preview = env.problems.slice(0, 6).map((p) => `${p.path} ${p.kind} expected ${p.expected} served ${p.served}`).join('\n');
    assert.equal(env.ok, true, preview);
    assert.ok(env.checked > 1000, `checked ${env.checked}`);
    assert.ok(env.hashed > 0, `hashed ${env.hashed}`);
  } finally {
    await server.close();
  }
});
