# Provenance — runtime environment light

## deep_space_2k (default IBL source, 2026-09-30)

`deep_space_2k.hdr` is authored in-repo by `scripts/generate-space-ibl.mjs` — a deterministic
deep-space environment (deep-space floor, galactic band with star glints, warm sun lobe, cool
planet-bounce lobe, subtle nebula structure). No external source, no license constraints.
Byte-identical across runs (`--check` pins it).

- Runtime role: image-based light only — `scene.environment` input. The visible
  sky stays the sector deep-sky plate; this env is never drawn as a background.
- Consumed by `src/render/foundryEnvironment.js` → `renderer.js` `_bakeEnv`.
- Shipped runtime artifact: `deep_space_2k.f32.bin` + `.f32.json`, produced by
  `node scripts/bake-foundry-ibl.mjs --source=deep_space_2k`.

## industrial_workshop_foundry_2k (retired alternate, 2026-09-22 → 2026-09-30)

`industrial_workshop_foundry_2k.hdr` is a Poly Haven CC0 HDRI, promoted from
`assets/reference/cc0/polyhaven/industrial_workshop_foundry/` (recorded in
`assets/reference/cc0/PROVENANCE.md`, retrieved 2026-09-22). It was the default IBL until the
2026-09-30 surfacing pass: hulls mirrored its indoor structure (windows, gantries), which read
wrong for ships in space. Files stay on disk as an alternate source; not served by default.

- Source: https://polyhaven.com/a/industrial_workshop_foundry (CC0)
