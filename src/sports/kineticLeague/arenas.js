// Four authored venues. Coordinates are arena-local on the XZ plane.
// Nothing here is spawned into the persistent world.

export const ARENAS = Object.freeze({
  yard: Object.freeze({
    id: 'yard',
    name: 'Bracket Yard',
    short: 'YARD',
    leaveRadius: 128,
    respawn: Object.freeze({ x: 0, z: 58 }),
    bounds: Object.freeze({ minX: -86, maxX: 86, minZ: -96, maxZ: 70 }),
    goal: Object.freeze({ axis: 'z', plane: -70, aperture: 20, center: 0, dir: -1 }),
    ball: Object.freeze({ x: 0, z: 26, radius: 4, mass: 10, restitution: 0.7, drag: 0.2, maxSpeed: 170 }),
    ship: Object.freeze({ x: 0, z: 48, radius: 5.2, mass: 46, maxAccel: 92, maxSpeed: 76 }),
    keeper: Object.freeze({ x: 0, z: -50, radius: 6.4, mass: 140, restitution: 0.42 }),
    posts: Object.freeze([
      Object.freeze({ x: -23, z: -70, radius: 4.6 }),
      Object.freeze({ x: 23, z: -70, radius: 4.6 }),
    ]),
    bumpers: Object.freeze([
      Object.freeze({ x: -68, z: -4, radius: 8 }),
      Object.freeze({ x: 68, z: -4, radius: 8 }),
    ]),
  }),
  house: Object.freeze({
    id: 'house',
    name: 'Cushion Hall',
    short: 'HALL',
    leaveRadius: 120,
    respawn: Object.freeze({ x: 0, z: 40 }),
    bounds: Object.freeze({ minX: -70, maxX: 70, minZ: -70, maxZ: 60 }),
    goal: Object.freeze({ axis: 'z', plane: -36, aperture: 12, center: 0, dir: -1 }),
    ball: Object.freeze({ x: 0, z: 16, radius: 3.2, mass: 9, restitution: 0.88, drag: 0.04, maxSpeed: 150 }),
    ship: Object.freeze({ x: 0, z: 32, radius: 4.4, mass: 40, maxAccel: 88, maxSpeed: 70 }),
    rails: Object.freeze({ left: -40, right: 40, south: 28, north: -36, gap: 14 }),
  }),
  slip: Object.freeze({
    id: 'slip',
    name: 'Long Ice',
    short: 'ICE',
    leaveRadius: 140,
    respawn: Object.freeze({ x: 0, z: 36 }),
    bounds: Object.freeze({ minX: -60, maxX: 60, minZ: -100, maxZ: 56 }),
    stone: Object.freeze({ x: 0, z: 18, radius: 4, mass: 16, restitution: 0.62, drag: 13.5, maxSpeed: 80 }),
    ship: Object.freeze({ x: 0, z: 36, radius: 4.8, mass: 42, maxAccel: 70, maxSpeed: 48 }),
    pads: Object.freeze([
      Object.freeze({ id: 'near', x: 0, z: -40, radius: 16 }),
      Object.freeze({ id: 'cheek', x: 24, z: 1, radius: 14 }),
    ]),
    guard: Object.freeze({ x: 12, z: -6, radius: 5.2 }),
    pen: Object.freeze({ x: 0, z: -16, radius: 18, ax: 4, az: 2.5, wx: 0.55, wz: 0.35 }),
  }),
  dock: Object.freeze({
    id: 'dock',
    name: 'Field Dock',
    short: 'DOCK',
    leaveRadius: 132,
    respawn: Object.freeze({ x: 0, z: 46 }),
    bounds: Object.freeze({ minX: -78, maxX: 78, minZ: -88, maxZ: 64 }),
    payload: Object.freeze({ x: 0, z: 18, radius: 3.5, mass: 8, restitution: 0.35, drag: 0.35, maxSpeed: 140 }),
    ship: Object.freeze({ x: 0, z: 36, radius: 5, mass: 44, maxAccel: 86, maxSpeed: 64 }),
    zones: Object.freeze([
      Object.freeze({ id: 'hand-1', x: 0, z: 0, radius: 13 }),
      Object.freeze({ id: 'hand-2', x: 0, z: -30, radius: 12 }),
    ]),
    goal: Object.freeze({ axis: 'z', plane: -58, aperture: 15, center: 0, dir: -1 }),
    charge: Object.freeze({ x: 22, z: -46, radius: 6.5, mass: 90 }),
    magnetBall: Object.freeze({ x: 26, z: 22, radius: 3.4, mass: 8, restitution: 0.45, drag: 0.15, maxSpeed: 120 }),
    pocket: Object.freeze({ x: 30, z: -30, radius: 10 }),
    pillar: Object.freeze({ x: 8, z: 2, radius: 6.5 }),
    well: Object.freeze({ x: -6, z: -2, radius: 72, strength: 340, falloff: 1.15, damping: 0.55 }),
    repulsor: Object.freeze({ x: 18, z: 8, radius: 36, strength: 220, falloff: 1.2, damping: 0.2 }),
  }),
});

export function arenaById(id) {
  return ARENAS[id] || null;
}
