import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  canonicalSignature,
} from '../scripts/lib/simReadModel.mjs';
import { canonicalSignatureAgainst } from '../scripts/lib/domainSignatureStream.mjs';

const SIG_OPAQUE = '@@opaque';
const SIG_CYCLE = '@@cycle';

// Keep a small copy of the pre-optimization writer in this test. It is the
// wire-format oracle: the candidate may reuse its scratch storage, but every
// emitted byte must remain identical.
function legacyWriteDomainSignature(value, parts, seen) {
  if (value === null) {
    parts.push('null');
    return;
  }
  const t = typeof value;
  if (t === 'number') {
    parts.push('n:', Number.isNaN(value) ? 'NaN'
      : Object.is(value, -0) ? '-0'
        : Number.isFinite(value) ? String(value)
          : String(value));
    return;
  }
  if (t === 'string') {
    parts.push('s:', JSON.stringify(value));
    return;
  }
  if (t === 'boolean') {
    parts.push('b:', String(value));
    return;
  }
  if (t === 'bigint') {
    parts.push('g:', String(value));
    return;
  }
  if (t !== 'object') {
    parts.push(SIG_OPAQUE);
    return;
  }
  if (seen.has(value)) {
    parts.push(SIG_CYCLE);
    return;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    parts.push('a:[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      legacyWriteDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    seen.delete(value);
    return;
  }
  if (value instanceof Map) {
    seen.add(value);
    const entries = [];
    for (const [k, v] of value) {
      const keyParts = [];
      legacyWriteDomainSignature(k, keyParts, seen);
      entries.push([keyParts.join(''), v]);
    }
    entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    parts.push('m:{');
    for (let i = 0; i < entries.length; i++) {
      if (i) parts.push(',');
      parts.push(entries[i][0], '=>');
      legacyWriteDomainSignature(entries[i][1], parts, seen);
    }
    parts.push('}');
    seen.delete(value);
    return;
  }
  if (value instanceof Set) {
    seen.add(value);
    const sigs = [];
    for (const item of value) {
      const itemParts = [];
      legacyWriteDomainSignature(item, itemParts, seen);
      sigs.push(itemParts.join(''));
    }
    sigs.sort();
    parts.push('e:{', sigs.join(','), '}');
    seen.delete(value);
    return;
  }
  if (value instanceof Date) {
    parts.push('d:', String(value.getTime()));
    return;
  }
  if (value instanceof RegExp) {
    parts.push('r:', value.source, '/', value.flags);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      parts.push('y:DataView:[', String(value.byteLength), ']');
      return;
    }
    parts.push('y:', value.constructor.name, ':[');
    for (let i = 0; i < value.length; i++) {
      if (i) parts.push(',');
      legacyWriteDomainSignature(value[i], parts, seen);
    }
    parts.push(']');
    return;
  }
  seen.add(value);
  const keys = Object.keys(value).sort();
  parts.push('o:{');
  for (let i = 0; i < keys.length; i++) {
    if (i) parts.push(',');
    parts.push(JSON.stringify(keys[i]), '=');
    let field;
    try {
      field = value[keys[i]];
    } catch (_) {
      field = undefined;
    }
    legacyWriteDomainSignature(field, parts, seen);
  }
  parts.push('}');
  seen.delete(value);
}

function legacyCanonicalSignature(value) {
  const parts = [];
  legacyWriteDomainSignature(value, parts, new Set());
  return parts.join('');
}

class CargoRecord {
  constructor() {
    this.z = 'last';
    this.a = 'first';
  }
}

function buildCases() {
  const shared = { n: 7, text: 'shared' };
  const cycle = { name: 'cycle' };
  cycle.self = cycle;

  const throwingGetter = { ok: 1 };
  Object.defineProperty(throwingGetter, 'bad', {
    enumerable: true,
    get() { throw new Error('expected test getter'); },
  });
  Object.defineProperty(throwingGetter, 'hidden', { enumerable: false, value: 'ignored' });
  throwingGetter[Symbol('ignored')] = 'ignored';

  const equalMapKeyA = { same: true };
  const equalMapKeyB = { same: true };
  const nestedMap = new Map([
    [equalMapKeyA, { value: 1, shared }],
    [equalMapKeyB, { value: 2, shared }],
  ]);
  nestedMap.set('nested', new Set([{ z: 2, a: 1 }, { z: 2, a: 1 }]));

  const nestedSet = new Set([
    { b: 2, a: 1 },
    { b: 2, a: 1 },
    nestedMap,
  ]);

  const typed = new Uint16Array([0, 1, 65535]);
  const viewBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
  const dataView = new DataView(viewBuffer, 1, 2);
  const inherited = Object.create({ inherited: 'omit' });
  inherited.own = 'keep';

  const crossRealm = vm.runInNewContext('({ z: 2, a: [1, 2], nested: { ok: true } })');
  const cargo = new CargoRecord();

  return [
    null, undefined, true, false, NaN, -0, Infinity, -Infinity, 0, 12.5,
    '', 'quote:" slash\\ unicode:☄ lone:\ud800', 2n, Symbol('opaque'),
    function opaque() {},
    [1, , undefined, { z: 2, a: 1 }],
    { sharedA: shared, sharedB: shared, cycle },
    cycle,
    nestedMap,
    nestedSet,
    new Date(0), new Date(Number.NaN), /a[b]+/giu, typed, dataView,
    cargo, inherited, throwingGetter, crossRealm,
  ];
}

test('scratch canonicalizer preserves the legacy signature for representative domain values', () => {
  const scratch = {};
  for (const value of buildCases()) {
    const expected = legacyCanonicalSignature(value);
    assert.equal(
      canonicalSignature(value, scratch),
      expected,
      `signature mismatch for ${Object.prototype.toString.call(value)}`,
    );
    assert.equal(canonicalSignatureAgainst(value, expected, scratch), expected);
  }
});

test('scratch canonicalizer resets pooled traversal state between calls', () => {
  const scratch = {};
  const cyclic = { a: 1 };
  cyclic.self = cyclic;
  const first = canonicalSignature({ map: new Map([[cyclic, new Set([cyclic])]]) }, scratch);
  const second = canonicalSignature({ after: true }, scratch);
  assert.equal(first, legacyCanonicalSignature({ map: new Map([[cyclic, new Set([cyclic])]]) }));
  assert.equal(second, legacyCanonicalSignature({ after: true }));
});

test('streamed comparison preserves exact signatures for early, late, and removal changes', () => {
  const previous = {
    a: 1,
    middle: { stable: true, value: 2 },
    z: { tail: 'old', keep: 3 },
  };
  const scratch = {};
  const expected = legacyCanonicalSignature(previous);

  const early = { ...previous, a: 9 };
  const late = {
    ...previous,
    z: { tail: 'new', keep: 3 },
  };
  const removed = { a: 1, middle: { stable: true, value: 2 } };

  for (const value of [early, late, removed]) {
    assert.equal(
      canonicalSignatureAgainst(value, expected, scratch),
      legacyCanonicalSignature(value),
    );
  }
  assert.equal(canonicalSignatureAgainst(previous, expected, scratch), expected);
});
