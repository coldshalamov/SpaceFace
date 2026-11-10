import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SECTORS } from '../src/data/sectors.js';
import { FRONTIER_ANCHORS } from '../src/data/frontierRegions/index.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SECTOR_LAW_MACHINES, killMachinesForSector, killMachinePhase } from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { world } from '../src/systems/world.js';
import { DEFAULT_DRIVE } from '../src/systems/routePlanner.js';
import { PROFILE_BY_ID, resolveSectorVisualProfile } from '../src/data/sectorVisualProfiles.js';
import { withSectorLandmark } from '../src/render/sectorLandmarkBackground.js';
import { resolveDeepFieldStructureRecipe } from '../src/render/deepFieldStructureRecipes.js';
import { travelVectorReadout } from '../src/ui/travelVectorHud.js';

test('4242: ten thin sectors materialize their named rule on the approach and the actual field law changes the flown vector', () => {
  const previous = FIELD_FLAGS.enabled; FIELD_FLAGS.enabled = true;
  try {
    assert.equal(SECTOR_LAW_MACHINES.length, 10);
    for (const machine of SECTOR_LAW_MACHINES) {
      const state = createGameState(4242), bus = createBus(), events = [], placed = [];
      state.mode = 'flight'; state.world.currentSectorId = machine.sectorId;
      const sector = SECTORS.find(s => s.id === machine.sectorId);
      state.world.sectors[sector.id] = sector; state.world.activeSector = { dressing: [] };
      const player = { id: 1, alive: true, type: 'ship', mass: 28, pos: {
        x: machine.globalPos.x + machine.dir.x * 30 + machine.perp.x * 16,
        z: machine.globalPos.z + machine.dir.z * 30 + machine.perp.z * 16 } };
      state.playerId = 1; state.entities.set(1, player);
      const fields = { rows: new Map(), registerEnvironmental(spec) { this.rows.set(spec.id, { ...spec }); },
        updateExternal(id, patch) { Object.assign(this.rows.get(id), patch); },
        hasExternal(id) { return this.rows.has(id); }, unregisterExternal(id) { this.rows.delete(id); } };
      const worldOwner = { _spawnPlaceProp(active, def, placeId, pos, options) {
        const entity = { id: 100 + placed.length, pos, data: { placeId }, ...options };
        active.dressing.push(entity); placed.push(entity); return entity;
      } };
      for (const name of ['toast', 'sector:physicalLaw', 'environmentalMachinery:ensureAnvil']) bus.on(name, payload => events.push({ name, payload }));
      const owner = Object.create(environmentalMachinery);
      owner.init({ state, bus, registry: { get: name => name === 'fields' ? fields : name === 'world' ? worldOwner : null } });
      try {
        assert.equal(killMachinesForSector(machine.sectorId)[0], machine, 'default adapter chooses this rule');
        const station = FRONTIER_ANCHORS[machine.sectorId].stations[0].pos;
        assert.ok(Math.hypot(station.x - machine.localPos.x, station.z - machine.localPos.z) >= 500, 'port mouth remains clear');
        let surge = null;
        for (let t = 0; t < 60; t += 0.25) {
          state.simTime = t; owner.update(0.25, state);
          if (killMachinePhase(machine, t).phase === 'surge') { surge = fields.rows.get(machine.fields[0].id); break; }
        }
        assert.ok(surge?.strength > 0, `${machine.id} has a real surge within the first minute`);
        const field = normalizeField({ ...surge, tag: 'environmental', durationS: Infinity });
        const acceleration = sampleFieldAcceleration(player.pos, { x: 0, z: 0 }, [field], state.simTime,
          { id: 1, type: 'ship', mass: 28, team: 0, marked: false }, { ax: 0, az: 0 });
        assert.ok(Math.hypot(acceleration.ax, acceleration.az) > 0.1, `${machine.id} changes flight through the shared kernel`);
        assert.equal(placed.length, 1); assert.equal(placed[0].name, machine.mouth.name);
        assert.equal(events.filter(e => e.name === 'sector:physicalLaw').length, 1);
        assert.ok(events.some(e => e.name === 'toast' && e.payload.text.includes(machine.mouth.name)));
        bus.emit('sector:exit', {}); assert.equal(fields.rows.size, 0, 'no old-sector force survives departure');
      } finally { owner.destroy(); }
    }
  } finally { FIELD_FLAGS.enabled = previous; }
});

test('4242: forced interdiction warns at jump start and the arrival hulls use that same bearing', () => {
  const state = createGameState(4242), bus = createBus(), events = [], spawned = [];
  state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime';
  const target = SECTORS.find(s => s.id === 'sector_kepler_scar');
  state.world.sectors[target.id] = target; state.world.activeSector = { enemies: [] };
  state.playerId = 1; state.entities.set(1, { id: 1, alive: true, pos: { x: 0, z: 0 }, flags: {} });
  state.jump = { state: 'CHARGING', via: 'drive', targetSectorId: target.id, chargeT: 0, chargeNeeded: 1 };
  const owner = Object.create(world); owner.state = state; owner.bus = bus;
  owner._activeDrive = () => DEFAULT_DRIVE; owner._spendFuel = () => {}; owner._interdictChance = () => 1;
  owner._directHostileSpawnIsSafe = () => true; owner._stampHomeSector = () => {};
  owner.helpers = { spawnEntity(spec) { const entity = { id: 100 + spawned.length, ...spec }; spawned.push(entity); events.push('hull'); return entity; } };
  owner.enterSector = sectorId => { state.world.currentSectorId = sectorId; events.push('arrival'); };
  bus.on('jump:interdictionWarning', payload => events.push({ warning: payload }));
  bus.on('jump:start', payload => events.push({ start: payload }));
  owner._tickCharging(1, state);
  assert.equal(spawned.length, 0);
  const warning = state.jump._interdiction;
  assert.ok(Number.isFinite(warning.bearing)); assert.equal(warning.pull, 1);
  assert.equal(events[0].warning.bearing, events[1].start.interdiction.bearing);
  assert.equal(travelVectorReadout(state, state.entities.get(1)).interdiction, warning, 'the flight instrument has the pending bearing');
  owner._tickJumping(10, state);
  assert.ok(spawned.length > 0);
  assert.ok(events.findIndex(e => e.warning) < events.indexOf('hull'));
  for (const hull of spawned) {
    const bearing = Math.atan2(hull.pos.z, hull.pos.x);
    const error = Math.atan2(Math.sin(bearing - warning.bearing), Math.cos(bearing - warning.bearing));
    assert.ok(Math.abs(error) <= 0.21, 'every first-shot hull is inside the warned fan');
  }
  assert.equal(state.jump._interdiction, null);
});

test('4242: all visual keys resolve real sectors, Bolus has its own profile, and the named landmark selects background art', () => {
  for (const [id, profile] of PROFILE_BY_ID) { assert.ok(SECTORS.some(s => s.id === id)); assert.ok(profile); }
  const bolus = resolveSectorVisualProfile({ id: 'sector_the_bolus' });
  assert.equal(bolus.id, 'viscera'); assert.equal(bolus.background.composition.planetChance, 0);
  const recipe = resolveDeepFieldStructureRecipe({ recipeId: 'helios_orbital_void' });
  const ceres = withSectorLandmark(recipe, 'sector_ceres_belt'), tethys = withSectorLandmark(recipe, 'sector_tethys_junction');
  assert.deepEqual(ceres.structures.slice(0, recipe.structures.length), recipe.structures, 'existing authored composition is retained');
  assert.match(ceres.landmarkSource, /Cathedral/); assert.equal(ceres.structures.at(-1).art.kind, 'derelict_hauler');
  assert.match(tethys.landmarkSource, /Trade Hub/); assert.equal(tethys.structures.at(-1).art.kind, 'relay_mast');
  assert.equal(withSectorLandmark(recipe, 'sector_ceres_belt'), ceres, 'one retained recipe per sector/profile');
});
