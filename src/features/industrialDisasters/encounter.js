import { deepFreeze, defineEncounter } from '../../data/encounters/catalog.js';
import { SITE, SCENARIOS } from './scenarios.js';

export const encounterOrder = 8205;
export const trigger = deepFreeze({
  id: 'pro_industrial_disasters', tier: 'minor', deck: 'civilian', weight: 1.1,
  zoneTypes: ['refinery_approach'], script: 'selfRegistered', pressureCost: 18,
  cooldownS: 1800, proximity: true, fireWithinWu: 750,
  gates: { sectorIds: [SITE.sectorId] },
});

// The director owns discovery and pacing. The feature owns the enduring workplace and all its
// consequences. In particular, the director must never clear its bodies when the invitation ends.
export const runtime = Object.freeze({
  fire(d, live, state) {
    if (state.world?.currentSectorId !== SITE.sectorId) return d.abort(live, 'wrong_sector');
    d.emit('industrialDisasters:discover', {
      siteId: SITE.id, sectorId: SITE.sectorId, anchor: SITE.anchor,
      source: 'encounter', encounterId: live.id,
    });
    // No deadline, timeout choice, reward or spawned actor belongs to this invitation. Declining
    // or inspecting cannot burn a rescue window, and director cleanup cannot erase the aftermath.
    return d.resolve(live, 'signal_received', { speak: false });
  },
  tick() {},
});

export const encounter = defineEncounter(trigger, {
  title: 'HINGE WORKS / DISTRESS CHANNEL',
  shape: { situation: 'distress', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_dmc' },
  factionId: SITE.factionId, context: 'civilian', engagementTrigger: 'none', motive: 'industrial_rescue',
  primaryLine: 'HINGE WORKS: Our loading shift has a problem. Approach the work lights; look before you commit.',
  telegraph: 'Work lights blink beside the refinery approach. A damaged hauler is holding on its last brake.',
  warmAssets: [...new Set([
    `places/${SITE.assetId}.glb`, `places/${SITE.refugeAssetId}.glb`,
    ...Object.values(SCENARIOS).flatMap((scenario) => scenario.bodies.map((body) => `places/${body.assetId}.glb`)),
  ])],
  choices: [], bark: null,
  receipts: { signal_received: 'Hinge Works is on your local channel. Inspect, respond, or fly on.' },
});

export default encounter;
