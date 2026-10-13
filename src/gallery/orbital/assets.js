// Presentation identities for gallery bodies. Sim never loads these meshes.
// Paths are existing Forge release packages (LOD siblings where the pipeline published them).

export const GALLERY_ASSETS = Object.freeze({
  pilot: Object.freeze({
    id: 'kestrel',
    label: 'Hitch',
    lod: Object.freeze([
      'assets/ships/release/render-packages/kestrel/render.glb',
      'assets/ships/release/render-packages/kestrel-lod1/render.glb',
      'assets/ships/release/render-packages/kestrel-lod2/render.glb',
    ]),
  }),
  mass: Object.freeze({
    id: 'towline-debris',
    label: 'Loose mass',
    lod: Object.freeze([
      'assets/ships/release/render-packages/towline-debris/render.glb',
      'assets/ships/release/render-packages/towline-debris-lod1/render.glb',
      'assets/ships/release/render-packages/towline-debris-lod2/render.glb',
    ]),
  }),
  bumper: Object.freeze({
    id: 'helios-rock-a',
    label: 'Rock bumper',
    named: true,
    fracture: Object.freeze({ closingSpeed: 40, into: 'mass' }),
    lod: Object.freeze([
      'assets/ships/release/render-packages/helios-rock-a/render.glb',
    ]),
  }),
  anchor: Object.freeze({
    id: 'helios-rock-b',
    label: 'Anchor rock',
    named: true,
    fracture: Object.freeze({ closingSpeed: 80, into: 'mass' }),
    lod: Object.freeze([
      'assets/ships/release/render-packages/helios-rock-b/render.glb',
    ]),
  }),
  traffic: Object.freeze({
    id: 'welding-drone',
    label: 'Lane drone',
    named: true,
    fracture: Object.freeze({ closingSpeed: 36, into: 'mass' }),
    lod: Object.freeze([
      'assets/ships/release/render-packages/welding-drone/render.glb',
    ]),
  }),
  survivor: Object.freeze({
    id: 'tally-three',
    label: 'Survivor pod',
    named: true,
    fracture: Object.freeze({ closingSpeed: 48, into: 'mass' }),
    lod: Object.freeze([
      'assets/ships/release/render-packages/tally-three/render.glb',
    ]),
  }),
});

export function assetForKind(kind) {
  return GALLERY_ASSETS[kind] || GALLERY_ASSETS.mass;
}
