<!-- LIFETIME: DURABLE -->
# Visual tuneup brief — the 3D graphics consistency pass

**Written:** 2026-09-19. **Audience:** the agent handed "make it look better."
**Owner-directed update:** the owner explicitly superseded this brief's frozen/ratified art
constraints and requested an artsy, inhabited indie world using the existing models. The active
direction and first-sector handoff are now [Lacquer & Starlight](../../docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md).
The original inventory below remains useful orientation, not a constraint on design judgment.
**Prepared by:** groundwork pass (file map + live captures) so this agent spends its budget
on judgment, not on grepping or running heavy scripts.

---

## 1. Mission

One pass over the 3D game's look — models, materials, lighting, post/filters, VFX, background —
with three outcomes:

1. **Make the world worth inhabiting.** Follow the owner's current direction: colored working
   vessels, warm inhabited details, deep colored shadows, polished edges and energetic plasma.
   Use the shared treatment before rebuilding models. The standard records the current design
   and implementation; it does not claim an owner-approved frame or prohibit improvements.
2. **Bring up the outliers.** Quality varies across models and effect families (see §5).
   Equalize *upward*, at the shared-lever level (grade, lighting, material profiles, VFX
   language) before touching individual assets.
3. **Correct small defects.** Mis-scaled glow, dead materials, inconsistent palettes, pop-in,
   washed highlights — the polish list you can see in the gallery (§4).

**Success bar (owner words, from the stocktake law):** a stranger shown the player ship and the
nearest NPC cannot ask which title each is from. Nothing on the default route looks cheap,
unlit, unfinished, or from another game. The picture reads as one illustrated industrial world.

**Scope fence:** this brief is the 3D/world side. The 2D UI/HUD screens have their own program
(`design/frontend/direction/FIELD_HARDWARE_PROGRAM.md`) and their own owner ruling — the
2D surfaces in the gallery (§4) are context for framing, not work targets.

## 2. Read first (law, in order)

| Read | Why |
|---|---|
| `design/VISION.md` | Product authority. Physics sandbox inside a living world; "colorful" is in the UVP sentence. Emphasis wins ties. |
| `docs/visual-assets/ILLUSTRATED_GRAPHICS_STANDARD.md` | **The look.** Includes the runtime treatment (`illustratedSurface.js`), the model tutorial, and the effects/shadows rules. |
| `docs/visual-assets/VFX_TECHNIQUE_STANDARD.md` | VFX law. 8 effect classes + rejection register B1–B19 (the blurry-square ban). |
| `docs/visual-assets/VFX_LIFECYCLE_STANDARD.md` | Every effect: ignition → build → sustain → release → dead; driven only by `vfx.update` and `state.simTime`. |
| `design/program/MODEL_STOCKTAKE.md` + `MODEL_STOCKTAKE_PLAN.md` | The quality bar ("do not invent another"), what was already fixed, what must never start. |
| `design/program/WORLD_VISUAL_CENSUS.md` | Every object you can see that is **not** a packaged model (code-built shapes), kept current with dated landings. |
| `docs/visual-assets/SOFT_CARD_INVENTORY.json` | The complete legal list of camera-facing cards. Anything not in it is banned and checked. |
| `AGENTS.md` (root) | Working rules, capture ruling, verification router. |
| `assets/bible/B-002_ship_materials.jpg`, `B-003_ore_surfaces.jpg`, `B-005_fx_emissive.jpg`, `B-013_nebula_mood.jpg` | Owner's mood/material reference plates (no doc points at them; treat them as style anchors). |

Skip deliberately: `design/graphics-sprints/VISUAL_ASSET_CATALOG.md` (stale 2026-08-08 snapshot,
archaeology only), `needed-assets.md` (wrong), any `approved/` frontend folder (owner never
approved any frame; no authority there).

## 3. How the picture is made (the five layers you can tune)

The renderer is a self-built pipeline on Three.js 0.184: ACES tonemapping, `FogExp2` per-sector,
one shadow-casting key light, a self-contained bloom pyramid whose composite owns grade/vignette/
grain/sRGB, and the illustrated-surface shader installed per material. **There is no separate
"graphics settings" file — each layer has one owner file:**

| Layer | Owner file(s) | What you can tune there |
|---|---|---|
| **Grade / post / filters** | `src/render/bloom.js` (composite: exposure, grade, toe, vignette, grain, ACES, ink contour); `src/render/post/spaceRenderGraph.js` (HDR graph, GTAO-lite); `src/render/presentPath.js`; per-sector post values via `resolveEffectiveSectorPost()` in bloom.js + `src/render/sectorVisualTransition.js` (1.5 s eased handoffs) | The single highest-leverage layer for "consistent look". The **ink filter** (contrast contours + luminance banding) already runs in both present paths. |
| **Lighting** | `src/render/renderer.js` (~L3804 rig, `createSectorPaletteRig` ~L11090): ambient + key/rim/fill directionals; `SECTOR_LIGHT_INTENSITIES` ~L403; colors from `SECTOR_PALETTE_CLASSES` in `src/data/sectors.js`; key light owns the only shadow map | Per-sector class palettes (core/belt/fringe/anomaly) and the four intensities. |
| **Materials** | `src/render/illustratedSurface.js` (four-band ramp, albedo power 0.8, metal mask 80%, AO-after-bands; shared shader-version key); `src/render/authoredMaterialProfiles.js` (GLB material-name → role regexes); `src/render/materialLibrary.js` (role authority); `src/render/industrialMaterialFamilies.js` (coating/bare-armour/brushed/refractory/rubber/markings response families); `src/data/palettes.js` (14 faction + 10 sector palettes, `SHIP_RECIPES`) | Where "one grey material on everything" and palette drift get fixed. |
| **Background & sky** | `src/render/spaceBackground.js` (layered painted deep-field L0–L6); `deepField*.js` (stars, structure art/recipes/design/presentation); `paintedPlanets.js` + `planetFactory.js`; `src/data/sectorVisualProfiles.js` (per-region composition recipes) | Sector identity and skyline variety. Note: two painted-planet PNGs are referenced but not retail-routable (known, deliberately deferred). |
| **VFX & energy** | `src/render/vfx.js` (14k-line pooled system; navigation index in header L9–30); `vfxProfiles.js` (per-engine/weapon colors — closest thing to a VFX palette); `src/render/weapons/recipes.js` (per-weapon recipes); `src/render/thruster/` tree (plumes, ribbons, retro, RCS); `src/render/vfx/quarksSystem.js` (9 particle families; burst-only, no billboards); `src/render/forceLanguage/` (field lifecycle + swept surfaces); `src/presentation/causalVfxGrammar.js` (meaning-role colors: silhouette+motion carry identity, not hue) | Effect family consistency: temperature fades, HDR feed into bloom, force-shaped geometry. |

Plus two cross-cutting layers: **camera/feel** (`src/render/camera.js`, `cameraDirector.js`,
`feel.js` hit-stop/FOV-punch/vignette, `velocityLanguage.js` speed bands — the long luminous
contrail is owner-mandated identity, do not shorten it) and **ships/hardware** (§6 asset route).

## 4. See the game (gallery — no heavy runs needed)

Fresh captures were made on 2026-09-19 into `.devshots/visual-tuneup/` — see
`.devshots/visual-tuneup/INDEX.md` for the annotated list. `.devshots/` is gitignored working
evidence; if it was cleared, regenerate with the commands in the INDEX (each is the repo's own
tool, already proven; total ≈ 10 min).

| What you see | Path | Notes |
|---|---|---|
| Every roster hull, 3 Mk tiers + faction paint variants (51 JPGs) | `.devshots/visual-tuneup/hulls/` | Preview framing is wider than chase cam; judge at chase size. Regen: `node scripts/run-ship-preview.mjs authored` |
| Asteroids, planets, stations, gates, bolts (18 JPGs) | `.devshots/visual-tuneup/world/` | Same regen command |
| Live flight with full HUD (desktop + mobile) | `.devshots/visual-tuneup/flight/flight-probe-*.png` | Regen: `node scripts/probe-flight-visual.mjs` |
| Live flight, UI hidden — the pure 3D picture + frame-cost report | `.devshots/visual-tuneup/flight/t00/t01/t-final.png` + `runtime-witness-report.md` | The style evidence. Regen: `npm run probe:runtime-witness` (~2–5 min) |
| 2D surfaces (menus, HUD, station tabs) + element crops (93 files, 18/21 surfaces) | `.devshots/visual-tuneup/ui/` (+`index.md`) | Missing save-load / station-shipworks / station-factions (timeouts) — re-shoot one screen in seconds: `node scripts/ui-bench.mjs --shot=<screen>` |

Cheap single-screen iteration afterwards: `node scripts/ui-bench.mjs --shot=<screen>` (seconds),
`node scripts/ui-look.mjs --only=<id>` (clicks every control). Lookdev sandboxes that need no
game boot: `graphics-lab.html` (serve repo, screenshot with `node sx-shot.mjs`),
`scripts/vfx-force-language-lab.html`, `tools/art/three_surface_preview.html` pages.
Do **not** run `check:visual-regression` or the full `capture:ui-matrix` (hours); the committed
baselines in `test/ui-frame-references/` are 2D-UI regression floors, not style guidance.

Capture-day reds on the 2026-09-19 dirty tree (pre-existing, NOT visual findings, see INDEX):
`capture-gameplay` could not script its way to flight (onboarding route mid-rework),
`check:assets:live` aborted on a release-manifest hash mismatch, three ui-stills surfaces timed
out. Ignore stale `.devshots/authored-assets-live*.jpg` from Sep 7.

## 5. Current state (what the groundwork found)

**Already good — protect it.**
- The player hero (Hitch/Kestrel) and Wasp: packaged, remastered, and **frozen** (PQ-050 law).
- Opening flyby: all 7 slots resolve packaged complete hulls; pirate is the accepted Wasp
  (PQ-193.01 receipt, 2026-09-11). Reverse/brake reads as two stubby cyan bow jets from the
  drive family (PQ-193.02). 47-A props, lane beacon, dead hulk, mining drone, gates, wreck
  sections all publish authored GLBs (PQ-193.03–.05 receipts; see dated rows in
  WORLD_VISUAL_CENSUS.md §A).
- The illustrated-surface treatment + ink filter exist and run in both present paths; VFX
  force-language pass landed 2026-09-18 (all 12 weapon recipes emit swept geometry, spool
  envelopes, Mach-tracer bolt clocks; `check:vfx-force-language` 87/87).
- Thruster subsystem (recipes/ribbons/flipbooks/volumetrics) is deep and recently reworked.

**Where inconsistency still lives (your hunt list — verify each in the gallery, don't take
this list's word):**
- **Procedural faction builders vs authored GLBs.** Seven NPC hulls are still code-built
  (`src/render/ships/`: concordPatrol, reaverPirate, meridianTrader, driftBarge, quietRaider,
  vaelSniper + kestrelHero fallback) with canvas textures, while traffic/fleet is authored GLB.
  Construction language may drift at chase size.
- **Asteroids remain generated lumpy rocks** (5 variants, `visualFactory.js` + `objectSpaceGeology.js`);
  named rock GLBs exist but are a rarer set. Ore/gem pickups and credit chips are spinning
  diamonds/small code meshes (census §A).
- **Uncommissioned by design:** disc mines, mass seed, snare anchors — code pucks; the census
  says commission-only after the shelf, so a tuneup should *light/surface* them well, not model them.
- **Station fallback** (fat cylinder + hoops) should be unreachable now (PQ-193.12) — if you can
  make it appear in a capture, that's a defect to report, not to style.
- **VFX color/style constants are scattered** (`vfxProfiles.js` inline hexes, `weapons/recipes.js`,
  `lawHeatTelegraphVfx.js` LAW_HEAT_COLORS frozen, `causalVfxGrammar.js` INSTRUMENT_GRAMMAR).
  There is no single VFX palette file; harmonizing hue families across these owners is exactly
  tuneup work.
- **Open VFX notes from the 2026-09-18 pass** (`VFX_POLISH_PASS_2026-09-18.md` §Open): shield
  idle shell static while visible; tether band flashes are plain additive cards. Both are
  small-correction shaped.
- **Soft-card residue:** 9 inventoried cards remain (`SOFT_CARD_INVENTORY.json`), 7 not yet at
  `exception` status — mostly `pending-visual-acceptance`/`factory`. The ratchet forbids new ones;
  converting one to shaped geometry is legitimate tuneup.
- **Two painted-planet plates not retail-routable** — known, deferred; do not re-style around them.
- **Codex-lab `gfx-review-frame.mjs`** exists (`node scripts/gfx-review-frame.mjs --scene deep-flight`)
  if you want a second mechanical opinion on a frame — optional.

## 6. Assets: where the models actually live

- **Runtime (what loads):** `assets/ships/release/` — 516 GLBs. Whole ships in
  `release/parts/wholeships/` (77 GLB + LOD sets); stations in `release/parts/places/`
  (7 archetype GLBs + gate ring); per-asset optimized `release/render-packages/`;
  machine truth `release/release_manifest.json`. Source of the slot→file map:
  `src/render/partsLibrary.js` (`STATION_ARCHETYPE_FILES`, `PLACE_FILES`) and
  `src/render/renderPackageManifest.js` (**generated — never hand-edit**; regenerate via
  `node scripts/build-render-package-pilots.mjs`).
- **Authoring:** `assets/ships/parts/` (168-entry `parts_manifest.json` — the accepted/blocked
  truth), `assets/ships/fleet_player_bodies_v1/` (production bodies + QUALITY_ITER review logs),
  145 `.blend` files repo-wide. Coordinate contract: +X forward, +Y up, +Z starboard, metre scale;
  texture contract 1024 sRGB + packed ORM; semantic roles exported as `spacefaceMaterialRole`
  glTF extras or recognized names (`hull`, `accent`, `mechanical`, `ceramic`, `radiator`,
  `docking`, `glass`, `signal`, `drive`, `geology`).
- **Non-ship props:** `assets/works/` (industrial hardware), `assets/incubator/` (candidate packs —
  do **not** copy donors), `assets/concept/` (reference only, never runtime textures).
- **Any Blender/GLB form or surfacing change** requires the material-truth preflight
  (`.grok/skills/spaceface-blender-material-truth/SKILL.md`) + `VISUAL_ASSET_PRODUCTION_STANDARD.md`
  G0–G7 gates, and re-publishing goes through the finalize/promote scripts in `tools/art/`
  (`finalize_whole_ship.mjs`, `build_release_parts.mjs`, …) — a changed source GLB alone does not
  change what the player sees. Prefer the shared levers in §3 before touching GLBs at all.

## 7. Hard tripwires (each of these has a checker that will bite)

1. **No new soft cards.** Any new `THREE.Points`/`Sprite`/glow-card construction anywhere in
   `src/render`/`src/ui/asteroid` fails `npm run check:vfx-techniques` unless declared in
   `SOFT_CARD_INVENTORY.json`. Distant sky stars are the only exempt role.
2. **B1–B19 bans** (`VFX_TECHNIQUE_STANDARD.md`): no camera-facing billboards for play-scale
   effects, no GL_POINTS sparks, no opacity-as-animation (shield-panel decay is the sole
   exception), procedural noise is never final art, effects must feed HDR bloom (>1.0 radiance),
   exhaust is never rigidly parented, jet vs flight-history must stay distinguishable.
3. **Hitch/Kestrel freeze.** Do not remaster the player starter (PQ-050). Never pass a gate by
   making Hitch cheaper or cutting default quality (shadows/bloom/population/detail) — the
   equal-picture rule. Performance spend = residency, batching, LOD, cadence.
4. **Light budget:** 8 point lights total (6 event + 2 weapon), pooled, never scene-root.
5. **Illustrated surface discipline:** install `installIllustratedSurface()` at material creation
   (never in the frame loop), keep the shared shader-version key updated when the shader changes,
   never bake the ramp into albedo textures, never give a ship a unique shader key for paint color.
6. **Determinism:** sim uses `state.rng`/`state.simTime`; never edit `test/*.expected.json` to
   pass; cosmetic render randomness is separate and allowed.
7. **One game path:** anything you change must be visible on the default browser route AND
   Electron; hidden flags/local candidates are not completion. Render layer never writes sim state.
8. **Accessibility:** reduced-motion and flash scaling (`motionScroll`, `flashScale`, `feel.js`
   gates) must keep working; HUD stays non-diegetic; UI is outside the post filters.
9. **Lifecycle:** new/changed effects get five-stage lifecycles via `forceLanguage/effectLifecycle.js`,
   driven only from `vfx.update`; no private rAF loops; interrupted birth releases from partial shape.
10. **Shared tree:** the worktree is chronically dirty with concurrent lanes. `git status --short`
    before you start; if you'll span sessions, drop a row with `node scripts/agent-checkpoint.mjs start`;
    commit **only your exact paths** (`git add -- <paths>` + `git commit -- <paths>`), never `-A`.

## 8. Verification ladder (run what the change needs, fast gate first)

| After touching… | Run |
|---|---|
| Anything | `npm run check:baseline` (~15 s sanity) |
| VFX/shaders | `npm run check:vfx-force-language` (87 tests), `npm run check:shader-compile`, `npm run check:vfx-techniques` (soft-card ratchet) |
| Materials/illustrated surface | `npm run check:art` (long chain — or the single relevant checks: `check:ship-material-sharing`, `check:render-hotpath`, `check:assets:live`) |
| Lighting/grade per sector | `npm run check:sector-palettes` + runtime-witness on the same route before/after |
| Perf-relevant (any of the above) | `npm run probe:runtime-witness` — read `.devshots/runtime-witness/report.md`; record frame-time tails and hitch counts, not averages; no GPU readback inside the timing window. Targets: 60 fps, rare >32 ms frames, quiet sim median <5 ms |
| Done | `npm run check:playable` |

Close work the owner's way (AGENTS.md §13 capture ruling): a fixed-seed number or focused test
closes it; stills are optional evidence, never a gate; a GPU/Chromium failure never blocks
`implemented`.

## 9. Suggested order of operations

1. Read §2's law set (an hour). Then look at the gallery until you can name each ship and place
   on sight.
2. **Audit pass (read-only):** walk the five layers of §3 against the gallery; write your defect
   list ranked by player-visibility. Confirm/refute every item in §5's hunt list against live
   captures — receipts say the old broken list is fixed; trust only the current picture.
3. **Shared levers first:** grade/post values, per-sector lighting, material-family response,
   VFX hue families. These move the whole picture toward consistency in one place each.
4. **Then outlier assets/effects** the levers can't reach (a specific material role mapping, one
   recipe's color, one card→geometry conversion).
5. **GLB work last, if at all** — it's the slowest loop (preflight → Blender → finalize → package
   → verify) and most consistency wins are in the runtime layers.
6. Keep a running before/after capture pair per change (same route, same seed, same settings) and
   the numbers from the runtime witness; end with the ladder in §8.
