import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { branchLifecycleCommsPayload } from '../src/ui/comms.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scenario = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/47a.scenario.json'), 'utf8'));

for (const branch of scenario.branches || []) {
  const payload = branchLifecycleCommsPayload({
    branchId: branch.id,
    summary: branch.summary,
    lifecycle: branch.lifecycle,
  });
  assert(payload, `${branch.id} should produce a UI lifecycle comms payload`);
  assert.equal(payload.sender, 'CONTRACT 47-A', `${branch.id} should render as a 47-A contract update`);
  assert.equal(payload.category, 'story', `${branch.id} should use the story comms channel`);
  assert.equal(payload.text, branch.lifecycle.complete, `${branch.id} should render authored completion text`);
  assert.equal(payload.note, branch.lifecycle.aftermath, `${branch.id} should render authored aftermath text`);
  assert.equal(payload.persist, true, `${branch.id} lifecycle comms should persist until dismissed`);
}

assert.equal(
  branchLifecycleCommsPayload({ lifecycle: {} }),
  null,
  'missing lifecycle text should not create an empty comms entry',
);

assert.equal(
  branchLifecycleCommsPayload({ lifecycle: { complete: '  Clean   spacing. ', aftermath: ' After   text. ' } }).text,
  'Clean spacing.',
  'UI lifecycle text should normalize accidental authoring whitespace',
);

console.log('SG-05 UI lifecycle rendering checks OK');
