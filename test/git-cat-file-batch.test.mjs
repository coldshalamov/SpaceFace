import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseGitCatFileBatch,
  readGitCatFileBatch,
} from '../scripts/lib/gitCatFileBatch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('batch parser honors declared byte lengths when blob bodies contain newlines', () => {
  const first = Buffer.from([0, 10, 255, 10]);
  const second = Buffer.from('line one\nline two\n');
  const output = Buffer.concat([
    Buffer.from(`aaa blob ${first.length}\n`), first, Buffer.from('\n'),
    Buffer.from('bbb missing\n'),
    Buffer.from(`ccc blob ${second.length}\n`), second, Buffer.from('\n'),
  ]);
  assert.deepEqual(
    parseGitCatFileBatch(output, ['first', 'missing', 'second']),
    [first, null, second],
  );
});

test('batch parser recognizes frames whose requested expressions contain spaces', () => {
  const body = Buffer.from('space-safe\n');
  const output = Buffer.concat([
    Buffer.from('HEAD:missing path.js missing\n'),
    Buffer.from(`HEAD:source path.js blob ${body.length}\n`), body, Buffer.from('\n'),
  ]);
  assert.deepEqual(
    parseGitCatFileBatch(output, ['missing path.js', 'source path.js']),
    [null, body],
  );
});

test('batch parser rejects truncated frames, bad separators, and oversized blobs', () => {
  const body = Buffer.from('abc\n');
  assert.throws(
    () => parseGitCatFileBatch(Buffer.from(`aaa blob ${body.length}\nabc`), ['x']),
    /truncated body/,
  );
  assert.throws(
    () => parseGitCatFileBatch(
      Buffer.concat([Buffer.from(`aaa blob ${body.length}\n`), body, Buffer.from('x')]),
      ['x'],
    ),
    /body separator is missing/,
  );
  assert.throws(
    () => parseGitCatFileBatch(
      Buffer.concat([Buffer.from('aaa blob 4\n'), body, Buffer.from('\n')]),
      ['x'],
      { maxBlobBytes: 3 },
    ),
    /exceeds the 3-byte limit/,
  );
});

test('one batch read returns a historical blob and preserves missing results', async () => {
  const [body, missing] = await readGitCatFileBatch('HEAD', ['index.html', 'src/__missing_for_batch_test__.js'], {
    cwd: ROOT,
  });
  assert.deepEqual(body, readFileSync(path.join(ROOT, 'index.html')));
  assert.equal(missing, null);
});
