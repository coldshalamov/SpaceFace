import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

let resolvePartOutputPath;
try {
  ({ resolvePartOutputPath } = await import('../tools/art/lib/partOutputPathContainment.mjs'));
} catch (error) {
  assert.fail(`part output containment helper must exist: ${error?.message || error}`);
}

const sandbox = await mkdtemp(join(tmpdir(), 'sf-part-path-'));
const partRoot = join(sandbox, 'parts');
const outside = join(sandbox, 'outside');
await mkdir(join(partRoot, 'engines'), { recursive: true });
await mkdir(outside, { recursive: true });

try {
  assert.equal(
    resolvePartOutputPath(partRoot, 'engines/engine_fixture.glb'),
    resolve(partRoot, 'engines', 'engine_fixture.glb'),
    'valid nested manifest file resolves beneath the real part root',
  );

  const rejected = [
    ['', /nonempty relative file path/],
    ['   ', /nonempty relative file path/],
    ['.', /root itself|file path/],
    ['engines', /directory target/],
    ['../outside/escape.glb', /escapes.*part root|traversal/],
    ['engines/../../escape.glb', /escapes.*part root|traversal/],
    ['engines/../engine.glb', /traversal/],
    [resolve(outside, 'absolute.glb'), /absolute/],
    ['/absolute-posix.glb', /absolute/],
    ['C:drive-relative.glb', /colon|drive-relative|ADS/],
    ['C:\\absolute-windows.glb', /absolute|colon/],
    ['engines/engine.glb:metadata', /colon|ADS/],
  ];
  for (const [candidate, pattern] of rejected) {
    assert.throws(
      () => resolvePartOutputPath(partRoot, candidate),
      pattern,
      `manifest destination must reject ${JSON.stringify(candidate)}`,
    );
  }

  const linkedParent = join(partRoot, 'linked-outside');
  try {
    await symlink(outside, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => resolvePartOutputPath(partRoot, 'linked-outside/escape.glb'),
      /resolved parent.*escapes.*part root|junction|symlink/,
      'an existing parent junction/symlink may not redirect publication outside the real root',
    );
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) throw error;
  }

  const finalizerSource = await readFile(new URL('../tools/art/finalize_part.mjs', import.meta.url), 'utf8');
  const containmentIndex = finalizerSource.indexOf('resolvePartOutputPath(PART_ROOT, entry.file)');
  const parseIndex = finalizerSource.indexOf('parseStrictEmbeddedGlb(readFileSync(glbPath)');
  const transactionIndex = finalizerSource.indexOf('publishTwoFileTransaction({');
  assert.ok(containmentIndex >= 0, 'finalizer calls the containment helper for the manifest destination');
  assert.ok(parseIndex >= 0, 'finalizer strictly parses the source GLB');
  assert.ok(containmentIndex < parseIndex,
    'manifest destination is contained before input parsing or mutation work begins');
  assert.ok(containmentIndex < transactionIndex,
    'transaction never receives a destination before containment succeeds');
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

console.log('PASS part output containment: nested path allowed; absolute, traversal, drive/ADS, root, directory, and link escapes rejected');
