<!-- LIFETIME: DURABLE -->
# PQ-131.04 — authored Refinery report

## Outcome

Asteroid Works now loads the authored `place_works_refinery` release asset on the normal installed,
placement-ghost, and controller proof routes. The procedural Refinery body is deleted. The authored
`furnace_slit`, `stack_vent`, and `lamp` hooks preserve LOD0/LOD1 heat and lens state without
repainting the shared jacket/stack/tank atlas. Work zoom uses LOD0, site zoom uses LOD1, late or
replaced loads release without mounting, and LOD2 remains authoring/evidence-only.

The first live site capture exposed a real register defect: the furnace, stack, and tank collapsed
into one dark speck. The selected-runtime generator now gives only LOD1 a deterministic,
non-emissive `three_mass_process_train_v1` basecolor/ORM atlas. The accepted full source geometry,
LOD0, footprint, hooks, and Blend remain byte-identical; the revised site capture keeps the three
industrial masses distinct without a glow, billboard, scale change, or procedural fallback.

## Frozen artifacts

- Full authored source: `55B35C4E28D23972E7E130BCE35BD3D8A5AEEC261EE022B992F5D1C490692795`, 8,295,200 bytes
- Blend: `CE90413DEBE3D36A18E40091146011FF6DAF321AC0E40CE881CF37D3B79EB9CD`, 7,557,137 bytes
- Selected LOD0/LOD1 source: `A5043353A4F53E71409EE31BF05F0A1F9255FF24CDA5BD9A95D0E715004345C5`, 9,160,644 bytes
- Release: `C48D5641E5AF64C342DBE4F7903CA3A2852161D092DD2F18C91720D916D3D8EF`, 3,307,996 bytes
- Render package GLB: `86A95B94B0CA297E4CEC0ABABB11D497924095DBA4DF6D4AC942136CC873E77E`, 3,498,536 bytes
- LOD0/LOD1/LOD2: 7,442 / 1,840 / 560 triangles; selected runtime source ships only LOD0 and LOD1

## Review and player-route acceptance

- Luna max, Terra xhigh, and Clinepass Kimi K3 max each returned KEEP on the exact revised source,
  selected release, and Browser work/site captures. The Luna reviewer who raised the original
  site-register P1 confirmed it is closed.
- Independent runtime review returned KEEP after verifying repaired hook/collision transforms,
  per-instance slit/lens materials, static-atlas sharing, same-URL register races, and stale-arrival
  disposal.
- Focused Rover/Core/Extractor/Refinery/loader tests: 28/28 passed.
- Render-package freshness: 117 production packages fresh.
- Baseline: 14/14 green.
- Asteroid Works theater invariants hold at 1920×1080 and 1280×720. Its headed 140 ms cadence
  sample once crossed the 180 ms repeat boundary under the 1920 route; the exact deterministic
  boundary test remained green, and the headed smoke now keeps an 80 ms delivery margin.
- Electron playable route: 16/16 passed.

## Next product unit

`PQ-131.05` — authored Surface derrick / head-frame.
