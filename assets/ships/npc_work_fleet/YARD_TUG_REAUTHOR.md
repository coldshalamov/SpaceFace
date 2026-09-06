# Yard Tug — form/material re-author (source pass)

Scope: `build_yard_tug_parts` (+ tug-local helpers) in `tools/blender/build_npc_work_fleet.py`.
Nothing else in the family changes. Sockets, asset/part IDs, root contract, canonical material set,
LOD recipes, drive-hook tagging and the export path are frozen.

State after this pass: **`production_model` (source-only)**. Not built, not exported, not published.
G1/G2/G4 remain **OPEN** — this record is not visual acceptance.

## 0. Why the pass exists

Controller review of the actual-source renders
(`.devshots/next10-yard-tug-source/three-quarter.png`, `top.png`, LOD0, collision hull excluded)
rejected the tug on four named defects. `DESIGN.md` already carried the same verdict
("Missing-hull / LEGO", 2026-08-18 still panel), so this is the recorded defect, not a new opinion.

| # | Rejected read | Mechanical cause in the old source |
|---|---|---|
| D1 | stacked pale LEGO blocks | `Tug_Spine` + `Tug_Keel` + `Tug_DriveBlockL/R` are four separate axis boxes that only graze each other; the drive blocks are 3.6 m tall against a 1.6 m spine, so nothing shares a silhouette |
| D2 | tall featureless mast | `Tug_WinchTower` is a 1.6 × 4.2 × 1.6 blank box; the drum is buried inside it, so no bearing, frame, fairlead or line route is visible |
| D3 | flat roof canopy | `Tug_Bridge` box + `Tug_Canopy` glass box lid — no pressure structure, no inset glass, no rake, no brow; the flat glass slab returns one specular blob |
| D4 | patterned black box engines | multi-metre flat faces carrying `Material_Mechanical`, whose map is a 40 × 16 px seam grid plus a ~7 px brush sine at normal strength 1.9. At that island scale the texture becomes a visible substitute for geometry — the banned failure in `SKILL.md` §5 |

D4 is the important one to state precisely: the material recipe is shared and correct for small
machined hardware. It is only wrong because it was asked to cover 6.4 × 3.6 m blank plates. The fix
is tug-local — **stop giving `Material_Mechanical` large flat faces** — not a shared-material edit.

## 1. Proportional fiction (`design/fiction/THE_WORKING_FLEET.md` §6, frozen)

Twenty-six metres, eleven of them engine. Two oversized drives shoulder-mounted on a spine frame; a
bow push-cradle with padded ribs scuffed white; hip nudge-keels with replaceable polymer shoes; aft
winch tower with towing drum and painted capacity plate; high bridge over the cradle so the pilot
looks **down** the client's hull. Almost no cargo volume.

Proportions authored to that sentence: hull girder x ∈ [-9.4, +9.6]; machinery x ∈ [-1.6, -12.6]
(**11.0 m**); cradle x ∈ [+9.6, +13.3]; overall ≈ **25.9 m** on the existing 7.6 m beam / 6.0 m
height envelope. `fictionLengthM` 26.0 is now met by geometry instead of prose.

**ART EXTRAPOLATION** (unsupported by canon, useful, labelled): yard-white paint over a dark rubbing
strake at the widest section; amber oxidised replaceable wear parts; nudge-thruster ports recessed in
the hip keels; ladder rungs and a grab rail on the machinery raft.

## 2. Visible-zone register

Supported review views: three-quarter and top **actual-source** renders (the two the controller
inspects), plus the 95/125/165 WU traffic band. `allSupportedViewZonesClassified: false` — a reviewer
confirms coverage; nothing below is claimed pre-approved.

| Zone | Class | Dominates a view | Substance / manufacture |
|---|---|---|---|
| Hull girder (lofted) | billed | yes (both) | painted structural alloy plate over frames; dielectric coat; `Material_Hull` |
| Drive pod shells | billed | yes (both) | same painted plate as the hull — pods are hull-family structure, not black boxes |
| Bearers, gussets, machinery bays, bay frames | billed | no | exposed brushed graphite alloy, metallic; only ever small or curved faces |
| Nozzle bells / throats / rims | billed | yes (three-quarter) | rolled hot-section alloy, hollow bell with wall thickness; cavity, never a disk |
| Drive core aperture | billed | no | recessed ≥0.9 m inside the bell; `Material_Cyan`; unlit it still reads as a throat |
| Pilothouse shell + brow + coaming | billed | yes (both) | folded plate pressure box, raked front, cambered roof |
| Pilothouse glass (5 panes) | billed | yes | physical glass, inset 0.06 m behind authored frames, wraparound |
| Push cradle: horns, buffer beam, braces | billed | yes (both) | painted plate girder work with a real load path into the keel |
| Cradle rubbing faces + keel shoes + capacity plate | billed | no | oxidised replaceable wear parts, `Material_Warm`, bolted to a dark backing frame |
| Winch: plinth, standards, drum, flanges, gearbox, fairlead | billed | yes (three-quarter) | machined bearing hardware; the drum→fairlead→astern line route is modelled |
| Hip nudge-keels + brackets + recessed ports | billed | yes (top) | painted plate fin growing out of the turn of bilge |
| Rubbing strake, seams, rails, floods | billed (grouped family) | no | thin dark section breaking the pale mass; floods reuse the accepted `_flood_fixture` |
| Collision hull | outside_supported_view | — | non-render helper (`supportedViews: []`) |

`retained_reviewed`: none. Every camera-visible tug part is re-authored in this pass; no donor or
prior geometry survives, so no inherited zone sits inside the whole-asset veto.

## 3. Shape-grammar repair

| Old grammar | New manufactured assembly |
|---|---|
| 4 disjoint boxes | one **lofted 8-point plate section swept over 9 stations** — taper, shoulder, hip waist, machinery flare — plus a keel girder cut into it |
| drive block = box | pod shell lofted on the same section family, **seated** into the hull flank and tied by two bearer beams + a gusset per side |
| drive = ring + tube + disk | **hollow bell**: outer cone, inner cone (wall thickness), rim ring, throat plate, recessed core |
| winch = blank tower | plinth → two bearing standards → drum on flanges → gearbox boss → aft fairlead roller in its frame → line leaves astern |
| bridge = box + glass lid | trunk/pedestal with ladder → lofted pilothouse, front raked 18° down over the load → 5 inset panes → brow eyebrow → cambered roof + coaming |
| cradle = slab + floating pads | two tapered horns off the bow shoulders, closed by a buffer beam, braced diagonally into the keel; wear faces bolted onto dark backing frames |

Rule applied throughout: **quiet silhouette first**. Meso detail is zoned to where load, access,
cooling and repair justify it (bearer roots, bay mouths, winch head, pad frames); the hull flanks and
pod shells stay clean painted plate. No greebles, no float, no glow cards, no decorative panels, and
no face-wide texture field standing in for form.

## 4. Material bill (canonical five only — no new material, no shared-recipe edit)

| Material | Substance | Where, and the size rule that keeps it honest |
|---|---|---|
| `Material_Hull` | painted alloy, dielectric, rough 0.68 | hull girder, pod shells, pilothouse, cradle horns/beam, hip keels, winch plinth. The pale coat is the yard's paint; it is broken up by real section change and by the dark strake, never by texture |
| `Material_Mechanical` | brushed graphite alloy, metallic 0.97 | bearers, gussets, bay cavities and frames, bells/throats/rims, winch hardware, pad backing frames, keel brackets, window frames, strake, rails. **Constraint: no `Material_Mechanical` face wider than ≈1.1 m of flat plate** — every use is a section, a curve, or a cavity. This is the direct D4 fix |
| `Material_Warm` | oxidised amber service metal | replaceable wear only: cradle rubbing faces, keel shoes, capacity plate, two grab handles |
| `Material_Glass` | physical glass | five inset pilothouse panes |
| `Material_Cyan` | cold instrument emissive | drive core aperture only, recessed deep in the bell |

Keeping `Material_Cyan` on the drive-core hook alone holds the export at **5 materials / 19
primitives** — unchanged from the current release and inside the 24-primitive whole-ship budget in
`scripts/audit-asset-structure.mjs`.

`componentReferenceDecision`: `not_needed`. No component is trapped by the software vocabulary — the
two rejection renders name the defects exactly and the fiction fixes the silhouette. No generated
reference is used, so no reference-parity contract is opened.

## 5. Frozen contracts (verified against the source before editing)

- Sockets unchanged and now landing on real hardware: `SOCKET_Engine_Main` (-11.6, 0.6, 0) and
  `SOCKET_Trail_Main` (-12.2, 0.6, 0) on the bell axis plane; `SOCKET_Push_Front` (10.6, 0.4, 0) on
  the cradle buffer beam; `SOCKET_Utility_Dorsal` (-6.4, 3.6, 0) **on the winch drum axis**;
  `SOCKET_Camera_Focus` (1.2, 1.4, 0) inside the hull mass.
- `assetId` `SF_WHOLESHIP_YARD_TUG`, `partId` `wholeship_yard_tug`, root name, traffic role `tug`,
  `spacefaceAsset` block, +X/+Y/+Z basis: untouched.
- LOD machinery untouched: parts still merge by canonical material name; `sf_drive_part` `fan`/`core`
  still produce `HOOK_DRIVE_FAN` / `HOOK_DRIVE_CORE` at every LOD; `close=True` still marks LOD0-only
  service detail.
- LOD meaning: LOD1 keeps hull, pods, bells, cradle, keels, winch load path and glass; only bolts,
  rails, seams, handles, floods and pad shims drop.
- Collision hull is still derived from LOD0 bounds by the unchanged shared code.
- `parts_manifest.json` bounds/tris/note are regenerated by `tools/art/publish_npc_work_fleet.mjs`
  during release integration; this pass hand-edits no manifest.

## 6. Cost

Source parts 24 → ~60. Expected LOD0 ≈ 4.5–5.5k tris (exact figure comes from the controller's
build). For scale inside its own family: `ore_barge` 7752, `repair_tender` 5652, `salvage_cutter`
4400, `apron_shuttle` 3456, current `yard_tug` 2240 — the tug was the thinnest hull in the fleet by a
wide margin, which is why it alone read as blockout. Primitive/material/draw structure is unchanged.

## 7. Evidence route (all still owed — nothing below is claimed)

1. `blender --background --python tools/blender/build_npc_work_fleet.py -- --only yard_tug`
2. Re-shoot the same two actual-source views at the same framing and compare against the rejection
   pair above.
3. Neutral-clay and hard grazing-light passes: the tug must still read as fabricated hardware with
   textures off, and must not read as stacked primitives.
4. Hash-bound whole-asset review record naming reviewer, views, changed zones, open P0/P1 and
   `keep|revise|revert|blocked`, then G1/G2/G4.
5. Publish/release integration and runtime evidence are the controller's serial steps.

Until 2–4 exist for this exact candidate hash the tug stays `production_model`. A green build, a
triangle count or this document are technical receipts only and close no gate.

## 8. Deck pass and controller review, 2026-09-06

The re-author above answered the three-quarter still. It did not answer the game camera. Re-shot at
the same two framings, the tug was correct in three-quarter and **one uninterrupted pale mass in
plan** — and SpaceFace is played from overhead, so the plan is the picture the player actually gets.
The rubbing strake that breaks the pale mass in a three-quarter view is a line seen edge-on from
above and does no work there.

D5 (new, plan view): nothing on the deck. The fix is the fittings a working tug needs anyway, all
fabricated structure at section scale, no wide plate and no paint standing in for form:

| Fitting | Material | Why it is there, and why it reads in plan |
|---|---|---|
| Deck margin, port and starboard | `Material_Mechanical` | the bulwark plate a crew works behind; the strongest plan-view read on the hull, so deliberately **not** LOD0-only — it must survive into the 95–165 WU traffic band where the tug is small and the pale mass is worst |
| Four hatch coamings + lids | `Material_Mechanical` / `Material_Hull` | machinery-space access, spaced down the length so the plan reads as a deck with work on it |
| Winch deck plate + kerbs | `Material_Mechanical` | the line-handling zone aft, its own bounded area rather than more of the same white |
| Centreline walkway | `Material_Mechanical` | the route from the wheelhouse door aft to the winch head |
| Hip shoe caps | `Material_Warm` | the shoes already carried oxidised service metal outboard; that face is edge-on overhead, so the wear parts are capped to be legible from the camera that matters |
| Bollards | `Material_Mechanical` | what the tow wire is made fast to; LOD0-only |

New helper `_tug_deck_run` places a fitting at the interpolated **deck top** of the loft table, the
way `_tug_flank_run` places one at the interpolated half beam, so deck work sits on the deck instead
of floating over the sheer.

Cost: source parts 87 → 122; LOD0/1/2 tris 7244/2758/1179 → **8208/3116/1331**. First pass came back
at 11276 and was reduced by dropping bevels from the segmented strip runs and thinning their counts,
which cost nothing at any real viewing distance. For family scale: `ore_barge` 7752, `repair_tender`
5652. The tug is now the heaviest hull in the fleet by a small margin, which is the right order — it
carries the most working plant (winch load path, push cradle, hip keels, deck fittings). Frozen
contracts hold: 6 meshes, the same four canonical materials plus `HOOK_DRIVE_FAN`/`HOOK_DRIVE_CORE`
at every LOD, sockets, asset/part ids and the root contract untouched.

**Controller review of this exact candidate, at the two documented source framings.** Verdict
**keep**. Silhouette, construction and material zoning all read as manufactured hardware; in plan the
hull now reads as a working deck rather than a blank. Published, released, and render-package rebuilt
against release hash `036b46403e92c5ff313c4b0b49db649dfb99b9b74b07c10b4208ad7f268dd768`; the `yard-tug` pilot binding was refreshed from the superseded hash to
this one, deliberately, because the asset changed.

**Open, and stated rather than closed:** the hull is still predominantly pale yard paint, which is
correct for the fiction but leaves the tug lighter in value than the rest of the work fleet. G1/G2/G4
remain **OPEN** — this is a single-reviewer pass at two framings, not the independent hash-bound
whole-asset review those gates require, and it makes no claim to be one.
