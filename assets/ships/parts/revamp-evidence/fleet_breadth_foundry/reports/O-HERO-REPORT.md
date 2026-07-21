# HERO Variant Lane — Report (Missions A + B)

**Branch:** `codex/fleet-breadth-foundry-20260720`  **Worktree:** `C:\Users\93rob\sf-fleet-breadth`
**Date:** 2026-07-20  **Lane:** Hero variants (audit rank #1 trade hub + rank #2 patrol Wasp)

Two shared assets — every lawful faction's patrol Wasp and the SCN/MTS/Free trade hub — given
per-faction CONSTRUCTION (not tint) per `FACTION_SURFACE_LANGUAGE.md`. Macro-first: plates,
fairings, gantries, masts, silhouette-level forms sized in bible metres. A later kit-detail
pass bolts on rivets/fasteners (clean attachment zones recorded per variant).

## Deliverables (all new files under foundry paths)

| Path | What |
| --- | --- |
| `.../variants/var_wasp_scn_patrol_v01.glb` | SCN patrol kit (full variant, donor + additions) |
| `.../variants/var_wasp_mts_escort_v01.glb` | MTS escort fairings |
| `.../variants/var_wasp_free_militia_v01.glb` | Free militia plates |
| `.../variants/var_station_trade_hub_scn_overlay_v01.glb` | Concord plated overlay (additions only) |
| `.../variants/var_station_trade_hub_mts_overlay_v01.glb` | Meridian gantry overlay |
| `.../variants/var_station_trade_hub_free_overlay_v01.glb` | Free patchwork overlay |
| `.../variants/hero_manifest.json` | preservation/budget/determinism record (written by check_hero) |
| `.../variants/tradehub_overlays.json` | per-overlay {donor, anchorFrame, intendedFaction, attachNotes} |
| `tools/foundry/hero/hero_common.py` | KitMat_* (exact brief-D values) + macro geometry helpers |
| `tools/foundry/hero/build_wasp_kits.py` | 3 wasp variants (seeded, raycast dorsal placement) |
| `tools/foundry/hero/build_tradehub_overlays.py` | 3 hub overlays (donor-frame anchored) |
| `tools/foundry/hero/check_hero.py` | TDD gate → `HERO_CHECK_OK` |
| `tools/foundry/hero/render_hero_evidence.py` | lineup + before/after evidence generator |
| `.../renders/hero/wasp_lineup_clone.png` · `wasp_lineup_varied.png` | the decisive lineup boards |
| `.../renders/hero/hub_before_after_{scn,mts,free}.png` | matched-camera before/after triptychs |
| `.../reports/hero/*.report.json` | validator reports (6 GLBs) |

## Commands + results

| Command | Result |
| --- | --- |
| `blender -b -P tools/foundry/hero/check_hero.py` | **HERO_CHECK_OK**, exit 0 (builds both missions, verifies every rule, 2-run determinism) |
| `node validate_foundry_glb.mjs <3 wasp> --budget 16136` | **3× PASS**, 0 warnings (tris 12126 / 12974 / 12994) |
| `node validate_foundry_glb.mjs <3 hub overlays> --budget 12000` | **3× PASS**, 0 warnings (tris 1976 / 4200 / 844) |
| `node validate_foundry_glb.mjs <wasp> --class variant` | FAIL — **expected**: whole-ship variants exceed the generic 8000 "variant" ceiling; the applicable cap is donor+40% = 16136 (enforced by check_hero) |
| `python tools/foundry/hero/render_hero_evidence.py` | 5 evidence boards into renders/hero/ |

### Preservation (check_hero, per wasp variant — all pass)
- 12/12 donor empties present, world-transform drift **0.0** (tol 1e-5), never reparented.
- +X forward preserved (nose sockets stay +X, no mirror).
- X-length within ±2% of donor 22.0 m.
- All 8 donor meshes present (silhouette identity); additions are ADD-only (no booleans).
- tris ≤ donor 11526 + 40% = 16136.
- Materials = donor's 7 + only the four `KitMat_*`. Added objects all `VAR_*`.
- TANGENT attributes preserved (`export_tangents=True`) — matches the donor's normal-map setup.

### Determinism
Every builder is seeded (`random.Random(seed)`), no wall-clock/uuid. check_hero builds each
variant's additions **twice** (fresh donor import + raycast each time) and compares VAR_ vertex
hashes — identical. Hub overlays hashed twice from the constant donor frame — identical.

## Faction constructions built (bible-faithful)

**Wasp (full variants, dorsal macro):**
- **SCN patrol** (§SCN, order): 3 low-count symmetric spine plates + 1 flank pair, one BOLD
  full-width two-tone band on a split line, and a disciplined straight emissive frame-line grid
  (raised relief). Restraint is the identity — deliberately the fewest additions.
- **MTS escort** (§MTS, product): tall continuous smooth clamshell spine cover (mid + fore + aft
  fairings) that wraps the donor's angularity into one rounded lump, 3 conformal sensor blisters,
  a gold-zone accent panel, ONE clean cabin strip. Biggest gestalt shift.
- **Free militia** (§Free, history): 6 mismatched bolt-on plates at big height variance with
  stepped lips, a FAT hand-routed conduit snaking asymmetrically, a scavenged pod that breaks the
  hull outline, one overplate repair patch, scattered mismatched emissive stubs.

**Hub (overlays, additions only, donor-frame anchored, origin identical):**
- **SCN Concord plated**: 18-plate armor cladding ring on the outer wall + 12 disciplined emissive
  spars rising above the top edge + a customs gantry arm off the +X berth.
- **MTS Meridian gantry**: 2 concentric commerce gantry rings + tie struts + 6 radial holo-ad
  armatures (frames + emissive panels) + 4 smooth clamshell crowns on top.
- **Free patchwork**: 8 scavenged habitat pods bolted proud of the wall + mixed truss splices +
  6 tape-and-pray panel skirts hanging at the rim.

## Lineup verdict — do the three Wasps stop reading as "the same ship dipped in paint"? (honest)

**Mostly yes — and honestly graded per faction.** At game_cam / mid gameplay distance (~150 px),
on GEOMETRY ALONE (neutral KitMat, no tint):
- **MTS — yes, clearly.** The continuous smooth spine ridge changes the top profile; it no longer
  reads as the angular donor.
- **Free — yes.** The fat conduit + the outline-breaking pod + lumpy asymmetric plates read as a
  different, junked-up ship.
- **SCN — a genuine but subtler shift.** Its identity is *restraint*, so it stays closest to the
  donor by design; it's carried the rest of the way by its emissive-PLACEMENT pattern (disciplined
  straight grid vs Free's scattered stubs vs MTS's single strip) and by tint. Calling SCN
  "clearly not the donor" on silhouette alone would be an overstatement — it's the marginal case,
  faithfully.

At the far end (~60 px, `zoom_out`) additions merge into the silhouette; only gross top-profile
mass (MTS) and outline breaks (Free pod) survive. Under faction TINT (lineup bottom row, approx
primaries multiplied — evidence only, never baked) all three separate strongly, which is by design
(bible tint-contract: neutral paint, runtime hue). The tint row is a **whole-image multiply
approximation** (not paint-zone-masked), so it also tints the dark hull and cyan trim — a rough
preview of runtime tint, not a faithful zone render. See `wasp_lineup_clone.png` (donor ×3) vs
`wasp_lineup_varied.png`, and the per-variant multi-view sheets in `renders/hero/wasp_sheets/`
(silhouette / clay / channel reads the lineup can't show — where SCN's restraint is best documented).

## Self-identified caveats / shortcuts (honest)

1. **Evidence render undersells emissive.** The harness has no bloom; the game does, and handles
   emissive at higher intensity. SCN's frame-line grid and Free's scattered stubs read more
   strongly in-game than in these neutral stills. `KitMat_Emissive` is fixed at strength 1.0
   (brief-D binding) — not tuned for the render.
2. **Hub renders textureless/gray.** Blender 5.1 cannot import the meshopt-compressed hub donor;
   the before/after uses a decompressed, texture-stripped working copy (via
   `tools/art/decompress_part.mjs`, into scratch — donor never modified). So the hub reads as
   neutral gray in both before and after; the overlays show by form/shadow, not final look.
3. **Macro-first, by design.** No rivets/fasteners yet — those are the deferred kit-detail pass.
   Clean attachment zones recorded per variant in `hero_manifest.json`
   (`rivet_pass_attachment_zones`) and in `tradehub_overlays.json` (`attachNotes`).
4. **Wasp additions sit largely in the inter-nacelle dorsal channel** (where the bible puts SCN
   armor — reactor/cockpit). The most distance-robust differentiators are the outline-breaking /
   top-profile forms; interior-valley detail is the first to vanish at 60 px.
5. **`--class variant` FAILs the wasps** (12k > generic 8000) — expected and correct: that ceiling
   is for kit/small-part variants, not whole-ships. The authoritative wasp cap is donor+40%.

## Unfinished / not in scope
None of the six variants are unfinished; check_hero is green and all GLBs validate. Kit-detail
(rivet) pass is intentionally deferred to the kit lane. No git writes; no donor files modified;
only new files under foundry paths.
