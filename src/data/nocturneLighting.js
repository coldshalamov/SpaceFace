// NOCTURNE authoring data. These are scene-linear lighting values, not simulation state.
// Hex colours are sRGB input converted once by THREE.Color. Distances are world units.
// Point/spot intensities use Three's inverse-square convention (candela-like game units).
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export const NOCTURNE_AUTHORING_VERSION = 1;
// Existing visualFactory asteroid definitions with authored bright mineral/ice emission.
export const NOCTURNE_LUMINOUS_ASTEROID_TYPES = freeze(['ast_metallic', 'ast_icy', 'ast_crystalline', 'ast_rare_exotic']);
export const NOCTURNE_CONTENT_LIMITS = freeze({
  maxOwners: 32, maxSources: 128, maxLightsPerOwner: 8, maxMedia: 4, maxProbes: 4,
  censusSeconds: 0.25, reach: 1050, minimumFixtureRadius: 8,
});

const light = (type, color, intensity, range, priority, extra = {}) => ({
  type, color, intensity, range, decay: 2, priority, importance: 1, ...extra,
});
export const NOCTURNE_LIGHT_PROFILES = freeze({
  sodium: light('spot', 0xffb45e, 6400, 250, 2, { angle: 0.65, penumbra: 0.55, shadow: true }),
  work_cyan: light('point', 0x75c8ff, 2100, 150, 2),
  furnace: light('area', 0xff702b, 8500, 210, 2, { angle: 1.05, penumbra: 0.85 }),
  dock: light('spot', 0xffce87, 4800, 220, 2, { angle: 0.72, penumbra: 0.6, shadow: true }),
  gate: light('point', 0x9c83ff, 3800, 220, 2),
  gate_cyan: light('point', 0x61e5ff, 2800, 175, 2),
  research: light('spot', 0x85d5ff, 4600, 190, 2, { angle: 0.5, penumbra: 0.5, shadow: true }),
  security: light('spot', 0xff5b69, 4200, 200, 2, { angle: 0.5, penumbra: 0.45, shadow: true }),
  emergency: light('point', 0xff3349, 1800, 100, 2, { rhythm: 'emergency' }),
  reactor: light('point', 0x70e4ff, 5200, 165, 2, { response: 'heat' }),
  ore: light('point', 0x61ffb0, 1100, 80, 1),
  biology: light('point', 0x9fff53, 2400, 135, 2, { response: 'growth', rhythm: 'breath' }),
  biology_violet: light('point', 0xb170ff, 1400, 100, 1, { response: 'growth', rhythm: 'breath' }),
  engine: light('point', 0x57cfff, 1800, 90, 1, { response: 'thrust' }),
  nav_port: light('point', 0xff4057, 180, 28, 0, { rhythm: 'navigation' }),
  nav_starboard: light('point', 0x57ffad, 180, 28, 0, { rhythm: 'navigation', phase: 0.5 }),
  welding: light('point', 0xb5dfff, 4500, 120, 3),
  electrical_arc: light('point', 0xa5bbff, 3500, 100, 3),
});

const fixture = (id, profile, offset, aim = null, extra = {}) => ({ id, profile, offset, aim, ...extra });
// Fallback offsets are fractions of the entity's physical radius. Authored sockets take priority.
// No generated beam or bulb mesh is attached: each lamp must illuminate existing real geometry.
export const NOCTURNE_LAYOUTS = freeze({
  industrial: [
    fixture('gantry', 'sodium', [-0.65, 0.85, -0.35], [0.45, -0.05, 0.25], { sockets: ['SOCKET_Light_Gantry', 'SOCKET_Light_Key'] }),
    fixture('process', 'furnace', [0.45, 0.2, 0.45], [-0.2, 0, 0.1], { sockets: ['SOCKET_Light_Furnace', 'SOCKET_Reactor'], response: 'process' }),
    fixture('work', 'work_cyan', [-0.25, 0.3, 0.65], null, { sockets: ['SOCKET_Light_Work'] }),
  ],
  dock: [
    fixture('approach', 'dock', [0.65, 0.6, -0.2], [1.5, -0.1, 0.15], { sockets: ['SOCKET_Light_Approach', 'SOCKET_Light_Key'] }),
    fixture('service', 'work_cyan', [-0.5, 0.3, 0.5], null, { sockets: ['SOCKET_Light_Service'] }),
  ],
  research: [
    fixture('examination', 'research', [-0.4, 0.8, -0.3], [0.4, 0, 0.1], { sockets: ['SOCKET_Light_Key'] }),
    fixture('service', 'work_cyan', [0.45, 0.15, 0.4], null, { sockets: ['SOCKET_Light_Service'] }),
  ],
  security: [
    fixture('search', 'security', [-0.4, 0.8, -0.3], [0.7, 0, 0.1], { sockets: ['SOCKET_Light_Key'] }),
    fixture('service', 'work_cyan', [0.4, 0.2, 0.5]),
  ],
  gate: [fixture('collar', 'gate', [0, 0.55, -0.6]), fixture('return', 'gate_cyan', [0, 0.4, 0.6])],
  derelict: [
    fixture('warning_fore', 'emergency', [0.6, 0.25, -0.3], null, { sockets: ['SOCKET_Light_Emergency', 'HOOK_NAV_PORT'], condition: 'emergency' }),
    fixture('warning_aft', 'emergency', [-0.65, 0.2, 0.3], null, { phase: 0.55, condition: 'emergency' }),
    fixture('core', 'reactor', [-0.1, 0.3, 0], null, { sockets: ['SOCKET_Reactor', 'HOOK_DRIVE_CORE'], condition: 'reactor' }),
  ],
  alien: [
    fixture('root', 'biology', [0.15, 0.15, 0.15], null, { sockets: ['SOCKET_Bioluminescence'] }),
    fixture('crown', 'biology_violet', [-0.45, 0.65, -0.3], null, { phase: 0.6 }),
  ],
  ore: [fixture('vein', 'ore', [0.1, 0.6, 0.1])],
  core: [fixture('core', 'reactor', [0, 0, 0], null, { response: 'cooling', intensity: 2400, range: 100 })],
  ship: [
    fixture('drive', 'engine', [-0.85, 0.1, 0], null, { sockets: ['SOCKET_Engine', 'HOOK_DRIVE_CORE'] }),
    fixture('port', 'nav_port', [0.1, 0.2, -0.55], null, { sockets: ['HOOK_NAV_PORT', 'SOCKET_Nav_Port'] }),
    fixture('starboard', 'nav_starboard', [0.1, 0.2, 0.55], null, { sockets: ['HOOK_NAV_STARBOARD', 'SOCKET_Nav_Starboard'] }),
  ],
});

export const NOCTURNE_COMPOSITIONS = freeze({
  vacuum: { id: 'vacuum', exposure: 1, exposureRange: [0.85, 1.05], medium: null, probe: null },
  industrial: {
    id: 'industrial', exposure: 0.9, exposureRange: [0.72, 1.0],
    medium: { radii: [1.65, 0.7, 1.3], density: 0.0018, color: 0xc4b296, anisotropy: 0.38, extinction: 1, noise: 0.35 },
    probe: { radii: [1.6, 0.8, 1.4], color: 0xff9e51, ambient: 0x304766, direction: [-0.4, 0.8, -0.3], intensity: 0.13, specular: 0.24, sharpness: 14 },
  },
  derelict: {
    id: 'derelict', exposure: 0.82, exposureRange: [0.68, 0.9],
    medium: { radii: [1.5, 0.5, 0.8], density: 0.0022, color: 0x8d9aab, anisotropy: 0.25, extinction: 1, noise: 0.5 },
    probe: { radii: [1.2, 0.6, 0.75], color: 0xff4354, ambient: 0x1b2638, direction: [0.7, 0.35, -0.3], intensity: 0.06, specular: 0.12, sharpness: 22 },
  },
  combat: {
    id: 'combat', exposure: 0.94, exposureRange: [0.8, 1.04], medium: null, probe: null,
    // Moving ships supply narrow bow cones, aft drive pools and coloured port/starboard points.
    // Weapon and explosion event emission is budgeted by the same director, never an arena fill.
  },
  alien: {
    id: 'alien', exposure: 0.88, exposureRange: [0.72, 0.96],
    medium: { radii: [1.6, 1.1, 1.6], density: 0.0015, color: 0x91ab76, anisotropy: 0.45, extinction: 1, noise: 0.65 },
    probe: { radii: [1.6, 1.2, 1.6], color: 0x8dff57, ambient: 0x372346, direction: [0.1, -0.85, 0.35], intensity: 0.10, specular: 0.18, sharpness: 7 },
  },
});

export const NOCTURNE_PROFILE_ALIASES = freeze({
  refinery: 'industrial', foundry: 'industrial', shipyard: 'industrial', factory: 'industrial',
  dock: 'dock', warning: 'derelict', reactor: 'derelict', research: 'research',
  security: 'security', gate: 'gate', ore: 'ore', biology: 'alien',
});
