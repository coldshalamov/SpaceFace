# Provenance — runtime environment light

`industrial_workshop_foundry_2k.hdr` is a Poly Haven CC0 HDRI, promoted from
`assets/reference/cc0/polyhaven/industrial_workshop_foundry/` (recorded in
`assets/reference/cc0/PROVENANCE.md`, retrieved 2026-09-22).

- Source: https://polyhaven.com/a/industrial_workshop_foundry (CC0)
- Runtime role: image-based light only — `scene.environment` input. The visible
  sky stays the sector deep-sky plate; this HDRI is never drawn as a background.
- Consumed by `src/render/foundryEnvironment.js` → `renderer.js` `_bakeEnv`.
