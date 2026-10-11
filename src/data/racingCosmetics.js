// Earned paint uses the normal ship appearance owner and existing authored surfaces.
export const RACING_COSMETICS = Object.freeze([
  Object.freeze({ id: 'factory', name: 'Factory finish', points: 0, appearance: null }),
  Object.freeze({ id: 'copper-current', name: 'Copper Current', points: 3,
    appearance: Object.freeze({ hullColor: '#93472c', accentColor: '#71c8bb', finish: 'satin', wear: 0.12, decalId: 'none' }) }),
  Object.freeze({ id: 'glacier-line', name: 'Glacier Line', points: 9,
    appearance: Object.freeze({ hullColor: '#466982', accentColor: '#dce8dc', finish: 'polished', wear: 0.06, decalId: 'none' }) }),
  Object.freeze({ id: 'solar-crown', name: 'Solar Crown', points: 15,
    appearance: Object.freeze({ hullColor: '#d3c6a0', accentColor: '#b96b28', finish: 'polished', wear: 0.04, decalId: 'none' }) }),
]);
export function racingCosmeticUnlocked(cosmetic, career) {
  return !!cosmetic && (cosmetic.points === 0
    || Object.values(career?.cups || {}).some(cup => cup.finishes > 0 && cup.points >= cosmetic.points));
}
export function racingCosmeticFor(id, career) {
  const cosmetic = RACING_COSMETICS.find(row => row.id === id);
  return racingCosmeticUnlocked(cosmetic, career) ? cosmetic : RACING_COSMETICS[0];
}
