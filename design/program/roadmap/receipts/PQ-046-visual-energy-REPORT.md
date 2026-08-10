<!-- LIFETIME: EVIDENCE -->
# PQ-046 visual-energy receipt

```yaml
packet: PQ-046
unit: PQ-046.visual-energy
candidateCommit: f773e086b2d702b98555e2c13c111ebd64a0028d
lifecycleClaim: integrated
acceptanceClaim: focused_green
disposition: PASS
changedPaths:
  - SAVE_SCHEMA.md
  - scripts/probe-bloom-slider.mjs
  - src/core/gameState.js
  - src/data/palettes.js
  - src/data/sectorVisualProfiles.js
  - src/render/bloom.js
  - src/render/post/spaceRenderGraph.js
  - src/render/renderer.js
  - src/render/ships/kestrelHero.js
  - src/render/vfx.js
  - src/ui/screens/settings.js
  - test/bloom-pass-timing-scratch.test.mjs
  - test/post-processing-restraint.test.mjs
  - test/render-target-pipeline-warmup.test.mjs
  - test/renderer-settings-runtime-truth.test.mjs
  - test/sector-visual-profiles.test.mjs
  - test/vfx-accessibility-profile.test.mjs
focusedGates:
  - SwiftShader pixel matrix: 48 configurations with wrapper/graph base presentation within 1 byte
  - adjacent render, VFX, accessibility, and dynamic-buffer suite: 77/77 pass
  - final graph/renderer focused suite: 40/40 pass
  - final warm/opening/compile dispatcher suite: 39/39 pass
  - check:render-hotpath: pass
  - check:perf:render-scale: pass
  - npm run check:baseline: 11/11 pass
  - sector palette, faction kit, Kestrel hero, and ship appearance checks: pass
routeEvidence:
  - deterministic direct WebGL wrapper/graph pixel evidence; no parent Browser/Electron route-accepted claim
performanceEvidence:
  - off and zero strength skip bloom pyramid passes but retain one canonical presentation composite
  - AO-off skips normal and AO passes; pass-family diagnostics report actual work
  - steady structural probe reports zero allocation, geometry, texture, and program deltas
review:
  discovery: REVISE
  causalRereview: APPROVE
residuals:
  - existing full-game bloom probe remained in loading on its prior unchanged attempt and was not repeated
  - ordinary-route visual acceptance remains unclaimed while foreign Kestrel-adjacent runtime work is live
followUps: []
```

## Result

Default bloom is raised to `0.52`; every sector profile now contributes at or above baseline with a
non-positive threshold bias and a distinct response. Faction hull paint carries hue-bearing
midtones, and the Kestrel dominant shell reads as weathered cobalt while retaining its canonical
cyan bright language.

All renderer routes now preserve one shared exposure/ACES/grade/toe/vignette/grain/sRGB policy.
Bloom off or zero skips only bloom work: it still draws the HDR scene and canonical composite, with a
calibrated black floor of approximately `[11,12,14]`. Render scale applies once, AO-off avoids its
normal/AO work, and main, warm-up, opening, and exact-target compilation select the same graph →
bloom-wrapper → native-degraded route. The selected bloom kernels remain explicitly route-specific;
only the shared base-presentation parity claim is frozen.

Both Massline representations retain their steady cable/anchor identity while snap, whip,
whitening, luminance, opacity, width, particle, and stress-flash transients honor reduced-motion and
reduced-flash policy. Bloom source radiance is stable across off/zero/epsilon/on, so the compositor
owns strength exactly once.

The candidate is published on `origin/master` at the exact commit above. This receipt claims
focused-green render behavior, accessibility, determinism, and structural performance; it does not
self-grant ordinary-route visual acceptance.
