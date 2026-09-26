import assert from 'node:assert/strict';
import test from 'node:test';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { VESTA_ORE_WINNOW as machine, vestaWinnowPhase } from '../src/data/environmentalMachinery.js';
import { SECTORS } from '../src/data/sectors.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { world } from '../src/systems/world.js';

const point = (x, z = 0) => ({ x: machine.globalPos.x + x, z: machine.globalPos.z + z });
const playerSpec = { hullId: 'ship_kestrel', pos: point(-260), isPlayer: true };

test('winnow gathers then discharges real loose ore and hulls without draining hull', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({ seed: 4242,
    systems: ['actions', 'flightV3', environmentalMachinery, fields, 'physics', terrainAnchors],
    hulls: [playerSpec],
  });
  try {
    host.state.world.currentSectorId = machine.sectorId;
    host.state.simTime = 0;
    const rock = host.spawnObstacle({ pos: point(105), radius: 5, mass: 40, dynamic: true });
    // Same membrane as mining pickups: a loose ore body, no direct position/velocity writes.
    const ore = host.runtime.spawn({ type: 'pickup', pos: point(80, 22), vel: { x: 0, z: 0 },
      radius: 3, mass: 10, collides: true, ttl: Infinity,
      data: { kind: 'ore', commodityId: 'cmdty_crystals', units: 1 },
      physicsBody: { schemaVersion: 1, radius: 3, mass: 10, inertiaY: 8,
        dynamic: true, ccd: true, material: 'cargo', revision: 0 },
    });
    host.step(120);
    host.assertBodies([rock, ore]);
    assert.ok(rock.pos.x < point(95).x, `gather moved rock inward: ${rock.pos.x - machine.globalPos.x}`);
    assert.ok(ore.pos.x < point(70).x, 'loose ore joins the gathering batch');

    const rider = host.spawnShip({ hullId: 'ship_wasp', pos: point(30, -20), team: 1 });
    const hull = rider.hull;
    host.state.simTime = 7;
    host.step(90);
    host.assertBodies([rider]);
    assert.ok(rider.vel.x > 60, `discharge launches a hull: ${rider.vel.x}`);
    assert.ok(rider.pos.x > point(80).x, 'hull travels down the open discharge');
    assert.equal(rider.hull, hull, 'the machine applies force, never a damage aura');
    assert.ok(ore.vel.x > 40, 'the gathered ore is thrown by the same discharge');
    assert.equal(host.proof().backend, 'rapier-dynamic');
    console.log(`Vesta winnow seed=4242 ore discharge=${ore.vel.x.toFixed(1)} WU/s hull=${rider.vel.x.toFixed(1)} WU/s`);
  } finally { host.dispose(); FIELD_FLAGS.enabled = previous; }
});

test('ordinary Vesta sector entry places the winnow at an existing seam, with safe windows and no duplicate banks', async () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const helios = SECTORS.find((row) => row.id === 'sector_helios_prime');
  const sector = SECTORS.find((row) => row.id === machine.sectorId);
  assert.ok(helios.neighbors.includes(sector.id), 'Vesta is directly reachable from the opening sector');
  assert.deepEqual(sector.fields.find((row) => row.id === machine.fieldId).center, machine.localPos);
  const host = await bootRealPath({ seed: 4242,
    systems: ['actions', world, environmentalMachinery, fields, 'physics', terrainAnchors],
    hulls: [playerSpec],
  });
  const worldOwner = host.runtime.getSystem('world');
  const fieldsOwner = host.runtime.getSystem('fields');
  const machineOwner = host.runtime.getSystem('environmentalMachinery');
  try {
    worldOwner.enterSector(machine.sectorId, { noTeleport: true });
    host.state.simTime = 7;
    host.step(1);
    const active = host.state.world.activeSector;
    const banks = () => active.dressing.filter((row) => row.environmentalMachineryId);
    assert.equal(banks().length, 2);
    const anchors = host.state.entityList.filter((entity) => entity.data?.killMachineId === machine.id);
    assert.equal(anchors.length, 2, 'both banks have real Massline-compatible terrain bodies');
    assert.ok(anchors.every((entity) => entity.collides && entity.data.terrainAnchor));
    assert.equal(fieldsOwner.hasExternal(machine.fields[1].id), true);

    host.state.mode = 'docked';
    machineOwner.update(1 / 60, host.state);
    assert.ok(machine.fields.every((field) => !fieldsOwner.hasExternal(field.id)));
    host.state.mode = 'flight';
    host.state.simTime = 5.5;
    host.step(1);
    assert.equal(banks().length, 2, 'undocking keeps the same furniture');
    assert.equal(fieldsOwner._kernel.list().find((field) => field.id === machine.fields[1].id).strength, 0,
      'warning displays the discharge direction without accelerating bodies');
    host.state.simTime = 11;
    host.step(1);
    assert.ok(machine.fields.every((field) => !fieldsOwner.hasExternal(field.id)), 'loading calm is force-free');

    host.bus.emit('save:loaded', {});
    host.state.simTime = 7.5 + 16 * 100;
    host.step(1);
    assert.equal(vestaWinnowPhase(host.state.simTime).phase, 'discharge');
    assert.equal(banks().length, 2, 'restoring retains the same live furniture');
    worldOwner.enterSector('sector_helios_prime', { noTeleport: true });
    machineOwner.update(1 / 60, host.state);
    assert.ok(machine.fields.every((field) => !fieldsOwner.hasExternal(field.id)), 'sector exit retires both phases');
    assert.ok(host.state.world.activeSector.dressing.some((row) => row.placeId === 'place_crusher_module'),
      'starter jaw materializes on the real sector bag, which has no id property');
    const count = host.state.world.activeSector.dressing.length;
    host.state.mode = 'docked';
    machineOwner.update(1 / 60, host.state);
    host.state.mode = 'flight';
    machineOwner.update(1 / 60, host.state);
    assert.equal(host.state.world.activeSector.dressing.length, count, 'starter jaw also survives docking without duplication');
  } finally { host.dispose(); FIELD_FLAGS.enabled = previous; }
});
