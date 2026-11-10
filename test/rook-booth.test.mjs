import test from 'node:test';
import assert from 'node:assert/strict';
import { createRookBooth, rookBoothSpec } from '../src/systems/rookBooth.js';
import { ROOK_BOOTH } from '../src/data/rook.js';
import { rookBoothEligible, rookDeliveryCheck, rookPayoutCr, rookPadPosition } from '../src/characters/rookRules.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const PAD = rookPadPosition();

function fixture({ sector = ROOK_BOOTH.sectorId, kind = 'adventure' } = {}) {
  const bus = createBus(), events = [];
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind },
    world: { currentSectorId: sector }, entities: new Map(), entityList: [],
    story: { flags: {} }, playerId: 7, ui: { docked: false },
  };
  let id = 10;
  const helpers = {
    spawnEntity(spec) { const e = makeEntity({ ...spec, id: ++id }); state.entities.set(e.id, e); state.entityList.push(e); return e; },
    removeEntity(rid) { const e = state.entities.get(rid); if (e) e.alive = false; },
  };
  helpers.spawnEntity({ type: 'ship', id: 7, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 50, hullMax: 50, isPlayer: true });
  for (const t of ['comms:popup', 'economy:grantCredits', 'rookWreck:delivered', 'salvage:completed']) bus.on(t, (p) => events.push([t, p]));
  const system = createRookBooth();
  system.init({ state, bus, helpers });
  const beacon = () => state.entityList.filter((e) => e.alive && e.data?.rookBooth === true);
  const addWreck = (over = {}) => helpers.spawnEntity({
    type: 'wreck', pos: { x: PAD.x, z: PAD.z }, vel: { x: 0, z: 0 },
    radius: 30, mass: 1800, hull: 1, hullMax: 1, data: {}, ...over,
  });
  return { bus, state, helpers, system, events, beacon, addWreck };
}

test('registered in both orders on the calendar clock — a seconds-scale pad census', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'rookBooth').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'rookBooth').length, 1);
  assert.equal(getDeclaredSystemClock('rookBooth'), 'calendar');
});

test('the pad beacon waits in Charon adventure and announces itself once ever', () => {
  const f = fixture();
  assert.equal(f.beacon().length, 1);
  const announces = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'rook_booth_announce');
  assert.equal(announces.length, 1);
  f.system._sync(); f.system._sync();
  assert.equal(f.beacon().length, 1, 're-entry cannot stack a second pad');
  assert.equal(announces.length, 1, 'the booth explains itself once ever');
});

test('no pad in survival, lab, or another sector; leaving Charon clears it', () => {
  for (const kind of ['survival', 'lab']) {
    const f = fixture({ kind });
    assert.equal(f.beacon().length, 0, kind);
  }
  const f = fixture();
  f.state.world.currentSectorId = 'sector_io_reach';
  f.bus.emit('sector:enter', {});
  assert.equal(f.beacon().length, 0, 'the pad is Charon property');
});

test('a wreck at rest inside the ring sells by mass — once', () => {
  const f = fixture();
  const w = f.addWreck();
  f.system.update(0.5, f.state);
  assert.equal(w.alive, false, 'the booth takes the hull');
  const grants = f.events.filter(([t]) => t === 'economy:grantCredits');
  assert.equal(grants.length, 1);
  assert.equal(grants[0][1].amount, rookPayoutCr(1800));
  assert.equal(f.state.story.flags[ROOK_BOOTH.countFlag], 1);
  const receipts = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === `rook_receipt_${w.id}`);
  assert.equal(receipts.length, 1);
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 1, 'no double-sell');
});

test('a fast pass is a flyby, not a sale — speed must settle inside the ring', () => {
  const f = fixture();
  const w = f.addWreck({ vel: { x: 40, z: 0 } });
  f.system.update(0.5, f.state);
  assert.equal(w.alive, true, 'moving freight is not delivered');
  w.vel = { x: 0, z: 0 };
  f.system.update(0.5, f.state);
  assert.equal(w.alive, false, 'it sells once it rests');
});

test('outside the ring nothing sells; the ring edge is swept by distance not time', () => {
  const f = fixture();
  const near = f.addWreck({ pos: { x: PAD.x + ROOK_BOOTH.padRadius - 1, z: PAD.z } });
  const far = f.addWreck({ pos: { x: PAD.x + ROOK_BOOTH.padRadius + 60, z: PAD.z } });
  f.system.update(0.5, f.state);
  assert.equal(near.alive, false, 'just inside counts');
  assert.equal(far.alive, true, 'just outside does not');
});

test('authored and owned wrecks are not inventory — POI, unique, site-structural exempt', () => {
  const f = fixture();
  const poi = f.addWreck({ data: { poiId: 'poi_charon_tether_wreck' } });
  const uniq = f.addWreck({ data: { persistenceOwner: 'uniqueWrecks', uniqueWreckId: 'uw_1' } });
  const site = f.addWreck({ data: { worldSiteStructural: true } });
  const owned = f.addWreck({ data: { runtimeOwner: 'machineLayer' } });
  const fair = f.addWreck({ data: { salvagePointId: 'sp_1' } });
  f.system.update(0.5, f.state);
  for (const [e, label] of [[poi, 'poi'], [uniq, 'unique'], [site, 'site'], [owned, 'runtime-owned']]) {
    assert.equal(e.alive, true, `${label} wreck is not Rook's goods`);
  }
  assert.equal(fair.alive, false, 'a fair salvage wreck sells');
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 1, 'only the fair hull pays');
});

test('the ordinary kill hulk IS fair goods: real target death creates the sold marker', () => {
  const f = fixture();
  const owner = Object.create(aftermathWrecks);
  const registry = { get: name => name === 'aftermathWrecks' ? owner : null };
  owner.init({ state: f.state, bus: f.bus, helpers: f.helpers, registry });
  f.system.registry = registry;
  const victim = f.helpers.spawnEntity({
    type: 'ship', pos: { ...PAD }, vel: { x: 0, z: 0 }, radius: 12,
    mass: 1800, hull: 0, hullMax: 80, data: { defId: 'ship_wasp', name: 'Cinder Wasp' },
  });
  victim.alive = false;
  f.bus.emit('entity:killed', { id: victim.id, killerId: f.state.playerId });
  const marker = f.state.aftermathWrecks.bySector[ROOK_BOOTH.sectorId].find(m => m.victimId === victim.id);
  assert.ok(marker, 'the actual death records durable provenance');
  const w = owner._resolveBoundWreck(marker.markerId);
  assert.ok(w, 'the actual aftermath owner materializes and binds the hull');
  f.system.update(0.5, f.state);
  assert.equal(w.alive, false, 'an aftermath-record wreck is the canonical goods');
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 1);
  const consumed = f.events.filter(([t]) => t === 'salvage:completed');
  assert.equal(consumed.length, 1, 'the book files the consumption receipt once');
  assert.equal(consumed[0][1].wreckId, w.id);
  assert.equal(consumed[0][1].markerId, marker.markerId);
  assert.equal(consumed[0][1].source, 'rook:booth');
  assert.equal(owner._markerById(marker.markerId), null, 'the owner actually retired the marker');
  f.bus.emit('save:loaded', {});
  f.bus.emit('sector:enter', { sectorId: ROOK_BOOTH.sectorId });
  f.system.update(0.5, f.state);
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 1, 'Continue/re-entry never repays');
  owner.destroy();
});

test('marked freight refuses: mission, claim, encounter, durable-record and authored dressing', () => {
  const f = fixture();
  const kinds = [
    ['mission-id', { missionId: 'm_1', missionPinned: true }],
    ['mission-tag', { missionTag: 'm_2', physicalRole: 'tower' }],
    ['contract-claim', { contractClaimSiteOf: 'm_3' }],
    ['salvor-claimed', { salvorClaimedBy: 'claim:x' }],
    ['recovery-call', { recoveryEncounterId: 'recovery:poi_charon_tether_wreck' }],
    ['survivor aboard', { survivorPod: { survivorCount: 1 } }],
    ['story prop', { storyPropKind: 'set_piece', encounterId: 'enc_1' }],
    ['mission wreck tag', { wreckMissionId: 'm_4' }],
    ['intervention site', { interventionId: 'job_1' }],
    ['world record', { worldRecordId: 'rec_1', durable: true }],
    ['identity key', { identityKey: 'rubric:f41' }],
    ['durable row', { durable: true }],
    ['world one-off', { worldOneOff: true, oneOffId: 'oo_1' }],
    ['berth consign', { berthConsign: { berthId: 'b_1' } }],
    ['arena shard', { arenaShardOf: 'mk_9', persistenceOwner: 'aftermathWrecks' }],
    ['character prop', { authoredCharacter: 'ravel' }],
    ['reef mine', { reefMine: true, reefMineId: 'rm_1' }],
    ['lastShift body', { persistenceOwner: 'lastShift' }],
    ['worldSite body', { persistenceOwner: 'asteroidSites', worldRecordId: 'wr_1' }],
    ['echo body', { persistenceOwner: 'alienEcology', hullEchoLossId: 'loss_1' }],
  ];
  const bodies = kinds.map(([label, data]) => [label, f.addWreck({ data })]);
  const flags = [
    ['persistent flag', { persistent: true }],
    ['durable flag', { durable: true }],
    ['missionPinned flag', { missionPinned: true }],
    ['invuln flag', { invuln: true }],
  ].map(([label, flags]) => [label, f.addWreck({ data: {}, flags })]);
  f.system.update(0.5, f.state);
  for (const [label, e] of [...bodies, ...flags]) {
    assert.equal(e.alive, true, `${label} is marked freight — the booth does not fence it`);
  }
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 0, 'no marked hull pays');
  assert.equal(f.events.filter(([t]) => t === 'salvage:completed').length, 0, 'nothing is consumed');
});

test('a data-less hull still sells — the latch never throws on a bare body', () => {
  const f = fixture();
  const w = f.helpers.spawnEntity({
    type: 'wreck', pos: { ...PAD }, vel: { x: 0, z: 0 }, radius: 10, mass: 300, hull: 1, hullMax: 1,
  });
  delete w.data;
  assert.doesNotThrow(() => f.system.update(0.5, f.state));
  assert.equal(w.alive, false);
  assert.equal(w.data.rookClaimed, true);
  assert.equal(f.events.filter(([t]) => t === 'economy:grantCredits').length, 1);
});

test('non-wreck bodies never sell; the count and receipts ride the story flags', () => {
  const f = fixture();
  f.helpers.spawnEntity({ type: 'drone', pos: { ...PAD }, vel: { x: 0, z: 0 }, radius: 4, mass: 20, hull: 5, hullMax: 5, data: {} });
  const dead = f.addWreck(); dead.alive = false;
  const ok = f.addWreck({ mass: 400 });
  f.system.update(0.5, f.state);
  const deliveries = f.events.filter(([t]) => t === 'rookWreck:delivered');
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0][1].payoutCr, rookPayoutCr(400));
  assert.equal(f.state.story.flags[ROOK_BOOTH.countFlag], 1);
  const second = f.addWreck({ mass: 900 });
  f.system.update(0.5, f.state);
  assert.equal(f.state.story.flags[ROOK_BOOTH.countFlag], 2);
  const texts = f.events.filter(([t, p]) => t === 'comms:popup' && p.id?.startsWith('rook_receipt')).map(([, p]) => p.text);
  assert.match(texts[0], /first hull/i);
  assert.match(texts[1], /hull logged/i);
  assert.ok(second.alive === false);
});

test('pure rules: eligibility rejects the exempt kinds, check sweeps by speed, payout floors', () => {
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: {} }), true);
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: { rookClaimed: true } }), false);
  assert.equal(rookBoothEligible({ type: 'drone', alive: true, data: {} }), false);
  // The ordinary kill record is the player's own residue — the one persistence owner that sells.
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: { persistenceOwner: 'aftermathWrecks' } }), true);
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: { persistenceOwner: 'uniqueWrecks' } }), false);
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: { missionId: 'm' } }), false);
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: { worldRecordId: 'r' } }), false);
  assert.equal(rookBoothEligible({ type: 'wreck', alive: true, data: {}, flags: { persistent: true } }), false);
  const still = rookDeliveryCheck({ pos: { ...PAD }, vel: { x: 0, z: 0 } });
  assert.equal(still.arrived, true);
  const fast = rookDeliveryCheck({ pos: { ...PAD }, vel: { x: 20, z: 0 } });
  assert.equal(fast.inZone, true);
  assert.equal(fast.arrived, false);
  assert.equal(rookDeliveryCheck({ pos: { x: NaN }, vel: { x: 0, z: 0 } }).arrived, false);
  assert.ok(rookPayoutCr(1800) >= 300, 'a full hull is real money');
  assert.equal(rookPayoutCr(0), ROOK_BOOTH.minPayoutCr, 'a debris lot floors at the minimum');
});

test('destroy unmounts cleanly: listeners, cook provider, owned beacon', () => {
  const f = fixture();
  f.system.destroy();
  f.system.destroy();
  assert.equal(f.beacon().length, 0);
  f.bus.emit('sector:enter', {});
  assert.equal(f.events.filter(([t]) => t === 'comms:popup').length, 1, 'only the first-boot announce remains');
});

test('the beacon is a marked non-colliding global ring beside the Expanse dock', () => {
  const spec = rookBoothSpec();
  assert.equal(spec.type, 'beacon');
  assert.equal(spec.collides, false, 'the marker never shoves a hull out of the ring');
  assert.equal(spec.data.scannerSignalKind, 'salvage');
  const station = sectorLocalToGlobalForSector({ x: 880, z: -640 }, ROOK_BOOTH.sectorId);
  const d = Math.hypot(spec.pos.x - station.x, spec.pos.z - station.z);
  assert.deepEqual(spec.pos, { x: 9232, z: 28132 });
  assert.equal(spec.physicsBody, false);
  assert.equal(spec.data.circuitMark, true);
  assert.equal(spec.data.ringRadius, ROOK_BOOTH.padRadius);
  assert.equal(spec.data.visualRadius, ROOK_BOOTH.padRadius);
  assert.equal(rookDeliveryCheck({ pos: ROOK_BOOTH.pad, vel: { x: 0, z: 0 } }).arrived, false);
  assert.ok(d > 60 && d < 300, `pad sits off the station body (${d.toFixed(0)} WU)`);
});
