import assert from 'node:assert/strict';
import test from 'node:test';

import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import {
  SAVE_IMPORT_MAX_BYTES,
  SAVE_IMPORT_MAX_COLLECTION_ITEMS,
  SAVE_IMPORT_MAX_DEPTH,
  SAVE_IMPORT_MAX_NODES,
  SAVE_IMPORT_MAX_PERSISTENT_ENTITIES,
  save,
} from '../src/save/saveSystem.js';
import { saveLoadScreen } from '../src/ui/screens/saveLoad.js';

function envelope(data = {}) {
  return { fmt: 'spaceface-save', version: CURRENT_VERSION, data };
}

function captureSaveErrors() {
  const originalBus = save.bus;
  const errors = [];
  save.bus = { emit(name, payload) { if (name === 'save:error') errors.push(payload); } };
  return { errors, restore() { save.bus = originalBus; } };
}

test('raw SaveSystem imports reject oversized text before JSON.parse', () => {
  const h = captureSaveErrors();
  const originalParse = JSON.parse;
  let parsed = false;
  JSON.parse = (...args) => {
    parsed = true;
    return originalParse(...args);
  };
  try {
    const ok = save.importString('x'.repeat(SAVE_IMPORT_MAX_BYTES + 1), 'import');
    assert.equal(ok, false);
    assert.equal(parsed, false, 'oversized input must be rejected before raw parsing');
    assert.deepEqual(h.errors[0], {
      slot: 'import',
      reason: 'import_too_large',
      limit: SAVE_IMPORT_MAX_BYTES,
      actual: SAVE_IMPORT_MAX_BYTES + 1,
    });
  } finally {
    JSON.parse = originalParse;
    h.restore();
  }
});

test('File import rejects a known oversized file before constructing FileReader', () => {
  const h = captureSaveErrors();
  const originalReader = globalThis.FileReader;
  let constructed = false;
  let callbackValue = null;
  globalThis.FileReader = class {
    constructor() { constructed = true; }
  };
  try {
    save.importFile({ size: SAVE_IMPORT_MAX_BYTES + 1 }, (ok) => { callbackValue = ok; });
    assert.equal(constructed, false);
    assert.equal(callbackValue, false);
    assert.equal(h.errors[0].reason, 'import_too_large');
    assert.equal(h.errors[0].limit, SAVE_IMPORT_MAX_BYTES);
  } finally {
    if (originalReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalReader;
    h.restore();
  }
});

test('File import checks reader text before JSON.parse when File.size is unavailable', () => {
  const h = captureSaveErrors();
  const originalReader = globalThis.FileReader;
  const originalParse = JSON.parse;
  let parsed = false;
  let read = false;
  let callbackValue = null;
  const raw = 'x'.repeat(SAVE_IMPORT_MAX_BYTES + 1);
  globalThis.FileReader = class {
    readAsText() {
      read = true;
      this.result = raw;
      this.onload();
    }
  };
  JSON.parse = (...args) => {
    parsed = true;
    return originalParse(...args);
  };
  try {
    save.importFile({}, (ok) => { callbackValue = ok; });
    assert.equal(read, true);
    assert.equal(parsed, false, 'reader text must be bounded before import parsing');
    assert.equal(callbackValue, false);
    assert.equal(h.errors[0].reason, 'import_too_large');
  } finally {
    JSON.parse = originalParse;
    if (originalReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalReader;
    h.restore();
  }
});

test('parsed save imports reject excessive depth before clone or restore', () => {
  let nested = 0;
  for (let i = 0; i <= SAVE_IMPORT_MAX_DEPTH; i++) nested = { child: nested };
  const prepared = save._prepareEnvelope(envelope({ nested }));
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, 'import_depth_limit');
  assert.equal(prepared.limit, SAVE_IMPORT_MAX_DEPTH);
});

test('parsed save imports reject excessive node count before clone or restore', () => {
  const buckets = [];
  for (let i = 0; i < 5; i++) buckets.push(new Array(50_000).fill(0));
  const prepared = save._prepareEnvelope(envelope({ buckets }));
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, 'import_node_limit');
  assert.equal(prepared.limit, SAVE_IMPORT_MAX_NODES);
});

test('parsed save imports reject an oversized collection before clone or restore', () => {
  const prepared = save._prepareEnvelope(envelope({
    items: new Array(SAVE_IMPORT_MAX_COLLECTION_ITEMS + 1).fill(0),
  }));
  assert.equal(prepared.ok, false);
  assert.equal(prepared.reason, 'import_collection_limit');
  assert.equal(prepared.limit, SAVE_IMPORT_MAX_COLLECTION_ITEMS);
});

test('parsed save imports reject excessive persistent entities before any restore mutation', () => {
  const originalState = save.state;
  const live = { marker: 'untouched' };
  save.state = live;
  try {
    const persistent = new Array(SAVE_IMPORT_MAX_PERSISTENT_ENTITIES + 1).fill({ type: 'ship' });
    const prepared = save._prepareEnvelope(envelope({
      entities: { persistent },
    }));
    assert.equal(prepared.ok, false);
    assert.equal(prepared.reason, 'import_persistent_entity_limit');
    assert.equal(prepared.limit, SAVE_IMPORT_MAX_PERSISTENT_ENTITIES);
    assert.equal(save.state, live, 'rejected preflight must not touch live state');
    assert.equal(live.marker, 'untouched');
  } finally {
    save.state = originalState;
  }
});

test('SaveLoad fallback rejects a known oversized file before FileReader or confirmation', async () => {
  const events = [];
  let rendered = 0;
  let constructed = false;
  const originalReader = globalThis.FileReader;
  const originalRender = saveLoadScreen._render;
  globalThis.FileReader = class {
    constructor() { constructed = true; }
  };
  saveLoadScreen._render = () => { rendered++; };
  const fileIn = {
    files: [{ name: 'oversized.json', size: SAVE_IMPORT_MAX_BYTES + 1 }],
    value: 'selected',
  };
  const ctx = {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    registry: { get() { return {}; } },
  };
  try {
    await saveLoadScreen._import(ctx, fileIn);
    const error = events.find((entry) => entry.name === 'save:error');
    assert.deepEqual(error.payload, {
      slot: 'import',
      reason: 'import_too_large',
      limit: SAVE_IMPORT_MAX_BYTES,
      actual: SAVE_IMPORT_MAX_BYTES + 1,
    });
    assert.equal(constructed, false);
    assert.equal(fileIn.value, '');
    assert.equal(rendered, 1);
  } finally {
    saveLoadScreen._render = originalRender;
    if (originalReader === undefined) delete globalThis.FileReader;
    else globalThis.FileReader = originalReader;
  }
});
