import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { ships, buildSlotList, makeShipEntitySpec } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';
import { hullSwitchCargoGuidance } from '../src/ui/station/screens/shipworks.js';

test('activation describes actual parked, reserved and incoming cargo before the real switch', () => {
  const sim = createSimulation({ seed: 4242, systems: [cargo, ships] });
  try {
    const { state, bus } = sim;
    const player = sim.spawn({ ...makeShipEntitySpec('ship_kestrel'), isPlayer: true });
    state.playerId = player.id;
    state.mode = 'flight';
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    const make = (id, name) => ({ defId: id, name,
      fittings: Array(buildSlotList(SHIPS.find((ship) => ship.id === id)).length).fill(null) });
    state.player.ownedShips = [make('ship_kestrel', 'Hitch'), make('ship_pelican', 'Pelican')];
    state.player.activeShipIndex = 0;
    sim.registry.get('ships').recomputeEntity(player.id, state.player.ownedShips[0].fittings);
    assert.equal(hullSwitchCargoGuidance(state, 0), '');
    assert.match(hullSwitchCargoGuidance(state, 1), /No unreserved cargo stays on Hitch.*Pelican has no stored cargo/);
    assert.equal(addCargo(state, 'cmdty_ore_iron', 10), 10);
    state.missions.active.push({ id: 'sealed-delivery', status: 'active', preloadedCargo: true,
      params: { cmdtyId: 'cmdty_ore_iron', qty: 4 } });
    state.player.ownedShips[1].cargo = { items: { cmdty_silicate: 2 }, usedVolume: 2, usedMass: 1.2 };
    const guidance = hullSwitchCargoGuidance(state, 1);
    assert.match(guidance, /6 unreserved units stay on Hitch/);
    assert.match(guidance, /4 sealed or protected units must fit in Pelican to travel with you/);
    assert.match(guidance, /Pelican has 2 stored units; it loads what fits and keeps the rest aboard/);
    bus.emit('ui:setActiveShip', { index: 1 });
    assert.equal(state.player.activeShipIndex, 1);
    assert.equal(state.player.ownedShips[0].cargo.items.cmdty_ore_iron, 6);
    assert.equal(state.player.cargo.items.cmdty_ore_iron, 4);
    assert.equal(state.player.cargo.items.cmdty_silicate, 2);
  } finally { sim.dispose(); }
});
