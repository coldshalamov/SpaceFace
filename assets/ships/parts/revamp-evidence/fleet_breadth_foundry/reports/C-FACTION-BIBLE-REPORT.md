# LANE C REPORT — Faction Surface-Language Bible + Material Profiles

**Date:** 2026-07-20 · **Lane:** C (art direction) · **Branch/worktree:** `sf-fleet-breadth`
(`codex/fleet-breadth-foundry-20260720`, base c740ae01) · **Status:** COMPLETE

## Deliverables

| # | Path | What |
|---|---|---|
| 1 | `design/foundry/FACTION_SURFACE_LANGUAGE.md` | 8 factions × 12 surface axes, per-faction **Grey-read** line, cross-faction contrast table, contrast audit (worst pair = 3/12 shared), worked example (`hull_fighter` under SCN / DMC / Reach with desaturation verdict), downstream consumption notes. |
| 2 | `assets/ships/foundry/fleet_breadth_20260720/materials/material_profiles.json` | Machine-readable profiles, schema `sf-foundry-material-profile/1`: per faction — 6 zones (paint/bareAlloy/machinery/ceramic/glassCanopy/emissive), segmentation, fasteners, 3 wear tiers, grimePlacement, heatStain, noiseScales, decals (with live `atlasRefs`), repairPractice, preferredKitFamilies, paletteRef. Top-level maskVocabulary + wearFieldSemantics bind wear fields to Lane E's real mask/decal files. |

Both are NEW files. No existing file was modified (verified: `git status --short` shows only
untracked foundry dirs).

## Ground truth read and honored

- `src/data/palettes.js` — all `paletteRef` blocks and zone emissive colors verified equal to
  `FACTION_PALETTES` by script (see checks). Every faction section consistent with shipped
  `PAINT_PROFILES` (grime proximity ≤0.25 at serviceWorn, killMarks exact match).
- `src/data/factions/*.js` — 8 sector-owning factions; `faction_helix` excluded (paper-only).
- `design/depth-program/P3-faction-visual-identity.md` — livery characters extended, none
  contradicted (Concord chrome / Meridian corporate gloss / Drift worn industrial / Reach
  cobbled / Quiet dark / Vael organic pulse / Frontier utilitarian / Choir cathedral-glow).
- `parts_manifest.json` — material slot vocabulary reused as-is (`Material_Hull/Accent/Glass/
  Mechanical` + whole-ship slots). **No new runtime slots invented.** Tint-multiplication
  contract honored: all `paint.baseGray` within 0.03 channel spread of neutral.
- Lane D brief — `preferredKitFamilies` use only the 14 sanctioned family names.
- Lane E outputs — all `atlasRefs` verified present in `decals_atlas.json`; all 8 mask names in
  `maskVocabulary` verified on disk.

## Commands run (exit codes)

| Command | Exit |
|---|---|
| `node -e "<schema/uniqueness/rejection audit>"` (8 factions, enums, vec3s, roughness lo<hi, per-faction uniqueness of every numeric vector, repair×fastener pair uniqueness, kit-family + atlas + mask existence, wear-tier monotonicity) | **1 on first run** — caught 3 copy-pasted roughness ranges (Free.ceramic = Quiet.ceramic [0.60,0.75]; Choir.ceramic = SCN.ceramic [0.55,0.70]; Choir.glassCanopy = Quiet.glassCanopy [0.06,0.14]) |
| Same audit after fixes (Free.ceramic→[0.62,0.78], Choir.ceramic→[0.52,0.66], Choir.glassCanopy→[0.05,0.13], doc updated to match) | **0** — `MATERIAL_PROFILES_AUDIT_OK` |
| `node -e "<doc↔JSON consistency check>"` (every faction's paint/bare roughness, fastener spacing, heat spread, emissive intensity, reg format appears in the doc) | **1 on first run** — Vael exposed-laminate roughness missing from doc axis 4; fixed. Re-run: **0** — `DOC_JSON_CONSISTENT` |
| `python -c "json.load(...)"` | **0** — `PYTHON_PARSE_OK` (bake-script consumability) |
| `node --input-type=module -e "<palettes.js alignment>"` (imports live `FACTION_PALETTES`/`PAINT_PROFILES`, compares every paletteRef + emissive + personality consistency) | **0** — `PALETTE_PROFILE_ALIGNMENT_OK` |
| `git status --short` | **0** — only untracked foundry dirs; no existing file touched; no git write commands used |

## Rejection-condition self-check results

- **Hue-swap collapse:** each faction section ends with a `Grey-read:` line; the worked example
  carries an explicit desaturation verdict distinguishing SCN/DMC/Reach by plate rhythm, joint
  language, tone structure, and tail treatment alone.
- **Repair AND fastener sharing:** no pair shares both (machine-checked). Intentional
  repair-tag collisions required by a 6-value enum across 8 factions:
  `colorMatchedReplacement` ×2 (SCN recessed / MTS hidden + serialized-seal culture),
  `panelBlanking` ×2 (Quiet hidden-anonymous / Choir riveted-votive — deliberate thematic
  inverses, called out in both docs).
- **Copy-pasted numbers:** machine-checked uniqueness across factions for every zone roughness
  range, plateSizeM, gapWidthM, spacing/scale, recessBias, spreadM, colorRamp, noiseScales,
  emissive intensity, decal density. 3 violations found and fixed during the lane (above).
- **Bake-script consumability:** all numeric fields are numbers with metre units stated;
  enums closed and validated; `spacingM/scaleM = 0` for The Quiet documented as "place nothing".

## Self-identified defects / shortcuts

1. **Hand-authored, not generated.** Determinism is trivially satisfied (static files, no
   RNG/clock/uuid), but there is no generator script to re-run. If the schema evolves, the JSON
   is edited by hand.
2. **Brief/source drift on Choir:** the brief said the `zealot` personality was missing from
   `PAINT_PROFILES`; it already ships (palettes.js:145: grime 0.30, chrome 0.10, no noseArt,
   no killMarks, patches 0.2). I extended the shipped values instead of inventing replacements —
   Choir's "no nose art, votive plaques instead of tallies" language follows from that row.
3. **Enum stretches (documented in-line):** (a) Vael `fasteners.style: "hidden"` with
   spacing/scale repurposed as suture-node stand-ins — no fastener-less enum value exists;
   (b) Vael `anisotropyHint: "brushed"` means growth-aligned organic sheen; (c) `glassCanopy`
   adds `transmissionHint` (Principled transmission weight) — an extension field, not a new
   material slot; (d) Reach/Free add optional `spacingJitterM`.
4. **Roughness/noise values are art-direction targets**, not yet validated against a real bake;
   no bake script consumes this JSON yet (consumer lanes are downstream). First bake should
   eyeball-confirm the SCN 0.28–0.42 vs MTS 0.18–0.32 gloss separation is visible at 60–150 px.
5. **No player-route captures** — this lane produces documents/data only, per the brief; visual
   acceptance belongs to the lanes that implement these profiles.

## Unfinished / handoff notes

- Nothing in-lane left undone. Downstream: variant lanes should roll `wearTiers` per instance
  (`fresh`/`serviceWorn`/`patched`) and respect `kitNote` for Vael (re-proportioned organic kit
  variants — bolting rectangular human kit onto Vael hulls is a defect).
- The contrast audit's counting method (strict "same kind" reading) is documented in the bible;
  worst pair is DMC–Free at 3/12 shared axes — inside the ≤4 rule with margin.
