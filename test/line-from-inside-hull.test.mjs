// A wreck's or a station's obstruction disc is a sparse bounding hull, not solid metal. A target
// mounted inside it was already reachable; a ship parked inside it was not, so every latch (and the
// rover's own line) was refused as "blocked" for as long as the pilot sat near a big derelict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isMasslineObstructed } from '../src/world/asteroidField.js';
import { rockAssay, rockAssayLine } from '../src/ui/asteroid/rockAssay.js';

const body = (id, type, x, z, radius) => ({ id, type, alive: true, pos: { x, z }, radius, physicsBody: { radius } });
const ask = (player, target, obstacles, report = null) => isMasslineObstructed({
  state: { simTime: 0 }, player, target, obstacles, report,
  sourceWorld: { x: player.pos.x, z: player.pos.z }, targetWorld: { x: target.pos.x, z: target.pos.z },
});

test('a line fired from inside a wreck\'s bounds is not a line through the wreck', () => {
  const player = body(1, 'ship', 0, 0, 8);
  const rock = body(2, 'asteroid', 120, 0, 14);
  const derelict = body(3, 'wreck', 30, 10, 90);   // its disc covers the ship
  assert.equal(ask(player, rock, [derelict, rock]), false);
});

test('a hull that really stands between the ship and the rock still blocks, and is named', () => {
  const player = body(1, 'ship', 0, 0, 8);
  const rock = body(2, 'asteroid', 300, 0, 14);
  const derelict = { ...body(3, 'wreck', 150, 0, 40), name: 'MTS Quadrille' };
  const report = {};
  assert.equal(ask(player, rock, [derelict, rock], report), true);
  assert.equal(report.blocker, derelict);
  const station = body(4, 'station', 150, 0, 60);
  assert.equal(ask(player, rock, [station, rock]), true);
});

test('rock stays solid: a ship cannot fire out from inside another asteroid\'s disc', () => {
  const player = body(1, 'ship', 0, 0, 8);
  const rock = body(2, 'asteroid', 200, 0, 14);
  const boulder = body(5, 'asteroid', 10, 0, 40);
  assert.equal(ask(player, rock, [boulder, rock]), true);
});

test('the scan names one material per stratum, the gas pockets, and the beam an ore needs', () => {
  const names = { cmdty_ore_iron: 'Iron Ore', cmdty_ore_copper: 'Copper Ore', cmdty_ore_titanium: 'Titanium Ore' };
  const rock = { id: 659, type: 'asteroid', data: { typeId: 'ast_metallic' } };
  const mk1 = rockAssayLine(rock, { entities: new Map(), player: {} }, (id) => names[id]);
  assert.match(mk1, /^Inside: iron shallow · copper mid \(Mk II\) · titanium deep \(Mk II\) · \d+ gas pockets?$/);
  const mk2 = rockAssayLine(rock, { entities: new Map(), player: { miningBeam: { tierId: 'beam_mk2' } } }, (id) => names[id]);
  assert.doesNotMatch(mk2, /Mk II/, 'a beam that can cut it needs no note');
  assert.equal(rockAssay(rock), rockAssay({ ...rock }), 'one scan per rock, cached');
  assert.equal(rockAssayLine({ id: 1, type: 'ship' }, {}, () => 'x'), null);
  // A rock bored before rock-type interiors keeps the old interior, and the scan reads that one.
  const legacy = rockAssay({ id: 9, type: 'asteroid', data: { typeId: 'ast_metallic', boreSeed: 9 } });
  const fresh = rockAssay({ id: 9, type: 'asteroid', data: { typeId: 'ast_metallic' } });
  assert.notDeepEqual(legacy.strata, fresh.strata);
});
