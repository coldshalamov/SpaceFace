# FACTION SURFACE LANGUAGE — the Fleet Breadth art bible

**Lane C deliverable, 2026-07-20 · Foundry batch `fleet_breadth_20260720`**
**Consumers:** Lane D (kitgen), Lane E (texgen), all variant lanes, future bake scripts.
**Machine-readable twin:** `assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json`
(every number in this document lives there; the JSON is the build interface, this doc is the taste).

## Verified ground truth (read before writing; deviations noted)

- `src/data/palettes.js` — `FACTION_PALETTES` (6 fields per faction) and `PAINT_PROFILES`
  (grime / chrome / noseArt / killMarks / patches per personality). All faction sections below
  are consistent with the shipped profile values.
- `src/data/factions/*.js` — 8 sector-owning factions confirmed (`faction_helix` is paper-only
  and intentionally excluded).
- **Brief deviation, verified:** the Choir `zealot` personality is NOT missing —
  `PAINT_PROFILES.zealot` ships as `{ grime 0.30, chrome 0.10, noseArt null, killMarks false,
  patches 0.2 }` (palettes.js:145). The brief predates that row. Choir below *extends* the
  shipped values rather than contradicting them.
- `design/depth-program/P3-faction-visual-identity.md` — livery characters in §5 are treated as
  binding direction; this bible is their surface-level expansion.
- `parts_manifest.json` material contract: parts tint through `Material_Hull / Material_Accent /
  Material_Glass / Material_Mechanical`; whole ships additionally use
  `Material_Glass_Canopy`, `Material_ArmorDark`, `Material_BrushedMetal`, `Material_Rubber`,
  `Material_Emissive_*`, `Material_RepairGreen`, `Material_Decal_*`. **No new runtime slots are
  invented anywhere in this lane.**
- **Tint multiplies over albedo.** All painted zones are authored near-neutral grayscale
  (see `paint.baseGray` per faction); the faction tint supplies hue at runtime. Hue lives in
  data, never in the baked paint.
- Texture contract: baseColor sRGB, normal OpenGL green-up, ORM = R:AO / G:roughness / B:metallic,
  1024². Lane E vocabulary this bible consumes: trim strips (`panel_gap`, `weld_bead`,
  `raised_rail`, `grip_plate`, `hatch_frame`, …), wear masks (`mask_edgewear`, `mask_chips`,
  `mask_corrosion`, `mask_carbon`, `mask_heatradial`, `mask_recessdust`, `mask_streaking`,
  `mask_panelfade`), decal atlas (`fac_*`, `warn_*`, `serv_*`, `wear_kill_tally`,
  `wear_patch_outline`, `wear_weld_ring`, `wear_scorch_ring`).
- Lane D kit families referenced in axis 12: `rivet_strip, fastener_recessed, rail_split,
  bracket_gusset, plate_lip, weld_seam, hatch_frame, access_panel, vent_grid, pipe_clamp,
  armor_spacer, heat_shield, weapon_collar, sensor_housing`.

## Reading rules

- Units are metres. Ships are 8–20 m; the worked-example donor (`hull_fighter`) is
  10.45 m × 5.88 m. Dorsal read at 60–150 px governs: every treatment below names at least one
  feature ≥0.3 m that survives the mip chain.
- Roughness ranges are [lo,hi] across the zone: lo = traffic-polished spots, hi = untouched
  film. The WHY is stated per faction — roughness is a maintenance story, not noise.
- Each faction section ends with **Grey-read:** — what survives full desaturation. If a faction's
  identity collapses without hue, that is a defect (see rejection conditions, brief-C).

---

## 1. faction_scn — Solar Concord Navy

*lawful · pristine chrome authority · anchor #3A78FF · profile: grime 0.05, chrome 0.85, insignia, no patches*

1. **Armor segmentation.** Large uniform plates, 1.2–2.4 m, on a strict orthogonal grid aligned to
   hull axes; split lines run straight fore-aft and athwart, never diagonal. Plates overlap toward
   the stern (service edges face aft, away from the direction of flight debris). Plate count is
   deliberately low — a 10 m fighter reads as ~6 dorsal plates. Armor concentrates symmetrically
   over the reactor bay and cockpit; the Navy armors the crew, not the cargo.
2. **Paint application.** Factory-sprayed 2-pack polyurethane over chromate primer, robot-applied.
   Masked two-tone: the secondary band follows an existing split line exactly (paint never crosses
   a seam — seams are masking guides). Paint ends cleanly at the heat-tile ring around each nozzle;
   there is no overspray anywhere on a Concord hull.
3. **Exposed alloy.** Brushed titanium-aluminide, grain aligned fore-aft; reads as a soft
   anisotropic streak under sun. Exposed only at nozzle throats, weapon collars, and hatch rims —
   never as a style choice, always because paint would burn or wear there.
4. **Roughness by zone.** Paint 0.28–0.42 (service gloss; hi end is a ship due for refit).
   Bare alloy 0.30–0.45. Machinery 0.45–0.60. Ceramic heat tile 0.55–0.70. Canopy 0.05–0.12.
   Traffic polish at hatch rims and boarding treads pulls local paint to 0.30 — the regulation
   shine is brightest where hands touch.
5. **Panel-edge treatment.** Crisp machined chamfer, 0.01–0.02 m, identical on every plate; a
   Concord edge is a drawing tolerance, not a hand artifact.
6. **Fasteners & seams.** Recessed flush torx strips, pitch 0.18 m, head Ø0.022 m, every row
   parallel to a split line. No visible welds on exterior; seams are gasketed flush with a 0.025 m
   shadow gap.
7. **Heat & exhaust wear.** Cleaned at every refit, so what exists is faint: a straw-to-blue
   titanium temper tint (#6A7FA8→#3E4A66) confined to 0.6 m behind nozzle rims. A Concord hull with
   a soot plume is a *plot event*, not a texture.
8. **REPAIR PRACTICE — color-matched replacement.** A breached plate is unbolted at the yard and
   replaced with a new plate, resprayed to the hull's batch code, re-stenciled. In the field,
   damaged plates are simply left until dock — the Navy does not patch, it re-issues. The only
   tell: a replaced panel fades differently (`mask_panelfade` at very low amplitude). Zero visible
   patches on active hulls (patches 0.0); the "patched" tier is one near-invisible panel mismatch.
9. **Decals & typography.** Stencil only. Registration `SCN-####` portside bow and repeated small
   on the dorsal spine; squadron insignia (`fac_scn`) on the fin. Warning labels dense at hazards —
   intake triangles, high-voltage bolts, no-step frames — because regulations require them.
   No kill marks; the Navy counts victories in citations, not paint.
10. **Emissive placement.** Cool blue window strips and running lights seated exactly on frame
    lines; dorsal formation lights at plate corners. Intensity 1.0, disciplined — emissives trace
    structure, they never decorate.
11. **Cleanliness profile.** Sterile by regulation. Carbon film only at nozzle roots and gear
    wells, airflow-streaked. Recess bias moderate (0.55): gaps are gasketed, so grime has nowhere
    to live.
12. **Preferred modules.** `fastener_recessed` (its native seam), `rail_split`, `hatch_frame`,
    `sensor_housing` (canted lens boxes, regulation placement), `armor_spacer` + `weapon_collar`
    on patrol fit. Everything torqued to spec, everything parallel.

**Grey-read:** low plate count, ruler-straight seams, gloss banding, a registration string, and
*nothing else*. Order is the identity.

---

## 2. faction_mts — Meridian Trade Syndicate

*corporate · showroom chrome · anchor #F2B233 · profile: grime 0.10, chrome 0.70, insignia, no patches*

1. **Armor segmentation.** Few, very large clamshell panels, 2.5–5.0 m — a Meridian hull is a
   consumer product with a service belly, not a riveted airframe. Splits are minimized and placed
   on styling lines: gentle sweeps that echo the brand mark, never arbitrary. The dorsal shell is
   ideally *one* panel; structure hides beneath.
2. **Paint application.** Robotic ceramic-clearcoat with metallic flake, showroom-cured, panel-
   baked before assembly so paint wraps edges with zero witness lines. Paint stops at the belly
   pan parting line: the service belly is unpainted, and the boundary is a designed feature line.
3. **Exposed alloy.** Warm clearcoated cast alloy on the belly and bay interiors — dull under a
   glossy seal, so reflections are soft but the surface is slick. Brushing exists only inside
   service bays, where customers don't look.
4. **Roughness by zone.** Paint 0.18–0.32 (the glossiest surface in the game; hi end = overdue
   detail). Belly alloy 0.26–0.40 under clearcoat. Machinery 0.40–0.55. Ceramic shields 0.50–0.62.
   Panoramic glazing 0.04–0.10. Walk-on cargo-deck zones locally 0.45–0.60 (anti-slip grit film,
   applied on purpose).
5. **Panel-edge treatment.** Soft product radii, 0.03–0.06 m rounds — nothing sharp a customer
   could sue over. Parting lines are coin-gap uniform (0.030 m).
6. **Fasteners & seams.** Hidden. Exterior fasteners sit beneath flush caps; the only visible
   heads are serialized seal-heads (Ø0.018 m, nominal pitch 0.30 m) whose caps carry the warranty
   hologram — tamper evidence as jewelry. Seams are bonded and faired.
7. **Heat & exhaust wear.** Between scheduled details, a light amber haze (#B08A4A→#6A5230) is
   tolerated at thruster clusters and the APU vent, spread 0.5 m — the patina of a working ship,
   removed before any client-facing event.
8. **REPAIR PRACTICE — certified serialized swap.** Same *practice tag* as Concord
   (`colorMatchedReplacement`) but a different culture: the whole styled clamshell is replaced as
   one serialized OEM unit, never an individual plate; a warranty-seal holo decal is applied across
   the new seam; the old shell goes back for refurbishment credit. Reads as: a slightly newer,
   slightly shinier clamshell with a holo seal — versus Concord's invisible single-plate swap with
   fresh stencil.
9. **Decals & typography.** Holographic. Registration `MTS-#####` in the corporate typeface on the
    quarter shell; brand mark (`fac_mts`) backlit on cargo doors. Warning labels are the legal
    minimum and are integrated into panel design (recessed frames), density low. No kill marks —
    violence is bad for resale.
10. **Emissive placement.** Warm gold cabin strip along the glazing line, logo backlight, docking
    guide lamps. Intensity 0.9, tasteful; the product glows where the customer boards.
11. **Cleanliness profile.** Detailed by contractor crews; a brake-dust-like film at thruster
    clusters and in the belly bay is tolerated between details. Recess bias lowest of all factions
    (0.45) — there are few recesses to dirty.
12. **Preferred modules.** `access_panel` and `hatch_frame` (flush, gas-strutted), `sensor_housing`
    (conformal blisters, never masts — masts are truckish), `pipe_clamp` inside bays only,
    `plate_lip` weather strips on cargo doors, `vent_grid` styled chevrons.

**Grey-read:** one big glossy shell, coin-gap seams, soft radii, hidden hardware, glowing logo.
The product is the identity.

---

## 3. faction_dmc — Drift Miners Collective

*blue-collar · honest workboat · anchor #C9772E · profile: grime 0.35, chrome 0.0, patches 0.3*

1. **Armor segmentation.** Small heavy plates, 0.6–1.4 m, orthogonal but sized to frame spacing,
   not aesthetics — the grid stutters around ribs. Overlap faces outward toward abrasion. Doubler
   plates (a second plate bolted over the first) concentrate at the ore-loading flank, tether
   points, and engine saddle: Drift armors where the work hits.
2. **Paint application.** Hand-rolled enamel, two coats, brush laps visible; large areas left in
   red-oxide primer or bare galvanizing — paint is for *marking*, not vanity. Hazard chevrons and
   lift-point marks are rolled on last, slightly crooked. Paint ends wherever the roller couldn't
   reach.
3. **Exposed alloy.** Cast manganese steel, dull, mill scale flaking in patches; no anisotropy —
   it scatters light like stone. Exposed everywhere paint wore off: tread zones, hatch rims,
   anywhere boots and ore touch.
4. **Roughness by zone.** Paint 0.55–0.75 (flat industrial). Bare steel 0.45–0.65. Machinery
   0.50–0.70. Slag-sprayed torch shields 0.65–0.80. Canopy 0.08–0.18, with wiper arcs polished
   back to 0.10 — the only polished thing on the ship is where the pilot looks out. Hand-rubbed
   grab rails locally 0.35–0.50: contact polish is the Drift's one gloss.
5. **Panel-edge treatment.** Rounded by wear, not by drawing — edges knocked down by abrasion and
   by the hammer that seated the plate. Nothing remains sharp except fresh torch cuts, and those
   get a pass with a grinder *eventually*.
6. **Fasteners & seams.** Hot-driven dome rivets, Ø0.045 m heads, pitch 0.12 m, staggered double
   rows at structural seams. Rivets are proud, big, and honest — the Drift's signature dot-grid
   reads at 60 px.
7. **Heat & exhaust wear.** Allowed to accumulate: straw-to-soot ramp (#8A6A3A→#3A3230) spreading
   1.8 m from nozzles, ore-torch mounts, and radiator roots. Nobody washes a workboat while the
   claim is paying.
8. **REPAIR PRACTICE — riveted overplate.** A breach gets a square galvanized overplate, one row
   of big dome rivets, edges sealed with an orange mastic bead squeezed out and thumbed flat. The
   patch is never color-matched and never painted to hide — a Drift hull wears its repairs like a
   tradesman's scar tissue. Patch count up to 3 on old hulls; `wear_patch_outline` + rivet rows.
9. **Decals & typography.** Stencil: registration `DMC-####` plus claim numbers on the flank;
   crew names hand-stenciled at the hatch. Warning labels abundant (chevrons, lift-here, tow
   brackets) and half-faded. No kill marks — the Collective fights rocks, not people.
10. **Emissive placement.** Sodium-orange work lamps at service points, hatch beacons, and a
    rotating beacon on the ore boom. Intensity 0.8; windows are few and small — light goes where
    hands work.
11. **Cleanliness profile.** Honest grime: reddish ore dust in every recess (recess bias 0.85),
    oil at actuator roots, no streaking pattern — dust settles, it isn't washed by airflow because
    nothing is streamlined.
12. **Preferred modules.** `rivet_strip` (its native seam), `bracket_gusset` (triangular gussets
    at every doubler), `plate_lip`, `pipe_clamp` (external runs, saddle clamps), `vent_grid`
    (horizontal louvers), `heat_shield` (corrugated blanket panels at torch mounts).

**Grey-read:** a dense dot-grid of rivets, small lumpy plates with doublers, flat matte tone,
dust in every line. Mass and labor are the identity.

---

## 4. faction_reach — Crimson Reach

*pirate · cobbled predator · anchor #D8334A · profile: grime 0.85, chrome 0.0, punk, killMarks, patches 0.6*

1. **Armor segmentation.** Scavenge. No grid: plates of mixed provenance and mixed thickness
   overlap like scales, big stolen slabs over the powerplant and cockpit, thin scrap everywhere
   else. Plate sizes 0.4–2.0 m with no rhythm — the rhythm is "what the last dead ship had."
2. **Paint application.** Rattle-can and mop over unprimed steel, previous owner's paint, or rust.
   War bands are sprayed diagonal across seams (paint ignores structure — the opposite of
   Concord). Much of the hull is bare scorched steel. Paint ends wherever the can ran out.
3. **Exposed alloy.** Mixed salvage plate: oxidized, oil-blackened, occasionally still wearing
   the donor ship's livery under scorch. No anisotropy; surfaces are pitted and scatter light
   dead.
4. **Roughness by zone.** Paint 0.60–0.85 (flat, oxidized, bubbling where sprayed over hot
   patches). Bare salvage 0.50–0.80. Machinery 0.45–0.75. Scorched shroud wraps 0.70–0.90.
   Canopy 0.10–0.22, pitted, cracks taped. Exception: weapon-root rings heat-polished to
   0.40–0.55 by repeated firing — the one smooth thing on a Reach hull is where it kills.
5. **Panel-edge treatment.** Burred torch cuts, slag unground. Edges are sharp, ragged, and
   dangerous; the burr fringe catches rim light and reads as a ragged outline at distance.
6. **Fasteners & seams.** External stitch weld beads, Ø0.030 m, nominal pitch 0.25 m but varying
   0.15–0.40 within one seam — whatever held. Some seams are just caulk and spite. Rivets appear
   only when a stolen plate arrived with them.
7. **Heat & exhaust wear.** Heavy and proud: over-driven engines leave carbon plumes
   (#3A2A22→#120D0B) spreading 2.5 m, scorch rings at weapon collars, heat-blued boost intakes.
   The tail of a Reach ship disappears into its own soot.
8. **REPAIR PRACTICE — welded scrap patch.** Torch-cut scrap of any shape, stitch-welded over the
   hole, slag left on, paint slapped over while still hot (bubbled). Patches stack — patch over
   patch over patch; a veteran Reach hull is more patch than ship (up to 6 visible). Each patch
   edge gets `wear_weld_ring`; no two patches share a shape.
9. **Decals & typography.** Hand-painted: jagged clan glyph on the nose, kill tallies under the
   canopy (`wear_kill_tally`, grouped in fives). No registration — the former owner's reg is
   crudely over-painted, still faintly visible, which is the point. Warning labels are painted
   over or kept as decoration. Density high and chaotic.
10. **Emissive placement.** Jittery red-orange tube lamps of uneven brightness (failing ballasts),
    extra floods bolted around trophy racks, weapon-root glow. Intensity 0.7 nominal but uneven —
    emissives flicker in attitude, not in rhythm.
11. **Cleanliness profile.** Filthy: oil, carbon, rust bleed from every weld and lap (recess bias
    0.90), airflow-streaked. Grime is camouflage, intimidation, and indifference in one layer.
12. **Preferred modules.** `weld_seam` (its native joint), `plate_lip` (stepped laps of mismatched
    scrap), `armor_spacer` (standoffs holding stolen slabs), `weapon_collar` (oversized,
    recoil-braced), `bracket_gusset`, `heat_shield` (foil with clips, half missing).

**Grey-read:** ragged scale-silhouette, weld ropes, blotchy tone breaks that ignore panel lines,
and a tail eaten by soot. Chaos is the identity.

---

## 5. faction_quiet — The Quiet

*smuggler · low-observable · anchor #7A5FB0 · profile: grime 0.50, chrome 0.0, punk, patches 0.35*

1. **Armor segmentation.** Medium flush-fitted plates, 1.0–2.0 m, on an orthogonal grid whose
   seams are *staggered* — no two adjacent split lines run collinear for more than a plate length.
   Gaps are the tightest of any faction (0.015 m) and every gap is filled with conductive sealant:
   the hull reads as one dark shape, not a set of plates.
2. **Paint application.** Hand-buffed matte absorbent coating, applied in thin cross-hatched
   passes, edges taped sharp. One tone, no two-tone: contrast is a signature, and signatures get
   you caught. Paint covers everything except engineered wear points.
3. **Exposed alloy.** Dark anodized, dead-dull. Exposed only at sensor apertures and the
   umbilical collar — places that must be bare to work. No anisotropy; directionality is a
   reflection, and reflections talk.
4. **Roughness by zone.** Paint 0.58–0.72 (matte absorbent). Anodized alloy 0.40–0.60. Machinery
   0.45–0.62, blackened. RAM appliqué 0.60–0.75. Canopy 0.06–0.14, smoked. Leading edges and hand
   points buff to 0.40–0.55 in service and get re-coated at the next safe port — on a Quiet hull,
   a shiny leading edge is a maintenance debt.
5. **Panel-edge treatment.** Machined chamfer, then filled and faired — the seam is there, you
   just can't see it until you're close enough to be a problem.
6. **Fasteners & seams.** None visible. Plates are bonded; fasteners are internal. (Machine
   profile: style `hidden`, spacing 0, scale 0 — truly fastener-less, the only faction that is.)
7. **Heat & exhaust wear.** Suppressed as doctrine: heat signature discipline means staining is
   wiped and baffled. What remains is a faint grey bloom (#4A4A52→#2A2A30) within 0.4 m of nozzle
   rims — the narrowest heat read of any faction.
8. **REPAIR PRACTICE — anonymous blanking.** A flush blank plate bonded over the damage, zero
   fasteners, edges sealed with dark compound, blended matte — but deliberately *not* exactly
   color-matched and deliberately unmarked: a slightly darker, totally anonymous panel. The Quiet
   does not log its repairs because it does not admit to its hull. Up to 2 blanks; they read as
   quiet gaps where identity used to be.
9. **Decals & typography.** Essentially none. The registration plate is removed and the scar of
   its removal is visible (a cleaner rectangle — identity by absence). One small hand tag (`punk`)
   lives *inside* the cockpit sill where only the crew sees it. No warnings, no kill marks —
   nothing that talks.
10. **Emissive placement.** Runs dark: navigation lights shuttered to slits, intensity 0.35 — the
    dimmest in the game. The brightest emission is the cabin glow leaking at the canopy seal.
11. **Cleanliness profile.** Flats are wiped; recesses are not (nobody polishes what doesn't
    reflect). Recess bias 0.80, no streak direction — streaks get wiped because streaks catch
    light.
12. **Preferred modules.** `sensor_housing` (canted, baffled lens boxes), `access_panel` (flush,
    screwed, gasketed), `hatch_frame` (dogged oval, seal-first), `pipe_clamp` (runs internalized
    where possible), `fastener_recessed` (the few service seams that must open).

**Grey-read:** one continuous dark shape with staggered ghost seams and almost no glow. Absence
is the identity.

---

## 6. faction_vael — The Vael

*xenophobic · grown, not built · anchor #2FCFA0 · profile: grime 0.15, chrome 0.30, insignia, killMarks, patches 0.1*

1. **Armor segmentation.** Organic. Overlapping scale-petals in radial flows growing from keel
   nodes; plates graduate 0.3 m at the prow to 1.6 m amidships along the flow. "Split lines" are
   growth sutures — slightly raised, calcified ridges where two plates fused. Nothing is
   orthogonal; everything has a growth direction.
2. **Paint application.** None. Color is structural — pigmented nacre laminate grown in layers;
   the faction tint plays across an interference sheen. Two-tone doesn't exist; tone shifts with
   view angle, not with masking.
3. **Exposed alloy.** Not alloy: exposed grown laminate, deep green-grey with a growth-aligned
   sheen (anisotropy along the flow direction, like brushed shell). Sensor organs and the canopy
   membrane have a milky organic gloss.
4. **Roughness by zone.** Nacre plate faces 0.25–0.42 (smooth, depth-sheen). Exposed grown
   laminate 0.30–0.48. Calcified suture ridges 0.50–0.65 (bone-matte). Grown-metal organ mounts
   0.35–0.55. Membrane canopy 0.15–0.25 —
   glossier than any painted surface on the ship, an inversion of every human faction.
5. **Panel-edge treatment.** Grown rolled lip, ~0.03 m radius, like a shell edge — the thickest
   "edge treatment" of any faction, and it self-heals.
6. **Fasteners & seams.** None exist. Plates fuse at sutures; the only fastener-equivalents are
   suture nodes — small nacre bumps pitched ~0.60 m along suture lines, Ø0.012 m. (Machine
   profile: style `hidden` with spacing 0.60 / scale 0.012 as suture-node stand-ins.)
7. **Heat & exhaust wear.** Vael drives run cool: no carbon. Exhaust leaves an iridescent
   thin-film deposit, oil-on-water pale green-grey (#2A4A44→#6A8A80), within 0.8 m of the drive
   suture ring — the only faction whose "soot" is pretty.
8. **REPAIR PRACTICE — resin regrowth.** A breach is sealed with secreted resin and the plate
   *re-grows*: the repair reads as a paler, smoother patch with concentric growth rings, slightly
   glossier than the surrounding hull — a scar in the biological sense. One regrowth scar on a
   veteran hull; it is not hidden and not decorated, it simply *is*.
9. **Decals & typography.** No typography. A single inlaid prow sigil (`fac_vael`, grown into the
    laminate — applied via the stencil pipeline but with zero edge, as if under clear nacre).
    Kill-notches are etched into a keel spur — physical notches (geometry), not paint: the Vael
    count kills in their body, not on it.
10. **Emissive placement.** Bioluminescent vein network running *along the sutures* — emissive
    follows the seams, the exact inverse of Concord (which lights frame lines) and the Choir
    (which lights openings). Green-cyan, intensity 1.2, slow pulse; it is language, not lighting.
11. **Cleanliness profile.** Hulls self-clean; only mineral dust lodges in suture ridges (recess
    bias 0.92, the highest — sutures are the only recesses that exist). No streaks; nothing flows
    on a Vael hull.
12. **Preferred modules.** `sensor_housing` (grown conformal blisters — the family re-authored
    with organic proportions), `heat_shield` (layered scale-foil), `rail_split` (grown keel
    rails), `vent_grid` (gill-slit reinterpretation). Vael pieces are *grown* versions of the kit
    families: same needs, alien answers — the variant lanes must re-proportion, not just re-tint.

**Grey-read:** radial scale flows, raised suture ridges, glowing veins tracing the seams, no
straight line anywhere. Biology is the identity.

---

## 7. faction_free — Free Frontier

*independent · the haunted runner · anchor #4ECBE0 · profile: grime 0.55, chrome 0.05, bomber, killMarks, patches 0.4*

1. **Armor segmentation.** A factory orthogonal grid (0.8–1.6 m plates) — visible as a ghost under
   everything that happened since: aftermarket plates of different sizes bolted over it, a
   replacement fin panel that doesn't quite match, seams re-cut by a succession of owners. The
   base order is real but *broken*; a Frontier hull is a grid with a history.
2. **Paint application.** Generations: factory spray underneath, hand-rolled and brush touch-ups
   over it, primer spots where a patch was prepped and never finished, nose art hand-painted over
   everything. Paint ends wherever each successive owner stopped caring — at different lines on
   different panels.
3. **Exposed alloy.** Plain alum-steel, oxidized grey-brown at scratches and chip clusters; no
   anisotropy. Exposed at every chip site, hatch rim, and anywhere a part was swapped and the
   surround was scuffed to fit.
4. **Roughness by zone.** Paint 0.48–0.68 (aged factory + hand coats). Bare alloy 0.55–0.75.
   Machinery 0.48–0.66. Aftermarket heat wrap 0.62–0.78. Canopy 0.07–0.16 — polished where the
   pilot actually looks out, dusty elsewhere (the one wiped thing is the view).
5. **Panel-edge treatment.** Mixed: surviving factory chamfers, edges rounded by years of hands,
   and the occasional burred field cut that never got ground. Dominant read is worn-round with
   honest exceptions.
6. **Fasteners & seams.** Whatever was in the toolbox: hand-driven rivets Ø0.035 m at a wandering
   0.15 m pitch, self-tappers where a rivet gun wouldn't fit, and one seam held by speed tape
   because it holds fine, okay?
7. **Heat & exhaust wear.** Carbon streaks build at engine roots and mounts (#4A3A2C→#1E1712,
   1.5 m spread), plus the odd scorch from an over-temp run the pilot doesn't want to discuss.
   Staining is never cleaned on principle and occasionally cleaned by accident.
8. **REPAIR PRACTICE — tape and pray.** Small breaches: composite speed tape + filler, hand-rolled
   paint over. Bigger ones: a riveted patch *not trimmed square* — whatever shape the scrap was,
   mastic squeezed out around the edges and left. Up to 4 visible repairs; each is a different
   shape, age, and shade because each was a different bad week.
9. **Decals & typography.** Hand-painted nose art — motto + mascot (`bomber` style; the player
    Kestrel wears `BORROWED TIME`, ghost mascot, shark mouth) — over a registration `FF-####` that
    is usually half-painted-out by the motto. Kill tally below the canopy sill (the Kestrel wears
    13). Warning labels moderate, half-legible, sometimes improved by hand.
10. **Emissive placement.** Plain cyan running lights, some replaced with wrong-color spares from
    a parts bin; a warm cabin leak. Intensity 0.75. Nothing matches because matching costs money.
11. **Cleanliness profile.** Field-maintained: canopy and sensors wiped, everything else dusty;
    oil at engine mounts, dust in panel gaps and canopy sills (recess bias 0.70), airflow
    streaking allowed to develop. A Frontier ship is clean exactly where its pilot's survival
    depends on clean.
12. **Preferred modules.** `rivet_strip`, `plate_lip`, `pipe_clamp` (external runs re-routed by
    hand), `access_panel`, `hatch_frame`, `weld_seam` (the occasional proper weld done by a
    friend who owed a favor).

**Grey-read:** a ghost grid under mismatched plates, tape edges, tally marks, and one thing —
the view out — kept clear. History is the identity.

---

## 8. faction_choir — Ascendant Choir

*zealot · cathedral engineering · anchor #E85FD0 · profile: grime 0.30, chrome 0.10, no noseArt, no killMarks, patches 0.2*

1. **Armor segmentation.** Radial: tall narrow lancet plates, 0.5 m wide × 2–4 m long, arranged in
   radial fans about the dorsal spine and overlapping upward toward the prow like shingles toward
   the relic core. The segmentation *is* the iconography — a Choir hull reads as a vault roof from
   above, which is the intent.
2. **Paint application.** Polished enamel over gilded primer, applied by ordained yards; masked
   liturgical two-tone with the secondary tone reserved for plates considered sanctified. A
   scripture band is masked *along* split lines (paint honors the seam, as Concord does — but
   where Concord masks for tolerance, the Choir masks for liturgy).
3. **Exposed alloy.** Gilded bronze-anodized trim, brushed along plate length — exposed proudly at
   plate lips, rail crowns, and weapon collars. Bronze castings on machinery. Bare metal on a
   Choir hull is vestment, not economy.
4. **Roughness by zone.** Enamel 0.30–0.50 (polished but devotional, not showroom). Gilded trim
   0.22–0.38 (the second-glossiest surfaces in the game after Meridian paint). Machinery
   0.42–0.58. Censer-vent stone-composite 0.52–0.66. Canopy 0.05–0.13, stained-glass tint.
5. **Panel-edge treatment.** Welded lip raised into a decorative bead — seams are celebrated, not
   hidden: every plate edge carries a dressed weld bead, ground into a uniform rope and polished.
   The only faction whose *seams* are jewelry.
6. **Fasteners & seams.** Ceremonial rivet rows in ritual groupings (threes and sevens), Ø0.028 m
   heads at 0.21 m ritual pitch, polished bright. A Choir fastener row reads as prayer beads
   tracing the plate edge.
7. **Heat & exhaust wear.** Votive soot is *permitted by doctrine* at censer vent-shrines:
   gold-brown (#7A5A2E→#2E2014) spreading 1.2 m around the vent-shrines and nozzle. Soot anywhere
   else is washed — staining is holy only where the liturgy says it is.
8. **REPAIR PRACTICE — votive blanking.** Damage is covered by an engraved blanking plate —
   polished bright, engraved with scripture recounting the battle survived, riveted with a full
   ceremonial row. The patch is meant to be *seen* (the exact inverse of the Quiet's anonymous
   blanks): each repair is a memorial. Up to 2 votive plates; a veteran Choir hull carries its
   history as bright engraved plaques amid the enamel.
9. **Decals & typography.** Holographic scripture along the spine band; marks of office at the
   prow; registration `AC-####` in liturgical capitals. Warning labels dense and reframed as
   blessings ("blessed is the high voltage" — `warn_radiation_trefoil` appears as a reliquary
   mark). No kill marks and no nose art (shipped profile): victories are recorded on votive
   plates, not tallied like sport.
10. **Emissive placement.** The brightest faction in the game: tall magenta lancet slit-windows,
    organ-pipe vent glow, a halo ring on the spine. Intensity 1.6 — glow is the sermon.
11. **Cleanliness profile.** Ritual washing of icon surfaces and enamel; soot allowed to
    accumulate only at vent-shrines and in suture seams and rivet rows by doctrine (recess bias
    0.75). A Choir ship is clean *as an act of worship*, selectively.
12. **Preferred modules.** `rail_split` (I-profile rails crowned bright), `sensor_housing` (mast
    with dish — reliquary-topped), `weapon_collar` (flanged, engraved), `plate_lip` (raised
    weather strips dressed bright), `rivet_strip` (ceremonial rows), `heat_shield` (rigid
    scalloped plates, scallops as tracery).

**Grey-read:** radial vault-plates, beaded seams, engraved bright plaques, and tall glowing
lancets. Liturgy is the identity.

---

## Cross-faction contrast table

Terse tokens; full answers in the faction sections. Numbers in `material_profiles.json`.

| Axis | SCN | MTS | DMC | Reach | Quiet | Vael | Free | Choir |
|---|---|---|---|---|---|---|---|---|
| 1 Segmentation | ortho grid, 1.2–2.4 m, stern-overlap | clamshell 2.5–5 m, styling-line splits | small ortho 0.6–1.4 m + doublers | scavenge scales 0.4–2 m | ortho staggered, flush 1–2 m | organic radial scale-flow 0.3–1.6 m | broken factory grid 0.8–1.6 m | radial lancets 0.5×2–4 m |
| 2 Paint | robot 2-pack, masked at seams | ceramic-clearcoat clamshell bake | hand-rolled, primer showing | rattle-can over anything | hand-buffed matte absorbent | none — pigmented nacre | factory + hand generations | enamel over gilded primer |
| 3 Alloy | brushed Ti, fore-aft | clearcoated warm cast | cast manganese, mill scale | mixed salvage, dead | dark anodized dull | grown laminate, flow sheen | plain alum-steel oxidized | gilded bronze, brushed |
| 4 Roughness (paint) | 0.28–0.42 | 0.18–0.32 | 0.55–0.75 | 0.60–0.85 | 0.58–0.72 | 0.25–0.42 nacre | 0.48–0.68 | 0.30–0.50 |
| 5 Edge | machined chamfer 0.01–0.02 | soft product round 0.03–0.06 | wear-rounded | burred torch cut | chamfer, filled/faired | grown rolled lip 0.03 | mixed worn | raised dressed weld bead |
| 6 Fasteners | recessed torx 0.18/Ø0.022 | hidden + seal-heads 0.30/Ø0.018 | dome rivets 0.12/Ø0.045 | stitch welds 0.25±/Ø0.030 | none (bonded) | none (fused; suture nodes 0.60) | hand rivets ~0.15/Ø0.035 | ritual rivets 0.21/Ø0.028 |
| 7 Heat wear | cleaned; straw tint 0.6 m | amber haze 0.5 m, detailed away | soot 1.8 m, kept | black plumes 2.5 m, proud | wiped; grey bloom 0.4 m | iridescent film 0.8 m | streaks 1.5 m, unbothered | votive soot 1.2 m, doctrinal |
| 8 Repair | yard plate swap, invisible | serialized clamshell + holo seal | riveted overplate + mastic | welded scrap, slag on | anonymous bonded blank | resin regrowth rings | tape/filler + untrimmed patch | engraved votive plaque |
| 9 Decals | stencil, SCN-####, dense warnings | holo, MTS-#####, minimal | stencil, DMC-#### + claim #s | hand-paint, tallies, reg over-painted | none; removal scar | inlaid sigil; notched keel spur | hand-paint motto + tally | holo scripture, AC-#### |
| 10 Emissive | frame-line blue, 1.0, disciplined | cabin gold + logo, 0.9 | work lamps, 0.8 | jittery lamps, 0.7 uneven | shuttered slits, 0.35 | suture veins, 1.2, pulsing | mismatched spares, 0.75 | lancets + halo, 1.6 |
| 11 Cleanliness | sterile by regulation | detailed; film between details | ore dust everywhere | filth as camouflage | flats wiped, recesses dusty | self-cleaning; suture dust | wiped where survival needs it | ritual wash, doctrinal soot |
| 12 Modules | recessed seams, spacers, collars | flush access, conformal sensors | rivets, gussets, pipe clamps | welds, standoffs, big collars | baffled sensors, flush panels | grown blisters, gill vents | rivets, lips, hand-routed pipe | crowned rails, masts, tracery |

### Contrast audit (rejection-condition proof)

Counting two factions as "sharing an axis" when their *construction answer is the same in kind*
(strict reading — e.g. any two `orthogonal` segmentations count as a share even at different
sizes):

- **Worst pair: DMC–Free = 3 shared** (orthogonal base grid, rivet fasteners, hand-applied paint).
  They diverge on the other 9 — most sharply on repair (riveted overplate vs tape-and-pray) and
  edge treatment (wear-rounded vs mixed worn with burr spots).
- **SCN–MTS = 2** (orthogonal base, same repair *tag* `colorMatchedReplacement` — but different
  repair culture: invisible single-plate swap vs serialized clamshell + warranty seal).
- **Quiet–Vael = 2** (fastener-less construction, recess-only cleanliness).
- **SCN–Quiet = 2** (orthogonal base, chamfer family — though Quiet fills/fairs theirs).
- All other pairs ≤2. No pair exceeds 4 of 12. ✓
- **Repair × fastener pairs:** `colorMatchedReplacement+recessed` (SCN) vs
  `colorMatchedReplacement+hidden` (MTS); `panelBlanking+hidden` (Quiet) vs
  `panelBlanking+rivet` (Choir); rivet fasteners split across DMC/Free/Choir with three different
  repair practices. No two factions share both. ✓

## Worked example — `hull_fighter` (10.45 m × 5.88 m) in three hands

The same donor, described three ways. Read each **desaturated** — the parenthetical is what you
still see with hue removed.

**Concord fighter.** Six dorsal plates on a straight grid, 0.025 m gasketed gaps, chamfered edges,
flush torx rows at 0.18 m. Masked two-tone: the secondary band follows the wing-root split line
exactly. `SCN-7741` stenciled on the dorsal spine, squadron insignia on the fin, intake triangles
and no-step frames at the wing roots. Emissive strips trace the frame lines. Faint straw tint
0.6 m behind the nozzles, nothing else. *(In grey: a low plate count, ruler-straight seams, gloss
banding, printed text. It reads as issued equipment.)*

**Drift fighter.** Fourteen small plates; doublers over the engine saddle and the port flank
(ore-side habit dies hard). Dome-rivet rows at 0.12 m everywhere — the dorsal reads as a dot
grid. Hand-rolled flat paint with visible laps, red primer showing at the port quarter, hazard
chevrons rolled slightly crooked at the intake lip. One galvanized overplate on the nose, mastic
bead thumbed around it. Soot fan 1.8 m off the nozzles, ore dust in every gap, `DMC-2210` and a
claim number stenciled by the hatch, crew name under it. Sodium work lamp over the hatch.
*(In grey: dark, matte, lumpy — a dense rivet dot-grid, plate steps, and a dust-filled seam map.
It reads as a tool.)*

**Reach fighter.** Nobody knows whose it was: the factory grid is buried under nine scrap plates
of mixed thickness, overlapping like scales, torch-cut edges burred and slagged, stitch welds at
a drunk pitch. War band sprayed diagonal across everything, ignoring the seams; the former
owner's registration ghosting under a rattle-can over-paint. Kill tallies hand-painted under the
canopy in groups of five. Weapon collars scorched smooth, and the whole tail disappears into a
2.5 m carbon plume. Lamps jitter. *(In grey: ragged scale silhouette, weld ropes, blotchy tone
breaks that ignore panel lines, soot swallowing the stern. It reads as a threat.)*

**Desaturation verdict:** plate count/rhythm (6 uniform / 14 doubled / 9 chaotic), joint language
(flush torx / rivet dots / weld ropes), tone structure (gloss bands at seams / flat dust-filled
gaps / blotches ignoring seams), and tail treatment (clean / soot fan / plume) are all
structurally distinct. No hue required.

## Consumption notes for downstream lanes

- Variant lanes: pick the faction profile, then apply `wearTiers` as a per-instance roll —
  `fresh` (yard/new), `serviceWorn` (default NPC), `patched` (veteran/pirate-tier). Wear fields
  modulate the named Lane E masks directly: `edgeWear→mask_edgewear`, `chips→mask_chips`,
  `grime→mask_recessdust + mask_corrosion`, `heatStain→mask_carbon/mask_heatradial` scaled by
  `heatStain.spreadM`, `patchCount→` patch decals + `mask_panelfade`.
- Painted geometry must be authored to `zones.paint.baseGray` (neutral); faction hue comes from
  the runtime tint. Do not bake faction hue into albedo.
- Kit piece material for painted kit parts is Lane D's `KitMat_Paint` (0.24/0.25/0.26) — already
  neutral and close to every faction's `baseGray`; per-faction roughness comes from the baked
  ORM, not from new materials.
- Fastener/spacing/scale numbers assume the 8–20 m ship range; kitgen variants should scatter
  within ±15% per instance for organic factions (Reach, Free) and ±2% for disciplined ones
  (SCN, MTS, Choir).
- Vael kit consumption requires re-proportioned organic variants (grown blisters, gill vents);
  do not bolt rectangular human kit onto Vael hulls and call it done.
