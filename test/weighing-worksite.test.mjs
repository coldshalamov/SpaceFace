import assert from 'node:assert/strict';
import test from 'node:test';
import { WEIGHING_WORKSITE, isWeighingOperation, isWeighingTarget, weighingSpawnPosition,
  stampWeighingTarget, observeWeighingScene, weighingEvidence, weighingReadout, isWeighingCasualty } from '../src/missions/weighingWorksite.js';
import { captureEntityRecord, spawnSpecFromRecord, bindEntityToRecord, stableRecordId, RECORD_KIND } from '../src/world/worldRecords.js';
import { factionHelix, ensureHelixState } from '../src/systems/faction_helix.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
function harness(count = 3) {
  const m = { id: 'weighing-test', status: 'active', storyTag: 'campaign47a:b4:operation',
    storyBranch: 'patrol', type: 'patrol_clear', destSectorId: 'sector_charon_expanse',
    destStationId: 'station_expanse', params: { weighingVersion: 1, bookScene: 'too_perfect_pack',
      packUnmask: true, clearCount: 3 }, objectiveTarget: 3, objectiveProgress: 0,
    targetEntityIds: [], completedTargetSlots: [] };
  const state = { meta: { seed: 77 }, tick: 1, simTime: 1, mode: 'flight', ui: {},
    world: { currentSectorId: m.destSectorId }, entities: new Map(), playerId: 'player' };
  state.entities.set('player', { id: 'player', alive: true, pos: weighingSpawnPosition(m, 0) });
  const events = [], owner = { state, bus: { emit: (name, data) => events.push({ name, data }) } };
  function add(slot) {
    const key = `mission:${m.id}:${slot}`;
    const e = { ...makeEnemySpawnSpec(WEIGHING_WORKSITE.archetype, 5, weighingSpawnPosition(m, slot)),
      id: `hull-${slot}`, type: 'ship', alive: true, homeSectorId: m.destSectorId };
    Object.assign(e.data, { missionId: m.id, missionTag: m.id, missionTargetSlot: slot,
      identityKey: key, homeSectorId: m.destSectorId, sectorId: m.destSectorId,
      worldRecordId: stableRecordId(77, m.destSectorId, RECORD_KIND.MISSION_TARGET, key) });
    state.entities.set(e.id, e); m.targetEntityIds.push(e.id);
    assert.equal(stampWeighingTarget(state, m, e, slot), true); return e;
  }
  const ships = Array.from({ length: count }, (_, i) => add(i));
  function helixTick() {
    const hx = ensureHelixState(state);
    // Real canonical geometry/faction writer; its unrelated docket side effects are
    // excluded from this unit harness and remain untouched in the production system.
    const host = { ...factionHelix, bus: owner.bus, _onFlagsDropped() {} };
    host._tickPacks(state, hx, [...state.entities.values()], state.simTime);
  }
  return { m, state, ships, owner, events, add, helixTick };
}
test('exact versioned operation and native 16t hull geometry; no legacy capture', () => {
  const h = harness(); assert.equal(isWeighingOperation(h.m), true);
  const offer = { ...h.m, branch: 'patrol' }; delete offer.storyBranch;
  assert.equal(isWeighingOperation(offer), true);
  for (const bad of [ { ...h.m, storyBranch: 'free' }, { ...h.m, destStationId: 'station_coalition' },
    { ...h.m, params: { ...h.m.params, weighingVersion: undefined } } ]) assert.equal(isWeighingOperation(bad), false);
  assert.equal(weighingSpawnPosition(h.m, 3), null);
  for (const e of h.ships) { assert.equal(e.mass, 16); assert.equal(e.data.ai.passive, true);
    assert.equal(e.data.ai.roe, 'hold_fire'); assert.equal(e.data.helixFalseFlag, false); }
  const before = h.ships.map(e => JSON.stringify({ pos: e.pos, vel: e.vel, hull: e.hull }));
  for (let i = 0; i < 20; i++) { observeWeighingScene(h.owner, h.m); h.helixTick(); }
  assert.equal(weighingEvidence(h.m), null);
  assert.deepEqual(h.ships.map(e => JSON.stringify({ pos: e.pos, vel: e.vel, hull: e.hull })), before);
  assert.equal(h.events.filter(e => e.data.id?.includes('arrival')).length, 1);
});
test('observed displacement arms canonical reveal, then releases the three live hulls', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m);
  h.ships[0].pos.x += 150; // measured result of a physical pull, never applied by the helper
  observeWeighingScene(h.owner, h.m);
  assert.equal(weighingEvidence(h.m), null); assert.equal(h.ships[0].factionId, 'faction_reach');
  assert.equal(h.ships[0].data.ai.passive, true);
  h.helixTick(); assert.equal(h.ships[0].factionId, 'faction_helix');
  observeWeighingScene(h.owner, h.m);
  assert.equal(weighingEvidence(h.m).kind, 'unmasked');
  for (const e of h.ships) { assert.equal(e.data.ai.passive, false); assert.equal(e.data.ai.roe, 'weapons_free'); }
  const saved = JSON.parse(JSON.stringify(h.m));
  assert.deepEqual(weighingEvidence(saved), weighingEvidence(h.m));
  assert.equal(saved.objectiveProgress, 0); assert.equal(saved.status, 'active');
  for (let i = 0; i < 3; i++) stampWeighingTarget(h.state, saved, h.ships[i], i);
  assert.ok(h.ships.every(e => e.factionId === 'faction_helix'));
  observeWeighingScene(h.owner, h.m);
  assert.equal(h.events.filter(e => e.data.id?.includes('exposed')).length, 1);
  assert.equal(h.events.filter(e => /economy|mission:completed|faction:repDelta/.test(e.name)).length, 0);
});
test('partial budget cannot falsely expose; intact cast arms only on displacement', () => {
  const h = harness(2); observeWeighingScene(h.owner, h.m); h.helixTick();
  assert.equal(weighingEvidence(h.m), null); assert.ok(h.ships.every(e => !e.data.helixFalseFlag));
  h.add(2); observeWeighingScene(h.owner, h.m); h.helixTick();
  assert.equal(h.m.params.weighingScene.phase, 'holding');
});
test('damage or lost target releases survivors without registry claim or kill credit', () => {
  for (const damage of [true, false]) {
    const h = harness(); observeWeighingScene(h.owner, h.m);
    if (damage) h.ships[0].shield -= 1;
    else { h.ships[0].alive = false; h.m.completedTargetSlots = [0]; h.m.targetEntityIds.shift(); }
    observeWeighingScene(h.owner, h.m); h.helixTick();
    assert.equal(weighingEvidence(h.m), null); assert.equal(h.m.params.weighingScene.phase, 'combat');
    assert.equal(h.ships[1].data.ai.passive, false); assert.equal(h.m.objectiveProgress, 0);
    h.m.status = 'completed'; assert.match(weighingReadout(h.m), /without verified/);
  }
});
test('foreign identity and duplicate slots cannot form an authenticated pack', () => {
  for (const key of ['missionTag', 'missionId', 'identityKey', 'worldRecordId', 'homeSectorId']) {
    const h = harness(); h.ships[0].data[key] = 'foreign';
    const before = JSON.stringify(h.ships[0]);
    assert.equal(stampWeighingTarget(h.state, h.m, h.ships[0], 0), false);
    assert.equal(JSON.stringify(h.ships[0]), before);
    h.ships[1].pos.x += 150; observeWeighingScene(h.owner, h.m); h.helixTick();
    assert.equal(weighingEvidence(h.m), null);
  }
  const h = harness(); h.m.targetEntityIds = [h.ships[0].id,h.ships[0].id,h.ships[2].id];
  h.ships[0].pos.x += 150; observeWeighingScene(h.owner, h.m); h.helixTick();
  assert.equal(weighingEvidence(h.m), null);
});
test('Continue re-dresses exact survivor identity without moving or healing it', () => {
  const h = harness(); h.ships[0].pos.x += 30;
  const m = JSON.parse(JSON.stringify(h.m)), e = h.ships[0];
  delete e.data.helixPack; delete e.data.helixSlot; delete e.data.scanLabel;
  const pos = { ...e.pos }, hull = e.hull;
  assert.equal(stampWeighingTarget(h.state, m, e, 0), true);
  assert.deepEqual(e.pos, pos); assert.equal(e.hull, hull); assert.match(e.data.scanLabel, /WEIR 1/);
  assert.equal(isWeighingTarget(h.state, m, e, 0), true);
});
test('two-member or foreign canonical receipt cannot certify exposure', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
  observeWeighingScene(h.owner, h.m); h.helixTick();
  h.state.helix.droppedPacks[`weighing:${h.m.id}`].memberIds.pop();
  observeWeighingScene(h.owner, h.m); assert.equal(weighingEvidence(h.m), null);
});
test('docked/wrong-sector/finished scenes cannot arm geometry or speak', () => {
  for (const kind of ['docked', 'sector', 'finished']) {
    const h = harness(); h.ships[0].pos.x += 150;
    if (kind === 'docked') h.state.ui.docked = true;
    if (kind === 'sector') h.state.world.currentSectorId = 'sector_helios_prime';
    if (kind === 'finished') h.m.status = 'completed';
    assert.equal(observeWeighingScene(h.owner, h.m), false);
    assert.equal(h.events.length, 0); assert.ok(h.ships.every(e => !e.data.helixFalseFlag));
  }
});
test('pending reveal survives a plain save and authentic rematerialization', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
  observeWeighingScene(h.owner, h.m);
  h.m.params = JSON.parse(JSON.stringify(h.m.params));
  for (let i = 0; i < 3; i++) {
    const old = h.ships[i], fresh = JSON.parse(JSON.stringify(old));
    fresh.occupantGeneration = 99; delete fresh.data.helixPack; delete fresh.data.helixSlot;
    h.state.entities.set(fresh.id, fresh); h.ships[i] = fresh;
    assert.equal(stampWeighingTarget(h.state, h.m, fresh, i), true);
  }
  h.helixTick(); observeWeighingScene(h.owner, h.m);
  assert.equal(weighingEvidence(h.m)?.kind, 'unmasked');
});
test('receipt-before-observer Continue maps old canonical IDs through exact durable slots', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
  observeWeighingScene(h.owner, h.m); h.helixTick();
  assert.equal(weighingEvidence(h.m), null);
  const receiptBefore = JSON.stringify(h.state.helix.droppedPacks);
  h.m.params = JSON.parse(JSON.stringify(h.m.params));
  for (let slot = 0; slot < 3; slot++) {
    const old = h.ships[slot], fresh = JSON.parse(JSON.stringify(old));
    h.state.entities.delete(old.id); fresh.id = `continued-${slot}`; fresh.occupantGeneration = 99;
    // worldRecords preserves faction and cloned AI, but not these optional stamps.
    delete fresh.data.falseFlagDropped; delete fresh.data.helixPack; delete fresh.data.helixSlot;
    h.state.entities.set(fresh.id, fresh); h.m.targetEntityIds[slot] = fresh.id; h.ships[slot] = fresh;
    assert.equal(stampWeighingTarget(h.state, h.m, fresh, slot), true);
  }
  observeWeighingScene(h.owner, h.m);
  assert.equal(weighingEvidence(h.m)?.kind, 'unmasked');
  assert.equal(JSON.stringify(h.state.helix.droppedPacks), receiptBefore, 'does not forge or rewrite owner receipt');
});
test('repeated or same-slot mixed original/current receipt IDs cannot certify a restore', () => {
  for (const mode of ['duplicate', 'mixed', 'stale', 'wrong-record']) {
    const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
    observeWeighingScene(h.owner, h.m); h.helixTick();
    const receipt = h.state.helix.droppedPacks[`weighing:${h.m.id}`];
    if (mode === 'duplicate') receipt.memberIds[1] = receipt.memberIds[0];
    if (mode === 'mixed') {
      const e = h.ships[0]; h.state.entities.delete(e.id); e.id = 'new-slot-zero';
      h.state.entities.set(e.id, e); h.m.targetEntityIds[0] = e.id;
      receipt.memberIds[1] = e.id;
    }
    if (mode === 'stale') receipt.t = h.m.params.weighingScene.armedAt - 1;
    if (mode === 'wrong-record') h.m.params.weighingScene.armedCast[0].worldRecordId = 'foreign';
    observeWeighingScene(h.owner, h.m); assert.equal(weighingEvidence(h.m), null);
  }
});
test('exact owned duplicate is disarmed even outside target list; no four-member evidence', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
  observeWeighingScene(h.owner, h.m);
  const duplicate = JSON.parse(JSON.stringify(h.ships[0])); duplicate.id = 'duplicate';
  h.state.entities.set(duplicate.id, duplicate);
  const foreign = JSON.parse(JSON.stringify(duplicate)); foreign.id = 'foreign';
  foreign.data.missionId = 'someone-else'; foreign.data.helixPack = 'another-pack';
  h.state.entities.set(foreign.id, foreign);
  observeWeighingScene(h.owner, h.m);
  assert.equal(duplicate.data.helixFalseFlag, false);
  assert.ok(h.ships.every(e => e.data.helixFalseFlag === false));
  assert.equal(foreign.data.helixFalseFlag, true, 'foreign bodies untouched');
  h.helixTick(); assert.equal(weighingEvidence(h.m), null);
  assert.equal(h.m.params.weighingScene.phase, 'combat');
});
test('malformed saved scene fails closed and malformed evidence is never a receipt', () => {
  for (const bad of [42, [], { version: 1, phase: 'holding', baselines: [] },
    { version: 1, phase: 'bogus', baselines: {} },
    { version: 1, phase: 'holding', baselines: { 0: [] } },
    { version: 1, phase: 'holding', baselines: { 0: { hull: 'bad', shield: 20 } } }]) {
    const h = harness(); h.m.params.weighingScene = bad;
    assert.doesNotThrow(() => stampWeighingTarget(h.state, h.m, h.ships[0], 0));
    assert.equal(h.m.params.weighingScene.phase, 'combat');
    assert.equal(h.ships[0].data.helixFalseFlag, false);
  }
  const h = harness();
  for (const evidence of [true, [], { kind: 'unmasked', packId: 'foreign', at: 1, slots: [0,1,2], maskFactionId: 'faction_reach' },
    { kind: 'unmasked', packId: `weighing:${h.m.id}`, at: 1, slots: [0,0,2], maskFactionId: 'faction_reach' }]) {
    h.m.params.weighingScene.evidence = evidence;
    assert.equal(weighingEvidence(h.m), null);
  }
});
test('quiet holding and settled combat never scan the full entity map', () => {
  const h = harness();
  h.state.entities.values = () => { throw new Error('unexpected full-world scan'); };
  for (let i = 0; i < 20; i++) assert.doesNotThrow(() => observeWeighingScene(h.owner, h.m));
  h.m.params.weighingScene.phase = 'combat';
  for (let i = 0; i < 20; i++) assert.doesNotThrow(() => observeWeighingScene(h.owner, h.m));
});
test('actual world-record Continue repairs omitted slot after durable authentication and preserves receipt', () => {
  const h = harness(); observeWeighingScene(h.owner, h.m); h.ships[0].pos.x += 150;
  observeWeighingScene(h.owner, h.m); h.helixTick();
  for (let slot = 0; slot < 3; slot++) {
    const old = h.ships[slot];
    const record = JSON.parse(JSON.stringify(captureEntityRecord(old, { seed: 77 })));
    const fresh = { ...spawnSpecFromRecord(record), id: `record-continued-${slot}`, alive: true };
    bindEntityToRecord(fresh, record); h.state.entities.delete(old.id);
    h.state.entities.set(fresh.id, fresh); h.m.targetEntityIds[slot] = fresh.id; h.ships[slot] = fresh;
    assert.equal(fresh.data.missionTargetSlot, undefined);
    assert.equal(fresh.data.falseFlagDropped, undefined);
    assert.equal(fresh.data.ai.maskBroken, true);
    assert.equal(isWeighingTarget(h.state, h.m, fresh, slot), true);
    assert.equal(isWeighingTarget(h.state, h.m, fresh), true, 'default derives exact identity slot');
    const pos = { ...fresh.pos }, hull = fresh.hull;
    assert.equal(stampWeighingTarget(h.state, h.m, fresh), true);
    assert.equal(fresh.data.missionTargetSlot, slot);
    assert.deepEqual(fresh.pos, pos); assert.equal(fresh.hull, hull);
  }
  observeWeighingScene(h.owner, h.m);
  assert.equal(weighingEvidence(h.m)?.kind, 'unmasked');
});
test('omitted slot needs exact record/key; explicit conflicting slot cannot be repaired', () => {
  const h = harness(), e = h.ships[0];
  delete e.data.missionTargetSlot;
  assert.equal(isWeighingTarget(h.state, h.m, e, 1), false);
  const recordId = e.data.worldRecordId; e.data.worldRecordId = 'foreign';
  assert.equal(stampWeighingTarget(h.state, h.m, e), false);
  e.data.worldRecordId = recordId; e.data.missionTargetSlot = 1;
  assert.equal(isWeighingTarget(h.state, h.m, e, 0), false);
  assert.equal(stampWeighingTarget(h.state, h.m, e, 0), false);
  assert.equal(e.data.missionTargetSlot, 1);
});
test('actual current dead marked body qualifies for canonical casualty settlement without mutation', () => {
  const h = harness(), body = h.ships[0]; body.alive = false;
  const before = JSON.stringify(body), missionBefore = JSON.stringify(h.m);
  assert.equal(isWeighingTarget(h.state, h.m, body), false, 'live predicate unchanged');
  assert.equal(isWeighingCasualty(h.state, h.m, { id: body.id, entity: body, killerId: 'terrain' }), true);
  assert.equal(isWeighingCasualty(h.state, h.m, { id: body.id, killerId: h.state.playerId }), true);
  assert.equal(JSON.stringify(body), before); assert.equal(JSON.stringify(h.m), missionBefore);
  delete body.data.missionTargetSlot;
  assert.equal(isWeighingCasualty(h.state, h.m, { id: body.id, entity: body }), true,
    'omitted slot still requires exact durable identity');
});
test('casualty rejects ordinary/foreign/live/missing/despawned/stale/replayed bodies', () => {
  const cases = [
    h => { delete h.m.params.weighingVersion; },
    h => { h.m.status = 'completed'; },
    h => { h.m.targetEntityIds = []; },
    h => { h.ships[0].alive = true; },
    h => { h.state.entities.delete(h.ships[0].id); },
    h => { h.ships[0].type = 'wreck'; },
    h => { h.ships[0].data.missionTag = 'foreign'; },
    h => { h.ships[0].data.missionId = 'foreign'; },
    h => { h.ships[0].data.identityKey = 'foreign'; },
    h => { h.ships[0].data.worldRecordId = 'foreign'; },
    h => { h.ships[0].data.missionTargetSlot = 1; },
    h => { h.ships[0].homeSectorId = 'foreign'; },
    h => { h.ships[0].data.homeSectorId = 'foreign'; },
    h => { h.ships[0].data.sectorId = 'foreign'; },
    h => { h.m.completedTargetSlots = [0]; },
  ];
  for (const alter of cases) {
    const h = harness(); h.ships[0].alive = false; alter(h);
    assert.equal(isWeighingCasualty(h.state, h.m, { id: h.ships[0].id, entity: h.ships[0] }), false);
  }
  const h = harness(), oldBody = h.ships[0]; oldBody.alive = false;
  const replacement = { ...oldBody, data: { ...oldBody.data }, occupantGeneration: 99 };
  h.state.entities.set(oldBody.id, replacement);
  assert.equal(isWeighingCasualty(h.state, h.m, { id: oldBody.id, entity: oldBody }), false,
    'stale event entity must not settle recycled current identity');
  assert.equal(isWeighingCasualty(h.state, h.m, null), false);
  assert.equal(isWeighingCasualty(h.state, h.m, { id: 'missing' }), false);
  // Canonical settlement removes target and records slot; replay cannot qualify.
  h.m.targetEntityIds.shift(); h.m.completedTargetSlots = [0];
  assert.equal(isWeighingCasualty(h.state, h.m, { id: replacement.id, entity: replacement }), false);
});
