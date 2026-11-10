// Harness self-check and the loadout census. No browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  assessTree, parseLsTree, quoteLoadError, needsHash, gitBlobOid, renderEnvironmentAbort, STALE_BANNER, verifyHarnessEnvironment, isHarnessOutput, isRouteServed,
} from '../scripts/player-truth/environment.mjs';
import { classifyOfferRead, fittedClaimFromText, explanationThePlayerSees, fittedSentenceThePlayerSees } from '../scripts/player-truth/routes.mjs';
import { parseArgs } from '../scripts/player-truth/run.mjs';

const { sourceOverlayDigest } = createRequire(import.meta.url)('../scripts/lib/gameServer.cjs');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('candidate assets are explicit, HTTP-verified and leave committed baseline checks strict', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pt-candidate-'));
  const starter = 'assets/ships/release/render-packages/kestrel/render-package.json';
  const changed = 'assets/changed.txt'; const added = 'assets/new.txt'; const unchanged = 'assets/unchanged.txt';
  const disk = new Map([[starter, Buffer.from('{}')], [changed, Buffer.from('old')], [unchanged, Buffer.from('stable')]]);
  const candidate = new Map([[changed, Buffer.from('new candidate')], [added, Buffer.from('new asset')]]);
  let tamper = false;
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '');
    const data = tamper && name === added ? Buffer.from('wrong') : candidate.get(name) || disk.get(name);
    if (!data) { res.writeHead(404); res.end(); return; }
    res.end(data);
  });
  try {
    for (const [name, body] of disk) {
      const file = path.join(dir, name); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, body);
    }
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['add', '--', 'assets'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'assets'], { cwd: dir });
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    const files = [...candidate].map(([name, body]) => ({ path: name, bytes: body.length,
      sha256: createHash('sha256').update(body).digest('hex'), contentBase64: body.toString('base64') }));
    const overlay = { schema: 'spaceface.sourceBaseline.v1', sourceCommit, files,
      sourceOverlayDigest: sourceOverlayDigest(files) };
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const baseline = await verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: overlay });
    assert.equal(baseline.ok, false, 'a Git baseline still rejects changed and untracked candidate assets');
    assert.ok(baseline.problems.some((p) => p.path === changed));
    assert.ok(baseline.problems.some((p) => p.path === added));
    const good = await verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: overlay, candidateAssets: true });
    assert.equal(good.ok, true); assert.equal(good.candidateAssets, 2);
    tamper = true;
    const wrong = await verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: overlay, candidateAssets: true });
    assert.equal(wrong.ok, false, 'every candidate asset must match what the browser actually receives');
    assert.ok(wrong.problems.some((p) => p.path === added));
    tamper = false;
    writeFileSync(path.join(dir, unchanged), 'stale');
    const stale = await verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: overlay, candidateAssets: true });
    assert.equal(stale.ok, false, 'unoverridden committed assets are still checked against Git');
    assert.ok(stale.problems.some((p) => p.path === unchanged));
    await assert.rejects(() => verifyHarnessEnvironment({ root: dir, sourceOverlay: overlay, candidateAssets: true }), /running server/);
    const forged = structuredClone(overlay); forged.files[0].contentBase64 = Buffer.from('forged').toString('base64');
    await assert.rejects(() => verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: forged, candidateAssets: true }), /mismatch/);
    const wrongBase = structuredClone(overlay); wrongBase.sourceCommit = '0'.repeat(40);
    await assert.rejects(() => verifyHarnessEnvironment({ root: dir, baseUrl, sourceOverlay: wrongBase, candidateAssets: true }), /not an ancestor/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    const resolved = path.resolve(dir), tmp = path.resolve(tmpdir()) + path.sep;
    assert.ok(resolved.startsWith(tmp) && path.basename(resolved).startsWith('pt-candidate-'));
    rmSync(resolved, { recursive: true, force: true });
  }
});

test('candidate source is labelled and cannot masquerade as a Git baseline', () => {
  const candidate = parseArgs(['--mode=adventure', '--candidate-source=.devshots/candidate.json']);
  assert.equal(candidate.candidateSource, true); assert.equal(candidate.baselineSource, '.devshots/candidate.json');
  assert.equal(parseArgs(['--baseline-source=.devshots/base.json']).candidateSource, false);
  assert.throws(() => parseArgs(['--candidate-source=a', '--baseline-source=b']), /only one/);
  assert.throws(() => parseArgs(['--candidate-source=a', '--baseline=master']), /Git performance baseline/);
});

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

test('concept art directions do not block gameplay while their media and runtime metadata stay pinned', () => {
  assert.equal(isRouteServed('assets/concept/people/CANONICAL_PORTRAIT_DIRECTION.md'), false);
  assert.equal(isRouteServed('assets/concept/ships/brief.MD'), false);
  assert.equal(isRouteServed('assets/concept/people/portrait.png'), true);
  assert.equal(isRouteServed('assets/portraits/manifest.json'), true);
  assert.equal(isRouteServed('assets/ships/release/render-packages/kestrel/render.glb'), true);
  assert.equal(isRouteServed('assets/ships/release/README.md'), true, 'only the authoring-document namespace is excluded');
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
