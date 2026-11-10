<!-- LIFETIME: DURABLE -->
# PQ-131.05 — authored Surface Derrick report

## Outcome

Asteroid Works now loads the authored `place_works_derrick` release asset on the permanent surface
and controller proof routes. The procedural `makeDerrick` body and import are deleted. The authored
`drum_spin`, `cable_anchor`, `lamp_L`, and `lamp_R` hooks drive movement-only drum phase, the live
umbilical start, and lens-only status materials. Work zoom uses LOD0, site zoom uses LOD1, late loads
release without mounting, and LOD2 remains authoring/evidence-only.

The first current site review exposed a real landmark defect: material values alone could not keep
the four-shoe/collar/A-frame read at 19 px/cell. The selected-runtime generator now gives only LOD1
a deterministic, non-emissive `grounded_headframe_value_roles_v1` basecolor/ORM profile. Fresh
capture then exposed two route bugs rather than another art defect: generic proof seating compressed
the standing 6.49-WU frame to 0.678 scale, and the permanent `Z.surface` basis left the authored
depth behind the rock cut face. Permanent and proof routes now both preserve authored 1x scale,
one-cell X footprint, native base anchoring, zero rotation, and seat native min-z at `ROCK_FACE`.

## Frozen artifacts

- Full authored source: `B35007A82902BFC57017950E2A7BB4C8221984D3E090229A507BCCEFFB6F492A`, 15,605,268 bytes
- Blend: `D60F4D641885D40279ECA56F399B29C00F718FB9AF901EB7CB471A535EE8A192`, 14,946,795 bytes
- Selected LOD0/LOD1 source: `920F476A02BC1CE887CD64372E0676040039DE4765D347CF234B20FC02CF5B02`, 15,663,416 bytes
- Release: `1FAAFC93EEC6ECC8C506238D3F7883D3B648C43F07DF21A284C4CBA954165813`, 4,062,804 bytes
- Render package GLB: `2A2383C4B10DE22F3725271F8F58C1EC4FC18564D86279D9FE32474C0A696091`, 4,207,032 bytes
- LOD0/LOD1/LOD2: 7,072 / 1,304 / 896 triangles; selected runtime source ships only LOD0 and LOD1

## Review and player-route acceptance

- Luna max, Terra xhigh, and Clinepass Kimi K3 max each returned KEEP on exact final source,
  selected release, and Browser work/site captures. The Luna reviewer who raised the site P1
  confirmed the production-equivalent scale/depth correction closed it.
- Independent runtime review returned KEEP after verifying zero-rotation/1x/min-z seating on both
  permanent and proof routes, pending-record safety, fallback-umbilical retirement, movement-only
  drum phase, lens-only materials, stale-arrival disposal, and LOD0/LOD1-only admission.
- Focused Rover/Core/Extractor/Refinery/Derrick/loader tests: 36/36 passed.
- Render-package freshness: 118 production packages fresh.
- Baseline: 14/14 green.
- Asteroid Works theater invariants hold at 1920x1080 and 1280x720.
- Electron playable route: 16/16 passed.

## Provider run disposition

Cursor Grok 4.6 xhigh was live but returned no output for its bounded image review and was stopped.
Grok 4.6 was live but reached the four-turn bound while reading images without a verdict. These are
run-local no-verdict outcomes, not durable statements about provider capacity or usefulness.

## Next product unit

`PQ-131.06` — authored modular conduit kit (cable + lane).
