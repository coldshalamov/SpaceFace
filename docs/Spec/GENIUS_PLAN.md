# SpaceFace — Genius Commission Plan & Division of Labor

**You are the main planner.** This doc fixes the path: what the supergenius does (3 code commissions,
~2hr each, sequenced), what the resident (ZCode) does in parallel and as the integration torch, and
what mid models do once contracts exist. The Kestrel authored model is downstream of Commission 3 and
is an art task (not a code commission).

---

## TIER 1 — Supergenius (3 code backbones, ~2hr each, SEQUENCED)

These are structural. A junior/mid cannot design them correctly. Each is verified-missing against the
actual codebase. Lazy-vs-genius guardrails are in the per-commission briefs (in chat / earlier in this
thread); the genius must clear the bar, not the floor.

### Commission 1 — Headless Sim Core  ← DO THIS FIRST
Decouple the simulation from Three/DOM. Real systems run in Node, deterministically, no DOM stubs.
- **Why first:** Commissions 2 and the real CI test suite are *impossible to do correctly* without it.
- **Acceptance test (the proof):** `node scripts/sim-run.mjs` steps the *actual* economy + combat
  systems for N ticks and prints byte-identical state across runs (same seed → same output). No
  `Math.random` leaks, no `import * as THREE` in any `src/systems/` file.
- ~3 files: sim boundary contract, 2 worst-coupled system refactors (economy + one combat path),
  the headless entry.

### Commission 2 — Deterministic Offscreen World Sim  ← AFTER #1
The living-world *engine* (not content): coupled flow/decay model on a sector graph, deterministic,
legible. Danger/economy/influence propagate whether or not the player is present.
- **Why after #1:** it must run headlessly and deterministically; that's literally what #1 enables.
- **Acceptance test:** leave a quiet sector, step the sim 10 min of game-time, return — it has changed
  by the model (Reach danger-spike propagated, Meridian price-shock rippled), readable on the starmap.
- ~3 files: `sectorSim.js` (rewritten), `dangerModel.js` (new), one surfacing integration.

### Commission 3 — Authored-Asset Pipeline + GLTFKit  ← PARALLEL with #1/#2 (independent)
Runtime GLTFLoader + part-composition kit + hook-binding contract + graceful fallback. The *only* path
off the procedural-only ceiling.
- **Why parallel:** it's independent of the sim work — it touches the render track, not the sim track.
- **Acceptance test:** drop `cockpit_dome.glb` + `engine_ion.glb` into `assets/ships/parts/`, a ship
  composes them with faction tinting + instancing + working damage/LOD, zero code changes, missing
  asset falls back to procedural (never crashes).
- ~3 files: `assetLoader.js`, `partsLibrary.js`, the `visualOverrides`/`shipKit` seam.

---

## TIER 1.5 — Art (DOWNSTREAM of Commission 3)

### The Kestrel authored model / parts library  ← WAITS FOR #3
This is **art**, not a code commission. It cannot enter the game until Commission 3's loader exists
(today a GLB is a dead file — verified: no GLTFLoader in `src/` or `vendor/`). Sequence:
1. Commission 3 lands (loader + parts kit exist).
2. Hand the modeler the parts-library spec (P0 first: 3 cockpits + 4 engines).
3. Drop GLBs in → ships compose them.
- **Do not start the model until #3 is in**, or you get a beautiful file that can't be loaded.

---

## TIER 2 — Resident (ZCode): do NOW, in parallel, no genius needed

These are real problems but they're config/glue/tuning — my job, not a 2-hour genius slot. I do these
on master while the genius works:

1. **Starter weapon + onboarding resequence** — the "boring opening" fix. One-liner in
   `newGameDefaults.js` (add a weapon, bump credits) + rework `onboarding.js` to reach combat fast.
   Biggest gameplay unlock per minute of work. ~30 min.
2. **Flight/camera/juice tuning** — yaw cap raise (fighters out-turn haulers), camera push-*in* in
   combat (not out), lower feel.js trigger threshold so chip damage lands, add fire-recoil. ~20 min.
3. **Render no-regrets** — wire the vendored `SSAOPass.js`, drop ambient 0.85→0.3, add a real HDRI.
   Lifts every ship immediately. ~30 min.

**These make the game visibly better while the genius cooks, and they're prerequisites that make the
genius's backbones land on a game that already feels decent.**

---

## TIER 3 — Mid models: ONLY after a backbone/contract exists

Mid models are useless for open-ended "make it better" but excellent at scoped instruction-following.
Rule: **a mid model task is only valid once a genius-built contract defines the shape of the content.**

- **After Commission 1+2 (world sim):** mid models can author sector/faction flavor text, event copy,
  danger-state descriptions — *into the schema the world sim defines*. Not before.
- **After Commission 3 (asset pipeline):** mid models (or you, or an artist) author part GLBs *to the
  texture-set/hook contract the pipeline defines*.
- **Lore wiring (the "confusing" fix):** a mid model can copy the 8 canonical NPCs into `bar.js` and
  write mission flavor into `missions.js` — but only with a tight instruction + the canonical docs as
  input. This is the textbook mid-model job and it can run *now* in parallel (it doesn't need a
  backbone — it's filling existing text fields). **Good first mid-model task.**

---

## Suggested first move

1. **Fire Commission 1 (sim core) at the genius now** — it's the gate for #2 and the CI tests. 2hr.
2. **In parallel, I do Tier 2 (starter weapon + flight/camera + SSAO) on master.** You feel the game
   improve this session.
3. **In parallel, fire the lore-wiring mid-model task** (bar NPCs + mission flavor) — it's unblocked.
4. When #1 returns, **I integrate + verify**, then **fire Commission 2** (world sim, needs #1).
5. **Commission 3 (asset pipeline) can fire anytime** — it's independent. Fire it in parallel with #2
   if you can run two genius jobs, else after #1.
6. **Kestrel/parts art starts only after #3 lands.**

---

## The one-sentence summary

Genius builds the 3 backbones (sim core → world sim, and asset pipeline in parallel); I do all
tuning/glue/SSAO/starter-fix now and integrate each commission as it lands; mid models pour content
into the contracts once they exist; the authored art waits for the pipeline. Nothing wasted, nothing
duplicated, nothing a cheaper tier could've done.
