import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { fields } from '../src/systems/fields.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { mining } from '../src/systems/mining.js';
import { scanner, playerSensorBlock } from '../src/systems/scanner.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { TUNABLE_BAND_CHANNEL_IDS } from '../src/data/bandRadio.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SEASONAL_WEATHER_VOLUMES, weatherPhase, weatherScanScale } from '../src/data/environmentalMachinery.js';
import { weatherSeasonAt, weatherForecast } from '../src/data/seasonalWeather.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { mountIonStormHud } from '../src/ui/ionStormHud.js';

function at(volume, across = 90) {
  return { x: volume.globalPos.x + volume.dir.x * 150 - volume.dir.z * across,
    z: volume.globalPos.z + volume.dir.z * 150 + volume.dir.x * across };
}
function timeFor(volume, offset = 31) {
  for (let season = 0; season < 4; season++) {
    const t = season * 4200 + offset;
    if (weatherSeasonAt(volume.sectorId, t).kind === volume.role) return t;
  }
  assert.fail('season not found');
}
function boot(volume, systems = [fields, environmentalMachinery]) {
  const sim = createSimulation({ seed: 4242, systems });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = volume.sectorId;
  sim.state.world.activeSector = { stations: [], pois: [] };
  const p = sim.spawn({ type: 'ship', team: 'player', pos: at(volume), radius: 8, mass: 60,
    hull: 100, hullMax: 100, shield: 100, shieldMax: 100,
    physicsBody: { dynamic: true, mass: 60, radius: 8, shape: 'ball' }, data: {} });
  sim.state.playerId = p.id; sim.state.simTime = timeFor(volume); sim.state.tick = Math.round(sim.state.simTime * 60);
  return { sim, p, state: sim.state, owner: sim.registry.get('environmentalMachinery') };
}

test('sector seasons and thirty-second forecasts survive the saved clock without rerolling', () => {
  for (const volume of SEASONAL_WEATHER_VOLUMES) {
    const t = timeFor(volume);
    assert.equal(weatherPhase(volume, t - 2).phase, 'warning');
    assert.equal(weatherPhase(volume, t).phase, 'surge');
    assert.equal(weatherPhase(volume, t + 100).phase, 'calm');
    const restored = JSON.parse(JSON.stringify({ simTime: t, sector: volume.sectorId }));
    assert.deepEqual(weatherForecast(restored.sector, restored.simTime), weatherForecast(volume.sectorId, t));
  }
});

test('solar wind uses the real field owner and delivers physical impulses to ship and towed cargo', () => {
  const previous = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  try {
    const volume = SEASONAL_WEATHER_VOLUMES.find(v => v.role === 'solar_wind');
    const { sim, state, p, owner } = boot(volume);
    const cargo = sim.spawn({ type: 'payload', team: null, pos: at(volume, 110), vel: { x: 0, z: 0 }, radius: 8, mass: 140,
      physicsBody: { dynamic: true, mass: 140, radius: 8, shape: 'ball' }, data: { masslineTetherable: true } });
    state.player.tether = { active: true, targetId: cargo.id };
    owner._updateWeather(state);
    sim.registry.get('fields').update(1 / 60, state);
    for (const entity of [p, cargo]) {
      const command = consumePhysicsCommand(entity);
      assert.ok(command?.impulses.some(i => Math.hypot(i.x, i.z) > 0), `${entity.type} must receive real force`);
    }
    assert.equal(state.player.tether.targetId, cargo.id);
  } finally { FIELD_FLAGS.enabled = previous; }
});

test('ion surge blocks the production sensor gate and pulse; clear restores scanning', () => {
  const volume = SEASONAL_WEATHER_VOLUMES.find(v => v.role === 'ion_storm');
  const { sim, state, p } = boot(volume, [scanner]);
  assert.equal(weatherScanScale(volume.sectorId, p.pos, state.simTime), 0);
  assert.equal(playerSensorBlock(state, p), 'jammed');
  const messages = [];
  sim.bus.on('toast', p => messages.push(p.text));
  state.input.actions = { scanPulse: true };
  sim.registry.get('scanner').update(1 / 60, state);
  assert.ok(messages.some(line => line.includes('jammed')));
  state.simTime += 100;
  assert.notEqual(playerSensorBlock(state, p), 'jammed');
});

test('meteor shower bodies move, collide and mine through ordinary mining; partial ore and spent lots survive reload', () => {
  const previous = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  try {
    const volume = SEASONAL_WEATHER_VOLUMES.find(v => v.role === 'meteor_shower');
    const { sim, state, owner } = boot(volume, [environmentalMachinery, mining]);
    owner._updateWeather(state);
    const rocks = state.entityList.filter(e => e.data?.weatherMeteorKey);
    assert.equal(rocks.length, 3);
    assert.ok(rocks.every(e => e.collides && e.physicsBody.dynamic && Math.hypot(e.vel.x, e.vel.z) >= 70));
    const miner = sim.registry.get('mining');
    const rock = rocks[0];
    const released = miner.applyMining(rock.id, 100, 0.6, state.playerId);
    assert.ok(released > 0);
    assert.ok(state.entityList.some(e => e.type === 'pickup') || Object.values(state.player.cargo?.items || {}).some(qty => qty > 0), 'ordinary mining releases valuable ore to the hold or physical pickups');
    owner._updateWeather(state);
    const remaining = rock.data.oreHP;
    assert.ok(remaining > 0 && remaining < 180);
    const savedDiscovery = JSON.parse(JSON.stringify(state.world.discovery));
    for (const r of rocks) { state.entities.delete(r.id); state.entityList.splice(state.entityList.indexOf(r), 1); }
    state.world.discovery = savedDiscovery;
    owner._updateWeather(state);
    const restored = state.entityList.find(e => e.data?.weatherMeteorKey === rock.data.weatherMeteorKey);
    assert.equal(restored.data.oreHP, remaining);
    miner.applyMining(restored.id, 1000, 1, state.playerId);
    owner._updateWeather(state);
    const savedAfterMining = JSON.parse(JSON.stringify(state.world.discovery));
    state.entities.delete(restored.id); state.entityList.splice(state.entityList.indexOf(restored), 1);
    state.world.discovery = savedAfterMining;
    owner._updateWeather(state);
    assert.equal(state.entityList.some(e => e.data?.weatherMeteorKey === restored.data.weatherMeteorKey), false, 'a spent lot never remints ore');
  } finally { FIELD_FLAGS.enabled = previous; }
});

test('a tuned Band speaks the seasonal forecast through its existing voice arbiter', () => {
  const volume = SEASONAL_WEATHER_VOLUMES.find(v => v.role === 'ion_storm');
  const { sim, state } = boot(volume, []), spoken = [];
  const band = Object.create(bandRadio);
  band.init({ state, bus: sim.bus, helpers: { voice: { say(line) { spoken.push(line); return true; } } } });
  sim.bus.emit('band:tune', { channelId: TUNABLE_BAND_CHANNEL_IDS[0] });
  state.bandRadio.identPending = false; state.bandRadio.nextLineAtS = 0;
  band.update(1 / 60, state);
  state.bandRadio.identPending = false; state.bandRadio.nextLineAtS = 0;
  band.update(1 / 60, state);
  assert.ok(spoken.some(line => line.text.includes('ION STORM')), JSON.stringify({ spoken, own: state.bandRadio }));
  const count = spoken.length;
  band.update(1 / 60, state);
  assert.equal(spoken.length, count);
  band.destroy();
});

test('HUD blackout is scoped to instruments, keeps radio/captions alive, and clears on exit', () => {
  const volume = SEASONAL_WEATHER_VOLUMES.find(v => v.role === 'ion_storm');
  const { state, p } = boot(volume, []);
  const nodes = [], classes = new Set();
  const doc = { createElement() { const n = { hidden: false, setAttribute() {}, remove() {} }; nodes.push(n); return n; } };
  const rail = { appendChild() {} };
  const root = { ownerDocument: doc, appendChild() {}, querySelector: () => rail,
    classList: { toggle(c, on) { on ? classes.add(c) : classes.delete(c); }, remove(c) { classes.delete(c); } } };
  const hud = mountIonStormHud(root, state);
  hud.update(); assert.ok(classes.has('sf-ion-blackout')); assert.equal(nodes[1].hidden, false);
  assert.ok(!nodes[0].textContent.includes('.sf-leftcontext'), 'the comms rail is outside blackout scope');
  p.pos.x += 10000; hud.update(); assert.equal(classes.has('sf-ion-blackout'), false);
  assert.equal(nodes[1].hidden, true); hud.destroy();
});
