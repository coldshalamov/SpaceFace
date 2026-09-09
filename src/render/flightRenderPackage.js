// Compiled flight render product. Loadout stays modular at the station;
// playable flight looks up an immutable package by fingerprint. A package is
// metadata for a prepared flat render-package instance; instances are owned by
// the loader, never recursively cloned by this cache, and never mutate the
// published package record.

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

function token(value, seen = new Set()) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => token(item, seen)).join(',')}]`;
  if (typeof value === 'object') {
    if (seen.has(value)) return '[cycle]';
    seen.add(value);
    const result = `{${Object.keys(value).sort().map((key) => `${key}:${token(value[key], seen)}`).join(';')}}`;
    seen.delete(value);
    return result;
  }
  return String(value);
}

function freezeMetadata(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) freezeMetadata(item, seen);
  } else {
    for (const item of Object.values(value)) freezeMetadata(item, seen);
  }
  seen.delete(value);
  try { Object.freeze(value); } catch (_) {}
  return value;
}

function cloneMetadata(value, seen = new Map()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  if (Array.isArray(value)) {
    for (const item of value) copy.push(cloneMetadata(item, seen));
  } else {
    for (const [key, item] of Object.entries(value)) copy[key] = cloneMetadata(item, seen);
  }
  return copy;
}

function immutableMetadata(value) {
  return freezeMetadata(cloneMetadata(value));
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
      const existing = byFingerprint.get(fingerprint);
      if (existing) return existing;
      const record = {
        schema: FLIGHT_RENDER_PACKAGE_SCHEMA,
        fingerprint,
        lanes: immutableMetadata(pkg.lanes || {}),
        sockets: immutableMetadata(pkg.sockets || []),
        bounds: pkg.bounds ? immutableMetadata(pkg.bounds) : null,
        collision: pkg.collision ? immutableMetadata(pkg.collision) : null,
        materialRoles: immutableMetadata(pkg.materialRoles || {}),
        metadata: pkg.metadata ? immutableMetadata(pkg.metadata) : null,
      };
      const frozen = Object.freeze(record);
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
