// Authored facts only. Placement and admission belong to the world owner.
export const SCHEMA = 'spaceface.ionaVey.v1';
export const TUG_KEY = 'iona_vey_tug';
export const OWNER = 'ionaVeyRival';
export const LIMITS = Object.freeze({ bodies: 5, appearances: 3, hailRange: 600,
  claimRadius: 150, receiverRadius: 70, settleSpeed: 8, settleS: 2, graceS: 30 });
export const TUG = Object.freeze({ key: TUG_KEY, name: 'Iona Vey · Fair Measure',
  shipDefId: 'ship_hawser', factionId: 'faction_free', speed: 28 });
export const APPEARANCES = Object.freeze([
  Object.freeze({ id: 'disputed_claim', title: 'The painted line',
    opening: 'Iona Vey, Fair Measure. My stake covers the marked frame, not the whole field. Give me thirty seconds, or hail me for a joint recovery.',
    bodies: Object.freeze([
      Object.freeze({ id: 'frame', label: 'Vey’s staked pump frame', claimed: true,
        mass: 180, radius: 9, hull: 120, offset: { x: 0, z: 0 }, pool: { cmdty_scrap_metal: 6 } }),
    ]) }),
  Object.freeze({ id: 'competitive_recovery', title: 'Two loads, one lane',
    opening: 'Heavy frame is staked; electronics are open salvage. We can race clean, or split the lift: I tow the frame, you bring the electronics inside the receiver ring. No fee, no gun clause.',
    bodies: Object.freeze([
      Object.freeze({ id: 'frame', label: 'Vey’s heavy drive frame', claimed: true,
        mass: 240, radius: 10, hull: 160, offset: { x: 0, z: 0 }, pool: { cmdty_scrap_metal: 8 } }),
      Object.freeze({ id: 'electronics', label: 'Open salvage · electronics rack', claimed: false,
        mass: 65, radius: 7, hull: 90, offset: { x: 100, z: 90 }, pool: { cmdty_salvage_electronics: 4 } }),
    ]) }),
  Object.freeze({ id: 'earned_terms', title: 'A measure of trust',
    opening: 'Same tug. Same rules. The frame is mine; the rack is yours to recover. What happened on the last two lifts sets our terms.',
    bodies: Object.freeze([
      Object.freeze({ id: 'frame', label: 'Vey’s final contract frame', claimed: true,
        mass: 220, radius: 10, hull: 150, offset: { x: 0, z: 0 }, pool: { cmdty_scrap_metal: 7 } }),
      Object.freeze({ id: 'electronics', label: 'Open salvage · sealed instrument rack', claimed: false,
        mass: 80, radius: 7, hull: 100, offset: { x: 110, z: -90 }, pool: { cmdty_salvage_electronics: 3 } }),
    ]) }),
]);
export const bodyKey = (appearance, id) => `iona_vey_${appearance}_${id}`;
