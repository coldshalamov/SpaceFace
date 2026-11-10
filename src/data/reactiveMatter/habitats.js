// Small working yards on the ordinary Adventure route. The bodies use existing
// authored cargo/place selectors; the player's flight and Massline own all input.
const bodies = Object.freeze([
  Object.freeze({ id: 'crane', modelId: 'anchor_bumper', x: 24, z: 32, anchored: true,
    placeId: 'place_claim_outpost_relay', scanLabel: 'Magnetic sorter · anchored · tow the iron crates clear',
    reactiveMachine: Object.freeze({ strength: 700, fieldRadius: 70, polarity: 1 }) }),
  Object.freeze({ id: 'iron', modelId: 'ferro_crate', x: -16, z: 0,
    scanLabel: 'Iron freight · magnetic · Massline pulls it out of the sorter' }),
  Object.freeze({ id: 'fuel', modelId: 'volatile_canister', x: 78, z: -24,
    scanLabel: 'Volatile fuel · impact or heat ignites it · keep freight clear' }),
  Object.freeze({ id: 'spar', modelId: 'cryo_spar', x: 122, z: 16,
    scanLabel: 'Cold spar · brittle · hard impacts fracture it into towable halves' }),
  Object.freeze({ id: 'spring', modelId: 'elastic_pod', x: 60, z: 70,
    scanLabel: 'Elastic buffer · stores contact work and gives it back' }),
]);
export const REACTIVE_HABITATS = Object.freeze({
  sector_helios_prime: Object.freeze({ x: 1300, z: -900, bodies }),
  sector_ceres_belt: Object.freeze({ x: -1450, z: 1100, bodies }),
  sector_vesta_forge: Object.freeze({ x: 1100, z: 1400, bodies }),
});
export function reactiveHabitatFor(sectorId) { return REACTIVE_HABITATS[sectorId] || null; }
