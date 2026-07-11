import assert from 'node:assert/strict';

import { resolveRequiredWholeShipRecord } from '../src/render/partsLibrary.js';
import { isPlayerKestrel } from '../src/render/visualOverrides.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

const player = makeShipEntitySpec('ship_kestrel', { isPlayer: true, team: 0 });
const courier = makeShipEntitySpec('ship_kestrel', { isPlayer: false, team: 0 });
const validRecord = {
  url: '/assets/ships/release/parts/wholeships/kestrel.glb',
  assetId: 'SF_WHOLESHIP_KESTREL',
};

assert.equal(player.isPlayer, true, 'new/load player construction must preserve the explicit player marker');
assert.equal(courier.isPlayer, false, 'same-team NPC construction must not inherit player identity');
assert.equal(isPlayerKestrel(player), true, 'the player Kestrel should activate the production whole ship');
assert.equal(isPlayerKestrel(courier), false, 'an NPC Kestrel must remain on the modular authored path');
assert.equal(
  resolveRequiredWholeShipRecord(player, [validRecord], { releaseMode: true, requiredWholeShip: true }),
  validRecord,
  'a validated player record should resolve',
);
assert.equal(
  resolveRequiredWholeShipRecord(courier, [validRecord], { releaseMode: true, requiredWholeShip: false }),
  null,
  'an NPC must not request the whole ship even when the record is loaded for the player',
);
assert.throws(
  () => resolveRequiredWholeShipRecord(player, [], { releaseMode: true, requiredWholeShip: true }),
  /did not pass the live authored-asset loader/,
  'a missing player GLB must fail readiness instead of selecting a modular hull',
);
assert.throws(
  () => resolveRequiredWholeShipRecord(player, [{ ...validRecord, assetId: 'CORRUPT_FIXTURE' }], {
    releaseMode: true,
    requiredWholeShip: true,
  }),
  /did not pass the live authored-asset loader/,
  'a contract-invalid player GLB record must fail readiness instead of selecting a modular hull',
);

console.log('Kestrel whole-ship player routing: PASS');
