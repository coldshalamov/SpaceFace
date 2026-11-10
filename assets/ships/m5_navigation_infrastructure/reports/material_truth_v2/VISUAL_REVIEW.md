<!-- LIFETIME: ASSET_EVIDENCE -->
# Whole-asset visual review — `place_nav_buoy` buoy-repair candidate

Reviewed candidate: `assets/ships/m5_navigation_infrastructure/source_candidates/material_truth_v2/places/place_nav_buoy.glb`
SHA-256 `cbaed85c003e24da2bb0088c41db005f484ba6b3541bf6c2e32cf1b2ef0a4ed7` (430,060 bytes;
LOD0/1/2 = 1876/972/288 render triangles; live release `e7d41985b76e...cc226f2`, 205,660 bytes).
Reviewer: solo integrator (evidence-bound, sources and conflicts disclosed per packet Phase 3) plus
one independent vision-agent review pass over the retained hash-bound stills and the in-game route
stills, run to a PASS verdict after two causal repair rounds. Review scope: **whole_asset**.

## Defects under repair (causal review 2026-09-10)

1. Lane-navigation head still read as a dark post-and-cap in silhouette.
2. Beacon signal (cyan slit + red band) sub-pixel at ordinary lane framing.
3. Pale service/solar panel shared the belt's value and hue — rock camouflage.

## Review lineage

- **Candidate epoch 1 (`a00bac94...`)**: exact-source evidence KEEP from the solo integrator; the
  independent reviewer then judged the in-game route stills and returned REVISE with pixel
  measurements — mast beacon contributed no visible pixel at ordinary framing, wings read
  near-black cool charcoal, hull darker than authored, red over-dominant. That review also
  exposed that the runtime renders this part through `render-packages/nav-buoy/`, which still
  snapshotted the pre-repair asset (the promotion flow had never rebuilt it); round-1 route
  evidence was therefore partially stale.
- **Candidate epoch 2 (`cbaed85c...`, this record)**: beacon lantern enlarged to a bezelled drum
  (emission 6.0), mast re-materialled in bright hull enamel, hull raised to warm bone
  (0.88/0.82/0.70), marking raised to true orange (0.98/0.50/0.06), solar wings raised to warm
  gold-anodized laminate; nav-buoy render package recompiled against the promoted release and the
  pilot binding refreshed. Independent reviewer re-reviewed the fresh broker-authorized stills.

## Gate verdicts

| Gate | Scope | Verdict | Evidence-bound reasoning |
|---|---|---|---|
| G1 form/silhouette | whole_asset | **KEEP** | Wide faceted lantern (radial step ≈2× spine) with overhanging dark cap, hazard waist, offset gantry; bright mast keeps the vertical silhouette. Head→neck→collar→base profile reads at ordinary framing in both runtimes (closed in review round 1, preserved). |
| G2 construction/material truth | whole_asset | **KEEP** | Panes are glazed facets in four-bar bezel frames under hoods; emissive-off evidence proves the unlit head explains itself. Hull warm bone enamel, cast hardware dark, wings tilted pyloned gold-anodized laminates with edge rails and marking tip markers. Material-ID render confirms the five semantic zones. |
| G4 range/legibility | whole_asset | **KEEP** | At ordinary framing in both runtimes the pane glow, orange collar, marking plate, and lit mast lantern carry; the full mast stays visible in the diagnostic crop. All four azimuth panels carry the signal. |
| Emissive restraint | whole_asset | **KEEP** | Emission confined to the optic role (panes + mast lantern) inside fixtures; emissive-off matched frame differs only by the glow. |

## Changed zones

Navigation head (lantern, panes, frames, hoods, cap, gantry, collar), mast + beacon lantern,
solar wings (pylons, laminates, rails, tip markers), shell/solar/marking material tuning.
Retained zones reviewed: lower stabilizer assembly, spine, service trunk/cables, telemetry vanes,
service marking plate — no regressions in `stabilization_close`/`service_side`.

## Open defects

None at whole-asset scope for this candidate. Far-field meso detail loss at `lod2_far` remains the
recorded intentional screen-space boundary, consistent with the relay lane's accepted ruling.

## Process findings recorded for the owners

1. **Render-package freshness**: `render-packages/nav-buoy/` snapshots the promoted release and is
   the bytes the runtime actually renders. The PQ-022 promotion flow must recompile the part's
   render package (and refresh its `pilots.json` binding) in the same transaction as the release;
   nothing in the old flow did so, which is why two review rounds rendered stale art. Fixed here
   for the buoy; the flow-wide gap belongs to the release-pipeline owner.
2. **POI dressing lifecycle**: quiet POI markers shelved off the entity list (world commit
   `b8cce1567`) are dropped on sector eviction while the stale sector bag suppresses
   re-materialization, hiding lane furniture on re-entry. The repair cell resets the destination's
   residency records so `enterSector` performs the owner's own fresh first-visit materialization;
   the world owner should close the hole properly.

## Boundary

This record closes candidate-side and route-still G1/G2/G4 evidence. Matched performance remains
Phase H3 per the leaf contract.
