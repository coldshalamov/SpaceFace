// Exact XZ projection of the original Forge COLLISION_SCISSORWAKE_CORE.
// Semantic radius17 remains a query envelope; the open V and blades never become native solids.
export const SCISSORWAKE_RADIUS=17;
export const SCISSORWAKE_SOURCE_SCALE=1;
export const SCISSORWAKE_MASS=28;
const PROXY={
  "schemaVersion": 1,
  "id": "scissorwake:authored-main-core:v1",
  "referenceRadius": "radius",
  "convexParts": [
    {
      "id": "core",
      "points": [
        {
          "x": -0.577662,
          "z": 0.12306064705882352
        },
        {
          "x": -0.5776544705882353,
          "z": -0.12065876470588235
        },
        {
          "x": -0.5776497647058824,
          "z": -0.13235823529411767
        },
        {
          "x": -0.5764803529411765,
          "z": -0.13529917647058823
        },
        {
          "x": -0.4855923529411765,
          "z": -0.14708923529411763
        },
        {
          "x": -0.05645782352941177,
          "z": -0.16736652941176472
        },
        {
          "x": -0.05477664705882353,
          "z": -0.16741976470588235
        },
        {
          "x": 0.02658270588235294,
          "z": -0.16734117647058824
        },
        {
          "x": 0.028461294117647057,
          "z": -0.16701535294117648
        },
        {
          "x": 0.03008888235294118,
          "z": -0.1661054117647059
        },
        {
          "x": 0.03045935294117647,
          "z": -0.16563117647058823
        },
        {
          "x": 0.11674788235294119,
          "z": -0.027437117647058824
        },
        {
          "x": 0.11740488235294118,
          "z": -0.025482764705882354
        },
        {
          "x": 0.11747676470588235,
          "z": -0.024517764705882353
        },
        {
          "x": 0.11756617647058824,
          "z": -0.016602235294117647
        },
        {
          "x": 0.1176285294117647,
          "z": -0.004308705882352941
        },
        {
          "x": 0.11758711764705881,
          "z": 0.01591694117647059
        },
        {
          "x": 0.11747676470588235,
          "z": 0.024517764705882353
        },
        {
          "x": 0.11740488235294118,
          "z": 0.025482764705882354
        },
        {
          "x": 0.11674788235294119,
          "z": 0.027437117647058824
        },
        {
          "x": 0.03009388235294118,
          "z": 0.1665319411764706
        },
        {
          "x": 0.028461294117647057,
          "z": 0.16701535294117648
        },
        {
          "x": 0.026351470588235296,
          "z": 0.16731382352941176
        },
        {
          "x": -0.05477664705882353,
          "z": 0.16741976470588235
        },
        {
          "x": -0.05645805882352941,
          "z": 0.16736652941176472
        },
        {
          "x": -0.4855923529411765,
          "z": 0.14708923529411763
        },
        {
          "x": -0.5764803529411765,
          "z": 0.13529917647058823
        },
        {
          "x": -0.5776491176470588,
          "z": 0.1323599411764706
        }
      ]
    }
  ],
  "primitives": [
    {
      "kind": "obb",
      "id": "core",
      "x": -0.23001673529411767,
      "z": 0.0,
      "hx": 0.34764526470588236,
      "hz": 0.16741976470588235
    }
  ]
};
export function scissorwakePhysicalBody(mass=SCISSORWAKE_MASS){return {schemaVersion:1,dynamic:true,mass,inertiaY:mass*17*17*.5,radius:SCISSORWAKE_RADIUS,revision:0,ccd:true,material:'ship',shape:'compound',collisionProxyManifest:structuredClone(PROXY)};}
export function isScissorwakeEntity(entity){return entity?.type==='ship'&&entity.data?.lootTableId==='scissorwake'&&entity.data.authoredAssetId==='SF_SHIP_SCISSORWAKE';}
