import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import {
  CRITICAL_SLICE_EVENT_IDS,
  PRESENTATION_EVENT_SCHEMA,
  PRESENTATION_EVENT_VERSION,
  normalizePresentationEvent,
  presentationDedupeKey,
  validatePresentationEvent,
} from '../src/presentation/cueSchema.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const source = readFileSync(resolve(ROOT, 'src/presentation/cueSchema.js'), 'utf8');

for (const forbidden of ['document.', 'window.', 'THREE.', 'Date.now', 'Math.random']) {
  assert(!source.includes(forbidden), `presentation cue schema must stay headless/deterministic: ${forbidden}`);
}

assert.equal(PRESENTATION_EVENT_VERSION, 1, 'presentation event version should be pinned');
assert.equal(PRESENTATION_EVENT_SCHEMA.$id, 'spaceface.presentation-event.v1', 'schema id should be versioned');
assert.deepEqual(CRITICAL_SLICE_EVENT_IDS, [
  'tether.attach',
  'tether.near_break',
  'tether.break',
  'shield.collapse',
  'subsystem.disabled',
], 'critical slice event ids should stay declared');

const state = {
  playerId: 1,
  simTime: 12.5,
  entities: new Map([
    [1, { id: 1, pos: { x: 10, y: 0, z: -5 } }],
    [2, { id: 2, pos: { x: 110, y: 0, z: -5 } }],
  ]),
};

const normalized = normalizePresentationEvent({
  id: 'tether.attach',
  sourceId: 1,
  targetId: 2,
  material: 'massline',
  magnitude: 3,
  tags: ['slice', 'slice', 'tether'],
}, state, 13000);

assert.equal(normalized.version, 1, 'normalized event should carry schema version');
assert.equal(normalized.id, 'tether.attach', 'event id should be preserved');
assert.equal(normalized.position.x, 110, 'target entity position should be inferred');
assert.equal(normalized.distance, 100, 'distance from player should be inferred');
assert.equal(normalized.direction.x, 1, 'direction from player to target should be normalized');
assert.equal(normalized.playerRelevance, 0.88, 'player source should produce high relevance');
assert.deepEqual(normalized.tags, ['slice', 'tether'], 'tags should be deduplicated in order');
assert.equal(normalized.simTimeMs, 12500, 'sim time should become milliseconds');
assert.equal(normalized.presentationTimeMs, 13000, 'presentation timestamp should be normalized');
assert.equal(
  normalized.dedupeKey,
  presentationDedupeKey(normalized),
  'dedupe key should be stable after normalization',
);

assert.equal(validatePresentationEvent({ id: 'bad' }).ok, false, 'undotted ids should be rejected');
assert.equal(
  validatePresentationEvent({ id: 'tether.break', direction: { x: 0, z: 0 } }).ok,
  false,
  'zero direction should be rejected',
);
assert.throws(
  () => normalizePresentationEvent({ id: 'bad' }, state),
  /Invalid presentation event/,
  'normalization should throw on invalid events',
);

console.log('Presentation cue schema checks OK');
