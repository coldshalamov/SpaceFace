import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareEvictionOrder,
  createResourceGovernor,
  evictionPriority,
  isGovernorEntryEvictable,
  isGovernorOwnerEvictable,
  selectEvictions,
} from '../src/render/resourceGovernor.js';
import { applySectorExitResidency, createAssetResidencyRegistry } from '../src/render/assetResidency.js';

test('player and opening shell outrank previous-sector warmth', () => {
  assert.ok(evictionPriority({ role: 'player' }) < evictionPriority({ role: 'warm-previous-sector' }));
  const ordered = [
    { key: 'warm', roles: ['warm-previous-sector'], bytes: 10 },
    { key: 'player', roles: ['player'], bytes: 50 },
  ].sort(compareEvictionOrder);
  assert.equal(ordered[0].key, 'warm');
});

test('governor evicts unused warmth before touching the current shell', () => {
  const entries = [
    { key: 'player-shell', roles: ['player', 'opening-shell'], bytes: 40 },
    { key: 'helios-station', roles: ['current-sector', 'opening-shell'], bytes: 80 },
    { key: 'old-ceres', roles: ['warm-previous-sector'], bytes: 120 },
    { key: 'far-lod2', roles: ['unused'], bytes: 30 },
  ];
  const plan = selectEvictions(entries, { maxBytes: 160 });
  assert.ok(plan.evict.includes('old-ceres'));
  assert.equal(plan.evict.includes('player-shell'), false);
  assert.equal(plan.evict.includes('helios-station'), false);

  const governor = createResourceGovernor({ maxGpuBytes: 160 });
  const again = governor.plan(entries, 'gpu');
  assert.deepEqual(again.evict, plan.evict);
});

test('sector exit calls the live governor instead of leaving warmth forever', () => {
  const calls = [];
  const residency = {
    prepareSectorExit(id) { calls.push(['exit', id]); },
    enforceBudget(kind) { calls.push(['budget', kind]); return { evict: ['old-ceres'] }; },
  };
  const receipt = applySectorExitResidency(residency, 'ceres');
  assert.deepEqual(calls, [['exit', 'ceres'], ['budget', 'gpu']]);
  assert.deepEqual(receipt.evict, ['old-ceres']);
});

test('live residency registry evicts previous-sector warmth when over budget', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 40 });
  const playerRes = { dispose() {}, userData: {}, byteSize: 16 };
  const warmRes = { dispose() {}, userData: {}, byteSize: 80 };
  registry.registerAsset('player-shell', [playerRes], { byteSize: 16 });
  registry.registerAsset('old-ceres', [warmRes], { byteSize: 80 });
  registry.retain('player-shell', { name: 'player' }, { role: 'player', sectorId: 'helios' });
  registry.retain('old-ceres', { name: 'warm' }, { role: 'warm-previous-sector', sectorId: 'ceres' });
  const plan = applySectorExitResidency(registry, 'ceres');
  assert.ok(plan.evict.includes('old-ceres'));
  assert.equal(registry.has('player-shell'), true);
});

test('byte pressure never evicts glass, runway, or a mixed-owner presentation asset', () => {
  const plan = selectEvictions([
    { key: 'glass', roles: ['glass'], presentationTier: 'R0_GLASS', bytes: 100 },
    { key: 'runway', roles: ['runway'], presentationTier: 'R1_RUNWAY', bytes: 100 },
    { key: 'mixed', roles: ['evictable', 'glass'], presentationTier: 'R0_GLASS', bytes: 100 },
    { key: 'metadata', roles: ['evictable'], presentationTier: 'R2_METADATA', bytes: 100 },
  ], { maxBytes: 100 });
  assert.deepEqual(plan.evict, ['metadata']);
});

test('low budgets leave protected presentation roles out of the plan with a shortfall receipt', () => {
  const plan = selectEvictions([
    { key: 'player', roles: ['player'], bytes: 40 },
    { key: 'glass', presentationTier: 'R0_GLASS', bytes: 40 },
    { key: 'runway', role: 'runway', bytes: 40 },
    { key: 'shell', role: 'gameplay-shell', bytes: 40 },
    { key: 'interaction', role: 'current-interaction', bytes: 40 },
  ], { maxBytes: 1 });
  assert.deepEqual(plan.evict, []);
  assert.equal(plan.budgetSatisfied, false);
  assert.equal(plan.protectedShortfallBytes, 199);
  assert.equal(plan.blockedBytesByRole.player, 40);
  assert.equal(plan.blockedBytesByRole.R0_GLASS, 40);
  assert.equal(plan.blockedBytesByRole.runway, 40);
  assert.equal(plan.blockedBytesByRole['gameplay-shell'], 40);
  assert.equal(plan.blockedBytesByRole['current-interaction'], 40);
});

test('planner policy is the same for mixed owners and active requests', () => {
  assert.equal(isGovernorOwnerEvictable({ role: 'warm-previous-sector' }), true);
  assert.equal(isGovernorOwnerEvictable({ role: 'player' }), false);
  assert.equal(isGovernorEntryEvictable({
    key: 'mixed',
    bytes: 100,
    ownerRecords: [{ role: 'warm-previous-sector' }, { role: 'player' }],
  }), false);
  assert.equal(isGovernorEntryEvictable({
    key: 'decode',
    bytes: 100,
    roles: ['evictable'],
    activeRequest: true,
  }), false);
  const plan = selectEvictions([
    {
      key: 'mixed',
      bytes: 100,
      ownerRecords: [{ role: 'warm-previous-sector' }, { role: 'player' }],
    },
    { key: 'decode', bytes: 100, role: 'evictable', activeRequest: true },
    { key: 'safe', bytes: 100, role: 'evictable' },
  ], { maxBytes: 1 });
  assert.deepEqual(plan.evict, ['safe']);
  assert.equal(plan.blockedBytesByRole.player, 100);
  assert.equal(plan.blockedBytesByRole['in-flight-request'], 100);
});

test('live receipt reports actual freed bytes and closes the budget when possible', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 150 });
  const protectedRes = { dispose() {}, userData: {}, byteSize: 120 };
  const warmRes = { dispose() {}, userData: {}, byteSize: 70 };
  registry.registerAsset('player-shell', [protectedRes]);
  registry.registerAsset('old-warmth', [warmRes]);
  registry.retain('player-shell', {}, { role: 'player' });
  registry.retain('old-warmth', {}, { role: 'warm-previous-sector' });

  const receipt = registry.enforceBudget();
  assert.deepEqual(receipt.evicted, ['old-warmth']);
  assert.equal(receipt.evictedBytes, 70);
  assert.equal(receipt.remainingBytes, 120);
  assert.equal(receipt.budgetSatisfied, true);
  assert.equal(receipt.protectedShortfallBytes, 0);
  assert.equal(registry.has('player-shell'), true);
});

test('live executor releases only assets whose every owner is evictable', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1 });
  const mixedRes = { dispose() {}, userData: {}, byteSize: 100 };
  const safeRes = { dispose() {}, userData: {}, byteSize: 60 };
  registry.registerAsset('mixed', [mixedRes]);
  registry.registerAsset('safe', [safeRes]);
  registry.retain('mixed', {}, { role: 'warm-previous-sector' });
  registry.retain('mixed', {}, { role: 'current-interaction' });
  registry.retain('safe', {}, { role: 'recent' });

  const receipt = registry.enforceBudget();
  assert.deepEqual(receipt.evicted, ['safe']);
  assert.equal(receipt.evicted.includes('mixed'), false);
  assert.equal(registry.has('mixed'), true);
  assert.equal(receipt.blockedBytesByRole['current-interaction'], 100);
  assert.equal(receipt.blockedBytesByReason['mixed-protected-owner'], 100);
  assert.equal(receipt.budgetSatisfied, false);
  assert.equal(receipt.protectedShortfallBytes, 99);
});

test('active decode request blocks release until the request is cancelled', () => {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1 });
  const resource = { dispose() {}, userData: {}, byteSize: 100 };
  registry.registerAsset('pending', [resource]);
  const request = registry.beginRequest('pending', {}, { role: 'evictable' });
  const receipt = registry.enforceBudget();
  assert.deepEqual(receipt.evicted, []);
  assert.equal(receipt.evictedBytes, 0);
  assert.equal(receipt.budgetSatisfied, false);
  assert.equal(receipt.blockedBytesByRole['in-flight-request'], 100);
  request.cancel('test-cancel');
  assert.equal(registry.has('pending'), false);
});

test('shared memory units are counted once and only free after every asset releases them', () => {
  const oneSided = createAssetResidencyRegistry({ maxGpuBytes: 50 });
  const shared = { dispose() {}, userData: {}, byteSize: 100 };
  const playerOwner = {};
  const warmOwner = {};
  oneSided.registerAsset('shared-player', [shared]);
  oneSided.registerAsset('shared-warmth', [shared]);
  oneSided.retain('shared-player', playerOwner, { role: 'player' });
  oneSided.retain('shared-warmth', warmOwner, { role: 'warm-previous-sector' });

  // The warm side is releasable, but the shared backing store is still held by the player.
  const oneRelease = oneSided.enforceBudget();
  assert.deepEqual(oneRelease.evicted, ['shared-warmth']);
  assert.equal(oneRelease.evictedBytes, 0);
  assert.equal(oneRelease.remainingBytes, 100);
  assert.equal(oneRelease.budgetSatisfied, false);
  assert.equal(oneRelease.protectedShortfallBytes, 50);
  assert.equal(oneSided.diagnostics().residentBytes, 100);

  const bothReleasable = createAssetResidencyRegistry({ maxGpuBytes: 50 });
  const sharedAgain = { dispose() {}, userData: {}, byteSize: 100 };
  bothReleasable.registerAsset('shared-a', [sharedAgain]);
  bothReleasable.registerAsset('shared-b', [sharedAgain]);
  bothReleasable.retain('shared-a', {}, { role: 'warm-previous-sector' });
  bothReleasable.retain('shared-b', {}, { role: 'recent' });

  const bothRelease = bothReleasable.enforceBudget();
  assert.deepEqual(bothRelease.evicted, ['shared-a', 'shared-b']);
  assert.equal(bothRelease.evictedBytes, 100);
  assert.equal(bothRelease.remainingBytes, 0);
  assert.equal(bothRelease.budgetSatisfied, true);
  assert.equal(bothRelease.protectedShortfallBytes, 0);
  assert.equal(bothReleasable.diagnostics().residentBytes, 0);
});
