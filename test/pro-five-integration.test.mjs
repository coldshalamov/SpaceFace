import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { getActiveTowjawRuntime } from '../src/features/towjaw/runtime.js';
import { getExpeditionSiteLayout } from '../src/features/derelictExpedition/site.js';
import { switchbackEntryPoint } from '../src/features/convoyRaid/runtime.js';
import { claimCatalystTrial, readFittedCatalyst } from '../src/features/kineticCatalysts/fitting.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const fields = ['towjaw', 'derelictExpedition', 'convoyRaid', 'stormChase', 'kineticCatalysts'];
const vesta = 'sector_vesta_forge';

function host(sectorId, point) {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  const state = runtime.state;
  state.mode = 'flight'; state.world.currentSectorId = sectorId;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: Array(7).fill(null), fittedInstances: {} }];
  state.player.activeShipIndex = 0; state.player.moduleInventory = [];
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, pos: point, fittings: [],
  }));
  state.playerId = player.id;
  runtime.getSystem('world').enterSector(sectorId, { noTeleport: true, placePlayer: false });
  runtime.getSystem('world').relocatePlayerInSector({ ...point, heading: 0 }, { reason: 'pro-five-integration' });
  return runtime;
}

function accept(runtime, { shapeId, choiceId, anchor, zoneType = 'derelict_field' }) {
  const encounterId = `integration:${shapeId}`;
  const result = runtime.getSystem('encounterDirector').requestAuthoredEncounter({
    shapeId, encounterId, sectorId: runtime.state.world.currentSectorId,
    zoneId: 'pro-five-integration', zoneName: 'Integration route', zoneType, zoneRadius: 600,
    anchor, respectPacing: false,
  });
  assert.equal(result.ok, true, `${shapeId}: ${result.reason}`);
  runtime.bus.emit('encounter:choose', { encounterId, choiceId });
  return encounterId;
}

const scenarios = [
  {
    id: 'towjaw', sector: vesta, point: { x: 800, z: 15000 },
    start(runtime) {
      const player = runtime.state.entities.get(runtime.state.playerId);
      const encounterId = accept(runtime, { shapeId: 'pro_five_towjaw', choiceId: 'investigate',
        anchor: { x: player.pos.x + 350, z: player.pos.z } });
      assert.equal(getActiveTowjawRuntime(runtime.state)?.getView().encounterId, encounterId);
    },
    identity(runtime) {
      const active = getActiveTowjawRuntime(runtime.state);
      assert.ok(active, 'accepted TOWJAW survives the complete save owner');
      const saved = active.snapshot();
      const boss = runtime.state.entities.get(saved.bindings.find(row => row.role === 'boss').id);
      assert.equal(boss.data.towjaw.encounterId, saved.encounterId);
      return { encounterId: saved.encounterId, key: boss.data.towjaw.key, hull: boss.hull,
        bodies: saved.bindings.map(row => row.key).sort() };
    },
  },
  {
    id: 'derelictExpedition', sector: vesta, point: getExpeditionSiteLayout(4242).entry,
    async start(runtime) {
      assert.equal(await runtime.getSystem('physics').prepareBackend(runtime.state), true);
      accept(runtime, { shapeId: 'blackbox_runs', choiceId: 'enter', anchor: getExpeditionSiteLayout(4242).entry });
      // The owner retries a cargo mount after native endpoints have materialized (0.5 s cadence).
      for (let i = 0; i < 60; i++) runtime.step(DT);
      const claim = claimCatalystTrial(runtime.state, { catalystId: 'orbital_magazine', ships: runtime.getSystem('ships') });
      assert.equal(claim.fitted, true, claim.reason);
    },
    identity(runtime) {
      const status = runtime.getSystem('derelictExpedition').getStatus();
      assert.ok(status?.record.accepted);
      const body = runtime.state.entities.get(status.entityIds.blackbox);
      assert.ok(body, `original recorder is materialized after native clamp admission: ${JSON.stringify({
        cargo: status.record.bodies.blackbox,
        rejections: runtime.state.combat.trace.events.filter(row => row.kind === 'attachment.rejected').slice(-4),
      })}`);
      assert.equal(body.data.derelictExpedition.key, 'blackbox');
      const fitted = readFittedCatalyst(runtime.state);
      assert.equal(fitted.id, 'orbital_magazine', 'real ships fitting survives the player/save owner');
      for (const kind of ['blackbox', 'core']) {
        const cargo = runtime.state.entities.get(status.entityIds[kind]);
        const clamp = Object.values(runtime.state.combat.attachments.byId).find(row => row.state === 'active'
          && row.actionInstanceId === `derelictExpedition:blackbox_vesta:${kind}`);
        assert.equal(clamp?.targetId, cargo?.id, `${kind} keeps its actual combat clamp`);
        assert.strictEqual(runtime.getSystem('physics')._sg02.attachments.get(clamp.id)?.targetEntity,
          cargo, `${kind} keeps its native clamp on that same occupant`);
      }
      return { site: status.record.siteId, custody: status.record.cargo.blackbox.status,
        key: body.data.derelictExpedition.key, hull: body.hull, fitted };
    },
  },
  {
    id: 'convoyRaid', sector: 'sector_ceres_belt', point: switchbackEntryPoint(),
    start(runtime) {
      const result = runtime.getSystem('convoyRaid').start({ runId: 'integration:switchback', choice: 'theft' });
      assert.equal(result.ok, true, result.reason);
    },
    identity(runtime) {
      const active = runtime.getSystem('convoyRaid').snapshot();
      assert.ok(active, 'accepted convoy survives the complete save owner');
      const target = active.bindings[active.train.targetId];
      const body = runtime.state.entities.get(target.id ?? target.entityId);
      assert.ok(body, 'original target carriage remains bound to its physical body');
      return { id: active.id, target: active.train.targetId, hull: body.hull,
        phase: active.raid.phase, couplers: active.train.couplers.map(row => [row.id, row.severed]) };
    },
  },
  {
    id: 'stormChase', sector: vesta,
    point: sectorLocalToGlobalForSector({ x: 860, z: -1240 }, vesta),
    start(runtime) {
      const result = runtime.getSystem('stormChase').runtime.begin({ patternId: 'lee_arc' });
      assert.equal(result.ok, true, result.reason);
    },
    identity(runtime) {
      const active = runtime.getSystem('stormChase').runtime.active;
      assert.equal(active?.phase, 'expedition');
      const receiver = active.bodies.find(row => row.role === 'receiver');
      const body = runtime.state.entities.get(receiver?.id);
      assert.ok(body, 'the forecast mooring remains a real restored physical body');
      return { id: active.id, pattern: active.plan.patternId, role: body.data.stormChase.role,
        hull: body.hull, ledger: active.ledger.samples.map(row => [row.id, row.status]) };
    },
  },
];

for (const scenario of scenarios) test(`seed 4242 production ${scenario.id}: opt-in, full envelope, cold restore and old-slot clearing`, async () => {
  const source = host(scenario.sector, scenario.point);
  let destination;
  try {
    const oldData = source.getSystem('save').serializeData();
    for (const key of fields) delete oldData[key];
    await scenario.start(source);
    const before = scenario.identity(source), credits = source.state.player.credits;
    const envelope = source.getSystem('save').serialize(`pro-five:${scenario.id}`);
    for (const key of fields) assert.ok(Object.hasOwn(envelope.data, key), `${key} joins the coherent save envelope`);
    source.dispose();
    destination = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4243 });
    assert.equal(await destination.getSystem('save').loadEnvelope(clone(envelope), `pro-five:${scenario.id}`), true);
    destination.state.mode = 'flight';
    assert.equal(await destination.getSystem('physics').prepareBackend(destination.state), true);
    destination.step(DT);
    assert.deepEqual(scenario.identity(destination), before);
    assert.equal(destination.state.player.credits, credits, 'rehydration cannot replay a feature payment');
    assert.equal(destination.getSystem('save')._restore(clone(oldData), 'legacy-pro-five').restored, true);
    destination.state.mode = 'flight'; destination.step(DT);
    assert.equal(getActiveTowjawRuntime(destination.state), null);
    assert.equal(destination.getSystem('derelictExpedition').getStatus(), null);
    assert.equal(destination.getSystem('convoyRaid').snapshot(), null);
    assert.equal(destination.getSystem('stormChase').runtime.active, null);
    assert.equal(readFittedCatalyst(destination.state).id, null);
  } finally { destination?.dispose(); source.dispose(); }
});
