import test from 'node:test';
import assert from 'node:assert/strict';

import {
  describeEntity,
  listComponents,
  resolveComponentForVerb,
} from '../src/systems/interactionDescriptors.js';
import {
  operationForWorldSiteComponent,
  worldSiteOperationReadiness,
} from '../src/systems/worldSiteKernel.js';

const SITE_ID = 'world_site_helios_relay';

function authoredState() {
  return {
    tick: 12,
    playerId: 1,
    entities: new Map([[1, {
      id: 1,
      type: 'ship',
      alive: true,
      team: 0,
      pos: { x: 0, z: 0 },
      radius: 10,
    }]]),
    combat: { entities: {} },
    sites: {
      worldOrder: [SITE_ID],
      worldById: {
        [SITE_ID]: {
          schemaVersion: 1,
          manifestId: SITE_ID,
          worldObjectId: SITE_ID,
          sectorId: 'sector_helios_prime',
          stageId: 'damaged',
          completedOperations: {},
          payloads: { relay_field_coil: { status: 'stowed' } },
          receivers: { relay_receiver: { status: 'ready', settledReceiptId: null } },
          components: {
            relay_core: { status: 'damaged', progress: {} },
            cargo_brace: { status: 'attached', progress: {} },
            receiver_collar: { status: 'ready', progress: {} },
          },
        },
      },
    },
  };
}

function componentEntity(componentId) {
  return {
    id: 200,
    type: 'wreck',
    alive: true,
    pos: { x: 220, z: -180 },
    radius: 10,
    data: {
      name: 'Helios Relay Component',
      worldSiteId: SITE_ID,
      worldSiteComponentId: componentId,
      worldRecordId: `${SITE_ID}/component/${componentId}`,
    },
  };
}

test('authored site component descriptors expose stable identity and declared beam verbs', () => {
  const state = authoredState();
  const entity = componentEntity('relay_core');
  const [component] = listComponents(state, entity);

  assert.deepEqual(component && {
    componentId: component.componentId,
    key: component.key,
    verb: component.verb,
    operationId: component.operationId,
    status: component.status,
    active: component.active,
    presentationOwnerWorldRecordId: component.presentationOwnerWorldRecordId,
  }, {
    componentId: 'relay_core',
    key: `wr:${SITE_ID}/component/relay_core::relay_core`,
    verb: 'repair',
    operationId: 'repair_relay_core',
    status: 'damaged',
    active: true,
    presentationOwnerWorldRecordId: `${SITE_ID}/root`,
  });

  const selection = {
    stableKey: `wr:${SITE_ID}/component/relay_core`,
    componentId: 'relay_core',
  };
  assert.deepEqual(resolveComponentForVerb(state, entity, 'repair', selection), {
    ok: true,
    componentId: 'relay_core',
    operationId: 'repair_relay_core',
  });
});

test('authored components never advertise dependency-blocked, unavailable, or completed operations', () => {
  const state = authoredState();
  const repairEntity = componentEntity('relay_core');
  const braceEntity = componentEntity('cargo_brace');
  const transferEntity = componentEntity('receiver_collar');
  const repairSelection = { stableKey: `wr:${SITE_ID}/component/relay_core`, componentId: 'relay_core' };
  const braceSelection = { stableKey: `wr:${SITE_ID}/component/cargo_brace`, componentId: 'cargo_brace' };
  const transferSelection = { stableKey: `wr:${SITE_ID}/component/receiver_collar`, componentId: 'receiver_collar' };

  assert.equal(resolveComponentForVerb(state, repairEntity, 'repair', repairSelection).ok, true);
  assert.equal(resolveComponentForVerb(state, repairEntity, 'cut', repairSelection).ok, false);
  assert.deepEqual(listComponents(state, braceEntity)[0].verb, null);
  assert.equal(listComponents(state, braceEntity)[0].inactiveReason, 'dependency-incomplete');
  assert.equal(resolveComponentForVerb(state, braceEntity, 'cut', braceSelection).ok, false);
  assert.equal(resolveComponentForVerb(state, transferEntity, 'transfer', transferSelection).ok, false);
  assert.equal(resolveComponentForVerb(state, transferEntity, 'cut', transferSelection).ok, false);

  state.sites.worldById[SITE_ID].completedOperations.repair_relay_core = { receiptId: 'done', tick: 12, cycle: 0 };
  state.sites.worldById[SITE_ID].components.relay_core.status = 'operational';
  const completed = listComponents(state, repairEntity)[0];
  assert.equal(completed.verb, null);
  assert.equal(completed.operationId, null);
  assert.equal(completed.active, false);
  assert.equal(completed.inactiveReason, 'complete');

  state.sites.worldById[SITE_ID].payloads.relay_field_coil.status = 'released';
  state.sites.worldById[SITE_ID].completedOperations.cut_cargo_brace = { receiptId: 'brace-done', tick: 12, cycle: 0 };
  const availableTransfer = listComponents(state, transferEntity)[0];
  assert.equal(availableTransfer.verb, 'transfer');
  assert.equal(availableTransfer.operationId, 'settle_field_coil');
});

test('shared readiness selector skips an earlier blocked operation for a later ready candidate', () => {
  const genericManifest = {
    operations: [
      {
        id: 'blocked-first', componentId: 'machine', verb: 'repair', from: ['damaged'], to: 'operational',
        dependsOn: ['missing-dependency'], requestStreamId: 'test-stream',
      },
      {
        id: 'ready-second', componentId: 'machine', verb: 'repair', from: ['damaged'], to: 'operational',
        dependsOn: [], requestStreamId: 'test-stream',
      },
    ],
  };
  const record = {
    components: { machine: { status: 'damaged' } },
    completedOperations: {},
    payloads: {},
    receivers: {},
  };
  const readiness = worldSiteOperationReadiness(genericManifest, record, 'machine', 'repair');
  assert.equal(readiness.operation && readiness.operation.id, 'ready-second');
  assert.equal(readiness.reason, null);
  assert.equal(operationForWorldSiteComponent(genericManifest, record, 'machine', 'repair').id, 'ready-second');
});
