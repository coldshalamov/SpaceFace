import { readActiveHullLegend } from '../src/ui/orrery/hudAdapter.js';
import { SHIPS } from '../src/data/ships.js';
// ship:nameChanged â€” the ring legend uses the given name, and the class name when that is cleared.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ringLegendText } from '../src/ui/orrery/ringLegend.js';

test('SFQ ship name ring a given name replaces the class on the ring', () => {
  assert.equal(
    ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0', customName: '  Kolyma  ' }),
    'KOLYMA · FIGHTER · TIER 0',
  );
  assert.equal(
    ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0', customName: '   ' }),
    'KESTREL · FIGHTER · TIER 0',
  );
  assert.equal(ringLegendText({ defName: 'Kestrel', classLine: 'fighter · tier 0' }), 'KESTREL · FIGHTER · TIER 0');
  assert.equal(ringLegendText({ defName: '', classLine: '', customName: '' }), 'HULL');
});


test('ring reads the active berth after switch and save replacement, including name removal', () => {
  const [a, b] = SHIPS;
  const player = { data: { defId: a.id } };
  const state = { playerId: 1, entities: new Map([[1, player]]), player: {
    activeShipIndex: 0, ownedShips: [{ defId: a.id, name: 'First hull' }, { defId: b.id, name: 'Second hull' }] } };
  assert.match(ringLegendText(readActiveHullLegend(state)), /FIRST HULL/);
  state.player.activeShipIndex = 1;
  player.data.defId = b.id;
  assert.equal(readActiveHullLegend(state).defName, b.name);
  assert.match(ringLegendText(readActiveHullLegend(state)), /SECOND HULL/);
  state.player = { activeShipIndex: 0, ownedShips: [{ defId: a.id, name: null }] };
  player.data.defId = a.id;
  assert.match(ringLegendText(readActiveHullLegend(state)), new RegExp(a.name.toUpperCase()));
});
