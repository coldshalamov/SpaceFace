// Fixed cohort: ten bodies, nine growth links. No procedural entity growth.
export const SITE = Object.freeze({ id: 'glassreef_garden', version: 1,
  missionId: 'mission_glassreef_garden', radius: 110, interactionRange: 14,
  maxBodies: 10, maxEdges: 9, maxStep: 0.1, harvestPerPod: 180,
  restoreGrant: 420, rescueGrant: 90, emergencyGrant: 45 });
export const PARTS = Object.freeze([
  { id: 'machine', kind: 'machine', x: 0, z: 0, radius: 8, mass: 800, color: '#39677b' },
  { id: 'collar', kind: 'growth', x: 20, z: 0, radius: 5, mass: 32, color: '#45d6cf' },
  { id: 'bough_a', kind: 'growth', x: 34, z: -17, radius: 4, mass: 18, color: '#5ce7d0' },
  { id: 'bough_b', kind: 'growth', x: 34, z: 17, radius: 4, mass: 18, color: '#75c5f7' },
  { id: 'pod_a', kind: 'pod', x: 49, z: -25, radius: 3, mass: 6, color: '#a4f8af' },
  { id: 'pod_b', kind: 'pod', x: 49, z: -9, radius: 3, mass: 6, color: '#a4f8af' },
  { id: 'pod_c', kind: 'pod', x: 49, z: 25, radius: 3, mass: 6, color: '#a4f8af' },
  { id: 'waste_a', kind: 'waste', x: 49, z: 9, radius: 3, mass: 10, color: '#efa74d' },
  { id: 'waste_b', kind: 'waste', x: 20, z: 18, radius: 3, mass: 10, color: '#efa74d' },
  { id: 'worker', kind: 'worker', x: -13, z: 0, radius: 2, mass: 3, color: '#f8d987' },
].map(Object.freeze));
// Each child owns exactly one ordinary tether_standard attachment. The physics owner
// supplies constraints, tension and collision response; this graph never integrates motion.
export const LINKS = Object.freeze([
  ['collar', 'machine'], ['bough_a', 'collar'], ['bough_b', 'collar'],
  ['pod_a', 'bough_a'], ['pod_b', 'bough_a'], ['pod_c', 'bough_b'],
  ['waste_a', 'bough_b'], ['waste_b', 'collar'], ['worker', 'machine'],
].map(([child, parent], i) => Object.freeze({ id: `growth_${i}`, child, parent })));
export const ZONES = Object.freeze({
  harvest: Object.freeze({ x: -34, z: -30, radius: 11 }),
  nursery: Object.freeze({ x: -34, z: 30, radius: 11 }),
  waste: Object.freeze({ x: 45, z: 55, radius: 12 }),
});
export const MISSION = Object.freeze({
  id: SITE.missionId, title: 'The Garden Still Has a Shift',
  giver: 'Iona Vale — nursery rigger',
  opening: 'The machinery stopped. The garden did not. Read the white ribs before you pull.',
  stages: Object.freeze([
    'Inspect the collar and identify seed pods and amber waste.',
    'Unload or break the collar; free Iona from the stranded work cradle.',
    'Detach seed pods. Move amber waste to the isolation cage, slowly.',
    'Choose: place viable pods in the sale cradle, or return two to the nursery bed.',
    'Ask Iona to sign the finite recovery receipt.',
  ]),
});
