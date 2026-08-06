import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  buildSlotList,
  fittingsFromDefaultModules,
  getDerivedStats,
  ships,
} from '../src/systems/ships.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const TRACTOR = MODULES.find((def) => def.id === 'mod_tractor_beam_m');
const WHIP = MODULES.find((def) => def.id === 'mod_elastic_whip_m');
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');

test('Elastic Whip is a reachable, exclusive, independently flagged Massline head', () => {
  const fittings = fittingsFromDefaultModules(DRIFTER.id, [WHIP.id]);
  const derived = getDerivedStats(DRIFTER.id, fittings, null);
  const production = effectiveTetherPolicy(STANDARD, { data: { derived } }, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, { data: { derived } }, LEGACY47A_FEATURES);
  const tractorTech = TECH_NODES.find((node) => node.id === WHIP.requiresTech);

  assert.ok(fittings.includes(WHIP.id), 'the M utility head fits a production hull');
  assert.ok(tractorTech.unlocks.modules.includes(WHIP.id), 'research exposes the head to station stock');
  assert.equal(derived.masslineHeadId, 'elastic_whip');
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadElasticWhip, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadElasticWhip, false);
  assert.equal(production.headId, 'elastic_whip');
  assert.deepEqual(
    [production.spring.K, production.spring.zeta, production.spring.captureS],
    [260, 0.28, 0.20],
  );
  assert.equal(legacy.headId, undefined, 'the head flag removes only Elastic Whip admission');
  assert.equal(legacy.spring, undefined, 'flag-off preserves the ordinary standard line');
  assert.match(statSnippet(WHIP), /spring-energy head/i);

  const forward = fittingsFromDefaultModules(DRIFTER.id, [TRACTOR.id, WHIP.id]);
  const reversed = fittingsFromDefaultModules(DRIFTER.id, [WHIP.id, TRACTOR.id]);
  assert.equal(getDerivedStats(DRIFTER.id, forward, null).masslineHeadId, 'elastic_whip');
  assert.equal(getDerivedStats(DRIFTER.id, reversed, null).masslineHeadId, 'elastic_whip',
    'defensive arbitration must not inherit fitting-slot order');

  const utilitySlots = buildSlotList(DRIFTER).filter((slot) => slot.type === 'utility');
  const liveFittings = fittingsFromDefaultModules(DRIFTER.id, [TRACTOR.id]);
  const state = {
    tick: 0,
    playerId: 1,
    entities: new Map(),
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: DRIFTER.id, fittings: liveFittings }],
      moduleInventory: [{ instanceId: 'whip_inventory', defId: WHIP.id }],
      researchedNodes: [WHIP.requiresTech],
      cargo: { usedVolume: 0 },
    },
  };
  const emitted = [];
  const bus = { on() {}, emit(type, payload) { emitted.push({ type, payload }); } };
  ships.init({ state, bus, helpers: {} });

  assert.equal(ships.fitModule({ slotIndex: utilitySlots[1].index, instanceId: 'whip_inventory' }), false,
    'live fitting must require the current head to be unfitted first');
  assert.equal(state.player.moduleInventory[0].instanceId, 'whip_inventory');
  assert.match(emitted.at(-1).payload.text, /unfit .* before fitting another head/i);
});

test('Elastic Whip returns more earned spring energy without steering or a cut impulse', async () => {
  const standard = await sampleSpring(STANDARD.spring, 'standard');
  const whipPolicy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'elastic_whip' } },
  }, PRODUCTION_FEATURES);
  const whip = await sampleSpring(whipPolicy.spring, 'elastic-whip');

  assert.ok(whip.maxClosingSpeed > standard.maxClosingSpeed * 1.2,
    `Whip should return a materially faster earned stroke: ${standard.maxClosingSpeed} -> ${whip.maxClosingSpeed}`);
  assert.ok(whip.maxRadialEnergy > standard.maxRadialEnergy * 1.4,
    `Whip should return materially more radial energy: ${standard.maxRadialEnergy} -> ${whip.maxRadialEnergy}`);
  assert.ok(Math.abs(whip.finalMomentumX) < 0.05, 'equal/opposite line impulses must conserve X momentum');
  assert.ok(Math.abs(whip.ownerZ - 31) < 0.01 && Math.abs(whip.payloadZ - 31) < 0.01,
    'the radial spring must not take over tangential speed');
  assert.ok(Math.abs(whip.ownerRot) < 1e-6 && Math.abs(whip.payloadRot) < 1e-6,
    'center-applied tension must not steer either body');

  const cut = await sampleCut(whipPolicy.spring);
  assert.ok(cut.tension > 0, 'the proof cut must happen while the Whip is loaded');
  assert.ok(cut.deltaSpeed < 1e-6,
    `manual cut must preserve earned velocity instead of adding a launch impulse, got ${cut.deltaSpeed}`);
});

test('an active Elastic Whip snapshots through combat save and Continue', () => {
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'elastic_whip' } },
  }, PRODUCTION_FEATURES);
  const player = { id: 1, alive: true, flags: {} };
  const payload = { id: 2, alive: true, flags: { persistent: true } };
  const state = {
    playerId: player.id,
    entityList: [player, payload],
    entities: new Map([[player.id, player], [payload.id, payload]]),
    combat: {
      attachments: {
        nextId: 2,
        byId: {
          att_000001: {
            id: 'att_000001',
            defId: 'tether_standard',
            ownerId: player.id,
            targetId: payload.id,
            state: 'active',
            restLength: 80,
            tetherPolicy: policy,
          },
        },
      },
      entities: {},
      actions: { nextRequestSeq: 1, nextInstanceSeq: 1, requests: [], activeByActor: {}, cooldownReadyTickByActor: {} },
      statusNextPendingSeq: 1,
    },
  };

  const payloadSave = serializeCombatState(state);
  assert.equal(payloadSave.attachments.byId.att_000001.tetherPolicy.headId, 'elastic_whip');
  assert.equal(payloadSave.attachments.byId.att_000001.tetherPolicy.spring.K, 260);

  const restored = {};
  const summary = restoreCombatState(restored, payloadSave, (ref) => {
    if (ref && ref.kind === 'player') return player.id;
    if (ref && ref.kind === 'persistent' && ref.saveId === String(payload.id)) return payload.id;
    return null;
  });
  assert.equal(summary.restoredAttachments, 1);
  assert.deepEqual(restored.combat.attachments.byId.att_000001.tetherPolicy, policy);
});

async function sampleSpring(spring, id) {
  const owner = makeBody(`${id}-owner`, 0, { vel: { x: 0, z: 31 } });
  const payload = makeBody(`${id}-payload`, 120, { vel: { x: 0, z: 31 } });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, payload]);
    const handle = runtime.createAttachment({
      attachmentId: `${id}-line`,
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: payload.id,
      sourceWorld: owner.pos,
      targetWorld: payload.pos,
      restLength: 80,
      spring,
      tick: 0,
    });
    assert.ok(handle);

    let maxClosingSpeed = 0;
    for (let tick = 0; tick < 120; tick += 1) {
      runtime.step(DT);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
      maxClosingSpeed = Math.max(maxClosingSpeed, -telemetry.relativeSpeed);
    }
    const reducedMass = owner.mass * payload.mass / (owner.mass + payload.mass);
    return {
      maxClosingSpeed,
      maxRadialEnergy: 0.5 * reducedMass * maxClosingSpeed * maxClosingSpeed,
      finalMomentumX: owner.mass * owner.vel.x + payload.mass * payload.vel.x,
      ownerZ: owner.vel.z,
      payloadZ: payload.vel.z,
      ownerRot: owner.rot,
      payloadRot: payload.rot,
    };
  } finally {
    runtime.dispose();
  }
}

async function sampleCut(spring) {
  const owner = makeBody('cut-owner', 0);
  const payload = makeBody('cut-payload', 120);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([owner, payload]);
    const handle = runtime.createAttachment({
      attachmentId: 'cut-line',
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: payload.id,
      sourceWorld: owner.pos,
      targetWorld: payload.pos,
      restLength: 80,
      spring,
      tick: 0,
    });
    for (let tick = 0; tick < 24; tick += 1) runtime.step(DT);
    const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
    const before = { x: owner.vel.x, z: owner.vel.z };
    assert.equal(runtime.cutAttachment({ attachmentId: handle.attachmentId }), true);
    runtime.step(DT);
    return {
      tension: telemetry.tension,
      deltaSpeed: Math.hypot(owner.vel.x - before.x, owner.vel.z - before.z),
    };
  } finally {
    runtime.dispose();
  }
}

function makeBody(id, x, options = {}) {
  const mass = options.mass ?? 24;
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass,
    maxSpeed: 170,
    physicsBody: {
      schemaVersion: 1,
      radius: 4,
      mass,
      inertiaY: 64,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z: 0 },
    vel: { x: options.vel?.x ?? 0, z: options.vel?.z ?? 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}
