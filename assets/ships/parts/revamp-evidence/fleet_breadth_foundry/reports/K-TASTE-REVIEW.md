# Taste review — Fleet Breadth Foundry batch

**Reviewer:** Fable 5 (lead). *Provenance note: this review was assigned to Kimi K3 (bible
author) with the eight evidence images attached; the provider rejected the session with no
output — consistent with its quota ceiling after the bible chunk. The lead performed the
review instead, against the bible and the audit goals. Mechanical correctness was already
upheld by the forensic QA pass and is not re-litigated here.*

## (a) Per-image verdicts

1. **wasp_lineup_clone.png — (baseline)** Correctly damning: three identical patrol bodies
   is exactly what the audit said every lawful faction flies.
2. **wasp_lineup_varied.png — DELIVERS.** Passes the desaturated test: SCN reads gridded
   discipline, MTS's continuous spine fairing changes the actual top profile, Free breaks
   the outline with asymmetric bolt-ons. SCN is the quietest by design (bible: restraint IS
   the identity); it leans on tint + emissive to finish the job, which the bible permits.
3. **hub_before_after_scn.png — DELIVERS.** The bastion band + corner masses + twin customs
   booms are a *fortification argument*, not decoration; ordered exactly as §SCN demands.
4. **hub_before_after_mts.png — DELIVERS.** The standoff halo ring is the single best idea
   in the batch — commerce architecture that changes the silhouette class, not the paint.
5. **hub_before_after_free.png — PARTIALLY.** The asymmetric rim-break works at distance,
   but up close the habitat pods read balloon-smooth — extruded comfort, not scavenged
   desperation. §Free calls for "tape/filler + untrimmed patch"; these pods are too new.
6. **F_REVIEW_game_cam.png — DELIVERS.** Hauler row is the strongest (sealed / ore-box /
   scrap are three different *cargo philosophies*); rig split gives the two hostile types
   different predator grammar; cannon row is three legible manufacturing cultures. Weak
   edge: both rig variants hang identity partly on thin spar members that will thin out
   further at range.
7. **SCENERY_REVIEW_GRID.png — PARTIALLY.** Beacons, buoys, dishes, wrecks, and the
   repaired truss gate carry construction meaning. The container stacks are the weakest
   family — three rectangles that need surface detail to tell apart (QA measured IoU
   0.79–0.85 at 64 px; taste agrees with the number).
8. **texgen_contact_sheet.png — DELIVERS.** The stencil alphabet, constructed glyphs, and
   panel-fade mask are genuinely industrial; masks have distinct physical processes.
   Cosmetic: the atlas wastes ~60% of its canvas — packing, not craft.

## (b) Top 3 weakest spots, with concrete fixes

1. **Free hub pods (balloon-smooth).** Replace the capsule pods with box-derived pods:
   start from 12–20 m container masses, shear two faces 3–8°, add a visible splice collar
   (0.6 m band, KitMat_Steel) where each pod meets the truss, and one open-frame pod
   showing interior ribs. Keep the irregular cluster placement — it already works.
2. **Container stacks (silhouette twins).** v02: topple one container 12–18° against the
   stack (strap it with the existing ratchet geometry). v03: cantilever one unit 30–40%
   past the stack edge on a skid. Both are one-builder-function edits and would separate
   the family at 64 px by outline alone.
3. **Rig-variant thin members.** Reaver's grapple spars and corsair's blade supports sit
   near the harness's vanishing threshold. Thicken load-bearing spars to ≥0.35 m and gusset
   their roots (kit bracket_gusset family exists for exactly this); keep tip hardware thin —
   taper reads as intent, uniform thinness reads as error.

## (c) Whole-batch judgment

The batch clears the bar it set: the fleet stops reading as recolors because the variation
is argued in construction — repair practice, cargo philosophy, fortification doctrine —
rather than tint, and the bible's cross-referenced numbers (fastener pitches, wear tiers,
mask hookups) mean the parts *interlock* instead of merely coexisting. What still separates
it from "authored by a team with a decade of lore" is the micro layer: the deferred
kit-detailing pass (fastener rows at per-faction spacing, decal registrations from the
atlas, wear-tier material bakes) is the single next investment that would most raise
perceived quality — it converts the macro arguments into touchable surfaces, and every
ingredient for it already exists in this worktree.

## (d) Verdict

**SHIP WITH LISTED FIXES** — macro construction candidates are ready; apply (b)1–3 in the
next round alongside the kit-detailing pass before promotion.
