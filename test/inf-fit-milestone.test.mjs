// inf-fit-milestone — the Shipworks receipt names the capability a fit just unlocked.
//
// The fit flow said "FIT COMMITTED · LOADOUT RECALCULATED" whatever the fit did: a pilot who
// bolts on their first cargo scoop, cloak or drone bay watched a mechanical line scroll past
// while the hull quietly learned a new verb. The capability vocabulary already exists
// (shipBandModels.capabilityDefinitions — "Scoop cargo without stopping", "Read quieter than you
// are"), so the milestone is a pure diff over it: Shipworks stamps the viewed hull's capability
// ids before the fit intent dispatches (UI scratch, one slot, TTL-bounded, never saved), and the
// station's module:equipped receipt consumes the stamp once and names the verb the fit added.
// A fit that teaches nothing keeps the old line; a stale or mismatched stamp never attaches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FIT_CAPABILITY_EXPECTATION_KEY,
  consumeFitCapabilityMilestone,
  stampFitCapabilityExpectation,
} from '../src/ui/ship/capabilityMilestone.js';

const STARTER = ['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_liner_s', 'mod_drill_amp'];

function stateWith(fittings, simTime = 100) {
  return {
    simTime,
    playerId: 'player',
    ui: {},
    player: {
      activeShipIndex: 0,
      ownedShips: [{ defId: 'ship_kestrel', fittings: fittings.slice() }],
    },
  };
}

test('the first scoop names the verb it teaches, once', () => {
  const state = stateWith(STARTER);
  const slot = STARTER.length; // the free utility slot the scoop lands in
  stampFitCapabilityExpectation(state, {
    hullDefId: 'ship_kestrel', slotIndex: slot, fittings: STARTER, player: state.player,
  });
  assert.ok(state.ui[FIT_CAPABILITY_EXPECTATION_KEY], 'the pre-fit stamp rides UI scratch');
  // The ships owner commits the fit, then emits module:equipped.
  state.player.ownedShips[0].fittings[slot] = 'mod_scoop_ring_s';
  const gained = consumeFitCapabilityMilestone(state, { shipId: 'player', slotIndex: slot, defId: 'mod_scoop_ring_s' });
  assert.ok(gained, 'the fit taught the hull a verb');
  assert.equal(gained.id, 'magnet');
  assert.equal(gained.verb, 'Scoop cargo without stopping');
  assert.equal(state.ui[FIT_CAPABILITY_EXPECTATION_KEY], null, 'the stamp is consumed exactly once');
  assert.equal(consumeFitCapabilityMilestone(state, { shipId: 'player', slotIndex: slot, defId: 'mod_scoop_ring_s' }), null,
    'a second receipt has nothing to name');
});

test('a fit that teaches nothing keeps the old line; stale and mismatched stamps never attach', () => {
  // Swapping the pulse laser for itself teaches nothing new.
  const same = stateWith(STARTER);
  stampFitCapabilityExpectation(same, { hullDefId: 'ship_kestrel', slotIndex: 0, fittings: STARTER, player: same.player });
  assert.equal(consumeFitCapabilityMilestone(same, { shipId: 'player', slotIndex: 0, defId: STARTER[0] }), null);

  // A stamp older than the TTL is dead.
  const stale = stateWith(STARTER, 100);
  stampFitCapabilityExpectation(stale, { hullDefId: 'ship_kestrel', slotIndex: 5, fittings: STARTER, player: stale.player });
  stale.simTime = 200;
  stale.player.ownedShips[0].fittings[5] = 'mod_scoop_ring_s';
  assert.equal(consumeFitCapabilityMilestone(stale, { shipId: 'player', slotIndex: 5, defId: 'mod_scoop_ring_s' }), null);

  // A receipt for a different slot cannot borrow the stamp.
  const other = stateWith(STARTER);
  stampFitCapabilityExpectation(other, { hullDefId: 'ship_kestrel', slotIndex: 5, fittings: STARTER, player: other.player });
  other.player.ownedShips[0].fittings[5] = 'mod_scoop_ring_s';
  assert.equal(consumeFitCapabilityMilestone(other, { shipId: 'player', slotIndex: 2, defId: 'mod_scoop_ring_s' }), null);
  assert.equal(other.ui[FIT_CAPABILITY_EXPECTATION_KEY], null, 'the mismatched stamp is still spent');

  // Junk input fails closed.
  assert.equal(stampFitCapabilityExpectation(null, { hullDefId: 'ship_kestrel', slotIndex: 1 }), null);
  assert.equal(stampFitCapabilityExpectation({}, { hullDefId: '', slotIndex: 1 }), null);
  assert.equal(consumeFitCapabilityMilestone({}, {}), null);
});

test('both ends of the wire: Shipworks stamps before the fit, the receipt names the verb', () => {
  const shipworks = readFileSync(new URL('../src/ui/station/screens/shipworks.js', import.meta.url), 'utf8');
  const emit = shipworks.slice(shipworks.indexOf('function emitFitIntent('));
  assert.ok(emit.indexOf('stampFitCapabilityExpectation(') > -1
    && emit.indexOf('stampFitCapabilityExpectation(') < emit.indexOf("ctx.bus.emit(eventName"),
    'the stamp is taken before the fit intent is emitted');
  const app = readFileSync(new URL('../src/ui/station/stationApp.js', import.meta.url), 'utf8');
  assert.match(app, /subscribe\('module:equipped', \(p = \{\}\) => \{\s*const gained = consumeFitCapabilityMilestone\(state\(\), p\);/,
    'the receipt consumes the stamp on the authoritative equip event');
  assert.match(app, /'LOADOUT RECALCULATED'/, 'a fit that teaches nothing keeps the old line');
});
