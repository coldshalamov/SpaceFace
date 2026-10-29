// w-270 B7 — arcade arsenal breadth: the named-synthesis shelf grows past the
// spec's 15–20 aim, each new evolution consumes real held parts and lands a
// real module whose mods are all wired in the derived fold (no dead promises).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SHIPS } from '../src/data/ships.js';
import { MODULES } from '../src/data/modules.js';
import { buildSlotList } from '../src/systems/ships.js';
import {
  EVOLUTION_OFFER_KIND,
  SURVIVAL_EVOLUTIONS,
  evolutionOffersFor,
  survivalEvolutionById,
} from '../src/data/survivalEvolutions.js';

const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));

const NEW_EVOLUTIONS = [
  { id: 'snap_whip', defId: 'mod_snap_whip_s', consumes: ['mod_elastic_whip_m', 'mod_winch_hd'] },
  { id: 'battering_ram', defId: 'mod_battering_ram_s', consumes: ['mod_afterburner_m', 'mod_ram_plate'] },
  { id: 'greedy_tractor', defId: 'mod_tractor_beam_s', consumes: ['mod_tractor_beam_m', 'mod_gravity_bumper_s'] },
  { id: 'serrated_sweep', defId: 'mod_serrated_sweep_s', consumes: ['mod_monofilament_sweep_m', 'mod_charge_rack'] },
];

test('w-270: the synthesis shelf meets the authored 15–20 aim', () => {
  assert.ok(SURVIVAL_EVOLUTIONS.length >= 15 && SURVIVAL_EVOLUTIONS.length <= 20,
    `aim was 15–20 named trades, shelf holds ${SURVIVAL_EVOLUTIONS.length}`);
});

test('w-270: each new evolution consumes real parts and lands a real, wired module', () => {
  for (const evo of NEW_EVOLUTIONS) {
    const row = survivalEvolutionById(evo.id);
    assert.ok(row, `${evo.id} is authored`);
    assert.deepEqual(row.consumes.slice().sort(), evo.consumes.slice().sort());
    assert.ok(row.price > 0, 'explicit cost');
    const product = MODULE_BY_ID.get(evo.defId);
    assert.ok(product, `${evo.defId} resolves to a module def`);
    assert.equal(product.slotType, 'utility');
    assert.equal(product.size, 'S', 'the result fits the smallest consumed bay');
    assert.ok(Object.keys(product.mods || {}).length > 0, `${evo.defId} must promise a wired mod`);
  }
});

test('w-270: each new evolution offers exactly when the build holds every part', () => {
  const hawser = SHIP_BY_ID.get('ship_hawser');
  const slots = buildSlotList(hawser);
  for (const evo of NEW_EVOLUTIONS) {
    const held = evolutionOffersFor({
      hullId: 'ship_hawser', slots,
      fittings: ['wpn_pulse_laser_m', null, null, null, null, null, null, null],
      moduleInventory: evo.consumes.map((defId) => ({ instanceId: 1, defId })),
    });
    const offer = held.find((o) => o.id === `evo_${evo.id}`);
    assert.ok(offer, `${evo.id} offers when every part is held`);
    assert.equal(offer.kind, EVOLUTION_OFFER_KIND);
    assert.equal(offer.defId, evo.defId);
    // One part short: no offer at all — the absence is the state.
    const short = evolutionOffersFor({
      hullId: 'ship_hawser', slots,
      fittings: ['wpn_pulse_laser_m', null, null, null, null, null, null, null],
      moduleInventory: evo.consumes.slice(0, 1).map((defId) => ({ instanceId: 1, defId })),
    });
    assert.equal(short.find((o) => o.id === `evo_${evo.id}`), undefined, `${evo.id} stays shut without all parts`);
  }
});
