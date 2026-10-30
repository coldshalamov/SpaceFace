// Authored local geometry; integration supplies one global XZ origin. No universe scheduler.
export const VERSION = 1;
export const EPISODE = 'wayfarer_house';
export const ROLES = Object.freeze(['tug', 'hearth', 'clinic', 'garden']);
export const PODS = Object.freeze([
  { id: 'hearth', name: 'Hearth', civilian: 'mara', mass: 28, radius: 17, hull: 420,
    offset: { x: -65, z: 0 }, service: 'refuge', need: 'cmdty_ice_water', quantity: 4 },
  { id: 'clinic', name: 'Blue Room', civilian: 'ivo', mass: 22, radius: 14, hull: 340,
    offset: { x: -125, z: 0 }, service: 'triage', need: 'cmdty_medical', quantity: 2 },
  { id: 'garden', name: 'Last Orchard', civilian: 'sen', mass: 32, radius: 20, hull: 380,
    offset: { x: -195, z: 0 }, service: 'seed_exchange', need: 'cmdty_ice_water', quantity: 3 },
]);
export const CIVILIANS = Object.freeze({
  mara: { name: 'Mara Quill', job: 'House steward', pod: 'hearth',
    need: 'Four units of water keep the communal galley open.',
    greeting: 'Thirty beds. One engine. Keep us pointed somewhere kind.',
    supplied: 'Kettles on. That makes us a house again.',
    loss: 'Count the living first. We can grieve while we move.' },
  ivo: { name: 'Ivo Renn', job: 'Medic', pod: 'clinic',
    need: 'Two units of medicine preserve the destination triage service.',
    greeting: 'Patients are strapped in. Brake before the bend, please.',
    supplied: 'Enough for the crossing. Nobody gets called expendable.',
    loss: 'The clinic is gone. I can still tell you where to find help.' },
  sen: { name: 'Sen Vale', job: 'Grower and winch mechanic', pod: 'garden',
    need: 'Three units of water and a recovered garden preserve the seed exchange.',
    greeting: 'The orchard is heavier than it looks. So is everybody’s future.',
    separation: 'Garden coupling let go. Bring the tow eye beside Blue Room. Slowly.',
    recovered: 'Roots intact. Your flying needs pruning, but the roots are intact.',
    supplied: 'Three units. I can make that last.',
    loss: 'Save the house. Seeds are not a reason to kill more people.' },
});
// Five real travel legs, approximately 620 s at the authored 18 wu/s, plus preparation,
// bend hold, recovery and final mooring. Minimum holds never substitute for spatial arrival.
export const ROUTE = Object.freeze([
  { id: 'departure', label: 'Departure apron', x: 1100, z: 0, minS: 75 },
  { id: 'lee', label: 'Lee of the broken carrier', x: 3000, z: 600, minS: 100 },
  { id: 'throat', label: 'Needle throat — slow before the bend', x: 4700, z: -250, minS: 100 },
  { id: 'shelter', label: 'Shelter pocket', x: 6600, z: 500, minS: 110 },
  { id: 'fork', label: 'The two harbours', x: 8300, z: 0, minS: 100 },
]);
export const DESTINATIONS = Object.freeze({
  commons: { name: 'Menders’ Common', x: 10000, z: 950, factionId: 'faction_free', rep: 18,
    consequence: 'An open civilian refuge; clinic and seed exchange serve independent travellers.' },
  compact: { name: 'Concord Shelter', x: 10000, z: -950, factionId: 'faction_scn', rep: 18,
    consequence: 'A protected relief berth; clinic and seed exchange support Concord relief traffic.' },
});
export const LIMITS = Object.freeze({ maxStepS: 0.25, recoverS: 8, berthS: 12,
  range: 240, playerRange: 1600, supplyRange: 180, captureRange: 115,
  relativeSpeed: 6, speed: 18, rewardPerPod: 180, participationS: 60 });
export const at = (origin, point) => ({ x: origin.x + point.x, z: origin.z + point.z });
