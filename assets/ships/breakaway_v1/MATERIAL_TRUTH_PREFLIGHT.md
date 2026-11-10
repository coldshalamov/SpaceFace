# PQ-195.00 material-truth preflight — SP-07 spindle + capture fork

Scope of THIS pass: promote the two blockout candidates to identity-stamped canonical
sources (frozen sockets/geometry, no form or surfacing change). Production surfacing
(textures, wear, bevels) is a separate billed pass after this one wires the bodies.

Candidate hashes (pre-stamp, from `source_candidates/manifest.json`):
- `sp07-spindle.glb` sha256 `49e2d5b9…c9f4`, 74336 bytes, 3780 tris, 6 materials
- `capture-fork.glb` sha256 `c5e0ded9…40b1`, 13324 bytes, 552 tris, 6 materials

## 0.1 Visible-zone register (supported review cameras)

Supported views: ordinary chase camera at the Tethys catcher (travel/combat framing),
thumbnail/icon distance, D=58 close inspection. `allSupportedViewZonesClassified: false`
until a reviewer confirms coverage.

### SP-07 (`place_breakaway_sp07`, forward +X, WU scale, circumradius 15.02 ≤ 16)

| # | Zone | Class | Dominates a view? | Note |
|---|---|---|---|---|
| S1 | Rotor core (ceramic_dark cylinder r6.2 L22) | billed | yes (close) | The flywheel mass; must read as enclosed rotor, never a crate |
| S2 | Load collars fore/aft (paint/graphite/copper/machined rings at ±10.8..±13.5) | billed | yes (chase) | Impact-taking collars; unequal collar rhythm is the identity |
| S3 | Cage rails (6 machined rods + painted saddles) | billed | yes (chase) | Load-bearing exterior structure; explains the 16 WU body |
| S4 | Service spine + lifting lug (graphite/paint/copper, +Y asymmetric) | billed | yes (thumbnail) | THE orientation cue; asymmetry is what defeats asteroid/fighter confusion |
| S5 | Fastener rhythm (12×2 machined bolts on collars) | billed | no | Kept: readable at medium angle, batched by material |
| S6 | Status lamps (4 amber boxes at ±9.1, ±6.7) | billed | no | Bounded emissive; restrained count is deliberate |
| S7 | Tow sockets (front/aft ±14 X, service +Y) | retained_reviewed | no | Frozen interface; matrix→TRS normalized at publish, positions unchanged |

### Fork (`place_breakaway_fork`, origin = mouth plane, inward +X, WU scale)

| # | Zone | Class | Dominates a view? | Note |
|---|---|---|---|---|
| F1 | Rails L/R (graphite shoes, machined wear strips, painted caps, copper posts) | billed | yes (chase) | Must read as a machine that can arrest a mass; thickness at game scale |
| F2 | Rear arrestor (graphite/copper block at x≈71..83) | billed | yes (close) | The physical stop; mouth stays OPEN — never a wall, ring, or bubble |
| F3 | Energy sinks (2 finned blocks behind arrestor) | billed | no | Where braking work visibly goes |
| F4 | Rail lamps (amber, 5 per rail + arrestor strip) | billed | no | Operating-state legibility only; no all-over emissive |
| F5 | Mouth/service/seat sockets | retained_reviewed | no | Frozen interface; mouth socket IS the placement authority |

No zone is `outside_supported_view`. No zone inherits a DCC default unexamined: all six
materials are explicit flat PBR factors (this pass changes none of them).

## 0.2 Fiction-development agreement + material bill (per billed zone)

Canon: Berth Three industrial flywheel in transit (PQ-195 outcome); MTS legal owner;
Concord catcher receiver. `ART EXTRAPOLATION`: MTS heavy-lift paint code (warm bone),
graphite machinery housings, exposed machined steel wear surfaces, copper energy-handling
bus, restrained amber state lamps, dry refractory rotor casing.

| Material | Substrate/process | Coating/finish | Forbidden reads |
|---|---|---|---|
| paint_bone | rolled plate, folded sections | worn warm paint, dielectric | clean hologram, glowing orb |
| graphite | cast/machined housings | oil-darkened machinery enamel | toy plastic, rubber |
| machined | turned/milled steel | bare metal, directional wear (future bake) | chrome trophy, mirror |
| copper | bus bar / lug forgings | heat-tempered energy metal | decorative gold trim |
| signal_amber | lamp fixtures (recessed, F4/S6) | bounded emissive in a fixture | all-over emissive toy, goal ring |
| ceramic_dark | refractory rotor casing | dry, non-metallic, heat-history tint | glowing power core |

This pass bills geometry/silhouette only; the surfacing bill above binds the NEXT pass
(bakes, wear, UVs). No high-res texture sets per material: reuse compact atlas/library.

## 0.3 Shape-grammar assembly sequence (new manufactured assemblies)

SP-07: enclosed rotor → open annular load collars → exterior cage rails/saddles →
asymmetric service spine → lifting lug → bounded lamps. Fork: paired rail shoes with
wear strips → copper energy posts → rear arrestor block → finned sinks → rail lamps.
Retained primitives are kept only where section + load purpose + interfaces make sense
(collar rings take impacts; rods carry cage loads; rail boxes carry arrest loads).
Neutral-clay risk recorded: both assets still read as stacked primitives without
textures — the G1/G2 whole-asset gate stays OPEN after this pass (blockout silhouette
promotion, not production surfacing).

## 0.4 componentReferenceDecision

`not_needed` for this pass: no form or surfacing change, so no construction study is
required. A component study may be billed with the surfacing pass (rotor casing and
rail-shoe wear); that pass will record its own decision.

## 0.5 Frozen identity (this pass freezes; surfacing pass keeps)

Silhouette envelope, footprint, orientation (+X forward/inward, +Y up), all socket
positions, fork mouth plane + inner half-width 27 + usable depth 72, SP-07
circumradius ≤ 16, runtime roles (moving industrial load; static receiver extension),
neighboring clearances (mouth forward of the catcher custody head; arrestor ahead of
the head). Quality axes for the surfacing pass: material differentiation, manufacture,
edge behavior, causal wear, supported-camera surface response.

## 0.6 Dominant inherited/retained zones

All geometry zones are inherited from the packet blockouts and remain inside the
whole-asset visual veto. `retained_reviewed` applies ONLY to socket interfaces (S7/F5),
reviewed here: positions match `source_candidates/manifest.json` exactly; publish
normalizes matrix→TRS and adds semantic-role extras without moving them.

## 0.7 Working scene + judging cameras

Working source: `source_candidates/build_breakaway_candidates.py` (regenerates both
GLBs) + `publish_sp07_fork.mjs` (identity stamp; geometry byte-preserved). Judging
cameras: live chase camera at the Tethys catcher on the ordinary route; thumbnail
read; D=58 close view. No Blender MCP session was available to this worker; no
geometry/surfacing change was made, so none was required.

## 0.8 G0-G7 evidence + gate scope for this pass

- G0 identity brief: DESIGN.md fiction/role + this record (brief approved at publish).
- Evidence: publish log (hashes, tris, bounds, sockets), new `test/pq195-00-*` geometry
  contract suites, `world-site-assets` hash-exact source/release/binding/socket check.
- Gate scope: `evidence_ready` for promotion mechanics ONLY. G1/G2/G4 whole-asset:
  OPEN (blockout surfacing). G7 independent review: OPEN. Browser/Electron headed
  acceptance: OPEN (owner capture decision: close is a number/test, stills optional).
- Reviewer required: independent agent review of the live-route read at the ordinary
  chase camera (leaf .00 done-when) — landed in-tree (R1–R4; the spindle renders
  through the authored-payload boundary); Wave 3 quality review closed the read
  on structural pins (see the receipt FIX RECORD).
