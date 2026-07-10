import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let parseStrictEmbeddedGlb;
try {
  ({ parseStrictEmbeddedGlb } = await import('../tools/art/lib/strictGlbValidation.mjs'));
} catch (error) {
  assert.fail(`strict GLB validation helper must exist: ${error?.message || error}`);
}

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const UNKNOWN_CHUNK = 0x12345678;

function document({ declaredBytes = 36, viewEnd = 36, buffers = null } = {}) {
  return {
    asset: { version: '2.0' },
    buffers: buffers || [{ byteLength: declaredBytes }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: viewEnd }],
    images: [{ name: 'generic_non_engine_png', bufferView: 0, mimeType: 'image/png' }],
  };
}

function chunk(type, payload, declaredLength = payload.length) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(declaredLength, 0);
  header.writeUInt32LE(type, 4);
  return Buffer.concat([header, payload]);
}

function jsonPayload(value) {
  const raw = Buffer.from(JSON.stringify(value));
  const pad = (4 - (raw.length % 4)) % 4;
  return Buffer.concat([raw, Buffer.from(' '.repeat(pad))]);
}

function documentWithJsonPadding(paddingLength) {
  for (let markerLength = 0; markerLength < 8; markerLength++) {
    const candidate = { ...document(), paddingProbe: 'x'.repeat(markerLength) };
    const rawLength = Buffer.byteLength(JSON.stringify(candidate));
    if ((4 - (rawLength % 4)) % 4 === paddingLength) return candidate;
  }
  assert.fail(`could not construct JSON fixture with ${paddingLength} padding byte(s)`);
}

function makeGlb({ doc = document(), binary = Buffer.alloc(36), chunks = null } = {}) {
  const body = Buffer.concat(chunks || [
    chunk(JSON_CHUNK, jsonPayload(doc)),
    chunk(BIN_CHUNK, binary),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

const valid = makeGlb();
const parsed = parseStrictEmbeddedGlb(valid, 'valid fixture');
assert.equal(parsed.binary.length, 36);
assert.equal(parsed.gltf.images[0].bufferView, 0);

const badMagic = Buffer.from(valid);
badMagic.writeUInt32LE(0x12345678, 0);
assert.throws(() => parseStrictEmbeddedGlb(badMagic, 'bad magic'), /bad GLB magic/);

const badVersion = Buffer.from(valid);
badVersion.writeUInt32LE(1, 4);
assert.throws(() => parseStrictEmbeddedGlb(badVersion, 'bad version'), /GLB version 2/);

const badTotal = Buffer.from(valid);
badTotal.writeUInt32LE(valid.length + 4, 8);
assert.throws(() => parseStrictEmbeddedGlb(badTotal, 'bad total'), /header total.*physical length/);

const truncatedHeader = makeGlb({
  chunks: [chunk(JSON_CHUNK, jsonPayload(document())), Buffer.from([1, 2, 3, 4])],
});
assert.throws(() => parseStrictEmbeddedGlb(truncatedHeader, 'truncated chunk header'), /truncated chunk header/);

const declaresPastEnd = makeGlb();
const jsonLength = declaresPastEnd.readUInt32LE(12);
const binHeader = 20 + jsonLength;
declaresPastEnd.writeUInt32LE(64, binHeader);
assert.throws(
  () => parseStrictEmbeddedGlb(declaresPastEnd, 'declared past end'),
  /chunk.*declares end.*physical length|chunk.*past physical end/,
  'a chunk declaring 64 bytes over only 36 physical BIN bytes must fail',
);

const misalignedChunk = makeGlb({
  chunks: [chunk(JSON_CHUNK, Buffer.from('{} '), 3), chunk(BIN_CHUNK, Buffer.alloc(36))],
});
assert.throws(() => parseStrictEmbeddedGlb(misalignedChunk, 'misaligned chunk'), /chunk length 3.*4-byte aligned/);

const duplicateJson = makeGlb({
  chunks: [
    chunk(JSON_CHUNK, jsonPayload(document())),
    chunk(JSON_CHUNK, jsonPayload(document())),
    chunk(BIN_CHUNK, Buffer.alloc(36)),
  ],
});
assert.throws(() => parseStrictEmbeddedGlb(duplicateJson, 'duplicate JSON'), /exactly one JSON chunk|duplicate JSON/);

const duplicateBin = makeGlb({
  chunks: [
    chunk(JSON_CHUNK, jsonPayload(document())),
    chunk(BIN_CHUNK, Buffer.alloc(36)),
    chunk(BIN_CHUNK, Buffer.alloc(36)),
  ],
});
assert.throws(() => parseStrictEmbeddedGlb(duplicateBin, 'duplicate BIN'), /exactly one BIN chunk|duplicate BIN/);

const binFirst = makeGlb({
  chunks: [chunk(BIN_CHUNK, Buffer.alloc(36)), chunk(JSON_CHUNK, jsonPayload(document()))],
});
assert.throws(() => parseStrictEmbeddedGlb(binFirst, 'BIN first'), /first chunk must be JSON/);

const unknownExtraChunk = makeGlb({
  chunks: [
    chunk(JSON_CHUNK, jsonPayload(document())),
    chunk(UNKNOWN_CHUNK, Buffer.alloc(4)),
    chunk(BIN_CHUNK, Buffer.alloc(36)),
  ],
});
assert.throws(
  () => parseStrictEmbeddedGlb(unknownExtraChunk, 'unknown extra chunk'),
  /unexpected chunk type 0x12345678|exactly JSON then BIN/,
  'canonical parts admit exactly a JSON chunk followed by a BIN chunk',
);

const jsonSpaceDocument = documentWithJsonPadding(2);
const legalJsonSpacePayload = jsonPayload(jsonSpaceDocument);
assert.deepEqual([...legalJsonSpacePayload.subarray(-2)], [0x20, 0x20],
  'legal JSON fixture ends in explicit ASCII-space alignment padding');
assert.doesNotThrow(
  () => parseStrictEmbeddedGlb(makeGlb({
    chunks: [chunk(JSON_CHUNK, legalJsonSpacePayload), chunk(BIN_CHUNK, Buffer.alloc(36))],
  }), 'legal JSON space padding'),
);

for (const [name, paddingByte] of [['NUL', 0x00], ['tab', 0x09], ['newline', 0x0a]]) {
  const illegalPayload = Buffer.from(legalJsonSpacePayload);
  illegalPayload[illegalPayload.length - 1] = paddingByte;
  const illegalJsonPadding = makeGlb({
    chunks: [chunk(JSON_CHUNK, illegalPayload), chunk(BIN_CHUNK, Buffer.alloc(36))],
  });
  assert.throws(
    () => parseStrictEmbeddedGlb(illegalJsonPadding, `illegal JSON ${name} padding`),
    /JSON chunk.*root object.*0x20 padding|JSON padding.*0x20/i,
    `JSON ${name} padding must not be accepted as canonical GLB alignment`,
  );
}

const invalidUtf8Payload = jsonPayload(documentWithJsonPadding(1));
const utf8MutationIndex = invalidUtf8Payload.indexOf(Buffer.from('generic_non_engine_png'));
assert.ok(utf8MutationIndex >= 0, 'invalid UTF-8 fixture mutation point exists');
invalidUtf8Payload[utf8MutationIndex] = 0xff;
assert.throws(
  () => parseStrictEmbeddedGlb(makeGlb({
    chunks: [chunk(JSON_CHUNK, invalidUtf8Payload), chunk(BIN_CHUNK, Buffer.alloc(36))],
  }), 'invalid JSON UTF-8'),
  /JSON chunk.*invalid UTF-8|fatal UTF-8/i,
  'JSON bytes must be decoded with fatal UTF-8 semantics',
);

const externalBuffer = makeGlb({
  doc: document({ buffers: [{ byteLength: 36, uri: 'external.bin' }] }),
});
assert.throws(() => parseStrictEmbeddedGlb(externalBuffer, 'external buffer'), /embedded buffer 0.*must not use URI|external/);

const multipleBuffers = makeGlb({
  doc: document({ buffers: [{ byteLength: 36 }, { byteLength: 12 }] }),
});
assert.throws(() => parseStrictEmbeddedGlb(multipleBuffers, 'multiple buffers'), /exactly one embedded buffer/);

for (let paddingBytes = 1; paddingBytes <= 3; paddingBytes++) {
  const declaredBytes = 36 - paddingBytes;
  const legalZeroPadding = makeGlb({
    doc: document({ declaredBytes, viewEnd: 32 }),
    binary: Buffer.alloc(36),
  });
  assert.doesNotThrow(
    () => parseStrictEmbeddedGlb(legalZeroPadding, `legal zero BIN padding ${paddingBytes}`),
    `${paddingBytes} zero BIN padding byte(s) are legal`,
  );

  const nonzeroBinary = Buffer.alloc(36);
  nonzeroBinary[declaredBytes] = 0x7f;
  const illegalNonzeroPadding = makeGlb({
    doc: document({ declaredBytes, viewEnd: 32 }),
    binary: nonzeroBinary,
  });
  assert.throws(
    () => parseStrictEmbeddedGlb(illegalNonzeroPadding, `nonzero BIN padding ${paddingBytes}`),
    /BIN padding.*0x00|nonzero BIN padding/i,
    `${paddingBytes} BIN padding byte(s) must all be zero`,
  );
}

const illegalPadding = makeGlb({
  doc: document({ declaredBytes: 32, viewEnd: 32 }),
  binary: Buffer.alloc(36),
});
assert.throws(() => parseStrictEmbeddedGlb(illegalPadding, 'illegal padding'), /padding.*3 bytes|physical BIN.*declared/);

const declaredBeyondPhysical = makeGlb({
  doc: document({ declaredBytes: 40, viewEnd: 36 }),
  binary: Buffer.alloc(36),
});
assert.throws(() => parseStrictEmbeddedGlb(declaredBeyondPhysical, 'declared storage mismatch'), /declared buffer byteLength 40.*physical BIN length 36/);

const truncatedGenericImage = makeGlb({
  doc: document({ declaredBytes: 336, viewEnd: 336 }),
  binary: Buffer.alloc(36),
});
assert.throws(
  () => parseStrictEmbeddedGlb(truncatedGenericImage, 'truncated generic image'),
  /bufferView 0 end 336 exceeds physical BIN length 36/,
  'generic non-engine embedded image views must be bounded by real BIN bytes',
);

const finalizerSource = await readFile(new URL('../tools/art/finalize_part.mjs', import.meta.url), 'utf8');
const sourceValidation = finalizerSource.indexOf('parseStrictEmbeddedGlb(readFileSync(glbPath)');
const manifestMutation = finalizerSource.indexOf('entry.tris = tris');
const transaction = finalizerSource.indexOf('publishTwoFileTransaction({');
assert.ok(sourceValidation >= 0, 'finalizer strictly validates source bytes');
assert.ok(sourceValidation < manifestMutation, 'source GLB is rejected before manifest mutation');
assert.ok(sourceValidation < transaction, 'source GLB is rejected before staging or destination promotion');
assert.equal(count(finalizerSource, /parseStrictEmbeddedGlb\(/g), 2,
  'the same strict parser validates source bytes and staged bytes exactly once each');

// Behavioral reject-before-write proof against the actual CLI path. Exercise both malformed
// structure and malformed canonical padding so strict source parsing—not a later texture or
// geometry check—is the reason publication never starts.
const finalizerPath = fileURLToPath(new URL('../tools/art/finalize_part.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = join(repoRoot, 'assets', 'ships', 'parts', 'parts_manifest.json');
const destinationPath = join(repoRoot, 'assets', 'ships', 'parts', 'fins', 'fin_wedge.glb');
const manifestBefore = await readFile(manifestPath);
const destinationBefore = await readFile(destinationPath);
const transactionResidueBefore = await transactionResidue(dirname(manifestPath), dirname(destinationPath));
const sandbox = await mkdtemp(join(tmpdir(), 'sf-strict-finalizer-'));
try {
  const nonzeroPadBinary = Buffer.alloc(36);
  nonzeroPadBinary[35] = 0x7f;
  const nonzeroBinPaddingSource = makeGlb({
    doc: document({ declaredBytes: 35, viewEnd: 32 }),
    binary: nonzeroPadBinary,
  });
  const rejectionCases = [
    {
      file: 'unknown-extra-chunk.glb',
      bytes: unknownExtraChunk,
      expected: /fin_wedge source GLB: unexpected chunk type 0x12345678|fin_wedge source GLB:.*exactly JSON then BIN/,
    },
    {
      file: 'nonzero-bin-padding.glb',
      bytes: nonzeroBinPaddingSource,
      expected: /fin_wedge source GLB:.*BIN padding.*0x00|fin_wedge source GLB:.*nonzero BIN padding/i,
    },
  ];
  for (const rejection of rejectionCases) {
    const malformedSource = join(sandbox, rejection.file);
    await writeFile(malformedSource, rejection.bytes);
    const result = spawnSync(
      process.execPath,
      [finalizerPath, malformedSource, 'fin_wedge', '--method=procedural_fallback'],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0, `${rejection.file} must fail the real finalizer CLI`);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      rejection.expected,
      `${rejection.file} must reject at strict source parsing`,
    );
    assert.deepEqual(await readFile(manifestPath), manifestBefore,
      'source rejection leaves canonical manifest bytes unchanged');
    assert.deepEqual(await readFile(destinationPath), destinationBefore,
      'source rejection leaves canonical destination bytes unchanged');
    assert.deepEqual(
      await transactionResidue(dirname(manifestPath), dirname(destinationPath)),
      transactionResidueBefore,
      'source rejection creates no transaction staging or backup residue',
    );
  }
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

console.log('PASS strict GLB validation: container, embedded storage, padding, image ranges, and finalizer ordering');

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

async function transactionResidue(...directories) {
  const found = [];
  for (const directory of new Set(directories)) {
    for (const name of await readdir(directory)) {
      if (name.includes('.sf-transaction-')) found.push(join(directory, name));
    }
  }
  return found.sort();
}
