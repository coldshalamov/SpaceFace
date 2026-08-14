// scripts/check-beam-verbs.mjs — Verification contract script for PQ-016 industrial beam verbs.
// Must print BEAMVERBS_CHECK_OK and exit 0 when all assertions pass.

import assert from 'node:assert/strict';
import { resolveBeamVerb, spawnPayloadEntity, handlePayloadSectorTransition, BEAM_CUE_IDS } from '../src/combat/industrialBeam.js';
import { describeEntity } from '../src/systems/interactionDescriptors.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';
import { salvageActions } from '../src/systems/salvageActions.js';

console.log('Running PQ-016 check:beam-verbs assertions...');

// --- Section 1: Verb Truth Table Assertions ---

// 1.1 CUT
{
  const wreckEntity = {
    id: 101,
    type: 'wreck',
    alive: true,
    pos: { x: 10, z: 20 },
    radius: 12,
    data: { parentType: 'ship', salvagePointId: 'sal_101' }
  };
  const mockState = { entities: new Map([[101, wreckEntity]]), simTime: 10 };
  const desc = describeEntity(mockState, wreckEntity);
  
  // Cut panel / pull module selected or auto on wreck weakpoint
  const cutRes = resolveBeamVerb(desc, { mode: 'cut', selectedComponentId: 'cut_panel' });
  assert.equal(cutRes.verb, 'cut', 'Wreck weakpoint cut mode should resolve to cut');
  assert.equal(cutRes.ok, true, 'Cut on salvage panel should be ok');

  // Cut mode on plain non-cuttable entity (e.g. raw asteroid)
  const astEntity = { id: 102, type: 'asteroid', alive: true, pos: { x: 50, z: 50 }, radius: 15 };
  const astDesc = describeEntity(mockState, astEntity);
  const astCutRes = resolveBeamVerb(astDesc, { mode: 'cut' });
  assert.equal(astCutRes.verb, 'cut');
  assert.equal(astCutRes.ok, false);
  assert.equal(astCutRes.reason, 'no-cuttable-component');
}

// 1.2 EXTRACT
{
  const mockState = { entities: new Map(), simTime: 10 };
  const astEntity = { id: 102, type: 'asteroid', alive: true, pos: { x: 50, z: 50 }, radius: 15, data: {} };
  const astDesc = describeEntity(mockState, astEntity);
  
  const extractRes = resolveBeamVerb(astDesc, { mode: 'extract' });
  assert.equal(extractRes.verb, 'extract');
  assert.equal(extractRes.ok, true);

  // Mined-out asteroid
  const minedOutEntity = { id: 103, type: 'asteroid', alive: true, pos: { x: 50, z: 50 }, radius: 15, data: { respawnAt: 100 } };
  const minedDesc = describeEntity(mockState, minedOutEntity);
  const minedRes = resolveBeamVerb(minedDesc, { mode: 'extract' });
  assert.equal(minedRes.verb, 'extract');
  assert.equal(minedRes.ok, false);
  assert.equal(minedRes.reason, 'mined-out');

  // Site-anchored asteroid
  const siteEntity = { id: 104, type: 'asteroid', alive: true, pos: { x: 50, z: 50 }, radius: 15, data: { siteAnchored: true } };
  const siteDesc = describeEntity(mockState, siteEntity);
  const siteRes = resolveBeamVerb(siteDesc, { mode: 'extract' });
  assert.equal(siteRes.verb, 'extract');
  assert.equal(siteRes.ok, false);
  assert.equal(siteRes.reason, 'beam-locked');
}

// 1.3 CRITICAL: No silent extract on a repair-only target
{
  const mockState = { entities: new Map(), simTime: 10, playerId: 1 };
  const shipEntity = {
    id: 201,
    type: 'ship',
    alive: true,
    hull: 50,
    hullMax: 100,
    armorHp: 20,
    armorMax: 50,
    pos: { x: 0, z: 0 },
    radius: 10,
    data: { combatProfileId: 'frigate_std' }
  };
  const shipDesc = describeEntity(mockState, shipEntity);

  // Explicit extract mode on ship target -> MUST DENY
  const shipExtractRes = resolveBeamVerb(shipDesc, { mode: 'extract' });
  assert.equal(shipExtractRes.verb, 'extract');
  assert.equal(shipExtractRes.ok, false, 'Extract mode on repair-only ship target MUST NOT be ok');
  assert.equal(shipExtractRes.reason, 'wrong-type');

  // Auto mode on damaged repair-only ship target -> resolves to REPAIR (or denies extract)
  const autoRes = resolveBeamVerb(shipDesc, { mode: 'auto', credits: 500, cargo: {} });
  assert.notEqual(autoRes.verb, 'extract', 'Auto mode on repair-only target must NEVER resolve to extract');
  assert.equal(autoRes.verb, 'repair');
}

// 1.4 REPAIR
{
  const mockState = { entities: new Map(), simTime: 10 };
  const damagedShip = {
    id: 202,
    type: 'ship',
    alive: true,
    hull: 30,
    hullMax: 100,
    pos: { x: 0, z: 0 },
    radius: 10,
    data: {}
  };
  const desc = describeEntity(mockState, damagedShip);

  // Repair with sufficient credits/materials
  const repairRes = resolveBeamVerb(desc, { mode: 'repair', credits: 1000 });
  assert.equal(repairRes.verb, 'repair');
  assert.equal(repairRes.ok, true);

  // Repair with zero credits and zero materials
  const brokeRepairRes = resolveBeamVerb(desc, { mode: 'repair', credits: 0, cargo: {} });
  assert.equal(brokeRepairRes.verb, 'repair');
  assert.equal(brokeRepairRes.ok, false);
  assert.equal(brokeRepairRes.reason, 'insufficient-resources');

  // Intact ship
  const intactShip = { id: 203, type: 'ship', alive: true, hull: 100, hullMax: 100, armorHp: 50, armorMax: 50, pos: { x: 0, z: 0 }, radius: 10, data: {} };
  const intactDesc = describeEntity(mockState, intactShip);
  const intactRes = resolveBeamVerb(intactDesc, { mode: 'repair', credits: 1000 });
  assert.equal(intactRes.verb, 'repair');
  assert.equal(intactRes.ok, false);
  assert.equal(intactRes.reason, 'hull-intact');
}

// 1.5 TRANSFER
{
  const mockState = { entities: new Map(), simTime: 10 };
  const siteMachine = { id: 301, type: 'station', alive: true, pos: { x: 0, z: 0 }, radius: 20, data: { siteId: 'site_1', machineId: 'refinery_1' } };
  const siteDesc = describeEntity(mockState, siteMachine);

  // Transfer with valid site machine receiver + cargo
  const transferRes = resolveBeamVerb(siteDesc, {
    mode: 'transfer',
    receiver: { type: 'site_machine', siteId: 'site_1', machineId: 'refinery_1' },
    cargo: { cmdty_iron_ore: 10 }
  });
  assert.equal(transferRes.verb, 'transfer');
  assert.equal(transferRes.ok, true);
  assert.ok(transferRes.receiverHints);

  // Empty cargo hold
  const emptyTransfer = resolveBeamVerb(siteDesc, {
    mode: 'transfer',
    receiver: { type: 'site_machine', siteId: 'site_1', machineId: 'refinery_1' },
    cargo: {}
  });
  assert.equal(emptyTransfer.verb, 'transfer');
  assert.equal(emptyTransfer.ok, false);
  assert.equal(emptyTransfer.reason, 'no-cargo');

  // Invalid receiver (e.g. wingman ship target)
  const wingman = { id: 302, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 10, data: { isWingman: true } };
  const wingDesc = describeEntity(mockState, wingman);
  const wingTransfer = resolveBeamVerb(wingDesc, { mode: 'transfer', receiver: { type: 'wingman', id: 302 }, cargo: { cmdty_iron_ore: 5 } });
  assert.equal(wingTransfer.verb, 'transfer');
  assert.equal(wingTransfer.ok, false);
  assert.equal(wingTransfer.reason, 'invalid-receiver');
}

// --- Section 2: Payload Spawn & Ownership Lifecycle ---
{
  const mockState = { entities: new Map(), playerId: 1, nextEntityId: 500 };
  const payload = spawnPayloadEntity(mockState, {
    pos: { x: 100, z: 200 },
    radius: 10,
    mass: 120,
    ownerId: 1,
    factionId: 'player',
    salvagePool: { cmdty_scrap_metal: 4 },
    payloadType: 'cut_panel'
  });

  assert.equal(payload.type, 'payload');
  assert.equal(payload.collides, true);
  assert.equal(payload.data.ownerId, 1);
  assert.equal(payload.data.ownership.ownerId, 1);
  assert.equal(payload.data.salvagePool.cmdty_scrap_metal, 4);
  assert.equal(typeof payload.prevPos?.copy, 'function',
    'late payloads must satisfy the fixed-step interpolation entity contract');
  assert.deepEqual(
    { x: payload.prevPos.x, z: payload.prevPos.z },
    { x: payload.pos.x, z: payload.pos.z },
    'the canonical entity factory snapshots the payload spawn pose',
  );

  // Sector transition cleanup test
  const transientPayload = spawnPayloadEntity(mockState, { pos: { x: 0, z: 0 }, transientSector: true });
  const anchoredPayload = spawnPayloadEntity(mockState, { pos: { x: 0, z: 0 }, worldRecordId: 'wr_999' });
  
  const removed = handlePayloadSectorTransition(mockState);
  assert.ok(removed >= 1, 'Transient payload should be despawned on sector transition');
  assert.equal(mockState.entities.has(anchoredPayload.id), true, 'Anchored payload with worldRecordId must survive transition');
}

// --- Section 3: Cue Mapping Assertions ---
{
  assert.equal(BEAM_CUE_IDS.cut, 'industrial.beam.cut');
  assert.equal(BEAM_CUE_IDS.extract, 'industrial.beam.extract');
  assert.equal(BEAM_CUE_IDS.repair, 'industrial.beam.repair');
  assert.equal(BEAM_CUE_IDS.transfer, 'industrial.beam.transfer');
}

console.log('All verb truth table assertions passed.');
console.log('BEAMVERBS_CHECK_OK');
