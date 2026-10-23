import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { cargo, addCargo, cargoUnitVolume } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { combat } from '../src/systems/combat.js';
import { stationServices } from '../src/systems/stationServices.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { PRODUCTION_FEATURES, applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { world as worldOwner } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { salvageTender, SALVAGE_TENDER_ENCOUNTER_RUNTIME, getSalvageTenderOwner } from '../src/features/salvageTender/runtime.js';
import { findTenderBody, TENDER_BODY_ID } from '../src/features/salvageTender/physical.js';
import { getSalvageTenderReadModel, getSalvageTenderHomeMarker, getSalvageTenderMapMarkers, filterSalvageTenderMapContacts } from '../src/features/salvageTender/readModel.js';
import { salvageTenderPrompt } from '../src/features/salvageTender/prompts.js';
import { freshSalvageTender, discoverTenderState } from '../src/features/salvageTender/model.js';
import { createSalvageTenderPresentation, TENDER_EQUIPMENT, bindSalvageTenderAudio } from '../src/features/salvageTender/presentation.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { resolveCourseTarget, commitCoursePayload, resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';

const SECTOR = 'sector_helios_prime';
const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));

// Focused explicit host: real simulation, cargo, credits, repair delivery, combat attachments,
// and (where requested) the production Rapier authority. This is not a full-render acceptance.
async function boot({ native = false, credits = 1000, discover = true, saving = false, prompts = false } = {}) {
  const systems = [...(native ? [physics] : []), cargo, economy, stationServices, combat, salvageTender,
    ...(saving ? [save] : []), ...(prompts ? [salvageTenderPrompt] : [])];
  const sim = createSimulation({ seed: 34310, systems,
    updateOrder: [cargo, economy, stationServices, salvageTender, ...(native ? [physics] : []), combat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.player.credits = credits;
  state.player.cargo.capVolume = 100;
  state.player.cargo.capMass = 10000;
  const pilotSpec = makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player });
  state.player.ownedShips = [{ defId: 'ship_kestrel', vesselId: 'test:salvageTender:pilot', fittings: pilotSpec.data.fittings }];
  const player = sim.spawn({ ...pilotSpec,
    type: 'ship', team: 0, isPlayer: true, radius: 6, mass: 100,
    pos: { x: 100, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 100, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    flags: {}, data: { ...pilotSpec.data, defId: 'ship_kestrel' },
    physicsBody: { schemaVersion: 1, radius: 6, mass: 100, inertiaY: 400,
      dynamic: true, shape: 'ball', ccd: true, revision: 0 },
  });
  state.playerId = player.id;
  state.fuel = { current: 20, max: 100 };
  const tender = sim.registry.get('salvageTender');
  if (discover) tender.discover({ sectorId: SECTOR, anchor: { x: 0, z: 0 } });
  const p = native ? sim.registry.get('physics') : null;
  if (p) assert.equal(await p.prepareBackend(state), true, 'real native physics must initialize');
  return {
    sim, state, bus, tender, physics: p,
    get player() { return state.entities.get(state.playerId); },
    get row() { return state.salvageTender; },
    get body() { return findTenderBody(state); },
    action(action, options = {}) { return tender.act(action, state.salvageTender.revision, options); },
    advance(seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) sim.step(DT); },
    close() {
      for (const system of [...sim.registry.systems].reverse()) system.destroy?.();
      p?._sg02?.dispose?.();
      sim.dispose();
    },
  };
}

function pilot(h, vx, vz = 0) {
  const e = h.player;
  writePhysicsControl(e, { source: 'test:pilot', mode: 'newtonian',
    force: { x: (vx - e.vel.x) * e.mass * 3, y: 0, z: (vz - e.vel.z) * e.mass * 3 },
    torque: { x: 0, y: -e.angVel * e.physicsBody.inertiaY * 3, z: 0 }, maxSpeed: Infinity });
  h.sim.step(DT);
}

function travel(h, target, { speed = 35, seconds = 70 } = {}) {
  for (let i = 0; i < seconds / DT; i++) {
    const dx = target.x - h.player.pos.x, dz = target.z - h.player.pos.z;
    const length = Math.hypot(dx, dz), desired = Math.min(speed, length * 0.8);
    pilot(h, length ? dx / length * desired : 0, length ? dz / length * desired : 0);
    if (length < 1.2 && Math.hypot(h.player.vel.x, h.player.vel.z) < 1.5) return;
  }
  assert.fail(`pilot could not reach ${JSON.stringify(target)} from ${JSON.stringify(h.player.pos)}`);
}

function recover(h, { payment = 'credits' } = {}) {
  assert.equal(h.action('accept').ok, true);
  assert.equal(h.action('tow').ok, true, 'recovery uses the production native Massline');
  const original = h.body;
  for (let i = 0; i < 1200; i++) {
    const goal = h.body.pos.x < 80 ? 12 : 0;
    pilot(h, goal, -h.player.pos.z * 0.6);
    if (h.tender.physical.canSecure(h.row).ok) {
      assert.equal(h.action('claim', { payment }).ok, true);
      assert.equal(h.body, original, 'recovery secures the actual moved hull');
      assert.equal(h.row.stage, 1);
      assert.equal(h.row.owned, true);
      assert.ok(h.body.pos.x >= 60, 'native motion must have done the recovery work');
      for (let j = 0; j < 180; j++) pilot(h, 0, 0);
      return;
    }
  }
  assert.fail(`recovery never reached a safe native berth: ${JSON.stringify(h.tender.physical.canSecure(h.row))}`);
}

function damage(h, entity, amount) {
  return h.sim.registry.get('combat').kernel.routeDamage({ attackerId: h.player.id, targetId: entity.id,
    packet: { channels: { kinetic: amount }, shieldBypass: 1, subsystemShare: 0 },
    origin: { kind: 'weapon', weaponId: 'test:collision', sourceId: h.player.id } });
}

function cargoTotal(h) { return Object.values(h.state.player.cargo.items).reduce((n, q) => n + q, 0); }

test('inspection and repeat discovery preserve one unowned physical tender; refuse and cancel cost nothing', async () => {
  const h = await boot();
  try {
    const body = h.body, credits = h.state.player.credits;
    assert.ok(body, 'ordinary discovery materializes a physical barge');
    assert.equal(h.row.owned, false);
    assert.equal(h.row.stage, 0);
    h.tender.inspect();
    assert.equal(h.row.owned, false, 'looking is not claiming');
    h.action('refuse');
    h.tender.discover({ sectorId: SECTOR, anchor: { x: 800, z: 800 } });
    assert.equal(h.body, body, 'a repeated encounter cannot clone or relocate the barge');
    h.action('accept');
    h.action('cancel');
    assert.equal(h.row.owned, false);
    assert.equal(h.row.stage, 0);
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === TENDER_BODY_ID).length, 1);
  } finally { h.close(); }
});

test('services and ownership fail closed before rescue and native admission', async () => {
  const h = await boot({ credits: 1000 });
  try {
    const before = { credits: h.state.player.credits, fuel: h.state.fuel.current, hull: h.player.hull };
    for (const action of ['claim', 'restore', 'repair', 'refuel', 'provision', 'relocate', 'secure']) {
      const result = h.action(action);
      assert.notEqual(result?.ok, true, `${action} must not grant functionality on an unrescued barge`);
    }
    h.action('accept');
    assert.notEqual(h.action('claim')?.ok, true, 'a menu click without a native recovery is not rescue');
    assert.equal(h.row.owned, false);
    assert.deepEqual({ credits: h.state.player.credits, fuel: h.state.fuel.current, hull: h.player.hull }, before);
  } finally { h.close(); }
});

test('native recovery cancellation releases its own line and resumes the same drifting original', async () => {
  const h = await boot({ native: true });
  try {
    const body = h.body, credits = h.state.player.credits;
    assert.equal(h.action('accept').ok, true);
    const tow = h.action('tow');
    assert.equal(tow.ok, true);
    for (let i = 0; i < 90; i++) pilot(h, 8);
    const position = { ...body.pos };
    assert.equal(h.action('cancel').ok, true);
    assert.notEqual(h.sim.registry.get('combat').kernel.attachments.get(tow.attachmentId).state, 'active');
    assert.equal(h.sim.registry.get('combat').kernel.attachments.get(tow.attachmentId).breakReason, 'salvage_tender_recovery_cancel');
    assert.equal(h.row.owned, false);
    assert.equal(h.row.rescueAccepted, false);
    assert.equal(h.row.physical.mode, 'released');
    assert.equal(h.body, body);
    assert.deepEqual({ ...body.pos }, position, 'cancel does not reset physical recovery progress');
    assert.equal(h.state.player.credits, credits);
    assert.equal(h.action('accept').ok, true);
    assert.equal(h.action('tow').ok, true);
    assert.equal(h.body, body);
    assert.equal(h.action('cancel').ok, true);
    const manual = h.sim.registry.get('combat').kernel.attachments.create({ defId: 'tether_standard',
      ownerId: h.player.id, targetId: body.id, controlMode: 'manual',
      sourceWorld: { ...h.player.pos }, targetWorld: { ...body.pos } });
    assert.equal(manual.ok, true);
    assert.equal(h.action('accept').ok, true);
    assert.equal(h.action('cancel').ok, true);
    assert.equal(h.sim.registry.get('combat').kernel.attachments.get(manual.attachment.id).state, 'active',
      'closing this feature does not cut a line owned by the ordinary manual tool');
  } finally { h.close(); }
});

test('the actual starter Hitch recovers Morrowlight with ordinary Flight V3 input and its standard native tow', async () => {
  const flags = snapshotFeatureMaps();
  let sim, native;
  try {
    applyFeatureConfigToMaps(PRODUCTION_FEATURES);
    sim = createSimulation({ seed: 34310,
      systems: [physics, combat, cargo, economy, stationServices, ships, flightV3, tetherGameplay, salvageTender],
      updateOrder: [combat, flightV3, salvageTender, physics, tetherGameplay, cargo, economy, stationServices],
      runtimeConfig: { profileId: 'production', features: PRODUCTION_FEATURES } });
    const { state } = sim;
    state.mode = 'flight'; state.world.currentSectorId = NEW_GAME.startingSectorId;
    state.player.credits = NEW_GAME.credits;
    sim.registry.get('ships').newGame();
    const owned = state.player.ownedShips[0];
    const player = sim.spawn(makeShipEntitySpec(owned.defId, { isPlayer: true, team: 0,
      player: state.player, fittings: owned.fittings, pos: { x: 100, z: 0 }, rot: 0 }));
    state.playerId = player.id;
    const owner = sim.registry.get('salvageTender');
    assert.equal(owner.discover({ sectorId: NEW_GAME.startingSectorId, anchor: { x: 0, z: 0 } }).ok, true);
    native = sim.registry.get('physics');
    assert.equal(await native.prepareBackend(state), true);
    sim.step(DT);
    const row = state.salvageTender, body = owner.physical.find(row);
    assert.equal(player.data.defId, NEW_GAME.shipId);
    assert.ok(player.mass < body.mass / 2, 'the real light starter, not the heavy force-controlled fixture, does this recovery');
    assert.equal(owner.act('accept', row.revision).ok, true);
    assert.equal(owner.act('tow', row.revision).ok, true);
    let claimed = false, mirrorSeen = false, minimumGap = Infinity;
    for (let tick = 0; tick < 12 / DT; tick++) {
      // Only ordinary controls after spawn: a six-tick forward tap, then neutral flight.
      state.input.moveZ = tick < 6 ? 1 : 0;
      state.input.moveX = 0; state.input.turnIntent = 0;
      state.input.brake = false; state.input.boost = false;
      sim.step(DT);
      mirrorSeen ||= state.player.tether?.active === true && state.player.tether?.targetId === body.id;
      minimumGap = Math.min(minimumGap, Math.hypot(body.pos.x - player.pos.x, body.pos.z - player.pos.z));
      if (!owner.physical.canSecure(row).ok) continue;
      assert.ok(Math.hypot(body.pos.x, body.pos.z) >= 60);
      assert.ok(Math.hypot(body.vel.x, body.vel.z) <= 8);
      assert.equal(owner.act('claim', row.revision, { payment: 'credits' }).ok, true);
      claimed = true; break;
    }
    assert.equal(claimed, true, 'stock thrust, braking and Massline can complete the modest rescue within 12 seconds');
    assert.equal(owner.physical.find(row), body);
    assert.equal(row.owned, true);
    assert.equal(row.stage, 1);
    assert.equal(state.player.credits, NEW_GAME.credits - 45);
    assert.equal(mirrorSeen, true, 'the existing tether gameplay owner exposes the native line to the ordinary player controls');
    assert.ok(minimumGap > body.radius + player.radius, 'the recovery does not rely on ramming the light starter');
  } finally {
    for (const system of [...(sim?.registry.systems || [])].reverse()) system.destroy?.();
    native?._sg02?.dispose?.(); sim?.dispose(); restoreFeatureMaps(flags);
  }
});

test('actual world navigation marks local tender courses without taking over a physical tow', async () => {
  const h = await boot({ native: true });
  try {
    const payloads = [], routes = [];
    const host = { state: h.state, bus: h.bus, computeRoute(sectorId, mode) {
      routes.push([sectorId, mode]); return { legs: [{ from: h.state.world.currentSectorId, to: sectorId }] };
    } };
    const off = h.bus.on('ui:setCourse', p => { payloads.push(p); worldOwner._onSetCourse.call(host, p); });
    assert.equal(h.action('accept').ok, true);
    assert.equal(h.action('tow').ok, true);
    assert.equal(h.state.nav.autopilot.active, false, 'marking the recovery berth must not steal steering or stop the tow');
    assert.ok(h.state.nav.autopilot.arrivalRadius <= 100, 'a home marker stops inside the service approach');
    assert.equal(h.state.nav.autoTravel, false);
    assert.equal(h.action('course', { destination: 'home' }).ok, true);
    assert.equal(h.state.nav.waypoint.targetEntityId, h.body.id);
    assert.equal(h.state.nav.waypoint.presentationEntityId, h.body.id);
    assert.equal(h.state.nav.autopilot.active, false);
    const crate = h.row.physical.recovery[1];
    assert.equal(h.action('recovery', { sourceId: crate.id }).ok, true);
    const original = h.tender.physical.recoveryBodies(h.row).find(e => e.data.worldRecordId === crate.id);
    assert.equal(h.state.nav.waypoint.targetEntityId, original.id);
    assert.ok(h.state.nav.autopilot.arrivalRadius <= 75, 'a supply marker stops inside transfer range');
    h.state.world.currentSectorId = 'sector_ceres_belt';
    assert.equal(h.action('course', { destination: 'home' }).ok, true);
    assert.equal(payloads.at(-1).pos, undefined, 'off-sector home requests the sector route, never a local galactic shortcut');
    assert.deepEqual(routes, [[SECTOR, 'fuel']]);
    assert.equal(h.state.nav.route.legs[0].to, SECTOR);
    off();
  } finally { h.close(); }
});

test('zero-credit expedition restores three functional stages and relocates the original tender with a real stocked pod', async () => {
  const h = await boot({ native: true, credits: 0 });
  try {
    const home = h.body;
    const initial = h.tender.physical.recoveryBodies(h.row).find(e => e.data.worldRecordId.endsWith(':initial'));
    const initialId = initial.id, manifestId = initial.data.cargoManifest.manifestId;
    // A constrained hold accepts a partial real load and leaves one cell in its original shell.
    h.state.player.cargo.capVolume = 6 * cargoUnitVolume(h.state, 'cmdty_scrap_metal')
      + 3 * cargoUnitVolume(h.state, 'cmdty_salvage_electronics') + cargoUnitVolume(h.state, 'cmdty_fuel_cells') + 0.001;
    travel(h, { x: 140, z: 15 });
    const first = h.action('unload', { bodyId: initialId });
    assert.equal(first.ok, true);
    assert.equal(first.remaining, 1);
    assert.equal(cargoTotal(h), 10);
    h.advance(DT * 2);
    const filled = clone(h.state.player.cargo.items);
    assert.equal(h.action('unload', { bodyId: initialId }).ok, false, 'a full hold cannot consume the remainder');
    assert.deepEqual(h.state.player.cargo.items, filled);
    assert.equal(initial.data.cargoManifest.totalQty, 1);
    h.state.player.cargo.capVolume = 100;
    travel(h, { x: 100, z: 0 });
    recover(h, { payment: 'parts' });
    assert.equal(h.state.player.credits, 0, 'the modest recovery can start with no money');
    assert.equal(h.body, home);
    assert.equal(getSalvageTenderHomeMarker(h.state)?.entityId, home.id);

    const receipts = [];
    const off = h.bus.on('service:completed', p => { if (p.source === 'salvageTender') receipts.push(p); });
    const hit = damage(h, h.player, 180);
    assert.ok(h.player.hull < 35, JSON.stringify({ hull: h.player.hull, hit }));
    assert.equal(h.action('repair').ok, false, 'stage one has a modest emergency weld, not the full workshop');
    assert.equal(h.action('emergency').ok, true);
    h.advance(4);
    assert.ok(Math.abs(h.player.hull - 35) < 1e-5);
    assert.equal(h.action('emergency').ok, false, 'the starter weld is finite');
    assert.equal(h.action('refuel').ok, true);
    h.advance(4);
    assert.ok(Math.abs(h.state.fuel.current - 45) < 1e-5);

    assert.equal(h.action('restore', { payment: 'parts' }).ok, true);
    assert.equal(h.row.stage, 2);
    assert.equal(h.action('repair').ok, true);
    const stageTwoRate = h.row.service.rate;
    h.advance(3);
    assert.ok(Math.abs(h.player.hull - 55) < 1e-5, 'stage two delivers repair through the existing service writer');
    assert.equal(h.row.service, null);
    assert.equal(receipts.length, 3);
    h.advance(2);
    assert.equal(receipts.length, 3, 'completed services cannot award twice');

    // The next improvement is earned by an actual trip to another finite recovery load.
    const outer = h.tender.physical.recoveryBodies(h.row).find(e => e.data.worldRecordId.endsWith(':outer'));
    const outerId = outer.id;
    travel(h, { x: outer.pos.x - 50, z: outer.pos.z });
    assert.ok(h.row.departures >= 1);
    const remoteOffer = h.tender.inspect('cargo');
    assert.equal(remoteOffer.ok, true, 'a remote crate offers its own normal deck interaction');
    assert.ok(remoteOffer.offer.choices.some(c => c.options?.bodyId === outer.id && c.options.action === 'unload'));
    assert.equal(h.action('unload', { bodyId: outer.id }).ok, true);
    h.advance(DT * 2);
    assert.equal(h.action('unload', { bodyId: outer.id }).ok, false);
    assert.equal(outer.data.cargoManifest.totalQty, 0);
    travel(h, { x: home.pos.x + 50, z: home.pos.z });
    assert.ok(h.row.arrivals >= 1);
    const returns = h.row.arrivals;
    h.advance(2);
    assert.equal(h.row.arrivals, returns, 'remaining beside home does not farm arrival history');
    assert.equal(h.action('restore', { payment: 'parts' }).ok, true);
    assert.equal(h.row.stage, 3);
    assert.equal(h.action('repair').ok, true);
    assert.equal(h.row.service.rate, stageTwoRate * 2, 'stage three is palpably faster');
    h.advance(1.5);
    assert.ok(Math.abs(h.player.hull - 75) < 1e-5);
    assert.equal(h.action('stow', { bodyId: initialId }).ok, true);
    assert.equal(h.row.physical.rackId, initial.data.worldRecordId);
    assert.equal(initial.data.cargoManifest.manifestId, manifestId);
    assert.equal(initial.data.cargoManifest.totalQty, 1);
    const rack = h.sim.registry.get('combat').kernel.attachments.get(h.row.physical.recovery[0].rackAttachmentId);
    assert.equal(rack.state, 'active');
    assert.equal(rack.ownerId, home.id);
    assert.equal(rack.targetId, initialId);

    const oldAnchor = clone(h.row.physical.anchor);
    const inventory = clone(h.state.player.cargo.items);
    assert.equal(h.action('relocate').ok, true);
    assert.equal(h.row.physical.mode, 'released');
    assert.equal(h.action('refuel').ok, false, 'moving machinery cannot service remotely');
    let secured = false;
    for (let i = 0; i < 1800; i++) {
      const moved = Math.hypot(home.pos.x - oldAnchor.x, home.pos.z - oldAnchor.z);
      pilot(h, moved < 90 ? 10 : 0);
      if (moved > 90 && h.tender.physical.canSecure(h.row).ok) {
        assert.equal(h.action('secure').ok, true); secured = true; break;
      }
    }
    assert.equal(secured, true);
    assert.equal(h.body, home);
    assert.equal(h.state.entities.get(initialId), initial);
    assert.equal(h.state.entities.get(outerId), outer);
    assert.equal(initial.data.cargoManifest.manifestId, manifestId);
    assert.equal(initial.data.cargoManifest.totalQty, 1);
    assert.equal(h.row.physical.rackId, initial.data.worldRecordId);
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, inventory.cmdty_scrap_metal - 1);
    assert.ok(Math.hypot(h.row.physical.anchor.x - oldAnchor.x, h.row.physical.anchor.z - oldAnchor.z) > 90);
    assert.equal(h.state.player.credits, 0);
    const arrivals = h.row.arrivals;
    travel(h, { x: home.pos.x + 500, z: home.pos.z + 80 });
    travel(h, { x: home.pos.x + 50, z: home.pos.z });
    assert.equal(h.row.arrivals, arrivals + 1, 'a second expedition returns to the same remembered home');
    assert.equal(h.body, home);
    off();
  } finally { h.close(); }
});

test('ordinary Adventure discovery and encounter decline leave one useful opportunity available for return', async () => {
  const h = await boot({ discover: false });
  try {
    h.sim.spawn({ type: 'station', team: 0, pos: { x: 0, z: 0 }, radius: 100, hull: 1000, flags: {}, data: {} });
    h.state.simTime = 89.99;
    assert.equal(h.row.discovered, false);
    h.advance(DT * 2);
    assert.equal(h.row.discovered, true, 'ordinary timed Adventure play introduces the tender without a console');
    const original = h.body, calls = [];
    const dispatcher = {
      abort(live, reason) { calls.push(['abort', reason]); },
      resolve(live, result) { calls.push(['resolve', result]); },
      offerChoices(live, choices) { calls.push(['offer', choices]); },
    };
    const live = { sectorId: SECTOR, anchor: { x: 900, z: 900 } };
    SALVAGE_TENDER_ENCOUNTER_RUNTIME.fire(dispatcher, live, h.state);
    assert.equal(live.phase, 'offer');
    SALVAGE_TENDER_ENCOUNTER_RUNTIME.choose(dispatcher, live, h.state, 'decline');
    SALVAGE_TENDER_ENCOUNTER_RUNTIME.choose(dispatcher, live, h.state, 'inspect');
    assert.deepEqual(calls, [['offer', ['inspect', 'decline']], ['resolve', 'left']]);
    assert.equal(h.body, original);
    assert.equal(h.row.owned, false);
    assert.equal(h.state.player.credits, 1000);
  } finally { h.close(); }
});

test('promptDeck decisions preserve revision fencing, cancellation and cleanup across New Game', async () => {
  const deck = { offers: [], current: null, resolved: [],
    offerDecision(spec) { this.current = spec; this.offers.push(spec); return true; },
    updateDecision(id, spec) { if (this.current?.id !== id) return false; this.current = { ...this.current, ...spec }; return true; },
    resolveDecision(id) { this.resolved.push(id); if (this.current?.id === id) this.current = null; return true; } };
  setPromptDeck(deck);
  const h = await boot({ prompts: true });
  try {
    h.tender.inspect();
    const initial = deck.current;
    assert.ok(initial.choices.some(c => c.id === 'accept'));
    assert.equal(initial.onChoose('accept'), true);
    assert.equal(h.row.rescueAccepted, true);
    assert.equal(h.row.owned, false);
    assert.equal(initial.onChoose('accept'), false, 'old card closure cannot replay a choice after revision changes');
    assert.equal(deck.current.onChoose('cancel'), true);
    assert.equal(h.row.rescueAccepted, false);
    assert.equal(h.state.player.credits, 1000);
    assert.equal(deck.current, null);
    h.bus.emit('scan:completed', { sectorId: SECTOR, targetId: null });
    assert.ok(deck.current.choices.some(c => c.id === 'accept'), 'the real untargeted sector scan reopens nearby context');
    h.state.player.targetId = h.tender.physical.recoveryBodies(h.row)[0].id;
    h.bus.emit('scan:completed', { sectorId: SECTOR, targetId: null });
    assert.ok(deck.current.choices.some(c => c.id === 'crate_initial'), 'an explicitly selected original crate opens cargo context');
    const old = h.body;
    h.tender.newGame();
    assert.equal(h.row.discovered, false);
    assert.equal(h.body, null);
    h.tender.discover({ sectorId: SECTOR, anchor: { x: 20, z: 0 } });
    h.advance(DT * 2);
    assert.notEqual(h.body, old);
    assert.equal(h.row.physical.tender.status, 'present', 'queued old destruction cannot invalidate a new game identity');
    const prompt = h.sim.registry.get('salvageTenderPrompt');
    prompt.destroy();
    const n = deck.offers.length;
    h.tender.inspect();
    assert.equal(deck.offers.length, n);
    h.tender.destroy();
    assert.equal(getSalvageTenderOwner(h.state), null);
    const p = { action: 'accept', revision: h.row.revision, result: null };
    h.bus.emit('salvageTender:action', p);
    assert.equal(p.result, null, 'destroyed runtime no longer consumes command events');
  } finally { h.close(); setPromptDeck(null); }
});

test('exact funds, sealed freight, stale cards and reentrant cargo callbacks cannot buy or award a restoration twice', async () => {
  const h = await boot({ native: true, credits: 45 + 179 });
  try {
    recover(h);
    const stageOneRevision = h.row.revision;
    assert.equal(h.action('restore', { payment: 'credits' }).ok, false);
    assert.equal(h.state.player.credits, 179);
    assert.equal(h.row.stage, 1);
    addCargo(h.state, 'cmdty_scrap_metal', 4);
    addCargo(h.state, 'cmdty_salvage_electronics', 2);
    h.state.missions.active.push({ id: 'sealed-restoration-fixture', status: 'active', preloadedCargo: true,
      params: { cmdtyId: 'cmdty_salvage_electronics', qty: 2 } });
    const view = getSalvageTenderReadModel(h.state);
    assert.equal(view.nextStage.materialsReady, false);
    assert.equal(h.action('restore', { payment: 'parts' }).ok, false);
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 4);
    assert.equal(h.state.player.cargo.items.cmdty_salvage_electronics, 2);
    h.state.missions.active.length = 0;
    const nested = [];
    const off = h.bus.on('cargo:changed', () => nested.push(h.action('restore', { payment: 'parts' })));
    assert.equal(h.action('restore', { payment: 'parts' }).ok, true);
    off();
    assert.equal(h.row.stage, 2);
    assert.ok(nested.length > 0);
    assert.ok(nested.every(r => r.ok === false), 'callbacks cannot cross the in-flight transaction fence');
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal || 0, 0);
    assert.equal(h.state.player.cargo.items.cmdty_salvage_electronics || 0, 0);
    assert.equal(h.state.player.credits, 179);
    assert.equal(h.tender.act('restore', stageOneRevision, { payment: 'credits' }).ok, false);
    assert.equal(h.row.stage, 2);
    assert.equal(h.state.player.credits, 179);
  } finally { h.close(); }
});

test('paid work pauses on departure, refunds untouched supply once, and will not jump to a replacement hull', async () => {
  const h = await boot({ native: true });
  try {
    recover(h);
    addCargo(h.state, 'cmdty_fuel_cells', 3);
    assert.equal(h.action('refuel').ok, true);
    const returns = [];
    const off = h.bus.on('cargo:changed', () => returns.push(h.action('cancel_service')));
    assert.equal(h.action('cancel_service').ok, true);
    off();
    assert.equal(h.state.player.cargo.items.cmdty_fuel_cells, 3);
    assert.ok(returns.every(r => r.ok === false));
    assert.equal(h.action('cancel_service').ok, false);
    assert.equal(h.action('refuel').ok, true);
    h.advance(0.5);
    const paid = h.row.service, delivered = paid.delivered;
    assert.ok(delivered > 0 && delivered < paid.requested);
    // An actual sector transition pauses work, retaining original physical records.
    h.bus.emit('sector:exit', { sectorId: SECTOR });
    h.state.world.currentSectorId = 'sector_ceres_belt';
    const fuel = h.state.fuel.current;
    h.advance(3);
    assert.equal(h.state.fuel.current, fuel);
    assert.equal(paid.paused, true);
    assert.equal(h.body.flags.invuln, true);
    h.state.world.currentSectorId = SECTOR;
    h.bus.emit('sector:enter', { sectorId: SECTOR });
    h.advance(0.5);
    assert.ok(h.state.fuel.current > fuel);
    const beforeReplacement = h.state.fuel.current, old = h.player;
    const replacement = h.sim.spawn({ type: 'ship', isPlayer: true, team: 0, radius: 6, mass: 100,
      pos: { ...old.pos }, vel: { ...old.vel }, hull: 100, hullMax: 100,
      data: { defId: old.data.defId }, flags: {},
      physicsBody: { schemaVersion: 1, radius: 6, mass: 100, inertiaY: 400, dynamic: true, shape: 'ball', revision: 0 } });
    h.state.playerId = replacement.id;
    h.advance(2);
    assert.equal(h.state.fuel.current, beforeReplacement, 'same model and fleet slot do not establish hull identity');
    assert.equal(h.row.service.paused, true);
    assert.match(h.row.service.pauseReason, /previous hull/);
    assert.equal(h.action('cancel_service').ok, true);
    assert.equal(h.state.player.cargo.items.cmdty_fuel_cells, 2, 'partially spent supply cannot be refunded');
  } finally { h.close(); }
});

test('real damage disables the original home, patching restores its work, and absence never manufactures a replacement', async () => {
  const h = await boot({ native: true });
  try {
    recover(h);
    const body = h.body;
    assert.equal(damage(h, body, 10000).ok, true);
    assert.equal(body.alive, true, 'lethal damage leaves a disabled repairable original');
    assert.equal(body.hull, 1);
    assert.equal(h.row.physical.disabled, true);
    assert.equal(h.action('refuel').ok, false);
    addCargo(h.state, 'cmdty_scrap_metal', 1);
    assert.equal(h.action('patch').ok, true);
    assert.equal(body.hull, 31);
    assert.equal(h.row.physical.disabled, false);
    assert.equal(h.body, body);
    addCargo(h.state, 'cmdty_fuel_cells', 1);
    assert.equal(h.action('refuel').ok, true);
    assert.equal(h.action('cancel_service').ok, true);
    h.sim.helpers.removeEntity(body.id);
    h.tender.physical.ensure(h.row); // deliberately before queued entity:destroyed dispatch
    assert.equal(h.body, null);
    h.advance(DT * 2);
    assert.equal(h.body, null);
    assert.equal(h.row.physical.tender.status, 'missing');
    assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === TENDER_BODY_ID).length, 0);
  } finally { h.close(); }
});

test('a copied identity on a recycled body is refused repeatedly until an explicit authoritative restore', async () => {
  const h = await boot({ native: true });
  try {
    recover(h);
    const original = h.body;
    h.sim.helpers.removeEntity(original.id);
    const impostor = h.sim.spawn({ type: 'ship', team: 0, mass: 90, radius: 24, hull: 100, hullMax: 160,
      pos: { ...original.pos }, vel: { ...original.vel }, data: clone(original.data), flags: { persistent: true },
      physicsBody: clone(original.physicsBody) });
    assert.notEqual(impostor.occupantGeneration, original.occupantGeneration);
    for (let i = 0; i < 4; i++) assert.equal(h.tender.physical.find(h.row) === null, true, 'copied occupant remains unbound');
    h.advance(DT * 2);
    assert.equal(h.row.physical.tender.status, 'missing');
    assert.equal(h.tender.physical.find(h.row), null);
    assert.equal(getSalvageTenderReadModel(h.state).entityId, null);
    assert.equal(getSalvageTenderReadModel(h.state).visible, false);
    addCargo(h.state, 'cmdty_scrap_metal', 1);
    assert.equal(h.action('patch').ok, false);
    assert.equal(impostor.hull, 100);
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 1);
  } finally { h.close(); }
});

test('canonical save envelope cold-restores installed machines and partially paid work without repeated delivery', async () => {
  const source = await boot({ native: true, saving: true });
  let envelope, expected;
  try {
    recover(source);
    assert.equal(source.action('restore', { payment: 'credits' }).ok, true);
    addCargo(source.state, 'cmdty_scrap_metal', 2);
    damage(source, source.player, 100);
    assert.equal(source.action('repair').ok, true);
    source.advance(0.5);
    expected = { hull: source.player.hull, credits: source.state.player.credits,
      cargo: clone(source.state.player.cargo.items), homeHull: source.body.hull,
      job: clone(source.row.service), position: { ...source.body.pos }, manifests: source.row.physical.recovery.map(r => clone(r.manifest)) };
    assert.ok(expected.job.delivered > 0 && expected.job.delivered < expected.job.requested);
    const saver = source.sim.registry.get('save');
    envelope = clone(saver.serialize('salvage-tender-mid-work'));
    assert.equal(envelope.data.salvageTender.stage, 2);
    assert.equal(envelope.data.salvageTender.service.id, expected.job.id);
    const plan = saver._saveCapturePlan();
    assert.equal(plan.filter(([key]) => key === 'salvageTender').length, 1);
    assert.deepEqual(plan.at(-1)[1](), envelope.data.salvageTender,
      'scheduled and synchronous saves carry the same detached sidecar');
    const iterator = saver._serializeDataSteps();
    let step;
    do { step = iterator.next(); } while (!step.done);
    assert.deepEqual(Object.keys(step.value), plan.map(([key]) => key), 'both captures preserve checksum key order');
    assert.deepEqual(step.value.salvageTender, envelope.data.salvageTender);
    assert.equal(envelope.data.entities.persistent.filter(e => e.data?.persistenceOwner === 'salvageTender').length, 4);
  } finally { source.close(); }

  const cold = await boot({ native: true, saving: true, discover: false, credits: 0 });
  try {
    const saver = cold.sim.registry.get('save');
    assert.equal(saver.loadEnvelope(envelope, 'salvage-tender-mid-work'), true);
    assert.equal(cold.row.stage, 2);
    assert.equal(cold.row.owned, true);
    assert.equal(cold.state.player.credits, expected.credits);
    assert.deepEqual(cold.state.player.cargo.items, expected.cargo);
    assert.equal(cold.body.hull, expected.homeHull);
    assert.deepEqual({ ...cold.body.pos }, expected.position);
    assert.equal(cold.player.hull, expected.hull);
    assert.equal(cold.row.service.id, expected.job.id);
    assert.equal(cold.row.service.delivered, expected.job.delivered);
    assert.deepEqual(cold.row.physical.recovery.map(r => r.manifest), expected.manifests);
    assert.equal(cold.tender.physical.nativeReady(cold.body), true);
    const receipts = [];
    cold.bus.on('service:completed', p => { if (p.source === 'salvageTender') receipts.push(p); });
    cold.advance(3);
    assert.equal(cold.row.service, null);
    assert.ok(Math.abs(cold.player.hull - (expected.hull + expected.job.remaining)) < 1e-5);
    assert.equal(receipts.length, 1);
    assert.deepEqual(cold.state.player.cargo.items, expected.cargo);
    cold.advance(3);
    assert.equal(receipts.length, 1);
    // A subsequent save and repeated Continue retain the completed state and the exact sources.
    const finished = clone(saver.serialize('salvage-tender-after-work'));
    assert.equal(saver.loadEnvelope(finished, 'salvage-tender-after-work'), true);
    assert.equal(saver.loadEnvelope(finished, 'salvage-tender-after-work'), true);
    cold.advance(1);
    assert.equal(cold.row.service, null);
    assert.equal(receipts.length, 1);
    assert.equal(cold.state.entityList.filter(e => e.alive && e.data?.persistenceOwner === 'salvageTender').length, 4);
    assert.deepEqual(cold.row.physical.recovery.map(r => r.manifest), expected.manifests);
  } finally { cold.close(); }
});

test('cold Continue restores an in-flight tow and its original native rack cargo with remapped identities', async () => {
  const source = await boot({ native: true, saving: true });
  let envelope, expected;
  try {
    recover(source);
    assert.equal(source.action('restore', { payment: 'credits' }).ok, true);
    assert.equal(source.action('restore', { payment: 'credits' }).ok, true);
    const pod = source.tender.physical.recoveryBodies(source.row).find(e => e.data.worldRecordId.endsWith(':initial'));
    assert.equal(source.action('stow', { bodyId: pod.id }).ok, true);
    addCargo(source.state, 'cmdty_scrap_metal', 1);
    assert.equal(source.action('relocate').ok, true);
    for (let i = 0; i < 300; i++) pilot(source, 10);
    assert.ok(source.body.vel.x > 1);
    expected = { homeId: source.body.data.worldRecordId, podId: pod.data.worldRecordId,
      manifest: clone(pod.data.cargoManifest), homePose: { ...source.body.pos }, podPose: { ...pod.pos },
      hull: source.body.hull, credits: source.state.player.credits, cargo: clone(source.state.player.cargo.items) };
    envelope = clone(source.sim.registry.get('save').serialize('salvage-tender-mid-tow'));
  } finally { source.close(); }

  const cold = await boot({ native: true, saving: true, discover: false });
  try {
    assert.equal(await cold.sim.registry.get('save').loadEnvelopeFromString(JSON.stringify(envelope), 'salvage-tender-mid-tow'), true,
      'the existing asynchronous parse/validate/Continue lane owns cold restoration');
    assert.equal(cold.row.owned, true);
    assert.equal(cold.row.stage, 3);
    assert.equal(cold.row.physical.mode, 'released');
    assert.equal(cold.body.data.worldRecordId, expected.homeId);
    assert.equal(cold.body.hull, expected.hull);
    assert.deepEqual({ ...cold.body.pos }, expected.homePose);
    const pod = cold.tender.physical.recoveryBodies(cold.row).find(e => e.data.worldRecordId === expected.podId);
    assert.ok(pod);
    assert.deepEqual({ ...pod.pos }, expected.podPose);
    assert.deepEqual(pod.data.cargoManifest, expected.manifest);
    assert.equal(cold.row.physical.rackId, expected.podId);
    assert.equal(cold.state.player.credits, expected.credits);
    assert.deepEqual(cold.state.player.cargo.items, expected.cargo);
    assert.equal(cold.action('release', { bodyId: pod.id }).ok, false, 'a moving or pending native rack cannot be released through stale UI');
    for (let i = 0; i < 3; i++) pilot(cold, 10);
    assert.equal(cold.row.physical.rackId, expected.podId, 'a restored semantic joint waiting for admission is not a broken rack');
    assert.ok(cold.tender.physical.hasPlayerLine(cold.row), 'the saved standard player line regains native telemetry');
    const active = cold.sim.registry.get('combat').kernel.attachments.listForEntity(cold.body.id).filter(a => a.state === 'active');
    assert.equal(active.length, 2);
    assert.ok(active.some(a => a.controlMode === 'salvage_tender_rack' && a.ownerId === cold.body.id && a.targetId === pod.id));
    const before = { ...cold.body.pos };
    for (let i = 0; i < 60; i++) pilot(cold, 10);
    assert.ok(cold.body.pos.x > before.x + 1, 'the resumed native bodies continue moving; no pose-copy relocation');
    assert.equal(cold.row.physical.rackId, expected.podId);
    assert.deepEqual(pod.data.cargoManifest, expected.manifest);
  } finally { cold.close(); }
});


function presentationFixture() {
  const row = freshSalvageTender();
  discoverTenderState(row, { sectorId: 'sector_helios_prime', anchor: { x: 0, z: 0 } }, 0);
  row.physical.mode = 'secured';
  const player = { id: 1, alive: true, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 } };
  const body = { id: 42, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 140, hullMax: 160,
    data: { persistenceOwner: 'salvageTender', worldRecordId: row.physical.tender.id,
      identityKey: row.physical.tender.id, salvageTenderBody: 'tender' } };
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.position.set(7, 0, 11); root.scale.setScalar(24); scene.add(root);
  const state = { mode: 'flight', simTime: 1, salvageTender: row, playerId: 1,
    world: { currentSectorId: 'sector_helios_prime' },
    player: { credits: 100, cargo: { items: {} } },
    entities: new Map([[1, player], [42, body]]), entityList: [player, body],
    settings: { video: {}, accessibility: { captions: true } },
    render: { renderer: {}, scene, meshes: new Map([[42, root]]) } };
  return { state, row, player, body, scene, root, bus: createBus() };
}
function presentationLeases({ delayed = false, missing = false } = {}) {
  const data = { loads: [], created: 0, retired: 0, releases: 0, sharedDisposed: 0, resolvers: [] };
  const geometry = new THREE.BoxGeometry(1, .3, .5), material = new THREE.MeshStandardMaterial();
  geometry.addEventListener('dispose', () => data.sharedDisposed++);
  material.addEventListener('dispose', () => data.sharedDisposed++);
  const record = { bounds: { size: [1, .3, .5] }, renderPackage: { createInstance() {
    data.created++;
    const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
    return { root, dispose() { data.retired++; root.clear(); } };
  } } };
  let active = true;
  data.factory = () => ({ owner: {}, isActive: () => active,
    load(path) { data.loads.push(path); return delayed ? new Promise(resolve => data.resolvers.push(resolve)) : Promise.resolve(missing ? null : record); },
    release() { active = false; data.releases++; },
  });
  data.resolve = () => data.resolvers.forEach(resolve => resolve(record));
  return data;
}

test('tender authored deck changes all three machinery stages and follows presented roots without resource theft', async () => {
  const f = presentationFixture(), l = presentationLeases();
  const owner = createSalvageTenderPresentation({ state: f.state, bus: f.bus, leaseFactory: l.factory });
  await owner.ready; owner.update();
  assert.deepEqual(owner.diagnostics(), { mounted: 6, pending: 0, failures: 0, disposed: false });
  assert.equal(new Set(l.loads).size, 6);
  assert.equal(owner.group.parent, f.scene);
  assert.equal(owner.group.visible, true);
  for (let stage = 0; stage <= 3; stage++) {
    f.row.stage = stage; f.row.owned = stage > 0; f.row.revision++; owner.update();
    for (const spec of TENDER_EQUIPMENT) {
      assert.equal(owner.group.getObjectByName(`Morrowlight_${spec.id}_restored`).visible, stage >= spec.stage);
      assert.equal(owner.group.getObjectByName(`Morrowlight_${spec.id}_broken`).visible, stage < spec.stage);
    }
  }
  const replacement = new THREE.Group(); replacement.position.set(-22, 0, 19); replacement.rotation.y = .5;
  replacement.scale.setScalar(24); f.scene.add(replacement); f.state.render.meshes.set(f.body.id, replacement);
  owner.update();
  assert.deepEqual(owner.group.matrix.elements, replacement.matrixWorld.elements);
  assert.notEqual(owner.group.matrix.elements[12], f.body.pos.x, 'deck uses presented rather than simulation pose');
  f.row.service = { type: 'repair', requested: 20, delivered: 1, remaining: 19, paused: false }; f.row.revision++; owner.update();
  const bench = owner.group.getObjectByName('Morrowlight_bench_Rack');
  assert.notEqual(bench.rotation.y, 0);
  f.state.settings.video.motionReduce = true; owner.update(); assert.equal(bench.rotation.y, 0);
  const light = owner.group.getObjectByName('Morrowlight_BerthLamp');
  assert.equal(light.intensity, 18);
  f.state.settings.video.motionReduce = false; f.state.settings.accessibility.flashReduce = true;
  f.state.simTime = 2; owner.update(); assert.equal(light.intensity, 18);
  replacement.visible = false; owner.update(); assert.equal(owner.group.visible, false);
  replacement.visible = true; owner.update(); assert.equal(owner.group.visible, true);
  owner.dispose(); owner.dispose();
  assert.equal(owner.group.parent, null); assert.equal(l.retired, 6); assert.equal(l.releases, 1);
  assert.equal(l.sharedDisposed, 0, 'authoritative shared package assets remain resident for other users');
  assert.equal(owner.diagnostics().mounted, 0);
});

test('tender late and missing equipment loads cannot resurrect an owner or manufacture a proxy', async () => {
  const f = presentationFixture(), l = presentationLeases({ delayed: true });
  const owner = createSalvageTenderPresentation({ state: f.state, leaseFactory: l.factory });
  assert.equal(owner.diagnostics().pending, 6);
  owner.dispose(); l.resolve(); await owner.ready;
  assert.deepEqual(owner.diagnostics(), { mounted: 0, pending: 0, failures: 0, disposed: true });
  assert.equal(l.created, 0); assert.equal(l.releases, 1);
  const absent = presentationLeases({ missing: true });
  const missing = createSalvageTenderPresentation({ state: f.state, leaseFactory: absent.factory });
  await missing.ready;
  assert.deepEqual(missing.diagnostics(), { mounted: 0, pending: 0, failures: 6, disposed: false });
  assert.equal(absent.created, 0); missing.dispose();
});

test('presentation owners synchronously release on save, sector exit and New Game boundaries', async () => {
  for (const event of ['save:restoring', 'sector:exit', 'salvageTender:reset']) {
    const f = presentationFixture(), l = presentationLeases();
    const owner = createSalvageTenderPresentation({ state: f.state, bus: f.bus, leaseFactory: l.factory });
    await owner.ready;
    owner.update();
    assert.equal(owner.disposed, false);
    f.bus.emit(event, {});
    assert.equal(owner.disposed, true, event);
    assert.equal(owner.group.parent, null, event);
    assert.equal(l.retired, 6, event);
    assert.equal(l.releases, 1, event);
    f.bus.emit(event, {});
    owner.dispose();
    assert.equal(l.retired, 6, 'repeated lifecycle events do not retire shared instances again');
    assert.equal(l.releases, 1);
    assert.equal(l.sharedDisposed, 0);
  }
});

test('tender cues stay local, honor mute/captions, rate limit and unsubscribe', () => {
  const f = presentationFixture(), audio = [], captions = [];
  f.bus.on('audio:cue', cue => audio.push(cue)); f.bus.on('presentation:caption', cue => captions.push(cue));
  const off = bindSalvageTenderAudio(f.bus, () => f.state);
  const cue = { kind: 'arrive', pos: { x: 0, z: 0 } };
  f.bus.emit('salvageTender:cue', cue); f.bus.emit('salvageTender:cue', cue);
  assert.equal(audio.length, 1); assert.equal(captions.length, 1);
  assert.equal(audio[0].id, 'sfx_dock_clunk'); assert.ok(audio[0].gain < .5); assert.equal(captions[0].showVisible, true);
  f.player.pos.x = 400; f.state.simTime++; f.bus.emit('salvageTender:cue', cue); assert.equal(audio.length, 1);
  f.player.pos.x = 20; f.state.simTime++; f.state.settings.accessibility.audioCues = false;
  f.bus.emit('salvageTender:cue', cue); assert.equal(audio.length, 1); assert.equal(captions.length, 2);
  f.state.settings.accessibility.audioCues = true; f.state.world.currentSectorId = 'sector_elsewhere'; f.state.simTime++;
  f.bus.emit('salvageTender:cue', cue); assert.equal(audio.length, 1);
  f.state.world.currentSectorId = f.row.physical.sectorId; off(); f.state.simTime++;
  f.bus.emit('salvageTender:cue', cue); assert.equal(audio.length, 1); assert.equal(captions.length, 2);
});

test('home chart uses real map coordinates, stamped local course and remote sector route without duplicate contact', () => {
  const homeSector = 'sector_ceres_belt';
  const local = { x: 360, z: -280 };
  const global = sectorLocalToGlobalForSector(local, homeSector);
  const row = freshSalvageTender();
  discoverTenderState(row, { sectorId: homeSector, anchor: global }, 1);
  row.owned = true; row.stage = 2;
  row.physical.mode = 'secured'; row.physical.tender.status = 'present';
  const body = { id: 42, alive: true, type: 'ship', pos: global, vel: { x: 0, z: 0 },
    hull: 160, hullMax: 160, data: { persistenceOwner: 'salvageTender', salvageTenderBody: 'tender',
      worldRecordId: row.physical.tender.id, identityKey: row.physical.tender.id } };
  const state = { salvageTender: row, world: { currentSectorId: homeSector },
    player: { cargo: { items: {} }, credits: 0 }, entityList: [body], entities: new Map([[body.id, body]]) };
  const before = JSON.stringify(row);
  const [mark] = getSalvageTenderMapMarkers(state, homeSector);
  assert.deepEqual(mark.drawPos, local);
  assert.deepEqual(mark.homePosition, global);
  assert.equal(mark.x, global.x); assert.equal(mark.z, global.z);
  assert.equal(mark.targetEntityId, body.id);
  assert.equal(mark.stable.key, `record:${row.physical.tender.id}`);
  // Both existing ownership canvases stamp the click record as kind claim.
  const click = { ...mark, kind: 'claim', entityId: mark.targetEntityId };
  const course = commitCoursePayload(state, click);
  assert.deepEqual(course.pos, global);
  assert.equal(course.targetEntityId, body.id);
  assert.equal(course.arrivalRadius, 70);
  assert.equal(resolveGalaxyMapPrimaryAction(state, click).kind, 'waypoint');
  const unrelated = { id: 5, entityId: 5, name: 'Unrelated ship' };
  const contacts = [{ id: 42, entityId: 42, stable: mark.stable }, unrelated,
    { id: '42', entityId: null, remembered: true }];
  assert.deepEqual(filterSalvageTenderMapContacts(state, contacts), [unrelated]);
  assert.equal(contacts.length, 3, 'the projection does not edit source contacts');
  assert.deepEqual(getSalvageTenderMapMarkers(state, 'sector_helios_prime'), []);

  state.world.currentSectorId = 'sector_helios_prime';
  const [remote] = getSalvageTenderMapMarkers(state, homeSector);
  assert.equal(remote.id, mark.id);
  assert.deepEqual(remote.drawPos, local);
  assert.deepEqual(remote.homePosition, global);
  assert.equal(remote.x, null); assert.equal(remote.z, null);
  assert.equal(remote.stable, null); assert.equal(remote.targetEntityId, null);
  const remoteClick = { ...remote, kind: 'claim', entityId: remote.targetEntityId };
  const route = resolveCourseTarget(remoteClick);
  assert.equal(route.type, 'sector'); assert.equal(route.sectorId, homeSector);
  assert.equal('pos' in route, false); assert.equal('targetEntityId' in route, false);
  assert.equal(resolveGalaxyMapPrimaryAction(state, remoteClick).kind, 'jump', 'the existing map offers its standard adjacent-sector course and jump');
  assert.equal(filterSalvageTenderMapContacts(state, contacts), contacts);
  assert.equal(JSON.stringify(row), before, 'map adapters remain pure');

  state.entityList = []; state.entities.clear();
  assert.deepEqual(getSalvageTenderMapMarkers(state, homeSector)[0].drawPos, local, 'offsector save pose persists');
  state.world.currentSectorId = homeSector;
  row.physical.tender.status = 'missing';
  state.entityList = [body]; state.entities.set(body.id, body);
  const [missing] = getSalvageTenderMapMarkers(state, homeSector);
  assert.equal(missing.status, 'MISSING');
  assert.equal(missing.targetEntityId, null);
  assert.equal(missing.stable, null, 'terminal missing identity never binds a replacement');
  row.owned = false;
  assert.deepEqual(getSalvageTenderMapMarkers(state, homeSector), []);
});
