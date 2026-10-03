# Generated images that ship in the game

Owner ruling 2026-10-03: generate with Codex's image tool and **use the result in the live game** — a texture, a
skin, an atlas, a portrait — wherever it beats code-drawn 2D. Concept art that nothing loads is not a deliverable.

## The loop (one job = one thing the game will load)

1. **Brief.** One prompt file: subject + style, nothing about files. Attach 1–2 existing assets of the same set as
   style references (`--ref`). Say "FULLY TRANSPARENT background" for cut-outs, "flat-lit, seamlessly tileable,
   top-down swatch" for surfaces. Never ask for text: words are set in code.
2. **Three variants per attempt.**
   `python tools/art/imagegen_variants.py run --out <scratch> --name <job> --prompt-file p.txt --variants 3 --ref a.png b.png`
   Run several jobs in parallel (a queue per job is fine); one run takes about 3–8 minutes.
3. **Look at every variant.** `python tools/art/imagegen_variants.py contact --out <scratch> --name <job>` builds one
   sheet (the header shows size and alpha range). Open it, pick per picture, and reject: a solid **green** key
   background (alpha 255–255 where you asked for transparency), a vignetted patch instead of a tile, line art instead
   of a texture, a face that resembles another role. Re-run only the failures; keep the good ones.
4. **Finish** with `tools/art/finish_generated.py` (deterministic): `medals`, `atlas` (clean circular alpha, 86% of a
   cell), `tile` (seamless + derived normal + optional glow key from the albedo), `cut_portraits.py` for faces.
   A generated picture never feeds normal/ORM data directly; derive them from height.
5. **Wire it as a new small library with a fallback to the old look** (see `src/render/rockFamilyLibrary.js`,
   `creatureSkinLibrary.js`, `src/data/localPortraits.js`): load once, publish only when every map decoded, resolve
   `null` and keep the old look on any failure, preload next to `preloadRockSurfaceLibrary` in `renderer.js` and await
   it (4 s cap) in `prepareOpeningGpuResources` so first-sight shader compiles happen behind the loading screen.
6. **Prove it in the real renderer.** A throwaway page that builds the real objects (`createVisualFactory().build`,
   `buildFaunaMesh`, …) at the gameplay camera (60° tilt, 144 WU) with and without the new maps, rendered in the
   preview browser. Compare before/after. Delete the page.
7. **Record provenance** in a `manifest.json` beside the set (schema `spaceface.generatedArt.v1`: generator, date,
   prompt, per-file subject, which variant was chosen and what was rejected) and add a test that the files ship and
   the library degrades.
8. **Commit by exact paths**; `git show --stat HEAD` afterwards.

## Traps that already cost time

- **Parallel runs swap images.** A run can copy another run's newest image as its own `out.png`. The truth is the
  run's own Codex session folder (`~/.codex/generated_images/<session id>/`, id in `codex.log`); the runner takes it
  from there, and `imagegen_variants.py repair --out <scratch>` fixes old jobs.
- **The dev server marks images immutable for a year.** A lab page must cache-bust texture URLs or it shows stale art.
- **A built visual's root transform is frozen** (`visualFactory.build`): wrap it in a holder group to place it.
- **Metal and exotic asteroids cannot build in plain node** (canvas roughness noise): a test needs a tiny
  `document.createElement('canvas')` stand-in (see `test/rock-family-library.test.mjs`).
- Never extend a loader that a test pins exactly (`preloadRockSurfaceLibrary`); add a new module instead. The
  identity portrait registry refuses role masks; the local pool lives beside it, never inside it.
- A stalled run (empty `codex.log` for many minutes) is dead: stop only that run's processes and start it again.
- Another agent often holds `.git/index.lock`: retry, never delete it.

## Where things live

| Set | Source/briefs | Files the game loads | Library |
|---|---|---|---|
| Sky planets (two 2x2 atlases + two ringed giants) | `assets/background/quiet-planets-2.prompt.txt` | `assets/background/quiet-*planet*.png` | `src/render/paintedPlanets.js` |
| Metal / crystal / exotic asteroid surfaces | `assets/ships/release/surfaces/asteroid-families/manifest.json` | same folder | `src/render/rockFamilyLibrary.js` |
| Alien tissue + machine nacre | `assets/ships/release/surfaces/creature-skins/manifest.json` | same folder | `src/render/creatureSkinLibrary.js` |
| Bar-patron faces (7 roles) | `tools/art/local_portrait_briefs.py` | `assets/portraits/locals/` | `src/data/localPortraits.js` |
| Achievement medals | `assets/ui/generated/achievements/manifest.json` | same folder | `src/ui/screens/achievements.js` |
| Planet-body terrain detail (6 tiles) | `assets/ships/release/surfaces/planet-detail/manifest.json` | same folder | `src/render/planetDetailLibrary.js` (read by `planetSiteVisual.js`) |
| App icon | `assets/brand/*.svg` (hand-authored) | `assets/brand/exports/` | `electron/main.cjs` + `package.json` build config |

## Every plan item, closed (2026-10-03)

**Done and live:** medals, sky planets (8 looks + 2 ringed giants), metal / crystal / exotic asteroid surfaces, alien
tissue and machine nacre, 64 bar-patron faces, planet-body terrain detail, the app icon (from the hand-authored emblem
via `assets/brand/export-icons.py`; CairoSVG needs a system Cairo library on Windows, so the exports were rendered
through Chromium and the repo's own exporter ran unchanged), and the Steam capsule / library / achievement art (already
built on demand by `node scripts/build-store-assets.mjs`; it is gitignored output, and `--check` passes).

**Decided against, with the reason:**

- **Fleet-wide hull wear / grime / new panel textures.** Evidence: all 117 Forge bodies were rendered through the live
  renderer on the real GPU (`fleet-look --fleet --views=close`) and two stations opened at full size. The ships read as
  clean lacquer, which is the owner's chosen look (FORGE rules 6-7), and no tile grid shows at the gameplay camera, only
  at extreme station zoom. The cost is a Blender rebuild and publish of every hull, which regenerates `pilots.json`,
  every render package and the model-truth census that other lanes are editing at the same time. The FORGE.md carve-out
  stays in place for a future targeted pass (one hull family at a time), but nothing in the picture asks for it now.
- **Livery / stencil decals on hulls.** The existing Living Hull marks sit at fixed normalised coordinates tuned to the
  Kestrel; 15 plan shapes (arrowhead, catamaran, saucer, liner) would need a per-hull surface raycast at build time, a
  Shipworks control and a preview that draws it, and the Kestrel's `borrowed_time` default already has a modelled
  stencil (a second quad would double it). At the chase camera a mark is about 20 px. Not worth a full-stack feature and
  a second pass through the frontend lane. `decalId` stays a stored, unrendered field, as `shipPaints.js` says.
- **VFX sprite sheets.** The effects are shader-driven sprites (`SPR_FLASH`, `SPR_RING`, `SPR_PUFF`, ...) and an engineered
  shard / quarks pipeline with its own standard; there is no flat texture slot to swap, and `makeStarTexture` is used
  only by the graphics lab and one legacy factory path. The authored fragment atlas is deliberately low-frequency for
  6 px per world unit. A generated sprite would add cost without a visible change.
- **Per-commodity item pictures.** The market rows already speak through 14 hand-authored vector family pictograms
  (the interface plan assigns icons to vector); a separate picture set would fight that system.
