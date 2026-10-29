// Gold Fortify pilot. Values are prototype calibration seeds; the physical effect is owned by the
// field kernel, while the run wallet, collision solver, and render factory remain their owners.

export const SWARM_FORTIFY_COMMAND = 'swarm:fortifyBuildRequested';
export const SWARM_FORTIFY_REPAIR_COMMAND = 'swarm:fortifyRepairRequested';
export const SWARM_FORTIFY_RELOAD_COMMAND = 'swarm:fortifyReloadRequested';
export const SWARM_FORTIFY_RECEIPT = 'swarm:fortifyBuildResolved';
export const SWARM_FORTIFY_STATE_REQUESTED = 'swarm:fortifyStateRequested';
export const SWARM_FORTIFY_STATE = 'swarm:fortifyState';
export const SWARM_FORTIFY_SCHEMA_VERSION = 1;

export const SWARM_FORTIFY_PHASES = Object.freeze(['draft', 'refit']);
export const SWARM_FORTIFY_MIN_PILOT_GAP = 190;
export const SWARM_FORTIFY_SIEGE_REACH = 1500;

export const SWARM_FORTIFY_SOCKETS = Object.freeze({
  frontNear: Object.freeze({ id: 'front-near', label: 'Front corridor · inner', distance: 280, angle: -Math.PI / 2, corridor: 'front' }),
  frontFar: Object.freeze({ id: 'front-far', label: 'Front corridor · outer', distance: 370, angle: -Math.PI / 2, corridor: 'front' }),
  portNear: Object.freeze({ id: 'port-near', label: 'Port corridor · inner', distance: 280, angle: Math.PI, corridor: 'diagonal_a' }),
  portFar: Object.freeze({ id: 'port-far', label: 'Port corridor · outer', distance: 370, angle: Math.PI, corridor: 'diagonal_a' }),
  starboardNear: Object.freeze({ id: 'starboard-near', label: 'Starboard corridor · inner', distance: 280, angle: 0, corridor: 'diagonal_b' }),
  starboardFar: Object.freeze({ id: 'starboard-far', label: 'Starboard corridor · outer', distance: 370, angle: 0, corridor: 'diagonal_b' }),
});

export const SWARM_FORTIFY_DEVICES = Object.freeze({
  gravity_beacon: Object.freeze({
    id: 'gravity_beacon',
    name: 'Gravity Beacon',
    description: 'A fixed well gathers light attackers and loose ordnance into a readable ring.',
    cost: 80,
    repairCost: 24,
    colliderRadius: 12,
    bodyMass: 500,
    hull: 140,
    field: Object.freeze({ defKey: 'well', radius: 190, strength: 110, damping: 0, falloff: 1.6, maxAffected: 8 }),
  }),
  repulsor_pylon: Object.freeze({
    id: 'repulsor_pylon',
    name: 'Repulsor Pylon',
    description: 'A timed outward pulse breaks a dense push before heat forces it to cool.',
    cost: 120,
    repairCost: 30,
    colliderRadius: 14,
    bodyMass: 650,
    hull: 180,
    field: Object.freeze({ defKey: 'repulsor', radius: 150, strength: 180, damping: 0, falloff: 1.3, maxAffected: 8 }),
    pulse: Object.freeze({ intervalTicks: 90, activeTicks: 18, heatPerPulse: 42, coolingPerTick: 0.22, overloadAt: 100, overloadTicks: 150 }),
  }),
  tesla_pair: Object.freeze({
    id: 'tesla_pair',
    name: 'Tesla Pair',
    description: 'Two linked endpoints arc through the space between them on a bounded cycle.',
    cost: 150,
    repairCost: 36,
    colliderRadius: 8,
    bodyMass: 300,
    hull: 90,
    pairSpan: 100,
    effect: Object.freeze({ intervalTicks: 72, damage: 7, range: 220 }),
  }),
  kinetic_turret: Object.freeze({
    id: 'kinetic_turret',
    name: 'Kinetic Turret',
    description: 'A finite-magazine cannon picks a nearby hostile and spends real rounds.',
    cost: 180,
    repairCost: 42,
    colliderRadius: 16,
    bodyMass: 750,
    hull: 220,
    // Calibration seed: the turret can buy back its finite rounds between waves at a
    // bounded per-round cost; a full magazine has no service charge.
    serviceCostPerRound: 2,
    effect: Object.freeze({ intervalTicks: 30, damage: 8, range: 420, ammo: 32, weaponId: 'wpn_autocannon_s' }),
  }),
});

export function swarmFortifyDevice(deviceId) {
  return Object.prototype.hasOwnProperty.call(SWARM_FORTIFY_DEVICES, deviceId)
    ? SWARM_FORTIFY_DEVICES[deviceId] : null;
}

export function swarmFortifySocket(socketId) {
  return Object.values(SWARM_FORTIFY_SOCKETS).find((socket) => socket.id === socketId) || null;
}

export function swarmFortifyPosition(anchor, socket, rotation = anchor?.rot) {
  const pos = anchor?.pos || anchor;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z) || !socket || !Number.isFinite(rotation)) return null;
  const angle = rotation + socket.angle;
  return {
    x: pos.x + Math.cos(angle) * socket.distance,
    z: pos.z + Math.sin(angle) * socket.distance,
  };
}

// Wave materialization has eight authored bearings. These three defended spokes cover their
// nearest approach corridor; the directly rearward tie alternates to avoid favoring one side.
export function swarmFortifyCorridorForGate(gateGroup, wave = 0) {
  if (gateGroup === 'front' || gateGroup === 'ne' || gateGroup === 'nw') return 'front';
  if (gateGroup === 'diagonal_a' || gateGroup === 'sw') return 'diagonal_a';
  if (gateGroup === 'diagonal_b' || gateGroup === 'se') return 'diagonal_b';
  if (gateGroup === 'rear') return Number.isInteger(wave) && wave % 2 === 0 ? 'diagonal_a' : 'diagonal_b';
  return null;
}
