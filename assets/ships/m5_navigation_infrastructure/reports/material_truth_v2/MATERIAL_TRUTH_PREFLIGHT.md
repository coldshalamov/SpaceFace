<!-- LIFETIME: ASSET_EVIDENCE -->
# Material-truth preflight — `place_nav_buoy` REPAIR REOPEN

Packet: PQ-022 · Dispatch unit: `PQ-022.billboard-buoy-reauthor` (reopened 2026-09-10, buoy only) ·
Tier: B · Supported review cameras: live default-route chase framing at ordinary and diagnostic-close
range, plus the builder's exact-source rig (whole 45 m, LOD1 27.2 m, top-head, head azimuths,
stabilization close). Station billboard and memorial array are NOT in scope; their geometry and
accepted evidence are preserved.

## 0. Scope and authority

- Repair is bounded by the causal review of 2026-09-10
  (`design/program/roadmap/receipts/PQ-022-reauthor-causal-review-2026-09-10.md`), which returned the
  navigation buoy with three named defects and required a diagnostic-close capture lane.
- Frozen identity preserved: asset id `SF_PLACE_HELIOS_NAV_SPIRE`, root `SF_M4_HELIOS_NAV_SPIRE_ROOT`,
  exact runtime envelope (glTF min `[-1.4, -5.0, -1.4]`, max `[1.575, 10.3, 1.4]`), non-mesh
  collision helper contract and digest, `SOCKET_Structure_Core`, five semantic material roles,
  forward +X / up +Y, LOD0>LOD1>LOD2 with 3000/1000/300 ceilings, placement scale and anchors.
- The five frozen material roles are retained; their authored tuning values are repaired in place.
  No new material may be added (validator node-set contract).

## 1. Visible-zone register (whole asset, LOD0)

| Zone | Classification | Supported-view dominant | Disposition |
|---|---|---|---|
| Lower stabilizer (boss, cruciform yoke, cage struts, reaction wheels, gimbals, dampers) | `retained_reviewed` | no (close diagnostics only) | retained after material/construction review; accepted construction from the v2 open-yoke repair |
| Service spine (frustum column, battery cases, service trunk, cables) | `retained_reviewed` | no | retained; battery-case shell colour replaced (see material bill) |
| Navigation head (lantern, panes, hoods, cap) | `billed` | yes at ordinary range | REBUILT — replaces the failed post-and-cap frustum head |
| Beacon signal (nav optic panes + mast lamp) | `billed` | yes at ordinary range | REBUILT — billboard-scale recessed emissive panes, one per cardinal face |
| Photovoltaic / radiator wings | `billed` | secondary at close/mid | REBUILT — tilted laminates replacing the flush camouflaging panels |
| Service marking (collar band + plate) | `billed` | yes (proven visible in route still) | retained geometry language, widened head collar band |
| Telemetry mast, vanes | `retained_reviewed` | no (top-head diagnostic) | retained; mast lamp beacon added under optic role |

`allSupportedViewZonesClassified: true` — reviewer coverage confirmed against the retained route
stills (ordinary belt framing) and the builder's four-azimuth head rig.

## 2. Fiction-development agreement and material bill

Canon anchor: Helios corridor lane furniture is faction-neutral, service-grade navigation hardware
(`design/program/WORLD_VISUAL_CENSUS.md`; the buoy is the shared lane marker beside `poi_*`
stations). Manufacturer/repair history below is `ART EXTRAPOLATION` in the corridor's established
salvage-and-service economy.

1. **Buoy_Pressure_Shell — `neutral_coated_pressure_shell` (retuned).**
   Function: pressurized instrument hull of an autonomous lane marker. Origin: corridor
   fabricator, maintained unit. Substrate: rolled and faceted plate over a stiffened frame.
   Coating: warm bone-white navigation enamel (high-visibility marine-lane language translated to
   vacuum hardware), maintained, dust-blasted at edges. Fasteners/joints: flanged lantern ring,
   bolted cap skirt, panel seams at spine stations. Optical read: bright, warm, unmistakably
   manufactured against black space and pale cool rock. Forbidden reads: rock mimicry, raw primer,
   military grey.
   - Repair rationale: the retained cool grey (0.33, 0.37, 0.36) shared the belt's pale
     blue-grey value AND hue at ordinary framing — the exact camouflage failure the causal review
     recorded for the panel zone, present on the hull as well.
2. **Buoy_Stabilizer_Frame — `cast_inertial_stabilizer_frame` (retained tuning).**
   Dark cast yoke/cage/hood hardware; provides the dark cap and hood contrast that breaks the
   silhouette. Unchanged.
3. **Buoy_Nav_Optic — `recessed_multiface_navigation_optic` (retuned emission).**
   Function: the lane signal itself. Four large cardinal panes set INTO framed recesses under
   cast hoods (emissive pixels live inside a fixture), plus a hooded mast lamp. Emission colour
   retained (cyan family), strength raised 2.7 → ~4.5 so the signal carries at the range the
   billboard's display face proved achievable in the same scene. With emission disabled the panes
   still read as glazed instrument facets in bezels — the head explains itself unlit.
4. **Buoy_Solar_Cell — `segmented_photovoltaic_laminate` (retuned).**
   Function: self-powered beacon service array. Gold-anodized radiator-backed photovoltaic
   laminate (Kapton-family thermal language), segmented, edge-framed in bright machined rail,
   mounted on tilted pylons so the laminae read as angled machinery rather than flush plating.
   Optical read: dark warm bronze-gold, metallic, clearly hardware. Forbidden reads: asteroid
   value/hue, flat black absence, pale camouflage.
   - Repair rationale: causal review — the pale panel "camouflages against the belt"; the retained
     near-black-blue tuning was invisible at range and the flush mount read as a rock shard.
5. **Buoy_Service_Marking — `finite_tow_service_marking` (retained tuning).**
   Warm hazard orange. The route still proves this is the one zone that already carries at
   ordinary framing; the head skirt collar widens so the signal ring reads at head scale.

## 3. Shape-grammar failures being repaired

- **Post-and-cap silhouette (recorded defect, not closed by v2):** the v2 `SignalHead` is a smooth
  four-ring frustum; at supported range it collapses to "post with a cap". Repair: a wide faceted
  lantern (radial step ~2.4× the spine) with a dark cast cap and underhang, an offset service
  gantry arm, and a hazard collar — mass and asymmetry readable in outline against black.
- **Sub-pixel signal (recorded defect):** 0.27 m recessed slit cylinders + 0.12 m collar band.
  Repair: ~1.15 × 0.85 m emissive panes per cardinal face at lantern scale, hooded; mast lamp
  enlarged to a bezelled fixture.
- **Camouflaged service panel (recorded defect):** flush 0.08 m laminates on pale cases. Repair:
  tilted segmented laminates with frame rails on visible pylons, retuned off the rock palette.

## 4. Component reference decision

`not_needed` — the repaired components are direct translations of established maritime/space
navigation-hardware construction (lantern, glazed facets, hazard banding, radiator laminate); no
generated reference is required to disambiguate construction.

## 5. Remaster freeze (component reference §5 equivalent)

Silhouette envelope, footprint, orientation, root, sockets, collision helper, placement scale,
anchors, role, and the lower stabilizer's accepted construction are frozen. Quality axes the
repair is judged on: ordinary-range silhouette legibility, beacon carry at range, panel/hull
separation from the asteroid palette, unlit self-explanation, LOD meaning preservation.

## 6. Surfaced working scene and judging cameras

`assets/ships/m5_navigation_infrastructure/blender/source/material_truth_v2/place_nav_buoy.blend`
is the complete surfaced working scene. Judging cameras: builder exact-source rig (full three-quarter
45 m, service side, top head, four-azimuth head contact sheet, stabilization close, emissive-off,
material-ID, grazing light, LOD1 27.2 m, LOD2 far) plus live-route ordinary and diagnostic-close
stills in Browser and Electron after promotion.

## 7. Evidence, gates, and reviewer

- Candidate-side: deterministic builder run → hash-bound GLB candidates, exact-source render epoch,
  build report, validation binding (schema unchanged, three-asset bundle, buoy-only content delta).
- Promotion: buoy-only guarded transaction (billboard and memorial live files and manifest rows
  hash-guarded untouched; BIN-payload identity re-proven for their rebuilt candidates).
- G1/G2/G4: hash-bound whole-asset review record on the exact candidate (`VISUAL_REVIEW.md`),
  independent reviewer pass against ordinary + diagnostic-close route stills per the causal
  review's evidence-shape requirement. Route/performance evidence claims stay false until the
  bounded browser/Electron capture lane completes.
