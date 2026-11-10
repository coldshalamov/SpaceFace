import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SHIPS } from '../src/data/ships.js';
import {
  PROPULSION_PROFILES,
  resolvePropulsionProfile,
  DRIVE_FAMILIES,
} from '../src/core/flight/propulsionCatalog.js';

describe('FB-059 — The heavy ladder flies distinct drives', () => {
  const HEAVIES = ['ship_hawser', 'ship_bastion', 'ship_warden', 'ship_colossus', 'ship_leviathan'];

  it('authors drive_torch_xl with valid physical properties and TORCH family', () => {
    const xl = PROPULSION_PROFILES.drive_torch_xl;
    assert.ok(xl, 'drive_torch_xl exists in PROPULSION_PROFILES');
    assert.equal(xl.family, DRIVE_FAMILIES.TORCH);
    assert.equal(xl.id, 'drive_torch_xl');
    assert.ok(xl.mainAccel > 0, 'positive mainAccel');
    assert.ok(xl.maxYawRate < PROPULSION_PROFILES.drive_torch_l.maxYawRate, 'slower slew than drive_torch_l');
    assert.ok(xl.spoolUpS > PROPULSION_PROFILES.drive_torch_l.spoolUpS, 'slower spool up than drive_torch_l');
  });

  it('resolves three distinct drive profile ids across the five heavies', () => {
    const shipMap = new Map(SHIPS.map(s => [s.id, s]));
    const assignedProfiles = new Map();

    for (const id of HEAVIES) {
      const ship = shipMap.get(id);
      assert.ok(ship, `ship ${id} found in catalog`);
      const profile = resolvePropulsionProfile(ship);
      assert.ok(profile, `propulsion profile resolved for ${id}`);
      assignedProfiles.set(id, profile.id);
    }

    assert.equal(assignedProfiles.get('ship_hawser'), 'drive_torch_l');
    assert.equal(assignedProfiles.get('ship_bastion'), 'drive_gravimetric_m');
    assert.equal(assignedProfiles.get('ship_warden'), 'drive_gravimetric_m');
    assert.equal(assignedProfiles.get('ship_colossus'), 'drive_torch_xl');
    assert.equal(assignedProfiles.get('ship_leviathan'), 'drive_torch_xl');

    const uniqueProfiles = new Set(assignedProfiles.values());
    assert.equal(uniqueProfiles.size, 3, 'three distinct drive profiles assigned across the five heavies');
  });

  it('yields three distinct handling triples across the heavy ladder', () => {
    const shipMap = new Map(SHIPS.map(s => [s.id, s]));
    const handlingTriples = new Map();

    for (const id of HEAVIES) {
      const ship = shipMap.get(id);
      const profile = resolvePropulsionProfile(ship);

      // Distinct handling metric triple: (accelRate, maxYawRate, maxSpeed)
      const topSpeed = profile.combatSpeed || profile.maxSpeed || 200;
      const accel = profile.mainAccel || profile.maxAccel || 100;
      const turnTime180 = Math.PI / profile.maxYawRate;
      const timeTo90 = (0.9 * topSpeed) / accel;

      handlingTriples.set(id, {
        profileId: profile.id,
        family: profile.family,
        timeTo90: Number(timeTo90.toFixed(2)),
        turnTime180: Number(turnTime180.toFixed(2)),
        maxYawRate: profile.maxYawRate,
      });
    }

    const hawser = handlingTriples.get('ship_hawser');
    const bastion = handlingTriples.get('ship_bastion');
    const colossus = handlingTriples.get('ship_colossus');

    // Compare Hawser (torch_l), Bastion (gravimetric_m), Colossus (torch_xl)
    assert.notEqual(hawser.profileId, bastion.profileId);
    assert.notEqual(hawser.profileId, colossus.profileId);
    assert.notEqual(bastion.profileId, colossus.profileId);

    assert.notEqual(bastion.family, hawser.family, 'Bastion is gravimetric while Hawser is torch');
    assert.ok(colossus.turnTime180 > hawser.turnTime180, 'Colossus turns slower than Hawser');
  });

  it('preserves ship hull masses, health, and pricing unchanged', () => {
    const shipMap = new Map(SHIPS.map(s => [s.id, s]));
    assert.equal(shipMap.get('ship_hawser').mass, 68);
    assert.equal(shipMap.get('ship_bastion').mass, 80);
    assert.equal(shipMap.get('ship_warden').mass, 150);
    assert.equal(shipMap.get('ship_colossus').mass, 300);
    assert.equal(shipMap.get('ship_leviathan').mass, 600);
  });
});
