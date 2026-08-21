// Compiled flight render product. Loadout stays modular at the station;
// playable flight looks up an immutable package by fingerprint.

export const FLIGHT_RENDER_PACKAGE_SCHEMA = 'spaceface.flightRenderPackage.v1';
export const MATERIAL_ABI_VERSION = 1;

const FINGERPRINT_FIELDS = Object.freeze([
  'sourceVersions',
  'hull',
  'cockpit',
  'engines',
  'fins',
  'weapons',
  'pods',
  'paint',
  'damageSchema',
  'lodSchema',
  'materialAbiVersion',
]);

function token(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(token).join(',');
  if (typeof value === 'object') {
    return Object.keys(value).sort().map((key) => `${key}:${token(value[key])}`).join(';');
  }
  return String(value);
}

export function computeLoadoutFingerprint(loadout = {}) {
  const parts = FINGERPRINT_FIELDS.map((field) => {
    const value = field === 'materialAbiVersion'
      ? (loadout.materialAbiVersion == null ? MATERIAL_ABI_VERSION : loadout.materialAbiVersion)
      : loadout[field];
    return `${field}=${token(value)}`;
  });
  return parts.join('|');
}

export function createFlightRenderPackageCache() {
  const byFingerprint = new Map();
  return {
    lookup(fingerprint) {
      if (!fingerprint) return null;
      return byFingerprint.get(fingerprint) || null;
    },
    publish(fingerprint, pkg) {
      if (!fingerprint || !pkg || typeof pkg !== 'object') return null;
      const frozen = Object.freeze({
        schema: FLIGHT_RENDER_PACKAGE_SCHEMA,
        fingerprint,
        lanes: Object.freeze({ ...(pkg.lanes || {}) }),
        sockets: Object.freeze([...(pkg.sockets || [])]),
        bounds: pkg.bounds ? Object.freeze({ ...pkg.bounds }) : null,
        collision: pkg.collision || null,
        materialRoles: Object.freeze({ ...(pkg.materialRoles || {}) }),
      });
      byFingerprint.set(fingerprint, frozen);
      return frozen;
    },
    has(fingerprint) {
      return byFingerprint.has(fingerprint);
    },
    get size() {
      return byFingerprint.size;
    },
    invalidate(fingerprint) {
      return byFingerprint.delete(fingerprint);
    },
  };
}

export function mayCookFlightGeometry(mode) {
  return mode === 'station' || mode === 'loading' || mode === 'hangar';
}
