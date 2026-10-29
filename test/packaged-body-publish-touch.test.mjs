// The packaged-body (wreck) commit compiles its group detached and before the caster sync, so the
// mounted body's live program key was linked by its first presented draw unless another opening
// material happened to share it (oc1v27-32: Drive_1<wreck_PackagedBody, 172-2749 ms post-lift).
// The commit must run the same publish-seam exact touch the cargo/place/ship commits run, on the
// attached root, after the shadow sync and before the ready-body template is captured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vf = readFileSync(resolve(ROOT, 'src/render/visualFactory.js'), 'utf8');
const pl = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');

function attachPackagedBodySource() {
  const start = vf.indexOf('function attachPackagedBody(');
  assert.ok(start >= 0, 'attachPackagedBody exists');
  const end = vf.indexOf('\nfunction ', start + 10);
  return vf.slice(start, end > 0 ? end : undefined);
}

test('packaged body commit touches the attached root after the caster sync', () => {
  const src = attachPackagedBodySource();
  const mount = src.indexOf('root.add(packaged)');
  const sync = src.indexOf('packagedShadowSync(root');
  const touchRead = src.indexOf('mintedAdmissionOptions.touchAuthoredExactTarget');
  const touchCall = src.indexOf('packagedTouch(root)');
  const capture = src.indexOf('readyBodies?.capture(');
  for (const [name, at] of Object.entries({ mount, sync, touchRead, touchCall, capture })) {
    assert.ok(at > 0, `${name} present`);
  }
  assert.ok(mount < sync, 'shadow sync follows the mount');
  assert.ok(sync < touchCall, 'exact touch follows the shadow sync (final caster state)');
  assert.ok(touchCall < capture, 'touch runs before the ready-body template is captured');
  assert.match(src.slice(touchRead, touchCall + 40), /typeof packagedTouch === 'function'/);
  assert.match(src.slice(touchCall - 20, touchCall + 80), /try \{ packagedTouch\(root\); \} catch/);
});

test('authored admission options carry the publish-seam touch the packaged commit reads', () => {
  assert.match(pl, /touchAuthoredExactTarget: touch\s*\n?\s*\?/);
});
