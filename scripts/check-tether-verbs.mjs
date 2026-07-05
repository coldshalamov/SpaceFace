import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

const ROOT = new URL('../', import.meta.url);
const checks = [];

check('SPEC3-17 attach/reel/cut lifecycle works through the attachment service', () => {
  const harness = createHarness();
  const service = createAttachmentService(harness);

  const created = service.create({
    defId: 'tether_standard',
    ownerId: 1,
    targetId: 2,
    sourceWorld: { x: 0, y: 0, z: 0 },
    targetWorld: { x: 125, y: 0, z: 0 },
  });
  assert.equal(created.ok, true, `create should succeed: ${created.reason || 'unknown'}`);
  assert.equal(created.attachment.state, 'active', 'created tether should be active');
  assert.equal(harness.events.filter((event) => event.name === 'tether:attached').length, 1,
    'attach must emit tether:attached once');

  const before = created.attachment.restLength;
  const reeled = service.reel(created.attachment.id, -24, 18);
  assert.equal(reeled.ok, true, `reel should succeed: ${reeled.reason || 'unknown'}`);
  assert(reeled.attachment.restLength < before, 'reel-in should shorten rest length');
  assert.equal(harness.events.filter((event) => event.name === 'tether:reel').length, 1,
    'reel must emit tether:reel once');

  const cut = service.cut(created.attachment.id, 1, 'tether_cut');
  assert.equal(cut.ok, true, `cut should succeed: ${cut.reason || 'unknown'}`);
  assert.equal(cut.attachment.state, 'broken', 'cut should close the joint lifecycle');
  assert.equal(cut.attachment.breakReason, 'tether_cut', 'cut reason should be preserved');
  assert.equal(harness.events.filter((event) => event.name === 'tether:broken').length, 1,
    'current lower-level cut path emits tether:broken once');
});

check('SPEC3-17 cut event exposes velocity and slingshot boolean', () => {
  const tetherSrc = readFileSync(new URL('src/systems/tetherGameplay.js', ROOT), 'utf8');
  const attachmentSrc = readFileSync(new URL('src/combat/attachments.js', ROOT), 'utf8');
  const joined = `${tetherSrc}\n${attachmentSrc}`;
  assert.match(joined, /tether:cut/,
    'SPEC3 cut surface must emit tether:cut { speed|velocity, slingshot } instead of only released/broken');
  assert.match(joined, /slingshot/,
    'SPEC3 cut payload must include a slingshot boolean');
});

check('SPEC3-17 slingshot state is granted after high-speed tangent cut', () => {
  const tetherSrc = readFileSync(new URL('src/systems/tetherGameplay.js', ROOT), 'utf8');
  assert.match(tetherSrc, /slingT|slingshotT|slingshotTimer/,
    'tether gameplay must grant a 1.0s slingshot state on qualifying cuts');
  assert.match(tetherSrc, /1\.4/,
    'slingshot state threshold must be at least 1.4x max thrust speed');
});

const failed = checks.filter((entry) => !entry.ok);
for (const entry of checks) {
  console.log(entry.ok ? `PASS ${entry.name}` : `FAIL ${entry.name}: ${entry.error}`);
}
if (failed.length) {
  console.log(`\n${failed.length}/${checks.length} tether verb checks failed.`);
  process.exit(1);
}

console.log(`\nAll ${checks.length} tether verb checks passed.`);

function createHarness() {
  const events = [];
  const handles = new Map();
  const state = {
    tick: 0,
    entities: new Map([
      [1, makeEntity({ id: 1, type: 'ship', x: 0, z: 0, radius: 12, mass: 16 })],
      [2, makeEntity({ id: 2, type: 'asteroid', x: 125, z: 0, radius: 18, mass: 640 })],
    ]),
  };
  ensureCombatState(state);
  return {
    state,
    catalog: createCombatCatalog(),
    helpers: {
      combatPhysics: {
        createAttachment(spec) {
          handles.set(spec.attachmentId, { ...spec });
          return { id: spec.attachmentId };
        },
        setAttachmentReel(spec) {
          const handle = handles.get(spec.attachmentId);
          if (handle) handle.restLength = spec.restLength;
          return { restLength: spec.restLength };
        },
        cutAttachment(spec) {
          handles.delete(spec.attachmentId);
          return true;
        },
        getAttachmentTelemetry(spec) {
          const handle = handles.get(spec.attachmentId);
          if (!handle) return null;
          return {
            restLength: handle.restLength,
            distance: handle.restLength,
            stretch: 0,
            relativeSpeed: 0,
            tension: 0,
            impulse: 0,
            phase: 'loaded',
          };
        },
      },
    },
    bus: {
      emit(name, payload) { events.push({ name, payload }); },
    },
    events,
  };
}

function makeEntity({ id, type, x, z, radius, mass }) {
  return {
    id,
    type,
    alive: true,
    pos: { x, z },
    rot: 0,
    radius,
    mass,
    hull: 100,
    hullMax: 100,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    armorHp: 0,
    armorMax: 0,
    data: {},
  };
}

function check(name, fn) {
  try {
    fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error: error && error.message ? error.message : String(error) });
  }
}
