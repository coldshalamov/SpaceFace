// Original Forge source projected into XZ. Three fixed solids preserve the open fork gap.
export const PALLET_JACK_RADIUS = 20;
export const PALLET_JACK_VISUAL_RADIUS = 20;
export const PALLET_JACK_SOURCE_SCALE = 1;
export const PALLET_JACK_MASS = 100;
const PROXY = {
  "schemaVersion": 1,
  "id": "pallet-jack:forge-source:v1",
  "referenceRadius": "radius",
  "convexParts": [
    {
      "id": "core",
      "points": [
        {
          "x": -0.6999773,
          "z": -0.17968575
        },
        {
          "x": -0.69982685,
          "z": -0.19285425
        },
        {
          "x": -0.6981255,
          "z": -0.19612415
        },
        {
          "x": -0.61966135,
          "z": -0.24969265
        },
        {
          "x": -0.1,
          "z": -0.25
        },
        {
          "x": -0.0022072,
          "z": -0.22050485
        },
        {
          "x": -0.0003004,
          "z": -0.2180942
        },
        {
          "x": -2.965e-05,
          "z": -0.2138075
        },
        {
          "x": -0.00020535,
          "z": 0.2035331
        },
        {
          "x": -0.0002128,
          "z": 0.2142269
        },
        {
          "x": -0.0002275,
          "z": 0.21795435
        },
        {
          "x": -0.0022072,
          "z": 0.22050485
        },
        {
          "x": -0.1,
          "z": 0.25
        },
        {
          "x": -0.61989225,
          "z": 0.2495915
        },
        {
          "x": -0.6981255,
          "z": 0.19612415
        },
        {
          "x": -0.69982685,
          "z": 0.19285425
        },
        {
          "x": -0.69985525,
          "z": 0.13067275
        }
      ]
    },
    {
      "id": "starboard",
      "points": [
        {
          "x": 0.0,
          "z": 0.3027784
        },
        {
          "x": 0.0003724,
          "z": 0.30138975
        },
        {
          "x": 0.00138975,
          "z": 0.3003724
        },
        {
          "x": 0.0027784,
          "z": 0.3
        },
        {
          "x": 0.55,
          "z": 0.3
        },
        {
          "x": 0.59753005,
          "z": 0.323765
        },
        {
          "x": 0.5975304,
          "z": 0.3237652
        },
        {
          "x": 0.598765,
          "z": 0.3247525
        },
        {
          "x": 0.5996691,
          "z": 0.3262153
        },
        {
          "x": 0.6,
          "z": 0.32776105
        },
        {
          "x": 0.6,
          "z": 0.37223895
        },
        {
          "x": 0.5996691,
          "z": 0.3737847
        },
        {
          "x": 0.598765,
          "z": 0.3752475
        },
        {
          "x": 0.5975304,
          "z": 0.3762348
        },
        {
          "x": 0.59753005,
          "z": 0.376235
        },
        {
          "x": 0.55,
          "z": 0.4
        },
        {
          "x": 0.0027784,
          "z": 0.4
        },
        {
          "x": 0.00138975,
          "z": 0.3996276
        },
        {
          "x": 0.0003724,
          "z": 0.39861025
        },
        {
          "x": 0.0,
          "z": 0.3972216
        }
      ]
    },
    {
      "id": "port",
      "points": [
        {
          "x": 0.0,
          "z": -0.3972216
        },
        {
          "x": 0.0003724,
          "z": -0.39861025
        },
        {
          "x": 0.00138975,
          "z": -0.3996276
        },
        {
          "x": 0.0027784,
          "z": -0.4
        },
        {
          "x": 0.55,
          "z": -0.4
        },
        {
          "x": 0.59753005,
          "z": -0.376235
        },
        {
          "x": 0.5975304,
          "z": -0.3762348
        },
        {
          "x": 0.598765,
          "z": -0.3752475
        },
        {
          "x": 0.5996691,
          "z": -0.3737847
        },
        {
          "x": 0.6,
          "z": -0.37223895
        },
        {
          "x": 0.6,
          "z": -0.32776105
        },
        {
          "x": 0.5996691,
          "z": -0.3262153
        },
        {
          "x": 0.598765,
          "z": -0.3247525
        },
        {
          "x": 0.5975304,
          "z": -0.3237652
        },
        {
          "x": 0.59753005,
          "z": -0.323765
        },
        {
          "x": 0.55,
          "z": -0.3
        },
        {
          "x": 0.0027784,
          "z": -0.3
        },
        {
          "x": 0.00138975,
          "z": -0.3003724
        },
        {
          "x": 0.0003724,
          "z": -0.30138975
        },
        {
          "x": 0.0,
          "z": -0.3027784
        }
      ]
    }
  ],
  "primitives": [
    {
      "kind": "obb",
      "id": "core",
      "x": -0.350003475,
      "z": 0.0,
      "hx": 0.349973825,
      "hz": 0.25
    },
    {
      "kind": "obb",
      "id": "starboard",
      "x": 0.3,
      "z": 0.35,
      "hx": 0.3,
      "hz": 0.05
    },
    {
      "kind": "obb",
      "id": "port",
      "x": 0.3,
      "z": -0.35,
      "hx": 0.3,
      "hz": 0.05
    }
  ]
};
export function palletJackCradleSocket() { return { x: 7, z: 0 }; }
export function palletJackPhysicalBody() {
  return { schemaVersion: 1, dynamic: true, mass: PALLET_JACK_MASS, inertiaY: 7829.021102,
    radius: PALLET_JACK_RADIUS, revision: 0, ccd: true, material: 'ship', shape: 'compound',
    collisionProxyManifest: structuredClone(PROXY) };
}
export function isPalletJackEntity(entity) {
  return entity?.type === 'ship' && entity.data?.lootTableId === 'pallet_jack'
    && entity.data.authoredAssetId === 'SF_SHIP_PALLET_JACK';
}
