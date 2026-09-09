<!-- LIFETIME: DURABLE -->
# PQ-131.02 — authored Massline Core report

## Outcome

Asteroid Works now loads the authored `place_works_massline_core` release asset on the normal installed
and placement-ghost routes. The procedural Core body is deleted. The authored `ring_spin` and `lamp`
hooks preserve the rotating race and isolated per-instance status lamp; work zoom uses LOD0 and site
zoom uses LOD1. Late or replaced loads release without mounting, and the combined-URL register race is
covered for rapid work/site/work changes.

## Frozen artifacts

- Combined authoring source: `759B7BC5B5BE8499B77ACFDCBB9AE67829B5D999C549C417E2E811318E9203DD`
- Runtime LOD0+LOD1 source: `76284DC09D1C1B4BA33FB094A37B05FA5EDBE1006A8AB67B767BE32C397CE1EF`
- Release: `6555D6E9E5E0528F216913C8317CF3333E8D88F83776D85C9EDB3B2C6F633CF8`, 1,176,548 bytes
- Render package: `623785D70473A11FDDD491083513F87F55ECDB7C7F7276B74C5BF46CA15B8EDC`, 1,297,396 bytes
- LOD0/LOD1/LOD2: 6,724 / 1,280 / 556 triangles; selected runtime source ships only LOD0 and LOD1

## Review and player-route acceptance

- Cycle 10 original-resolution G1/G2/G4 review: Grok 4.6 high, Luna max, and Terra xhigh each returned
  KEEP with no P0/P1 defects. The controller accepted the exact candidate in
  `assets/works/massline_core/evidence/cycle_010/reviews/controller_acceptance.md`.
- Focused Core loader/runtime tests: 10/10 passed.
- Render-package freshness: 115 production packages fresh.
- Baseline: 14/14 green.
- Asteroid Works theater invariants hold at 1920×1080 and 1280×720.
- Electron playable route: 16/16 passed.

## Next product unit

`PQ-131.03` — authored Extractor.
