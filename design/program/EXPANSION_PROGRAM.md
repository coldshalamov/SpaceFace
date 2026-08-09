<!-- LIFETIME: DURABLE -->
# SpaceFace Expansion Program — operating guidelines for the long autonomous build

Goal: raise SpaceFace to A-list 2026 parity in **graphics, animation, VFX, variety and world density**,
and make the universe feel populated, purposeful and specific rather than sparse and repetitive.

This document is durable research and operating guidance, not dispatch authority. Read it before
planning a broad graphics portfolio so the same weeks are not spent twice, then admit each bounded
production outcome through the normal queue/active-packet route. It grants no lease or acceptance
and cannot advance the Physics-as-Spectacle R5/five-minute-Ceres/R8 dependency chain.

---

## 1. The single most important prior result

A previous lane ran **twelve controlled experiments** trying to raise the independent reviewer's score
on the primary scene. Every one held p95 at 16.80 ms. **Nine consecutive experiments returned exactly
2.25/5 with byte-identical per-axis scores.**

| # | attempt | layer | result |
|---|---|---|---|
| 1-2 | shader roughness breakup; albedo value zones | renderer | no change (n=5 each) |
| 3-5 | nebulaOpacity; rim x2; ambient x4 | renderer | none, or darker |
| 6 | chase zoom 72 -> 46 | renderer | **visibly much better**, score identical |
| 7 | envMapIntensity on solid roles | renderer | no change (kept — physically correct) |
| 8-10 | AO bake into 10 ORMs; per-role repaint; both + roughness re-target | asset | no change |
| 11-12 | authored deep-field ribbons; authored deep-field structures | asset | no change |

A control settles the interpretation: a **real EVE Online frame scored through the same harness gets
4s and 3.63 overall**. The grader discriminates between games, not between our variants.

> **Conclusion for this measured scene and scorer:** none of the exact twelve hypotheses crossed the
> "2" band, even when chase zoom visibly improved the frame. Do not repeat those exact single-lever
> experiments unchanged. The result does not close untested renderer, composition, camera, or
> player-route hypotheses; parity still requires accumulated authored detail, effect craft, scene
> population, and art direction moving together, verified by human and route evidence.

**The most actionable observation in the whole program:** in the asteroid-field frame, the *asteroids
read as rock* — varied surface, believable light, real silhouette — while the *ship beside them reads
as flat plastic*. Same renderer, same lights, same frame. **The engine is not the limit. The rocks are
simply better authored than the ship.** Start there and treat it as the template for "good enough".

---

## 2. The production loop

Run this loop continuously. Each pass should end with something committed and measured.

1. **Research (grok).** Pull reference screenshots of 2020s space games, and Blender/three.js technique
   guides. Feed technique findings into the build step, not just the art step.
2. **Worldbuild (grok, separate thread).** Write encyclopedic, obsessive detail for the thing being
   built — who made it, why it looks worn where it's worn, what the markings mean, who crews it, what
   it does at 3am. Aim for a Wookieepedia-depth entry. Depth here is what produces variety later:
   two ships described in detail diverge naturally; two ships described vaguely converge into "same".
3. **Concept art (codex image gen).** Turn the description into concept art. This is the visual target.
4. **Build (Blender + code).** Model, texture, animate, or implement to match the concept.
5. **Adversarial review (codex, `gpt-5.6-sol`, max).** Compare against BOTH the concept art and the
   professional reference frames. Demand specifics, not vibes.
6. **Iterate** until the reviewer stops finding substantive faults, then commit and move on.

Keep the loop's artifacts: description -> concept -> asset -> review. That chain is the provenance and
makes any later regression debuggable.

---

## 3. What "more" actually means here

The game is sparse and repetitive. Fixing that is mostly **content architecture**, not shaders:

* **NPC behaviour.** NPCs should be visibly *doing jobs* — hauling, mining, surveying, patrolling,
  repairing, docking, scavenging, escorting, refuelling, arguing over a claim. An NPC with an errand
  reads as alive; an NPC holding station reads as a prop.
* **Professions and factions.** More roles, each with its own silhouette, loadout, paint, routine and
  reason to be where it is.
* **Encounters.** More event types, and events that interrupt each other. Variety comes from
  combinations, so prefer several small composable events over one big scripted one.
* **Object and structure types.** More classes of station, wreck, buoy, platform, habitat, rig.
* **Reactions.** Objects and NPCs should respond to the player and to each other — flinch, scatter,
  hail, flee, investigate, call for help.
* **Animation.** Moving parts, deploy/stow states, docking sequences, machinery that runs.

Every one of these multiplies with the others. Ten ship types x six professions x eight events is a
different game from three x one x two.

---

## 4. Consistency and story

The expanded universe must fit the existing one. Before authoring anything new, read the existing
design docs and the in-game copy for tone. Names, markings, factions and hardware should feel like they
came from the same world. When you invent, invent *downward* into detail that supports what exists —
not sideways into a different game.

Write the fiction down as you go. A thing with a written reason to exist gets built better than a thing
with a slot to fill.

---

## 5. Measurement discipline — traps that already cost real time

These are all real failures from the prior lane. Each cost hours.

* **Score a known-good subject through your own grader before trusting it.** The prior pass condition
  ("every axis >= 4") was *unreachable*: a genuine AAA frame failed it, because a cinematic screenshot
  has no HUD and scored 1 on `ui_integration`. Calibrate against measured reference performance.
* **Gate your reference set for scene-type validity.** 2 of 5 "deep-flight" references were
  in-atmosphere planet scenes. A vacuum frame cannot win a *background* comparison against a sky and a
  ground. `scripts/gfx-validate-references.mjs` does this; run it on every scene you score.
* **Never compare against a stale baseline.** An archived frame showed a fake 80.3% -> 73.0% win; a
  same-session baseline showed 73.4% -> 73.0% = noise. Re-capture the baseline in the same session.
* **Match resolution.** Historical session image captures used 1262×648 while archived rounds used
  1920×1080. HUD occupies a different *fraction* of each, so frame statistics are not comparable
  across them. Use the active manifest/profile and pass `--width/--height` explicitly whenever a
  number will be quoted.
* **Pick metrics that cannot be gamed by a global offset.** "Dead black %" measured the black floor,
  not content — a flat +0.02 luma lift moves it 84% -> 0.2% while adding nothing. Prefer
  `structFrac` (fraction of 16x16 tiles with luma stdev > 0.01) in `scripts/gfx-frame-stats.mjs`.
* **Read tool reports; never trust `ok: true`.** A batch reported 20/20 success while 4 assets had
  silently matched no texture at all. Any transform must fail loudly when it wrote nothing.
* **Resolve textures from the MATERIAL GRAPH, not filenames.** Name-matching failed both ways: it
  counted normal maps as ORMs ("n-ORM-al" contains "orm") *and* missed real ones named
  `*_wear_mask_1k`. One asset reported stdev 0 when its true value was 0.2011.
* **Verify a claim about a function by reading it.** "The env map is a bake of the black scene" was
  wrong and produced a whole false causal chain — `createSpaceReflectionEnvironment` builds a studio
  rig with emissive cards at radiance 4.2/2.4/1.15.
* **Do not write a plausible lesson into the codebase before measuring it.** "Idle unfairly depresses
  vfx" was committed as a comment, then refuted: the motion frame scored *lower* (2.13 vs 2.25).

---

## 6. Performance is a hard gate

The binding shipping contract is [`design/PERF_BUDGET.md`](../PERF_BUDGET.md): target-profile
**p95 ≤16.7 ms**, unchanged-or-better p99/hitch tails, and no quality reduction. The prior lane also
measured an Intel-iGPU route at p95 16.80 ms; report that route-specific guardrail when applicable,
but it never relaxes the 16.7 ms target. Measure both arms with the same admitted manifest, active
profile, and dimensions (the current probe default is 1830×973); use 1920×1080 only for the explicitly
named legacy Intel route. Quote p95, p99, and hitches rather than a single frame.

Known, pre-existing, not yours to be alarmed by: combat shows a stochastic ~250 ms spike from a
non-preemptible `buildComposedShip` admission stall (it reproduces with all graphics changes reverted,
and correlates with low ship speed). `check-helios-sky-kit.mjs` fails on `cycle 10: core fog density`
independently of any change. Attribute before you fix by using a clean isolated worktree or a
candidate-only path; never stash, restore, or overwrite foreign work in the shared checkout.

The user's standing rule: **no quality reduction to buy performance.** Find the waste instead. The
prior lane found two nebula layers being baked and sampled every frame (32.2 MB of texture) whose
shader contribution was multiplied by exactly zero.

---

## 7. Working safely alongside other agents

Other agents may work this repository concurrently. Ownership is exact and current, not inferred
from a lane label or old task URI.

* Read `design/program/NOW.md`, `git status --short`, current diffs, and live task activity before
  mutation. A dirty foreign path or demonstrably live exact writer is protected; an expired lane
  label alone is not.
* Never use `git stash`, `checkout`, `restore`, `reset`, or `clean` to manufacture a baseline in the
  shared checkout. Use a clean isolated worktree or a candidate-only output instead.
* Untracked new files can be deleted by this environment. `git add -N` them immediately.
* To test an asset change without shipping it, keep the candidate under an isolated candidate path or
  dedicated worktree and point the probe at it explicitly. Never copy over a live source and depend
  on a later restore.

---

## 8. Definition of done for any single item

1. It has a written fiction entry with real specificity.
2. It has concept art that matches that entry.
3. The built asset/effect/behaviour matches the concept art.
4. An adversarial reviewer compared it to professional references and stopped finding substantive
   faults.
5. The repository p95 ≤16.7 ms target and p99/hitch protections hold; any applicable 16.80 ms
   Intel-iGPU route guardrail is reported separately and never weakens the target.
6. Tests and `check:contracts` pass; the fiction, concept and provenance are committed.

Breadth counts as much as polish. A hundred things at "clearly good" beats three at "perfect" for a
game whose actual problem is that it feels empty and same-y.

---

## 9. The render stack — what each seam can and cannot buy you

Reviewed at `f66f6768`. `src/render/` holds ~80 modules; these are the ones that decide how the game
looks. The **Axis** column records which exact hypotheses were measured in the cited scene and which
seams remain promising. "Closed" below means only "do not repeat the same tested hypothesis
unchanged"; it is not a ban on new renderer, composition, camera, or route-level evidence.

`src/render/AGENTS.md` is the module-level contract and owns the silent-fallback trap. Read it before
editing anything here.

### Tested hypotheses — do not repeat unchanged

| Seam | Owns | Measured result |
|---|---|---|
| `authoredMaterialProfiles.js` | Material role classification (14 regex rules), roughness breakup shader | **Two hypotheses disconfirmed at n=5** — roughness breakup and albedo value zones both left `material` at 2/5, samples `[2,2,2,2,2]`. The file says so itself at lines 53-58. `installRoughnessBreakup` is live (called from `applyAuthoredMaterialProfile:238`), keyed `spaceface-surface-breakup-v3-roughness-only`. Its own conclusion: the reviewer wants *texture content*, not shader modulation. |
| `bloom.js` (913 lines) | Selective bloom, 4-level, post-stack composite, `uToe` | `SECTOR_POST_TOE = 0.020` is live and took dead-black 84.6% → 0.2% at unchanged p95. `0.038` washes out. The ladder was captured; the value is chosen, not guessed. |
| `spaceBackground.js` / `parallaxLayers.js` | Deep-field composite, L0/L1/L2, parallax midground | Midground already raised ~6 → ~64 expected on-screen objects. Raising `nebulaOpacity` is **disconfirmed** — L1 is authored as dark dust and `mix()` replaces L0 with it, so the frame gets *darker*. |
| Lighting rig (`rim`, `fill`, `ambient` in `src/data/sectorVisualProfiles.js`) | Per-sector key/fill/rim | `rim` 1.15→2.45 and `ambient` 0.15→0.62 at 4x both produced **no visible change**. Four disconfirmations total on this axis. |

### Open axes — where improvement actually is

| Seam | Owns | What it can buy |
|---|---|---|
| **Authored GLB texture content** | `assets/**`, Blender sources | **Largest gap exposed by the measured scene.** Per-zone painted metal / glass / worn edge, readable at ship size. Other renderer and composition hypotheses remain open until measured. |
| `partsLibrary.js` | Ship composition, whole-ship / role / archetype maps, packed-ORM single-sample shader | Variety through composition and correct selector wiring. Two hostile roles currently alias one hull. |
| `assetLoader.js` | GLB fetch + validate; **returns `null` and records a diagnostic on failure** | The silent-fallback trap: the entity stays visible with procedural fallback geometry, so a broken authored asset looks like a *styling* problem. Always check `getAuthoredAssetDiagnostic` and `npm run check:assets:live`. |
| `vfx.js` (11,245 lines) + `src/vfxnext/**` | Pooled particles and sprites; the isolated 12-family reference library | Effects are the brightest band in the hierarchy and the cheapest perceived quality per triangle. `EVENT_LIGHT_POOL_SIZE = 6` is the ceiling **and a shader cache key `precompile.js` must match**. |
| `lod.js` / `hlod.js` (88 / 81 lines) | Projected-screen-size LOD selector with 25px hysteresis | Selector only — it never owns geometry. Adding a level is a *geometry* task, not an architecture one. **`lod.js:10`'s "the Kestrel ships LOD0-only" comment is stale** — `partsLibrary.js:874-877` maps `ship_kestrel` to lod0/1/2, `881-882` does the same for the Wasp, both are in the release manifest, and a hysteresis resolver runs at `partsLibrary.js:3592`. Whole-ship LOD coverage is better than that comment implies; the real gaps are `rock_b`/`rock_c`, which have no chain at all. |
| `assetResidency.js` (574 lines) | Texture/mesh residency and admission | Where the dead-nebula 32.2 MB is reclaimable without touching a pixel. |
| `adaptiveQuality.js` (126 lines) | Dynamic resolution | **Read the quality contract before touching this.** Dynamic resolution is a quality reduction; the standing rule forbids buying performance with it. |
| `materialLibrary.js` / `canvasTextures.js` | Shared materials, runtime canvas textures | Deduplication — "no duplicated asset loads or material programs for equivalent roles". |
| `renderer.js` (4,793 lines) | WebGLRenderer, scene, frame, sector post constants | Structural work only: batching, state ordering, persistent resources. |

### The two traps most likely to waste your day

1. **The silent fallback.** A failed authored load leaves the entity *visible* with procedural
   geometry. You will read it as an art defect and go re-texture a model the game never loaded.
2. **Shader cache keys.** A change to injected shader source without changing its program cache key
   makes three.js reuse the program compiled from the *old* source. The new term silently never
   appears — and it measures as "no effect", which reads as a disconfirmed hypothesis rather than a
   bug. This has already happened here (`bloom.js` `setOptions` did not read `o.toe`, so an entire
   A/B ladder produced identical frames).

---

## 10. Current research snapshot and ranking

The measured research ranking lives in
[`design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md`](../graphics-sprints/TOP10_ROI_ASSET_PLAN.md).
It is not execution order: an integrator must admit one dependency-ready leaf through the program
queue before implementation.
The historical candidate and literal-source-reference screen lives in
[`design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md`](../graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md).
It does not prove current manifest, bundle, dynamic-route, or player reachability; rerun the owning
validators before acting on a captured disposition.

The original research snapshot was verified at `f66f6768`; these are historical findings, not a
current ownership census. Before acting, refresh `NOW.md`, Git status and diffs, branch/ref state,
and demonstrably live exact writers:

1. **The lease board had exceeded its commit expiry and contradicted itself.** That snapshot remains
   evidence for why live exact-path checks are mandatory, not a reusable current staleness count.
2. **No authored-asset surfacing lane was active in that snapshot.** That conclusion was already
   superseded at the `9772dfbd` reconciliation, when receiver-facility Blender/GLB/evidence work was
   live in the shared tree. Current workers must recheck exact paths and writers.
3. **The promotion boundary was where work stopped in that snapshot.** Six lanes each authored a complete, reviewed
   pack — 98 incubator GLBs, a 32-cell markings atlas, a 12-family VFX library, a 58-event microevent
   catalog — and each left wiring "to whoever holds those exact paths". Nobody held them. Before
   authoring something new, check whether the thing you need is already on disk, then use current
   manifest, bundle, catalog, and route validators to determine whether it is actually unwired.
