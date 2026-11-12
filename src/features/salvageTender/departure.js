import { sellableCargoQuantity } from '../../systems/cargo.js';
import { TENDER_CONFIG as C } from './model.js';

/** A departure is a choice, not a full-tank guarantee or a new supply economy. */
export function tenderDeparturePlan(state, row, bodies) {
  const pilot = state.entities.get(state.playerId);
  const fuel = Math.max(0, (state.fuel?.max || 0) - (state.fuel?.current || 0));
  const hull = Math.max(0, (pilot?.hullMax || 0) - (pilot?.hull || 0));
  const armor = Math.max(0, (pilot?.armorMax || 0) - (pilot?.armorHp || 0));
  const need = [
    { id: 'cmdty_fuel_cells', name: 'fuel cells', units: Math.ceil(fuel / C.fuelPerCell) },
    { id: 'cmdty_scrap_metal', name: 'scrap', units: row.stage >= 2 ? Math.ceil((hull + armor) / C.repairPerScrap) : 0 },
  ].map(n => ({ ...n, hold: sellableCargoQuantity(state, n.id) }))
    .map(n => ({ ...n, missing: Math.max(0, n.units - n.hold) }));
  const sources = (row.physical?.recovery || []).flatMap(r => {
    if (r.status === 'lost') return [];
    const e = bodies.find(b => b.data?.worldRecordId === r.id);
    if (!e || e.alive === false || !(e.hull > 0)) return [];
    const lines = need.filter(n => n.missing > 0).flatMap(n => {
      const qty = (e.data?.cargoManifest?.lines || []).filter(l => l.commodityId === n.id)
        .reduce((sum, l) => sum + Math.max(0, l.qty || 0), 0);
      return qty > 0 ? [{ ...n, qty }] : [];
    });
    return lines.length ? [{ sourceId: r.id, bodyId: e.id, generation: e.occupantGeneration,
      name: r.name, lines, pos: { x: e.pos.x, z: e.pos.z } }] : [];
  });
  return { fuel, hull, armor, need, sources };
}
