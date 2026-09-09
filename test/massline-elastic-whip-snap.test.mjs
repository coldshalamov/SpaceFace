// PQ-029.01 — Elastic whip as stored energy.
//
// The drill lives as data (src/data/scenarios/elastic-whip-drill.scenario.json — the Range
// screen is owned elsewhere and stays untouched). This test proves the snap against the real
// SG-02 whip spring: a Drifter-mass hull burns away from a latched wasp, and the return
// stroke moves that light hostile ≥ 40% of Wasp cruise. Cutting does not add a launch impulse.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DRILL = JSON.parse(readFileSync(resolve(ROOT, 'src/data/scenarios/elastic-whip-drill.scenario.json'), 'utf8'));
const WASP_CRUISE = 105;
const SNAP_FLOOR = 0.4 * WASP_CRUISE;
const DT = 1 / 60;
const PLAYER_ID = 2901;
const WHIP = MODULES.find((def) => def.id === 'mod_elastic_whip_m');
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');
const HITCH = SHIPS.find((def) => def.id === 'ship_kestrel');

test('the drill exists as data: three beats, one verb each, inside 60 seconds', () => {
  assert.equal(DRILL.schema, 'spaceface.scenarioContract.v1');
  assert.equal(DRILL.id, 'scenario.elastic-whip-drill');
  assert.ok(DRILL.durationSeconds <= 60, `drill must teach inside 60 s, got ${DRILL.durationSeconds}`);
  assert.deepEqual(DRILL.beats.map((b) => b.id), ['whip_latch', 'whip_stretch', 'whip_snap']);
  const roles = new Map(DRILL.actors.map((a) => [a.id, a]));
  assert.equal(roles.get('player_drifter').assetRef, 'ship_drifter');
  assert.ok(roles.get('drill_wasp').capabilities.includes('hostile.light'));
});

test('the whip is an M head on the Drifter, not a Hitch gun', () => {
  assert.equal(WHIP.size, 'M');
  assert.equal(WHIP.slotType, 'utility');
  const drifterFit = fittingsFromDefaultModules(DRIFTER.id, [WHIP.id]);
  assert.ok(drifterFit.includes(WHIP.id), 'Drifter M utility must accept the whip');
  assert.equal(getDerivedStats(DRIFTER.id, drifterFit, null).masslineHeadId, 'elastic_whip');
  const hitchUtility = (HITCH.slots.utility || []).some((slot) => {
    const size = typeof slot === 'string' ? slot : slot.size;
    return size === 'M' || size === 'L';
  });
  assert.equal(hitchUtility, false, 'Hitch has no M utility — do not pretend the starter ships the whip');
  const wasp = { id: 2, type: 'ship', alive: true, pos: { x: 80, z: 0 } };
  assert.equal(isAttachable(wasp, PLAYER_ID), true, 'a light hull is a legal whip latch');
});

test('a stored stretch snaps a light hostile to >= 40% of Wasp cruise', async () => {
  const STANDARD = ATTACHMENT_DEFS.find((d) => d.id === 'tether_standard');
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'elastic_whip' } },
  }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, 'elastic_whip');

  const owner = makeBody('whip-owner', 0, 0, -105, 0, DRIFTER.mass, 'ship');
  const wasp = makeBody('whip-wasp', 80, 0, 0, 0, 16, 'ship');
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, wasp]);
    const handle = runtime.createAttachment({
      attachmentId: 'elastic-whip-snap', defId: 'tether_standard',
      ownerId: owner.id, targetId: wasp.id,
      sourceWorld: owner.pos, targetWorld: wasp.pos,
      restLength: 80, spring: policy.spring, tick: 0,
    });
    assert.ok(handle, 'the whip must latch the light hostile');

    let peakWasp = 0;
    for (let tick = 0; tick < 180; tick += 1) {
      runtime.step(DT);
      peakWasp = Math.max(peakWasp, Math.hypot(wasp.vel.x, wasp.vel.z));
    }
    const ratio = peakWasp / WASP_CRUISE;
    console.log(`WHIP_SNAP_SPEED=${peakWasp.toFixed(1)} CRUISE=${WASP_CRUISE} RATIO=${ratio.toFixed(2)} FLOOR=0.40`);
    assert.ok(peakWasp >= SNAP_FLOOR,
      `whip snap must move a light hostile >= 40% cruise (${SNAP_FLOOR}), got ${peakWasp.toFixed(1)}`);
  } finally {
    runtime.dispose();
  }
});

function makeBody(id, x, z, vx, vz, mass, type) {
  return {
    id, type, alive: true, radius: 4, mass, maxSpeed: 170,
    physicsBody: { schemaVersion: 1, radius: 4, mass, inertiaY: 64, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}
