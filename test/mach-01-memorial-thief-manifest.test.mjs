// MACH-01 — the memorial thief is a declared sub-object, never an undeclared ticker.
//
// memorialThief.js has live game-world behavior (it spawns, scares, flees, steals) but is not a
// registered system: uniqueWrecks owns its clock. The manifest must say so — either the module is
// registered with a clock, or it is declared as owned with no independent tick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  OWNED_RUNTIME_MODULES,
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getManifestIdentityPayload,
} from '../src/runtime/authoritativeSystemManifest.js';
import * as memorialThief from '../src/systems/memorialThief.js';

test('the manifest declares the thief owned by a registered system', () => {
  const decl = OWNED_RUNTIME_MODULES.memorialThief;
  assert.ok(decl, 'memorialThief must appear in OWNED_RUNTIME_MODULES');
  assert.equal(decl.owner, 'uniqueWrecks');
  assert.equal(decl.tick, 'owned', 'declared as owned, not a ticker');
  assert.ok(
    PRODUCTION_INIT_ORDER.includes(decl.owner),
    'the declared owner must be a registered system whose listeners drive the module',
  );
  assert.deepEqual([...decl.driven].sort(), ['economy:tick', 'entity:killed']);
});

test('the thief module itself has no registered-system shape', () => {
  assert.equal(typeof memorialThief.init, 'undefined', 'no init');
  assert.equal(typeof memorialThief.update, 'undefined', 'no update');
  assert.equal(typeof memorialThief.name, 'undefined', 'no system name');
  assert.equal(typeof memorialThief.createMemorialThief, 'function', 'it is a factory');
  const src = readFileSync(
    fileURLToPath(new URL('../src/systems/memorialThief.js', import.meta.url)),
    'utf8',
  );
  assert.equal(/setInterval|setTimeout|requestAnimationFrame/.test(src), false,
    'no independent timer inside the module');
});

test('the declaration does not change the manifest identity payload', () => {
  const payload = getManifestIdentityPayload();
  const flat = JSON.stringify(payload);
  assert.equal(flat.includes('memorialThief'), false,
    'a sub-object must not appear as a registered system id');
  assert.equal(payload.schema, 'spaceface.authoritativeSystemManifest.v1');
  assert.ok(PRODUCTION_INIT_ORDER.includes('uniqueWrecks'));
});
