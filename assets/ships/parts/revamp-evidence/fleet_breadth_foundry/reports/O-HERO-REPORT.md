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

---

# REPAIR ROUND — trade-hub overlays remastered to station scale (2026-07-20)

**Wasps are UNTOUCHED** (still `HERO_CHECK_OK`, tris 12126 / 12974 / 12994). This round rebuilds
ONLY the three trade-hub overlays. The hub geometry described in the "Hub (overlays…)" bullet and
the "Faction constructions" section above is the **rejected v1** and is superseded below.

## Why it was rejected (lead vision review)
The v1 overlays were **ornament-scale on a ~121×105 m building**: at game_cam they read as ~4 small
rooftop cubes + a thin wire ring; at zoom_out they added essentially nothing (the "after" square was
indistinguishable from the bare donor). Features were not proportional to the host.

## Donor fact that drove the redesign
Profiling the decompressed donor (`tools`-side, into scratch) showed the donor's **top is a full
120.8 × 104.9 m roof rectangle at z≈26–28.7** (half-extents 60.4 × 52.4, centred at x≈3.0), while the
body tapers narrower in Y beneath it. So the roof + roof-edge rectangle is the solid, known ground the
60° top-down camera actually sees — all new masses seat there. **zoom_out pixel reality** (fill 0.10 /
384 px ⇒ the host spans ~38 px, ~3.2 m/px): thin verticals (masts, spars, thin bands) barely register;
the silhouette is carried by **footprint-outline change and outward horizontal masses**. Each faction
was therefore engineered to a *categorically different outline*.

## What each overlay is now (station-scale, seated on the roof + roof-edge)
- **SCN — fortified customs bastion (orthogonal, symmetric).** Full-perimeter armored cladding band
  (12 m tall × 5 m proud, segmented at ~17 m pitch) + **four heavy corner bastions** (26 m blocks that
  clamp/enlarge the rectangle — the crisp zoom_out read) + a disciplined 2×3 grid of 24 m frame-line
  masts on the roof + **two symmetric customs gantry booms** (~40 m reach past the −X berth wall, tied
  by a gate bar — the strong outward zoom_out read). tris **2756**.
- **MTS — layered commerce (soft product rounds).** Two concentric **standoff halo rings** (smooth
  ellipses offset ~8–15 m out from the hull edge, standing clear of the roof on **12–14.5 m vertical
  legs** with inner-to-outer ties) + **rounded clamshell fairing crowns** bulging past the 4 roof
  corners + 2 mid-edges (the dominant rounded zoom_out read) + 4 upright holo-ad billboard frames on
  the roof. tris **4800**.
- **Free — scavenged accretion (nothing aligned, asymmetric).** 12 big habitat pods (capsule bodies +
  domed caps), 2 of them oversized radial **outriggers** cantilevered past the rim, the rest clustered
  over the roof breaking the outline at unaligned points + junk truss splices + mismatched panel skirts
  hanging off the −X and −Y edges only. tris **1752**.

Materials: only the four `KitMat_*` (via `hero_common.ensure_all_kitmats`, unchanged). All objects
`VAR_*`. New geometry helpers are local to `build_tradehub_overlays.py`; `hero_common.py` was **not**
touched (it is shared with the accepted wasps).

## zoom_out verdict (my own eyes, `--fast` matched-camera frames)
**PASS — all four are distinguishable by silhouette alone.** Bare donor = a clean ~38 px square.
**SCN** = a crisp, heavier square with four bright corner masses + a twin-boom protrusion on one edge
(ordered/symmetric). **MTS** = a rounded, lobed mass with a faint halo ring and soft corner bulges.
**Free** = a ragged, lopsided square with irregular pods breaking the rim asymmetrically. No pair
collapses to "rectangle with small bumps"; SCN↔Free is the closest pair but reads apart on
symmetry-vs-chaos and the SCN boom. game_cam/neutral_close are unambiguous.

## Commands + results (repair round)
| Command | Result |
| --- | --- |
| `blender -b -P tools/foundry/hero/build_tradehub_overlays.py` | builds 3 overlays, tris **2756 / 4800 / 1752**, writes `tradehub_overlays.json` |
| `node tools/foundry/validate_foundry_glb.mjs <3 overlays> --out reports/hero --budget 12000` | **3× PASS**, 0 warnings |
| `blender -b -P tools/foundry/hero/check_hero.py` | **HERO_CHECK_OK**, exit 0 (both missions; wasps unchanged; 2-run determinism; writes `hero_manifest.json`) |
| rebuild + SHA256 vs `hero_manifest` | **3× MATCH** — GLB bytes byte-identical across runs (determinism rule 4 at the file level) |
| `python tools/foundry/hero/render_hero_evidence.py` (`SF_HERO_WORK`=scratch) | regenerated `hub_before_after_{scn,mts,free}.png` (+ unchanged wasp lineups) |

`check_hero.py` change (hub section only, wasp asserts untouched): the hub-overlay envelope sanity
bound was widened from a flat ±20 m to per-axis **XY_OUT=44, Z_UP=32, Z_DOWN=26 m**, because
station-scale features legitimately extend past the donor bbox (booms reach ~37 m past the wall, masts
rise ~28 m above the roof, rings float ~18 m out, outriggers break the rim ~25 m). Verified overlay
bboxes (Blender frame) sit inside with headroom: SCN x[−94.4,76.4] y[±65.4] z[11.2,56.2]; MTS
x[−78.8,84.8] y[±70.9] z[26.7,49.2]; Free x[−67.8,59.5] y[−77.5,59.0] z[15.2,40.6]. The bound still
rejects gross authoring/origin errors.

## Files changed this round
- `tools/foundry/hero/build_tradehub_overlays.py` — rewrote `_scn_hub` / `_mts_hub` / `_free_hub` +
  `ATTACH_NOTES` + docstrings (local helpers only; no `hero_common` change).
- `tools/foundry/hero/check_hero.py` — widened the hub-overlay envelope (hub section only).
- `assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_{scn,mts,free}_overlay_v01.glb` — remastered.
- `assets/ships/foundry/fleet_breadth_20260720/variants/tradehub_overlays.json` — regenerated (new tris + attachNotes).
- `assets/ships/foundry/fleet_breadth_20260720/variants/hero_manifest.json` — regenerated (new hub tris/bbox/sha/determinism).
- `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/renders/hero/hub_before_after_{scn,mts,free}.png` — overwritten.
- `assets/ships/parts/revamp-evidence/fleet_breadth_foundry/reports/hero/var_station_trade_hub_{scn,mts,free}_overlay_v01.glb.report.json` — regenerated.

## Honest caveats (repair round)
1. **Evidence renders textureless/gray** (unchanged v1 limitation): Blender 5.1 can't import the
   meshopt donor, so the before/after uses a decompressed, texture-stripped working copy — the hub is
   neutral gray in both frames; overlays read by form/shadow, not final look. `--fast` (24 spp / 384 px)
   per the task allowance.
2. **Macro-first, by design.** No rivets/fasteners — the kit-detail pass is still deferred (clean
   attachment zones recorded in `tradehub_overlays.json` `attachNotes`).
3. **KitMat_Emissive base albedo** is `hero_common`'s (0.02) not kitgen's (0.05); emission colour +
   strength are identical, and `hero_common` is the lane's established material shared with the accepted
   wasps, so it was reused rather than diverged (touching it would alter accepted wasp output).
