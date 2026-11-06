// Focused canonical-owner integration. No renderer, synthetic package availability or GPU claim.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { normalizeShipAppearance, shipAppearanceSignature } from '../src/core/shipAppearance.js';
import { buildPaintAppearance } from '../src/data/shipPaints.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { cargo } from '../src/systems/cargo.js';
import { shipjack } from '../src/systems/shipjack.js';
import { save } from '../src/save/saveSystem.js';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';
import { isPackagedLiveWholeShipFile } from '../src/data/wholeShipVisualIdentity.js';

const CUTTER_FILE = 'wholeships/hornet_scn_customs_cutter.glb';
const PAINT = { hullColor: '#334455', accentColor: '#aaccee', finish: 'polished', wear: 0.1, decalId: 'concord' };

function boot(t, { populate = true, impostor = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [ships, cargo, shipjack, save], updateOrder: [] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  const owner = sim.registry.get('ships'), jack = sim.registry.get('shipjack');
  state.mode = 'flight'; state.run.kind = 'adventure';
  state.onboarding = { active: false, finished: true };
  state.world.currentSectorId = 'sector_helios_prime';
  state.meta.createdAt = 'customs-appearance-4242';
  state.ui.docked = false; state.ui.dockedStationId = null;
  if (!populate) return { sim, state, bus, owner, jack };
  owner.newGame();
  const initial = state.player.ownedShips[0];
  const from = sim.spawn(makeShipEntitySpec(initial.defId, {
    isPlayer: true, player: state.player, fittings: initial.fittings, pos: { x: 0, z: 0 },
  }));
  state.playerId = from.id;
  owner.recomputeActiveShip();
  jack.admit(from, { playerOwned: true, origin: 'customs:starter' });
  const spec = impostor
    ? makeShipEntitySpec('ship_wasp', { team: 1, pos: { x: 60, z: 0 } })
    : makeEnemySpawnSpec('customs_cutter', 5, { x: 60, z: 0 });
  const to = sim.spawn(spec);
  if (impostor) to.data.lootTableId = 'customs_cutter';
  to.data.appearance = normalizeShipAppearance(PAINT, to.data.defId);
  const vessel = jack.admit(to, { origin: 'customs:prize', profile: 'military' });
  const request = { targetId: to.id, targetGeneration: vessel.generation,
    vesselId: vessel.vesselId, operationId: 'customs:capture' };
  return { sim, state, bus, owner, jack, from, to, vessel, request };
}

function assertCutterSelection(entity) {
  const selection = wholeShipVisualForEntity(entity);
  // Until the real publisher registers the file, production admission must fail closed.
  assert.equal(selection?.file || null, isPackagedLiveWholeShipFile(CUTTER_FILE) ? CUTTER_FILE : null);
}

test('only canonical Hornet customs appearance gains a variant; legacy shapes and signatures stay stable', () => {
  const legacy = normalizeShipAppearance(null, 'ship_hornet');
  assert.deepEqual(legacy, { version: 1, hullColor: null, accentColor: null,
    finish: 'satin', wear: 0.2, decalId: 'none' });
  assert.equal(shipAppearanceSignature(legacy, 'ship_hornet'), '1|-|-|satin|0.200|none');
  const valid = normalizeShipAppearance({ ...PAINT, variantId: 'customs_cutter' }, 'ship_hornet');
  assert.equal(valid.variantId, 'customs_cutter');
  assert.equal(Object.isFrozen(valid), true);
  assert.equal(shipAppearanceSignature(valid, 'ship_hornet'),
    shipAppearanceSignature(PAINT, 'ship_hornet') + '|customs_cutter');
  for (const defId of [null, 'ship_wasp', 'ship_hornet_typo']) {
    assert.equal(Object.hasOwn(normalizeShipAppearance({ variantId: 'customs_cutter' }, defId), 'variantId'), false);
  }
  for (const variantId of [null, 'unknown', '../customs_cutter', 'CUSTOMS_CUTTER', {}, ['customs_cutter']]) {
    assert.deepEqual(normalizeShipAppearance({ variantId }, 'ship_hornet'), legacy);
    assert.equal(shipAppearanceSignature({ variantId }, 'ship_hornet'), shipAppearanceSignature(legacy, 'ship_hornet'));
  }
});

test('production capture copies the canonical cutter identity and existing paint to owned and live appearance', t => {
  for (const appearance of [null, PAINT]) {
    const h = boot(t);
    h.to.data.appearance = appearance && normalizeShipAppearance(appearance, 'ship_hornet');
    const credits = h.state.player.credits;
    const result = h.owner.captureAndTransfer(h.request);
    assert.equal(result.ok, true, result.reason);
    const owned = h.state.player.ownedShips[result.index];
    assert.deepEqual(owned.appearance, normalizeShipAppearance({ ...appearance, variantId: 'customs_cutter' }, 'ship_hornet'));
    assert.equal(owned.appearance.variantId, 'customs_cutter');
    assert.deepEqual(h.to.data.appearance, owned.appearance);
    assert.equal(h.state.player.credits, credits, 'a cosmetic identity adds no charge');
    assertCutterSelection(h.to);
  }
});

test('tow admission stamps the live target once and a later handoff respects explicit owned paint', t => {
  const h = boot(t);
  const result = h.owner.admitCapturedVessel(h.request);
  assert.equal(result.ok, true, result.reason);
  const owned = h.state.player.ownedShips[result.index];
  assert.equal(owned.appearance.variantId, 'customs_cutter');
  assert.deepEqual(h.to.data.appearance, owned.appearance);
  assert.equal(h.owner.setShipAppearance({ shipIndex: result.index,
    appearance: { ...owned.appearance, hullColor: '#556677' } }), true);
  const chosen = structuredClone(owned.appearance);
  h.to.data.appearance = normalizeShipAppearance({ ...PAINT, hullColor: '#111111' }, 'ship_hornet');
  assert.equal(h.owner.admitCapturedVessel(h.request).admitted, false);
  assert.deepEqual(owned.appearance, chosen, 'existing owned appearance remains authoritative');
  assert.equal(h.owner.captureAndTransfer(h.request).ok, true);
  assert.deepEqual(h.to.data.appearance, chosen);
});

test('the real paint-rack intent retains captured cutter identity while changing a swatch', t => {
  const h = boot(t);
  assert.equal(h.owner.captureAndTransfer(h.request).ok, true);
  const owned = h.state.player.ownedShips[h.state.player.activeShipIndex];
  h.bus.emit('ui:setShipAppearance', {
    appearance: buildPaintAppearance(owned.appearance, { hullColor: '#556677' }),
  });
  assert.equal(owned.appearance.hullColor, '#556677');
  assert.equal(owned.appearance.variantId, 'customs_cutter');
  assert.deepEqual(h.to.data.appearance, owned.appearance);
  assertCutterSelection(h.to);
});

test('a customs loot tag on another hull cannot mint a Hornet appearance variant', t => {
  const h = boot(t, { impostor: true });
  assert.equal(h.owner.captureAndTransfer(h.request).ok, true);
  const owned = h.state.player.ownedShips[h.state.player.activeShipIndex];
  assert.equal(Object.hasOwn(owned.appearance, 'variantId'), false);
  assert.deepEqual(owned.appearance, normalizeShipAppearance(PAINT, 'ship_wasp'));
});

test('ordinary berth switching away and back follows owned appearance despite a historical customs loot tag', t => {
  const h = boot(t);
  assert.equal(h.owner.captureAndTransfer(h.request).ok, true);
  const index = h.state.player.activeShipIndex;
  h.sim.spawn({ type: 'station', pos: { x: 0, z: 0 }, radius: 60, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios', name: 'Helios' } });
  h.state.ui.docked = true; h.state.ui.dockedStationId = 'station_helios';
  h.bus.emit('dock:docked', { stationId: 'station_helios' });
  assert.equal(h.owner.setActiveShip(0), true);
  const live = h.state.entities.get(h.state.playerId);
  assert.equal(live.data.lootTableId, 'customs_cutter', 'historical loot identity remains independent');
  assert.equal(Object.hasOwn(live.data.appearance, 'variantId'), false);
  assert.equal(wholeShipVisualForEntity(live).file, 'wholeships/kestrel.glb');
  assert.equal(h.owner.setActiveShip(index), true);
  assert.equal(live.data.appearance.variantId, 'customs_cutter');
  assertCutterSelection(live);
});

test('cold Continue restores owned cutter appearance through the real save envelope and sector rematerialization', t => {
  const h = boot(t);
  assert.equal(h.owner.captureAndTransfer(h.request).ok, true);
  const activeEnvelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('customs-active-continue')));
  const activeContinue = boot(t, { populate: false });
  assert.equal(activeContinue.sim.registry.get('save').loadEnvelope(activeEnvelope, 'customs-active-continue'), true);
  const activeBody = activeContinue.state.entities.get(activeContinue.state.playerId);
  assert.equal(activeBody.data.defId, 'ship_hornet');
  assert.equal(activeBody.data.appearance.variantId, 'customs_cutter');
  assertCutterSelection(activeBody);
  const reverse = h.owner.captureAndTransfer({ targetId: h.from.id,
    targetGeneration: h.from.data.shipjackGeneration, vesselId: h.from.data.vesselId,
    operationId: 'customs:reverse' });
  assert.equal(reverse.ok, true, reverse.reason);
  h.vessel.materializationOwner = 'shipjack';
  h.jack.parkSector();
  assert.equal(h.vessel.location.kind, 'remote');
  const envelope = JSON.parse(JSON.stringify(h.sim.registry.get('save').serialize('customs-cold-continue')));
  const fresh = boot(t, { populate: false });
  assert.equal(fresh.sim.registry.get('save').loadEnvelope(envelope, 'customs-cold-continue'), true);
  fresh.state.mode = 'flight';
  const owned = fresh.state.player.ownedShips.find(ship => ship.vesselId === h.vessel.vesselId);
  assert.equal(owned.appearance.variantId, 'customs_cutter');
  fresh.jack.enterSector();
  const body = fresh.state.entityList.find(entity => entity.alive && entity.data?.vesselId === h.vessel.vesselId);
  assert.ok(body, 'the production Shipjack owner rematerializes the remote owned hull');
  assert.equal(body.data.defId, 'ship_hornet');
  assert.deepEqual(body.data.appearance, owned.appearance);
  assert.equal(body.data.appearance.variantId, 'customs_cutter');
  assertCutterSelection(body);
  t.diagnostic(isPackagedLiveWholeShipFile(CUTTER_FILE)
    ? 'Real production pilot is registered; selector identity checked, GPU appearance remains separate.'
    : 'Cutter pilot is not registered; production selector correctly withholds asset admission.');
});
