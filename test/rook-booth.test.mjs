import test from 'node:test';
import assert from 'node:assert/strict';
import { createRookBooth, rookBoothSpec } from '../src/systems/rookBooth.js';
import { ROOK_BOOTH } from '../src/data/rook.js';
import { rookBoothEligible, rookDeliveryCheck, rookPayoutCr } from '../src/characters/rookRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const PAD = ROOK_BOOTH.pad;

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
  for (const t of ['comms:popup', 'economy:grantCredits', 'rookWreck:delivered']) bus.on(t, (p) => events.push([t, p]));
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

test('the beacon is a marked non-colliding post beside the Expanse dock', () => {
  const spec = rookBoothSpec();
  assert.equal(spec.type, 'beacon');
  assert.equal(spec.collides, false, 'the marker never shoves a hull out of the ring');
  assert.equal(spec.data.scannerSignalKind, 'salvage');
  const d = Math.hypot(spec.pos.x - 880, spec.pos.z + 640);
  assert.ok(d > 60 && d < 300, `pad sits off the station body (${d.toFixed(0)} WU)`);
});
