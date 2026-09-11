# P15 — Keyart tiles and backdrop plates — receipt

<!-- APPEND ONLY. Do not rewrite an entry above this line. -->

---

## 2026-09-11 · PQ-194.02 (S2) · codex gpt-6-astra xhigh + controller devin

**DONE (tiles); REROUTED (backdrop plates).** The first production dispatch under the refit
packets: Codex `gpt-6-astra` at `xhigh` (codex-cli 0.153.4, npm binary — the app-bundled 0.130
CLI predates the model), built-in `image_gen`, shared checkout, exact write set. This is the
legitimate mood-imagery packet under the new production law.

### Delivered — tiles (38 files, all landed in `assets/ui/kit/assets/tiles/`)

- 5 arena tiles `tile.arena.*` @1x 640×360 + @2x + `-masked` vignette-alpha variants at both sizes
  (ricochet-foundry, lagrange-crucible, cinder-sluice, cryo-drift, storm-lattice)
- 5 mode tiles `tile.mode.*` 320×320 + @2x (swarm, gauntlet, daily, weekly, ghost)
- 4 difficulty tiles `tile.difficulty.1..4` 320×160 + @2x (same equipment: pristine→used→battered→
  burning, chained via image edits so the subject stays identical)
- `_contact-sheet.png` regenerated, `kit-manifest.json` extended (19 entries appended; diff is
  reformat + additions only — 0 removed, 0 changed pre-existing entries), `prompts-p15.md` records
  the exact request per master (all `image_gen`, named per file).

### Verified by the controller

- Sizes exact at @1x; alpha present where required; kit `alpha_check.py` over `assets/tiles/`:
  **49 assets, 0 fringing**. Worker's own stricter "transparent RGB clean" check flagged the 5
  masked arena tiles — controller normalised RGB under alpha=0; check now satisfied by
  construction and the fringe test remains green.
- Tiles are authored compositions at the tile's own framing (conventions §7.11), not crops of a
  larger scene — confirmed visually; the five arenas share lens/horizon/grade and read inside a
  160 px smoked window (worker's `tiles-smoked-160.png` evidence).
- No baked text, no logos; grade matches the approved crucible plate it was shown as reference.

### Rerouted — backdrop plates

The worker correctly reported **`BLOCKED: image_gen — native backdrop resolution`**: the built-in
tool returns at most 1672×941, so a native 1920×1080 backdrop could not be produced without
upscaling, which the conventions forbid. Resolution: per the new production law, world/backdrop
plates are **Cycles renders of the game's own GLBs anyway** — the sibling Blender dispatch
(`bl_scenes.py` extended with `berth`, `berth-cold`, `chart-field`, `workshop-bench`, `ship-rig`,
`hangar-wall` + cold variants; renders in `.devshots/ui-packets/S2-work/plates/`) produces them at
native 1920×1080 with real material truth. Controller promotes the selected plates to
`plate.backdrop.*` kit assets. **No image_gen backdrop is missing.**

Promoted to `assets/ui/kit/assets/plates/` (six files): `plate.backdrop.berth-bay` + `-cold`,
`plate.backdrop.workshop-bench` + `-cold`, `plate.backdrop.hangar-wall` + `-cold`. Because these
are *backdrop* plates (they stand in for the live world behind text), the kit copies carry the
quiet grade baked in (0.55 exposure + soft highlight knee) — measured WCAG vs bone `#EAE6DF` over
the busiest 128² window: **5.2:1–6.9:1, all PASS** (the raw scene plates measure 1.9–3.5:1, the
same profile the approved title/crucible plates show — frames dim behind text via smoked glass;
backdrops ship pre-quieted). Full-strength plates remain in `.devshots/ui-packets/S2-work/plates/`
for frame composition; @2x (3840×2160) is reproducible on demand via `bl_scenes.py <scene>
width=3840`. Manifest extended; both contact sheets rebuilt.

### Worker exit

The P15 exec ended without a `-o` final message (process ended mid-wrap-up after recording the
BLOCKED state); all deliverable files, `prompts-p15.md`, `verification.json` and `checks.json`
landed before exit. Receipt authored by the controller from verified evidence.

### Files

`assets/ui/kit/assets/tiles/tile.*` (38 new), `assets/ui/kit/assets/tiles/_contact-sheet.png`,
`assets/ui/kit/kit-manifest.json`, `assets/ui/kit/prompts-p15.md`,
`.devshots/ui-packets/S2-work/P15/` (masters + evidence).
