<!-- LIFETIME: CAMPAIGN -->
# X1 — One art direction: status

**Campaign:** X1 (Lane 6, LOOK & SOUND). **State: awaiting owner approval of the lineup.**
**Owner gate:** X2 mass production does not start until the lineup below is approved.

## Done

- `DIAGNOSIS.md` — the measured cause chain (three media, no depth/scale rule, arena furniture
  built from three bare primitives).
- `STYLE_BIBLE.md` — one page: one medium per depth band, the planet rule, the Forge prop rule,
  scale modules, colour/light, never list, asset acceptance.
- `CENSUS.md` — every class that breaks the bible (B1–B7), every class that complies (K1–K7),
  scale census, manifest counts.
- **Production proof:** `src/render/arenaFinish.js` (new) — a chamfered unit box (60 tris, exact
  1×1×1 datum) and the shared three-value prop palette + hazard band / work lamp / panel helpers.
  Applied to `src/render/lawArenaDressing.js` (six law rooms + boss dressing) and
  `src/render/foundryBankSurface.js` + `buildFoundryToy` (the Ricochet Foundry furniture).
  No new draw call for the chamfer; one hazard band + one lamp on the flagship props.
- **Lineup captures** in `lineup/`:
  - `before-foundry.jpg` — the 2026-11-05 baseline (flat tan/grey boxes, photographic Saturn).
  - `after-foundry-wide.png` — the same arena, after the finish.
  - `after-lineup-plate-ship-sky.png` — ship + bank plate + rock + sky planet in one frame at the
    gameplay camera.
- Focused checks: `node --test test/pq133-08-law-dressing.test.mjs test/pq133-09-cryo-storm-dressing.test.mjs`
  — 23/23 pass. Geometry: unit bounding box exactly [-0.5, 0.5]³.

## Evidence / limitations

- The live capture is 729×536 from the running shared checkout; the full-resolution capture path
  (`scripts/capture-x1-lineup.mjs`) is committed and runs the ordinary title → Swarm route. The
  shared tree's `src/data/missions.js` was mid-rewrite during the session, so full boot was
  intermittent. Re-shoot at 1600×1000 in X2 before the final asset review.
- **Independent image review (2026-11-06):** first capture rejected on camera and on the plate's
  missing thickness/clamps/dark share/bright seams. The material findings were fixed (skirt,
  clamps, lamp housing, dark recessed seams, hatch, dashed safety band). **One named open defect:**
  the Helios sky giant is lit from the right while the play key reads upper-left
  (`sectorVisualProfiles.js` `lightAngle: -0.72`). Fix the authored angle and re-shoot in X2.
- No frame-time regression measured yet on the E10 dashboard; the change adds ≤ 2 draws per arena
  prop and no per-frame work. Measure on the owner's laptop before X2 mass production.

## Next

1. Owner approves or amends the lineup (`LINEUP.md`).
2. X2 starts: Swarm enemy silhouettes, boss chunks, the 7 arena kits, planets/backdrops, prop
   replacements, part visuals for Lane 4, the ship-sheet hangar. Each through Forge + image review.
3. Measure the arena-finish delta on the E10 dashboard and record it here.
