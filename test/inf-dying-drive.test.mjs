// inf-dying-drive — the engine glow tells you a ship is dying.
//
// The drive already names the maneuver and the faction; the missing word was how close the
// ship is to death. The hull truth the sim owns (e.hull / e.hullMax) now reaches the plume:
// below the fail band the bell cools toward ember, below critical it sputters on its own
// deterministic phase — a crowd never sputters in unison, and no ambient randomness exists.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDyingDrive,
  applyDyingDriveToSlot,
  DRIVE_DYING_INTACT,
  DRIVE_HULL_FAIL_FRAC,
  DRIVE_HULL_CRITICAL_FRAC,
} from '../src/render/thruster/systems/dyingDrive.js';
import { FamilyProductionFleet } from '../src/render/thruster/systems/familyFleet.js';

test('an intact or unknown hull reads intact — the drive keeps its maneuver heat', () => {
  assert.equal(resolveDyingDrive(1), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(0.5), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(DRIVE_HULL_FAIL_FRAC), DRIVE_DYING_INTACT, 'the fail band boundary is intact');
  assert.equal(resolveDyingDrive(NaN), DRIVE_DYING_INTACT, 'no hull fields: set dressing never gutters');
  assert.equal(resolveDyingDrive(undefined), DRIVE_DYING_INTACT);
  assert.equal(resolveDyingDrive(1.4), DRIVE_DYING_INTACT, 'out-of-range hull clamps intact');
});

test('a failing hull gutters progressively; a critical hull sputters hard', () => {
  const failing = resolveDyingDrive(0.3, 0, 0);
  assert.ok(Math.abs(failing.fail - 0.25) < 1e-9, "fail grows linearly down the band");
  assert.ok(failing.cool > 0 && failing.cool < 0.3, 'failing: a cool, not a blackout');
  assert.ok(failing.dim > 0.5, 'failing: the bell still reads');
  const critical = resolveDyingDrive(0.05, 0, 0);
  assert.equal(critical.fail, (DRIVE_HULL_FAIL_FRAC - 0.05) / DRIVE_HULL_FAIL_FRAC);
  assert.ok(critical.cool > failing.cool, 'critical cools harder');
  assert.ok(critical.sputter > failing.sputter, 'critical sputters harder');
  assert.ok(critical.turbulenceAdd > failing.turbulenceAdd, 'a dying bell spits harder');
});

test('the sputter is deterministic per ship and de-phased across a crowd', () => {
  const a = resolveDyingDrive(0.08, 0.31, 0.25);
  const b = resolveDyingDrive(0.08, 0.31, 0.25);
  assert.deepEqual(a, b, 'the same ship phase answers the same way');
  const c = resolveDyingDrive(0.08, 0.31, 0.75);
  assert.notEqual(a.sputter, c.sputter, 'another ship on another phase misses its own beats');
});

test('the slot application leans ember — red outlives blue — and never goes black', () => {
  const dying = resolveDyingDrive(0.04, 0.2, 0.5);
  const slot = { color: [1.0, 0.9, 0.85], turbulence: 0.2 };
  applyDyingDriveToSlot(slot, dying);
  assert.ok(slot.color[0] > slot.color[1] && slot.color[1] > slot.color[2], 'the picture cools toward ember');
  assert.ok(slot.color[0] > 0.15, 'never black');
  assert.ok(slot.turbulence > 0.2, 'turbulence rises');
  const intact = { color: [0.5, 0.5, 0.5], turbulence: 0.1 };
  applyDyingDriveToSlot(intact, DRIVE_DYING_INTACT);
  assert.deepEqual(intact.color, [0.5, 0.5, 0.5], 'an intact answer is a no-op');
  applyDyingDriveToSlot(null, dying); // no slot: no throw
});

test('the fleet record carries the hull truth from the drive read', () => {
  // _makeShipRecord defaults intact; setShipDrive copies the read's hullFrac.
  const holder = { socketsPerShip: 1, _allocCount: 0, families: [null] };
  const ship = FamilyProductionFleet.prototype._makeShipRecord.call(holder);
  assert.equal(ship.hullFrac, 1, 'a ship without a read yet reads intact');
  assert.equal(ship.sputterPhase, 0, 'the sputter clock starts still');
  FamilyProductionFleet.prototype.setShipDrive.call(null, ship, { drive: 1, hullFrac: 0.22 });
  assert.equal(ship.hullFrac, 0.22, 'the dying tell rides the drive signals');
  FamilyProductionFleet.prototype.setShipDrive.call(null, ship, { drive: 1 });
  assert.equal(ship.hullFrac, 1, 'a read without hull fields restores intact');
});
