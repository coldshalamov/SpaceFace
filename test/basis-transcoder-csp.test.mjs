import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInThisContext } from 'node:vm';

import {
  createCspSafeBasisInvoker,
  createCspSafeBasisMethodCaller,
  rewriteBasisTranscoderForStrictCsp,
} from '../vendor/addons/loaders/KTX2Loader.js';

const BASIS_SOURCE = readFileSync(
  new URL('../vendor/addons/libs/basis/basis_transcoder.js', import.meta.url),
  'utf8',
);
const BASIS_WASM = readFileSync(
  new URL('../vendor/addons/libs/basis/basis_transcoder.wasm', import.meta.url),
);
const SAMPLE_GLB = readFileSync(
  new URL('../assets/ships/release/parts/hulls/hull_multirole.glb', import.meta.url),
);

test('Basis worker source replaces both dynamic Emscripten shims under strict CSP', () => {
  const rewritten = rewriteBasisTranscoderForStrictCsp(BASIS_SOURCE);

  assert.notEqual(rewritten, BASIS_SOURCE);
  assert.equal(rewritten.includes('newFunc(Function,args)(...closureArgs)'), false);
  assert.equal(rewritten.includes('newFunc(Function,params)(...args)'), false);
  assert.equal(rewritten.includes('createCspSafeBasisInvoker('), true);
  assert.equal(rewritten.includes('createCspSafeBasisMethodCaller('), true);
});

test('CSP-safe Basis invoker preserves wire conversions, return conversion, and arity checks', () => {
  const calls = [];
  const invoker = createCspSafeBasisInvoker(
    'BasisFile.getImageWidth',
    [
      { name: 'number', fromWireType: (value) => value + 1 },
      null,
      { destructorFunction: null, toWireType: (_destructors, value) => value * 2 },
    ],
    null,
    (target, value) => {
      calls.push({ target, value });
      return value + 3;
    },
    7,
    {
      throwBindingError(message) { throw new TypeError(message); },
      runDestructors() { throw new Error('destructor stack should not run'); },
      createNamedFunction(_name, fn) { return fn; },
    },
  );

  assert.equal(invoker(5), 14);
  assert.deepEqual(calls, [{ target: 7, value: 10 }]);
  assert.throws(() => invoker(), /called with 0 arguments, expected 1/);
});

test('CSP-safe Basis invoker runs embind destructor stacks', () => {
  const destroyed = [];
  const invoker = createCspSafeBasisInvoker(
    'BasisFile.close',
    [
      { name: 'void' },
      null,
      {
        toWireType(destructors, value) {
          destructors.push(() => destroyed.push(value));
          return value;
        },
      },
    ],
    null,
    () => undefined,
    null,
    {
      throwBindingError(message) { throw new TypeError(message); },
      runDestructors(destructors) { for (const destroy of destructors) destroy(); },
      createNamedFunction(_name, fn) { return fn; },
    },
  );

  assert.equal(invoker('texture'), undefined);
  assert.deepEqual(destroyed, ['texture']);
});

test('CSP-safe Basis method caller preserves pointer reads and object receiver semantics', () => {
  const returned = [];
  const caller = createCspSafeBasisMethodCaller(
    [
      { argPackAdvance: 4, readValueFromPointer: (pointer) => pointer * 2 },
      { argPackAdvance: 8, readValueFromPointer: (pointer) => pointer + 1 },
    ],
    { isVoid: false },
    0,
    {
      emval_returnValue(retType, destructorsRef, value) {
        returned.push({ retType, destructorsRef, value });
        return value + 5;
      },
    },
  );
  const receiver = { tag: 'receiver' };
  function method(first, second) {
    assert.equal(this, receiver);
    return first + second;
  }

  assert.equal(caller(receiver, method, 99, 10), 40);
  assert.deepEqual(returned, [{ retType: { isVoid: false }, destructorsRef: 99, value: 35 }]);
});

test('CSP-safe Basis method caller constructs without evaluating source', () => {
  class TextureRecord {
    constructor(name) { this.name = name; }
  }
  const caller = createCspSafeBasisMethodCaller(
    [{ argPackAdvance: 4, readValueFromPointer: () => 'hull' }],
    { isVoid: true },
    1,
    { emval_returnValue() { throw new Error('void constructor should not convert a return'); } },
  );

  assert.equal(caller(null, TextureRecord, 0, 0), undefined);
});

test('CSP-safe Basis free-function caller consumes its first wire value as the receiver', () => {
  const receiver = { value: 4 };
  const caller = createCspSafeBasisMethodCaller(
    [
      { argPackAdvance: 4, readValueFromPointer: () => receiver },
      { argPackAdvance: 4, readValueFromPointer: () => 6 },
    ],
    { isVoid: false },
    2,
    { emval_returnValue: (_retType, _destructorsRef, value) => value },
  );
  function add(value) { return this.value + value; }

  assert.equal(caller(null, add, 0, 0), 10);
});

test('strict-CSP Basis worker reads a real release KTX2 payload', async () => {
  const rewritten = rewriteBasisTranscoderForStrictCsp(BASIS_SOURCE);
  const original = await readTextureFacts(BASIS_SOURCE, 'basis-transcoder-original.js');
  const cspSafe = await readTextureFacts(
    `${createCspSafeBasisInvoker.toString()}\n${createCspSafeBasisMethodCaller.toString()}\n${rewritten}`,
    'basis-transcoder-csp-worker.js',
  );

  assert(original.width > 0 && original.height > 0 && original.levels > 0);
  assert.deepEqual(cspSafe, original);
});

async function readTextureFacts(source, filename) {
  globalThis.__SF_BASIS_TEST_REQUIRE__ = createRequire(import.meta.url);
  let createFactory;
  try {
    createFactory = runInThisContext(
      `(() => {\nconst require = globalThis.__SF_BASIS_TEST_REQUIRE__;\nconst __filename = 'basis_transcoder.js';\nconst __dirname = '.';\n${source}\nreturn BASIS;\n})()`,
      { filename },
    );
  } finally {
    delete globalThis.__SF_BASIS_TEST_REQUIRE__;
  }
  const BasisModule = await createFactory({ wasmBinary: BASIS_WASM });
  BasisModule.initializeBasis();
  const texture = new BasisModule.KTX2File(firstEmbeddedKtx2(SAMPLE_GLB));
  try {
    return {
      valid: texture.isValid(),
      width: texture.getWidth(),
      height: texture.getHeight(),
      levels: texture.getLevels(),
      faces: texture.getFaces(),
      layers: texture.getLayers(),
      alpha: texture.getHasAlpha(),
    };
  } finally {
    texture.close();
    texture.delete();
  }
}

function firstEmbeddedKtx2(glbBytes) {
  const bytes = Buffer.from(glbBytes);
  let offset = 12;
  let json = null;
  let binary = null;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = bytes.subarray(offset, offset + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/u, '').trim());
    if (type === 0x004e4942) binary = chunk;
    offset += length;
  }
  const image = json?.images?.find((entry) => String(entry?.mimeType || '').toLowerCase() === 'image/ktx2');
  assert(image && Number.isInteger(image.bufferView), 'sample GLB must contain an embedded KTX2 image');
  const view = json.bufferViews[image.bufferView];
  assert(view && binary, 'sample KTX2 buffer view must resolve into the GLB BIN chunk');
  const start = Number(view.byteOffset || 0);
  return new Uint8Array(binary.subarray(start, start + Number(view.byteLength)));
}
