// Original retained triangular skin, and four source-exact release lips outside that skin.
// Stock leaves the parent mass before its independent native lamp is admitted.
export const MOTHLIGHT_RADIUS = 21;
export const MOTHLIGHT_VISUAL_RADIUS = 21;
export const MOTHLIGHT_SOURCE_SCALE = 1;
export const MOTHLIGHT_LAMP_RADIUS = 1.55;
export const MOTHLIGHT_LAMP_VISUAL_RADIUS = 1.55;
// Measured endpoint of ActualGunChargeCore in the original source, in native/glTF units.
export const MOTHLIGHT_GUN_SOCKET = Object.freeze({x:12.52,y:.30,z:0});
const DRY_MASS = 52;
const DRY_INERTIA_Y = 3059.246037;
const LAMP_INERTIA_Y = 2 * .4 * MOTHLIGHT_LAMP_RADIUS ** 2;
const SOCKETS = [
  {
    "x": -8.0,
    "z": -13.0
  },
  {
    "x": -8.0,
    "z": 13.0
  },
  {
    "x": -3.0,
    "z": -10.4
  },
  {
    "x": -3.0,
    "z": 10.4
  }
];
const PROXY = {
  "schemaVersion": 1,
  "id": "mothlight:forge-source:v1",
  "referenceRadius": "radius",
  "convexParts": [
    {
      "id": "core",
      "points": [
        {
          "x": -0.47619047619,
          "z": -0.568256857143
        },
        {
          "x": -0.475813380952,
          "z": -0.56964452381
        },
        {
          "x": -0.474783142857,
          "z": -0.570269047619
        },
        {
          "x": -0.47337847619,
          "z": -0.56996147619
        },
        {
          "x": 0.616214380952,
          "z": -0.001478190476
        },
        {
          "x": 0.617249190476,
          "z": -0.000541761905
        },
        {
          "x": 0.617249190476,
          "z": 0.000541761905
        },
        {
          "x": 0.616214380952,
          "z": 0.001478190476
        },
        {
          "x": -0.433333333333,
          "z": 0.549068380952
        },
        {
          "x": -0.47337847619,
          "z": 0.56996147619
        },
        {
          "x": -0.474783142857,
          "z": 0.570269047619
        },
        {
          "x": -0.475813380952,
          "z": 0.56964452381
        },
        {
          "x": -0.47619047619,
          "z": 0.568256857143
        }
      ]
    }
  ],
  "primitives": [
    {
      "kind": "obb",
      "id": "core",
      "x": 0.07052935714285713,
      "z": 0.0,
      "hx": 0.5467198333333333,
      "hz": 0.5702690476190476
    }
  ]
};
export function mothlightLampSocket(index) {
  if (!Number.isInteger(index) || index < 0 || index >= SOCKETS.length) throw new RangeError('Mothlight has four original release sockets');
  return { ...SOCKETS[index] };
}
export function mothlightPhysicalBody(stockRemaining = 4, revision = 0) {
  const stock = Number.isFinite(stockRemaining) ? Math.max(0, Math.min(4, Math.floor(stockRemaining))) : 4;
  // Originals are consumed in socket order; each remaining two-unit lamp contributes its real lever arm.
  const inertiaY = SOCKETS.slice(4 - stock).reduce((sum, p) => sum + LAMP_INERTIA_Y + 2 * (p.x * p.x + p.z * p.z), DRY_INERTIA_Y);
  return { schemaVersion: 1, dynamic: true, mass: DRY_MASS + stock * 2, inertiaY,
    radius: MOTHLIGHT_RADIUS, revision, ccd: true, material: 'ship', shape: 'compound',
    collisionProxyManifest: structuredClone(PROXY) };
}
export function mothlightLampPhysicalBody() {
  return { schemaVersion: 1, dynamic: true, mass: 2, inertiaY: LAMP_INERTIA_Y,
    radius: MOTHLIGHT_LAMP_RADIUS, revision: 0, ccd: true, material: 'ship', shape: 'ball' };
}
export function isMothlightTender(entity) {
  return entity?.data?.persistenceOwner === 'mothlight' && typeof entity.data.mothlightKey === 'string'
    && !entity.data.mothlightLampId && entity.data.lootTableId === 'mothlight';
}
export function isMothlightLamp(entity) {
  return entity?.data?.persistenceOwner === 'mothlight' && typeof entity.data.mothlightKey === 'string'
    && /^lamp_[1-4]$/.test(entity.data.mothlightLampId || '');
}
