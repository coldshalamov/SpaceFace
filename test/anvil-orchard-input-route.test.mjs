import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// uiRoot's real DOM command handler is module-private. This test-only loader exposes
// that unchanged function, without patching game source or reproducing its behavior.
// register is supported by the repository's Node >=22.12 engine floor.
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  const result = await next(url, context);
  if (url.endsWith('/src/ui/uiRoot.js')) return { ...result,
    source: String(result.source) + '\\nexport { cycleTargetComponent as orchardRouteCycleComponent };\\n' };
  return result;
}`), import.meta.url);
const { cycleTarget, orchardRouteCycleComponent } = await import('../src/ui/uiRoot.js');
const { createSimulation } = await import('../src/core/sim.js');
const { physics } = await import('../src/core/physics.js');
const { input, applyFlightKeyEvent } = await import('../src/systems/input.js');
const { mining } = await import('../src/systems/mining.js');
const { cargo } = await import('../src/systems/cargo.js');
const { asteroidSites } = await import('../src/systems/asteroidSites.js');
const { makeShipEntitySpec } = await import('../src/systems/ships.js');
const { save } = await import('../src/save/saveSystem.js');
const { fields } = await import('../src/systems/fields.js');
const { planetRuntime } = await import('../src/systems/planetRuntime.js');
const { traffic } = await import('../src/systems/traffic.js');
const { flightV3 } = await import('../src/systems/flightV3.js');
const { environmentalMachinery } = await import('../src/systems/environmentalMachinery.js');
const { PLANET_FLAGS, PLANET_SITE } = await import('../src/data/planets.js');
const { FIELD_FLAGS } = await import('../src/data/fields.js');
const { world } = await import('../src/systems/world.js');

// Focused owner composition, not a complete production-manifest or browser proof.
// The route starts at Anvil's worker berth. Its normal worker, flight, input, planet,
// physics, mining, cargo and save owners execute; galaxy population/rendering do not.
const worldRecords = { name: 'world', init(ctx) { this.state = ctx.state; },
  upsertWorldRecord: world.upsertWorldRecord };
const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };

test('raw flight and beam input harvest, resume, release and physically collect one original Orchard lot', async () => {
  const previousPlanet = PLANET_FLAGS.enabled, previousFields = FIELD_FLAGS.enabled;
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424214, systems: [worldRecords, trafficWork,
    asteroidSites, input, flightV3, fields, planetRuntime, physics, environmentalMachinery, cargo, mining, save] });
  try {
    const state = sim.state;
    state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic'; sim.step();
    let frame = state.entities.get(state.planet.orchardFrameId);
    assert.ok(frame);
    const collector = state.entities.get(state.planet.witnessId);
    let player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel', {
      pos: { x: collector.pos.x, z: collector.pos.z - 100 }, rot: Math.PI }), isPlayer: true });
    state.playerId = player.id;
    const facade = sim.registry.get('physics'), keys = sim.registry.get('input');
    assert.equal(await facade.prepareBackend(state), true);
    sim.bus.on('ui:cycleTarget', ({ dir }) => cycleTarget(state, dir, sim.bus));
    sim.bus.on('ui:cycleComponent', ({ dir }) => orchardRouteCycleComponent(state, dir, sim.bus));
    let pickupEvents = 0;
    sim.bus.on('pickup:collected', () => { pickupEvents++; });
    let goal = { x: frame.pos.x + 170, z: frame.pos.z };
    const press = (code, pressed) => applyFlightKeyEvent(keys, { code, pressed });
    // A bounded feedback pilot emits keyboard transitions only. It never edits a
    // live pose/velocity or calls a native/machinery/collection mutation method.
    const pilot = (stop = 30) => {
      const dx = goal.x - player.pos.x, dz = goal.z - player.pos.z;
      const distance = Math.hypot(dx, dz), speed = Math.hypot(player.vel.x, player.vel.z);
      const error = Math.atan2(Math.sin(Math.atan2(dz, dx) - player.rot),
        Math.cos(Math.atan2(dz, dx) - player.rot));
      const turn = error - player.angVel * 0.4;
      press('ArrowLeft', turn < -0.035); press('ArrowRight', turn > 0.035);
      const brake = distance < stop || speed > 65 || Math.abs(error) > 0.5
        || speed * speed / 90 > distance - stop;
      press('Digit0', brake); press('KeyW', !brake && distance > stop);
    };
    const brake = () => {
      for (const code of ['ArrowLeft', 'ArrowRight', 'KeyW']) press(code, false);
      press('Digit0', true);
    };
    const selectSocket = (socket) => {
      // These are the shipped UI bus commands, not raw Tab/DOM click delivery.
      for (let i = 0; i < state.entityList.length && state.player.targetId !== frame.id; i++)
        sim.bus.emit('ui:cycleTarget', { dir: 1 });
      assert.equal(state.player.targetId, frame.id);
      for (let i = 0; i < 4 && state.ui.componentSelection?.componentId !== `orchard_socket_${socket}`; i++)
        sim.bus.emit('ui:cycleComponent', { dir: 1 });
      assert.equal(state.ui.componentSelection?.componentId, `orchard_socket_${socket}`);
    };
    for (let i = 0; i < 7200 && !state.sites.anvilOrchard.lots.some(l => l.units === 4); i++) {
      pilot(); sim.step();
    }
    brake();
    const lot = state.sites.anvilOrchard.lots.find(l => l.units === 4);
    assert.ok(lot, 'the ordinary flown worker must fill a four-unit finite lot');
    const lotId = lot.id, socket = lot.socket, harvestTick = state.tick;
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 44);
    assert.equal(state.sites.anvilOrchard.sockets[socket].status, 'stowed');
    selectSocket(socket); press('KeyB', true);
    for (let i = 0; i < 10; i++) sim.step();
    const savedSlot = structuredClone(state.sites.anvilOrchard.sockets[socket]);
    const savedLot = structuredClone(state.sites.anvilOrchard.lots.find(l => l.id === lotId));
    assert.equal(savedSlot.progress, 9);
    assert.equal(savedSlot.status, 'releasing');
    let admission, finalizerCalls = 0;
    sim.helpers.finalizeLoadedGame = () => {
      finalizerCalls++;
      assert.equal(state.mode, 'loading');
      admission = facade.prepareBackend(state).then(ok => {
        assert.equal(ok, true); state.mode = 'flight';
      });
      return admission;
    };
    const saves = sim.registry.get('save');
    assert.equal(saves.loadEnvelope(JSON.parse(JSON.stringify(saves.serialize('orchard-input-opening')))), true);
    assert.equal(finalizerCalls, 1); assert.ok(admission); await admission;
    assert.equal(state.mode, 'flight');
    assert.deepEqual(state.sites.anvilOrchard.sockets[socket], savedSlot);
    assert.deepEqual(state.sites.anvilOrchard.lots.find(l => l.id === lotId), savedLot);
    player = state.entities.get(state.playerId);
    frame = state.entityList.find(e => e.alive !== false && e.data?.orchardKind === 'frame');
    assert.equal(state.entities.get(frame.id), frame);
    assert.ok(facade.readOrchardFramePose(frame), 'finalizer preparation preserves the exact authored root');
    selectSocket(socket); press('KeyB', false); press('KeyB', true);
    for (let i = 0; i < 1100 && state.sites.anvilOrchard.sockets[socket].status !== 'drifting'; i++) sim.step();
    press('KeyB', false); sim.step();
    assert.equal(state.sites.anvilOrchard.sockets[socket].status, 'drifting');
    const releaseTick = state.tick;
    const pod = state.entityList.find(e => e.alive !== false && e.data?.worldRecordId === lotId);
    assert.ok(pod); assert.equal(pod.data.amount, 4);
    assert.equal(pod._physicsPartition, 2, 'ordinary next-tick classification retains the released dynamic body');
    assert.ok(facade.readOrchardPodReady(pod));
    const before = state.player.cargo.items.cmdty_gas_hydrogen || 0;
    goal = pod.pos;
    for (let i = 0; i < 3600 && pod.alive !== false; i++) { pilot(4); sim.step(); }
    brake();
    assert.equal(pod.alive, false, 'ordinary proximity collection consumes the released body');
    assert.equal(pickupEvents, 1);
    assert.equal(state.sites.anvilOrchard.lots.find(l => l.id === lotId).outcome, 'delivered');
    assert.equal(state.player.cargo.items.cmdty_gas_hydrogen, before + 4);
    assert.equal(state.sites.anvilOrchard.sourceRemaining, 44);
    const collectedTick = state.tick;
    admission = null;
    assert.equal(saves.loadEnvelope(JSON.parse(JSON.stringify(saves.serialize('orchard-input-collected')))), true);
    assert.equal(finalizerCalls, 2); assert.ok(admission); await admission;
    assert.equal(state.mode, 'flight');
    assert.equal(state.player.cargo.items.cmdty_gas_hydrogen, before + 4);
    assert.equal(state.entityList.some(e => e.alive !== false && e.data?.worldRecordId === lotId), false);
    assert.equal(state.sites.anvilOrchard.lots.find(l => l.id === lotId).outcome, 'delivered');
    console.log(JSON.stringify({ route: 'focused-ordinary-input', seed: 424214, harvestTick,
      savedProgress: savedSlot.progress, releaseTick, collectedTick, lotId,
      cargo: state.player.cargo.items.cmdty_gas_hydrogen, sourceRemaining: state.sites.anvilOrchard.sourceRemaining,
      finalizerCalls, pickupEvents }));
  } finally {
    sim.dispose(); PLANET_FLAGS.enabled = previousPlanet; FIELD_FLAGS.enabled = previousFields;
  }
});
