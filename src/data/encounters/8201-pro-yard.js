import { deepFreeze, defineEncounter } from './catalog.js';

/** Ordinary Adventure discovery. The yard runtime owns persistent lots, physics and payment;
 * this encounter only introduces the real place and can never award or duplicate a wreck. */
export const encounterOrder = 8201;
export const trigger = deepFreeze({
  id: 'pro_shipbreaking_yard', tier: 'ambient', deck: 'civilian', weight: 1.2,
  zoneTypes: ['mining_belt', 'refinery_approach', 'civilian_core'],
  gates: { sectorIds: ['sector_ceres_belt'] },
  script: 'selfRegistered', pressureCost: 0, cooldownS: 600, proximity: true,
});
export const runtime = Object.freeze({
  fire(d, live) {
    const yard = d.registry?.get?.('shipbreakingYard');
    if (!yard) { d.abort(live, 'yard_owner_unavailable'); return; }
    if (typeof yard.discover !== 'function') { d.abort(live, 'yard_discovery_unavailable'); return; }
    const result = yard.discover({ source: 'encounter', encounterId: live.id });
    if (result === false || result?.ok === false) { d.abort(live, result?.reason || 'yard_not_ready'); return; }
    if (yard.offerCatalog?.() === false) yard.offerDirections?.();
    // Discovery is a receipt, not a timed mission. The persistent yard remains after resolution.
    d.resolve(live, 'discovered', { speak: false });
  },
});
export default defineEncounter(trigger, {
  shape: { situation: 'yard', place: trigger.zoneTypes, twist: 'depth', actor: 'faction_pitborn' },
  title: 'CERES SHIPBREAKERS', factionId: 'faction_pitborn',
  motive: 'Retired hulls supply replacement machinery and scrap to Ceres. The receiving scale pays for the original part and its remaining condition.',
  primaryLine: 'Three hulls on the slips. Inspect before you buy. Bring the useful pieces back whole.',
  verbs: ['inspect', 'latch', 'tow'], choices: [],
  receipts: { discovered: 'Ceres shipbreakers are open. Inspection is free; claims and intact values are posted at each slip.' },
});
