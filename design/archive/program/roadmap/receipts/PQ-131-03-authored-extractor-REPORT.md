<!-- LIFETIME: DURABLE -->
# PQ-131.03 — authored Extractor report

## Outcome

Asteroid Works now loads the authored `place_works_extractor` release asset on the normal installed
and placement-ghost routes. The procedural Extractor body is deleted. The authored `head_face`,
`belt`, and `lamp` hooks preserve head travel, instance-owned belt motion, and lens-only status
lighting; work zoom uses LOD0 and site zoom uses LOD1. Late/replaced loads release without mounting,
rapid work/site/work changes settle on the final register, and LOD2 remains evidence-only.

The controller capture route was also corrected: it previously added the raw Y-up GLB at scene
origin and photographed the unrelated entry derrick. It now runs the production Extractor binding,
seats the selected release at the framed proof cell, holds the work camera on it, and photographs the
same instance after the site-register switch.

## Frozen artifacts

- Authoring source: `3E071A9A7A143480AF6A09088F032207153D441D4A0D3E0409BD5EBA21D92BA8`, 6,453,308 bytes
- Runtime LOD0+LOD1 source: `15B69A9A999562B00077065244CAC4CE1A7917E5076F920E451B615EB8CED7F8`, 4,370,236 bytes
- Release: `A65685BC1E917DA9512879159ED2E65F2E640A233D4010BDB4099D8D26FA6A02`, 2,016,576 bytes
- Render package GLB: `05BC593A95A14E71AA38B15F56DBEBBE98CBDC0D44DF05284726040A5E3686FB`, 2,101,292 bytes
- LOD0/LOD1/LOD2: 3,112 / 916 / 544 triangles; selected runtime source ships only LOD0 and LOD1

## Review and player-route acceptance

- Cycle 8 G1/G2/G4/G7 review: Luna max, Terra xhigh, and OpenCode Go Kimi K3 max each returned KEEP
  with no P0/P1. The controller decision is recorded in
  `assets/works/extractor/evidence/cycle_008_master/reviews/controller-acceptance.md`.
- Independent runtime review returned KEEP after belt-sampler and lens-only ownership corrections.
- Focused Rover/Core/Extractor/loader tests: 21/21 passed.
- Render-package freshness: 116 production packages fresh.
- Baseline: 14/14 green.
- Asteroid Works theater invariants hold at 1920×1080 and 1280×720. Its fixed-delay lane-density
  sample was replaced with a bounded wait for the live reading after one timing-race failure.
- Electron playable route: 16/16 passed.

## Next product unit

`PQ-131.04` — authored Refinery.
