import test from 'node:test';
import assert from 'node:assert/strict';

import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';

const kernelPromise = import('../src/systems/worldSiteKernel.js').catch((error) => ({ __loadError: error }));
const SITE_ID = 'world_site_helios_relay';

async function kernel() {
  const mod = await kernelPromise;
  assert.equal(mod.__loadError, undefined, `worldSiteKernel must load: ${mod.__loadError && mod.__loadError.message}`);
  return mod;
}

const manifest = () => structuredClone(worldSiteManifestById(SITE_ID));

test('reference manifest validates its versioned ids, bindings, operation graph, and JSON data', async () => {
  const { validateWorldSiteManifest, WORLD_SITE_LIMITS } = await kernel();
  const result = validateWorldSiteManifest(manifest());
  assert.deepEqual(result, { ok: true, errors: [] });
  assert.equal(WORLD_SITE_LIMITS.maxComponents, 7);
  assert.ok(WORLD_SITE_LIMITS.maxEntities >= 8 && WORLD_SITE_LIMITS.maxEntities <= 16);
  assert.ok(WORLD_SITE_LIMITS.maxReceipts >= 32 && WORLD_SITE_LIMITS.maxReceipts <= 128);
  assert.equal(manifest().requestStreams[0].id, 'player-industrial-beam');
  assert.deepEqual(manifest().consequences, [{
    id: 'field_coil_settled',
    intents: [
      { domain: 'economy', type: 'economy:grantCredits', payload: { amount: 450, reason: 'world_site_recovery' } },
      { domain: 'faction', type: 'faction:repDelta', payload: { factionId: 'faction_scn', delta: 1, reason: 'world_site_recovery' } },
    ],
  }]);
});

test('manifest validation rejects duplicate ids, cycles, missing bindings, bad proxies, and non-JSON values', async () => {
  const { validateWorldSiteManifest } = await kernel();

  const duplicate = manifest();
  duplicate.components.push({ ...duplicate.components[0] });
  assert.ok(validateWorldSiteManifest(duplicate).errors.some((e) => e.code === 'component-id-duplicate'));

  const cycle = manifest();
  cycle.operations.find((op) => op.id === 'repair_relay_core').dependsOn = ['cut_cargo_brace'];
  assert.ok(validateWorldSiteManifest(cycle).errors.some((e) => e.code === 'operation-dependency-cycle'));

  const missing = manifest();
  missing.visualRoot.placeId = '';
  missing.components[0].anchorId = '';
  missing.proxies[0].componentId = 'ghost_component';
  const missingCodes = validateWorldSiteManifest(missing).errors.map((e) => e.code);
  assert.ok(missingCodes.includes('visual-binding-missing'));
  assert.ok(missingCodes.includes('component-anchor-missing'));
  assert.ok(missingCodes.includes('proxy-component-missing'));

  const missingProxy = manifest();
  missingProxy.proxies.pop();
  assert.ok(validateWorldSiteManifest(missingProxy).errors.some((e) => e.code === 'component-proxy-count'));

  const duplicateBinding = manifest();
  duplicateBinding.proxies[1].componentId = duplicateBinding.proxies[0].componentId;
  assert.ok(validateWorldSiteManifest(duplicateBinding).errors.some((e) => e.code === 'component-proxy-count'));

  const proxy = manifest();
  proxy.proxies[0].shape = 'triangle';
  proxy.proxies[0].radius = -4;
  assert.ok(validateWorldSiteManifest(proxy).errors.some((e) => e.code === 'proxy-incompatible'));

  const invalidBodyTypeOverride = manifest();
  invalidBodyTypeOverride.proxies.find(
    (candidate) => candidate.componentId === 'payload_cradle',
  ).bodyTypeByStatus = { sealed: 'ghost' };
  assert.ok(validateWorldSiteManifest(invalidBodyTypeOverride).errors
    .some((e) => e.code === 'proxy-status-body-type-invalid'));

  const unknownBodyTypeStatus = manifest();
  unknownBodyTypeStatus.proxies.find(
    (candidate) => candidate.componentId === 'cargo_brace',
  ).bodyTypeByStatus = { 'missing-status': 'sensor' };
  assert.ok(validateWorldSiteManifest(unknownBodyTypeStatus).errors
    .some((e) => e.code === 'proxy-body-status-unknown'));

  const failureActorPolicy = manifest();
  failureActorPolicy.failureTriggers[0].actorPolicy = 'ambient-anything';
  assert.ok(validateWorldSiteManifest(failureActorPolicy).errors
    .some((e) => e.code === 'failure-trigger-actor-policy-invalid'));

  const nonJson = manifest();
  nonJson.debug.invalid = Number.POSITIVE_INFINITY;
  assert.ok(validateWorldSiteManifest(nonJson).errors.some((e) => e.code === 'non-json-value'));
});

test('operation reduction is ordered, deterministic, bounded, and replay-idempotent', async () => {
  const {
    createWorldSiteRecord,
    applyWorldSiteOperation,
    WORLD_SITE_LIMITS,
  } = await kernel();
  const def = manifest();
  const initialA = createWorldSiteRecord(def, { tick: 10 });
  const initialB = createWorldSiteRecord(def, { tick: 10 });
  const requests = [
    { operationId: 'repair_relay_core', amount: 40, tick: 11, receiptId: 'beam:11:relay' },
    { operationId: 'recover_safety_coupler', amount: 24, tick: 12, receiptId: 'beam:12:coupler' },
    { operationId: 'cut_cargo_brace', amount: 32, tick: 13, receiptId: 'beam:13:brace' },
  ];

  let a = initialA;
  let b = initialB;
  for (const request of requests) {
    const ra = applyWorldSiteOperation(def, a, request);
    const rb = applyWorldSiteOperation(def, b, request);
    assert.equal(ra.ok, true);
    assert.equal(rb.ok, true);
    a = ra.record;
    b = rb.record;
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.receipts.map((r) => [r.sequence, r.operationId]), [
    [1, 'repair_relay_core'],
    [2, 'recover_safety_coupler'],
    [3, 'cut_cargo_brace'],
  ]);
  assert.equal(a.payloads.relay_field_coil.status, 'released');
  assert.deepEqual(a.components.relay_core.progress, {});
  assert.deepEqual(a.components.safety_coupler.progress, {});
  assert.deepEqual(a.components.cargo_brace.progress, {},
    'completed operation receipts replace partial progress in the canonical record');

  const beforeReplay = JSON.stringify(a);
  const replay = applyWorldSiteOperation(def, a, requests[2]);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.record, a, 'replay returns the exact persistent record reference');
  assert.equal(JSON.stringify(replay.record), beforeReplay);
  assert.equal(replay.receipt, null);
  assert.deepEqual(replay.intents, []);

  for (let i = 0; i < WORLD_SITE_LIMITS.maxReceipts + 12; i += 1) {
    const failed = applyWorldSiteOperation(def, a, {
      operationId: 'repair_beacon_array',
      amount: 0.01,
      tick: 20 + i,
      receiptId: `bounded:${i}`,
    });
    if (failed.ok) a = failed.record;
  }
  assert.ok(a.receipts.length <= WORLD_SITE_LIMITS.maxReceipts);
  assert.ok(Object.keys(a.operationCursors).length <= def.operations.length);
});

test('receipt dedupe is exact even for ids that collided in the legacy bitmap', async () => {
  const { createWorldSiteRecord, applyWorldSiteOperation } = await kernel();
  const def = manifest();
  const seen = new Map();
  let pair = null;
  for (let i = 0; i < 5000 && !pair; i += 1) {
    const id = `collision:${i}`;
    let hash = 2166136261 >>> 0;
    for (let j = 0; j < id.length; j += 1) {
      hash ^= id.charCodeAt(j);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    const bit = hash % (16 * 32);
    if (seen.has(bit)) pair = [seen.get(bit), id];
    else seen.set(bit, id);
  }
  assert.ok(pair, 'fixture finds a deliberate legacy bitmap collision');
  let record = createWorldSiteRecord(def, { tick: 1 });
  record = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 1, tick: 2, receiptId: pair[0],
  }).record;
  const second = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 1, tick: 3, receiptId: pair[1],
  });
  assert.equal(second.ok, true);
  assert.equal(second.duplicate, false);
  assert.equal(second.record.components.relay_core.progress.repair_relay_core, 2);
});

test('failure remains recoverable and payload receiver settlement completes exactly once', async () => {
  const {
    createWorldSiteRecord,
    applyWorldSiteFailure,
    applyWorldSiteOperation,
  } = await kernel();
  const def = manifest();
  let record = createWorldSiteRecord(def, { tick: 1 });
  const firstRepair = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 40, tick: 2, receiptId: 'repair:relay:first',
  });
  assert.equal(firstRepair.ok, true);
  record = firstRepair.record;
  const failed = applyWorldSiteFailure(def, record, {
    componentId: 'relay_core',
    failureId: 'relay_trip',
    tick: 3,
    receiptId: 'failure:relay_trip',
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.record.components.relay_core.status, 'failed');
  assert.equal(failed.record.completedOperations.repair_relay_core, undefined, 'failure reopens the completed repair');
  record = failed.record;

  const stale = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 40, tick: 4,
    requestStreamId: 'player-industrial-beam', requestSequence: 2,
  });
  assert.equal(stale.duplicate, true, 'receipt from the prior repair cycle stays stale');

  const recovered = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 40, tick: 5,
    requestStreamId: 'player-industrial-beam', requestSequence: 5,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.record.components.relay_core.status, 'operational');
  record = recovered.record;

  for (const request of [
    { operationId: 'recover_safety_coupler', amount: 24, tick: 6, receiptId: 'repair:coupler' },
    { operationId: 'cut_cargo_brace', amount: 32, tick: 7, receiptId: 'cut:brace' },
  ]) record = applyWorldSiteOperation(def, record, request).record;

  const { planWorldSiteMaterialization } = await kernel();
  const deliveryPlan = planWorldSiteMaterialization(def, record);
  const payload = deliveryPlan.payloads[0];
  const receiver = deliveryPlan.components.find((component) => component.componentId === 'receiver_collar');
  const settlementRequest = {
    operationId: 'settle_field_coil', amount: 1, tick: 8, receiptId: 'settle:field_coil',
    delivery: {
      payloadId: 'relay_field_coil',
      payloadWorldObjectId: `${SITE_ID}/payload/relay_field_coil`,
      receiverId: 'relay_receiver',
      payloadPos: { ...receiver.pos },
      receiverPos: { ...receiver.pos },
      payloadRadius: payload.radius,
      receiverRadius: receiver.radius,
    },
  };
  const settled = applyWorldSiteOperation(def, record, settlementRequest);
  assert.equal(settled.ok, true);
  assert.equal(settled.record.payloads.relay_field_coil.status, 'settled');
  assert.equal(settled.record.receivers.relay_receiver.settledReceiptId,
    `${SITE_ID}/operation/settle_field_coil/player-industrial-beam/8`);
  assert.deepEqual(settled.intents.map((intent) => [intent.type, intent.payload.delta ?? intent.payload.amount]), [
    ['economy:grantCredits', 450],
    ['faction:repDelta', 1],
  ]);

  const replay = applyWorldSiteOperation(def, settled.record, settlementRequest);
  assert.equal(replay.duplicate, true);
  assert.deepEqual(replay.intents, []);
  assert.equal(replay.record, settled.record);
});

test('receiver rejects a released payload without exact overlapping delivery evidence', async () => {
  const { createWorldSiteRecord, applyWorldSiteOperation } = await kernel();
  const def = manifest();
  let record = createWorldSiteRecord(def, { tick: 1 });
  for (const request of [
    { operationId: 'repair_relay_core', amount: 40, tick: 2, receiptId: 'remote:core' },
    { operationId: 'cut_cargo_brace', amount: 32, tick: 3, receiptId: 'remote:brace' },
  ]) record = applyWorldSiteOperation(def, record, request).record;
  const before = record;
  const remote = applyWorldSiteOperation(def, record, {
    operationId: 'settle_field_coil', amount: 1, tick: 4, receiptId: 'remote:settle',
    delivery: {
      payloadId: 'relay_field_coil',
      payloadWorldObjectId: `${SITE_ID}/payload/relay_field_coil`,
      receiverId: 'relay_receiver',
      payloadPos: { x: 5000, z: 5000 }, receiverPos: { x: 0, z: 0 },
      payloadRadius: 6, receiverRadius: 10,
    },
  });
  assert.equal(remote.ok, false);
  assert.equal(remote.reason, 'payload-not-delivered');
  assert.equal(remote.record, before);
  assert.equal(remote.record.operationCursors.settle_field_coil, undefined);

  const wrongIdentity = applyWorldSiteOperation(def, record, {
    operationId: 'settle_field_coil', amount: 1, tick: 5, receiptId: 'wrong-id:settle',
    delivery: {
      payloadId: 'relay_field_coil',
      payloadWorldObjectId: 'world_site_helios_relay/payload/impostor',
      receiverId: 'relay_receiver',
      payloadPos: { x: 0, z: 0 }, receiverPos: { x: 0, z: 0 },
    },
  });
  assert.equal(wrongIdentity.ok, false);
  assert.equal(wrongIdentity.reason, 'payload-not-delivered');
});

test('recovery cycles keep histories bounded without forgetting stale exact receipts', async () => {
  const { createWorldSiteRecord, applyWorldSiteOperation, applyWorldSiteFailure, WORLD_SITE_LIMITS } = await kernel();
  const def = manifest();
  let record = createWorldSiteRecord(def, { tick: 0 });
  for (let cycle = 0; cycle < WORLD_SITE_LIMITS.maxFailures + 4; cycle += 1) {
    record = applyWorldSiteOperation(def, record, {
      operationId: 'repair_relay_core', amount: 40, tick: cycle * 2 + 1, receiptId: `cycle:${cycle}:repair`,
    }).record;
    record = applyWorldSiteFailure(def, record, {
      componentId: 'relay_core', failureId: `trip:${cycle}`, tick: cycle * 2 + 2,
      receiptId: `cycle:${cycle}:failure`,
    }).record;
  }
  assert.equal(record.components.relay_core.cycle, WORLD_SITE_LIMITS.maxFailures + 4);
  assert.equal(record.failures.length, WORLD_SITE_LIMITS.maxFailures);
  assert.ok(record.receipts.length <= WORLD_SITE_LIMITS.maxReceipts);
  assert.ok(Object.keys(record.operationCursors).length <= def.operations.length);
  const before = record;
  const stale = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core', amount: 40, tick: 99,
    requestStreamId: 'player-industrial-beam', requestSequence: 1,
  });
  assert.equal(stale.duplicate, true);
  assert.equal(stale.record, before);
});

test('materialization plan has stable bounded root/component/payload identities and visible stages', async () => {
  const {
    createWorldSiteRecord,
    applyWorldSiteOperation,
    planWorldSiteMaterialization,
    WORLD_SITE_LIMITS,
  } = await kernel();
  const def = manifest();
  let record = createWorldSiteRecord(def, { tick: 1 });
  const before = planWorldSiteMaterialization(def, record);
  assert.equal(before.root.worldRecordId, `${SITE_ID}/root`);
  assert.equal(before.components.length, 6);
  assert.ok(before.entities.length <= WORLD_SITE_LIMITS.maxEntities);
  assert.deepEqual(before.components.map((c) => c.worldRecordId), def.components.map((c) => `${SITE_ID}/component/${c.id}`));
  assert.equal(before.payloads.length, 0);
  assert.equal(before.root.stageId, 'damaged');

  for (const request of [
    { operationId: 'repair_relay_core', amount: 40, tick: 2, receiptId: 'r:core' },
    { operationId: 'recover_safety_coupler', amount: 24, tick: 3, receiptId: 'r:coupler' },
    { operationId: 'cut_cargo_brace', amount: 32, tick: 4, receiptId: 'r:brace' },
    { operationId: 'unseal_payload_cradle', amount: 18, tick: 5, receiptId: 'r:cradle' },
  ]) record = applyWorldSiteOperation(def, record, request).record;

  const after = planWorldSiteMaterialization(def, record);
  assert.equal(after.root.stageId, 'opened');
  assert.notEqual(after.root.scale, before.root.scale, 'stage transformation changes visible root scale');
  assert.equal(after.payloads.length, 1);
  assert.equal(after.payloads[0].worldRecordId, `${SITE_ID}/payload/relay_field_coil`);
  const brace = after.components.find((component) => component.componentId === 'cargo_brace');
  assert.ok(Number.isFinite(brace.pos.x) && Number.isFinite(brace.pos.z));
  assert.notDeepEqual(brace.pos, after.root.pos, 'verified socket transform keeps component center distinct from root');
});

test('status-conditioned solid proxies become sensors without changing durable identity', async () => {
  const {
    createWorldSiteRecord,
    applyWorldSiteOperation,
    planWorldSiteMaterialization,
  } = await kernel();
  const def = manifest();
  const cargoProxy = def.proxies.find((proxy) => proxy.componentId === 'cargo_brace');
  assert.deepEqual(cargoProxy.bodyTypeByStatus, { detached: 'sensor' });
  let record = createWorldSiteRecord(def, { tick: 1 });
  const before = planWorldSiteMaterialization(def, record).components
    .find((component) => component.componentId === 'cargo_brace');
  assert.equal(before.worldRecordId, `${SITE_ID}/component/cargo_brace`);
  assert.equal(before.status, 'attached');
  assert.equal(before.bodyType, 'solid');

  record = applyWorldSiteOperation(def, record, {
    operationId: 'repair_relay_core',
    amount: 40,
    tick: 2,
    receiptId: 'status-body:core',
  }).record;
  record = applyWorldSiteOperation(def, record, {
    operationId: 'cut_cargo_brace',
    amount: 32,
    tick: 3,
    receiptId: 'status-body:brace',
  }).record;
  const after = planWorldSiteMaterialization(def, record).components
    .find((component) => component.componentId === 'cargo_brace');
  assert.equal(after.worldRecordId, before.worldRecordId);
  assert.equal(after.status, 'detached');
  assert.equal(after.bodyType, 'sensor',
    'a detached brace is no longer a physical obstacle after its release operation');
  assert.equal(after.proxy.bodyType, 'sensor',
    'runtime proxy metadata must expose effective contact authority');
  assert.equal(after.proxy.authoredBodyType, 'solid',
    'the effective sensor retains its authored solid provenance');
});

test('shipped Mk1 fixed-step route uses bounded per-operation cursors through save/reload', async () => {
  const {
    createWorldSiteRecord,
    normalizeWorldSiteRecord,
    applyWorldSiteOperation,
    planWorldSiteMaterialization,
    WORLD_SITE_LIMITS,
  } = await kernel();
  const def = manifest();

  const run = (directMultiplier) => {
    let record = createWorldSiteRecord(def, { tick: 0 });
    let sequence = 0;
    let accepted = 0;
    const dps = 18 * directMultiplier;
    const ordered = [
      ['repair_relay_core', 40],
      ['recover_safety_coupler', 24],
      ['cut_cargo_brace', 32],
      ['unseal_payload_cradle', 18],
      ['settle_field_coil', 1],
      ['repair_beacon_array', 20],
    ];
    for (const [operationId] of ordered) {
      while (!record.completedOperations[operationId]) {
        sequence += 1;
        let delivery;
        if (operationId === 'settle_field_coil') {
          const plan = planWorldSiteMaterialization(def, record);
          const payload = plan.payloads[0];
          const receiver = plan.components.find((component) => component.componentId === 'receiver_collar');
          delivery = {
            payloadId: 'relay_field_coil', payloadWorldObjectId: payload.worldRecordId,
            receiverId: 'relay_receiver', payloadPos: { ...receiver.pos }, receiverPos: { ...receiver.pos },
          };
        }
        const result = applyWorldSiteOperation(def, record, {
          operationId,
          amount: operationId === 'settle_field_coil' ? 1 : dps / 60,
          tick: sequence,
          requestStreamId: 'player-industrial-beam',
          requestSequence: sequence,
          delivery,
        });
        assert.equal(result.ok, true, `${operationId} at fixed tick ${sequence}`);
        assert.equal(result.duplicate, false);
        record = result.record;
        accepted += 1;
        if (sequence === 50) {
          record = normalizeWorldSiteRecord(def, JSON.parse(JSON.stringify(record)));
          const before = record;
          for (const replaySequence of [50, 49]) {
            const replay = applyWorldSiteOperation(def, record, {
              operationId: 'repair_relay_core', amount: dps / 60, tick: 51,
              requestStreamId: 'player-industrial-beam', requestSequence: replaySequence,
            });
            assert.equal(replay.duplicate, true);
            assert.equal(replay.record, before);
            assert.equal(replay.receipt, null);
            assert.deepEqual(replay.intents, []);
          }
        }
        assert.ok(sequence < 1000, 'route must not exhaust or stall');
      }
    }
    assert.equal(Object.keys(record.operationCursors).length, def.operations.length);
    assert.ok(record.receipts.length <= WORLD_SITE_LIMITS.maxReceipts);
    assert.equal(record.receiptIds, undefined);
    return { record, sequence, accepted };
  };

  const baseline = run(1);
  const direct = run(1.08);
  assert.equal(baseline.sequence, 449);
  assert.equal(baseline.accepted, 449);
  assert.equal(direct.sequence, 417);
  assert.equal(direct.accepted, 417);
});

test('malformed save normalization derives a reachable bounded state from manifest truth', async () => {
  const {
    applyWorldSiteOperation,
    normalizeWorldSiteRecord,
    operationForWorldSiteComponent,
    WORLD_SITE_LIMITS,
  } = await kernel();
  const def = manifest();
  const malformed = {
    manifestId: def.id,
    worldObjectId: def.worldObjectId,
    createdTick: -4,
    updatedTick: Number.POSITIVE_INFINITY,
    revision: 99,
    stageId: 'recovered',
    components: Object.fromEntries(def.components.map((component) => [component.id, {
      status: 'unreachable-corruption',
      cycle: 0,
      failureCount: 0,
      progress: Object.fromEntries(def.operations.map((operation) => [operation.id, Number.POSITIVE_INFINITY])),
    }])),
    completedOperations: {
      settle_field_coil: {
        receiptId: 'ghost-settlement', tick: 900, cycle: 0,
        requestStreamId: 'wrong-stream', requestSequence: 900,
      },
      repair_beacon_array: {
        receiptId: 'ghost-beacon', tick: 901, cycle: 0,
        requestStreamId: 'player-industrial-beam', requestSequence: 901,
      },
      ghost_operation: { receiptId: 'ghost', tick: 902 },
    },
    operationCursors: {
      settle_field_coil: { requestStreamId: 'wrong-stream', throughSequence: Number.MAX_SAFE_INTEGER },
      ghost_operation: { requestStreamId: 'player-industrial-beam', throughSequence: 100 },
    },
    payloads: {
      relay_field_coil: {
        status: 'settled', settledReceiptId: 'ghost-settlement',
        motion: { pos: { x: 5, z: 6 }, vel: { x: 7, z: 8 } },
      },
    },
    receivers: { relay_receiver: { status: 'settled', settledReceiptId: 'different-ghost' } },
    receipts: Array.from({ length: WORLD_SITE_LIMITS.maxReceipts + 20 }, (_, sequence) => ({
      sequence, kind: 'operation', operationId: sequence % 2 ? 'ghost_operation' : 'settle_field_coil',
      requestStreamId: 'wrong-stream', requestSequence: sequence,
    })),
    failures: Array.from({ length: WORLD_SITE_LIMITS.maxFailures + 20 }, (_, cycle) => ({
      componentId: 'ghost_component', cycle,
    })),
    nextReceiptSequence: -1,
  };

  const normalized = normalizeWorldSiteRecord(def, malformed);
  assert.equal(normalized.stageId, 'damaged');
  assert.deepEqual(normalized.completedOperations, {});
  assert.deepEqual(normalized.operationCursors, {});
  assert.equal(normalized.payloads.relay_field_coil.status, 'stowed');
  assert.equal(normalized.payloads.relay_field_coil.settledReceiptId, null);
  assert.equal(normalized.receivers.relay_receiver.status, 'ready');
  assert.equal(normalized.receivers.relay_receiver.settledReceiptId, null);
  assert.equal(normalized.components.relay_core.status, 'damaged');
  assert.ok(normalized.receipts.length <= WORLD_SITE_LIMITS.maxReceipts);
  assert.ok(normalized.failures.length <= WORLD_SITE_LIMITS.maxFailures);

  const recovery = operationForWorldSiteComponent(def, normalized, 'relay_core', 'repair');
  assert.equal(recovery && recovery.id, 'repair_relay_core');
  const progressed = applyWorldSiteOperation(def, normalized, {
    operationId: recovery.id,
    amount: recovery.threshold,
    requestStreamId: recovery.requestStreamId,
    requestSequence: 1,
    tick: 1,
  });
  assert.equal(progressed.ok, true);
  assert.equal(progressed.record.components.relay_core.status, 'operational');
});
