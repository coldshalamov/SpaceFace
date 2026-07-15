# WAVE 2 PROMPT — paste this as the first message of a fresh session

> **How to use:** start a new Claude Code session in the SpaceFace repo and paste everything below the line
> (or say "follow `design/revamp/WAVE2_PROMPT.md`"). It is scoped to **code work only** — the Blender/visual-asset
> production is owned by a separate agent (Grok) running `FULL_GRAPHICS_REVAMP_GOAL.md` + `BP-08`. This prompt
> ends by having that session author the Wave 3 prompt, so the chain continues on its own.

---

You are running **Wave 2 of the SpaceFace revamp**. This is a large, real implementation turn. Optimize for the
most correct, verified result — not the fastest. Bounded parallel subagent fleets and workflows are welcome.

## 0. Read first (do not skip)
1. `design/revamp/REVAMP_MASTER.md` — the frame: north star, the **8 stable contracts** (§3), wave sequencing, reconciliation ledger. Obey the contracts.
2. `design/revamp/_BASELINE.md` — the captured 47-A + perf baseline. You diff against this, not against red/green.
3. Your lane docs: `BP-02_COMBAT_CEILING.md`, `BP-05_STORY_WIRE.md`, `BP-10_POLISH_UX.md` (render subset), `BP-07_FLIGHT_TRAVERSAL.md`.
4. Memory: the `spaceface-revamp-2-1` and `world-overhaul-2-1` notes (integration seams, what shipped in Wave 1).

## 1. Scope — IN (code only)
- **BP-02 Combat ceiling:** velocity-lead aim + HUD lead pip (new `src/ai/gunnery.js`); projectile momentum inheritance (**flag-gated** if it perturbs the baseline); beam pipeline (new `src/systems/beamWeapons.js` + additive weapon data + dispatch in `combat.js`); missile LOS + fuel; damage-triangle surfaced on the target panel; scanning weak-point reward loop.
- **BP-05 Story wire:** beat registry B8+ in `src/data/narrative.js`; the Wren artifact thread (fires off the **already-shipped** `salvage.js`/anomaly events); manifest phases 2–3; the NPC-ecology graffiti web; Callum/Elroy/VALE-registry beats; **Helix** paper-faction data row (`src/data/factions.js`, zero ships — Reconciliation 1); route ALL comms through the **already-shipped** `voiceArbiter` and use the **already-shipped** `src/data/barks.js`. **Endgame Choices A–E: consult the advisor before wiring (irreversible-feeling).**
- **BP-10 render CODE only:** bloom, ACES tone-mapping, distance fog, dynamic point lights, and engine **ribbon trails** (new `src/render/ribbonTrails.js`, replacing particle trails). Every effect ships with a **quality toggle** measured against the 30 fps floor before merge. Plus **contact HUD identity badges** (faction · role · threat · ship class/level — the data is already on `entity.data.ai` / `entity.factionId` / `entity.data.level`).
- **BP-07 Flight & traversal — LAST, highest golden risk:** leash-steering to the GDD targets, **brake-to-stop (Space)**, mass-wired handling, ring-lane **mechanic** (works with the existing generic gate mesh), tether traversal. **Do this last, after an advisor sign-off + a fresh baseline diff.**

## 2. Scope — OUT (do NOT do these)
- **No Blender / GLB authoring. No `parts_manifest.json` edits. No station/landmark/ring-gate/wreck/whole-ship asset production.** That is Grok's lane (`FULL_GRAPHICS_REVAMP_GOAL.md` + `BP-08`). Touching it will collide with a live agent.
- **Asset-gated work → defer with a clear TODO, don't block on it:** PBR-material application on hero assets (needs Grok's baked maps), registering the 5 authored engines / 6 weapons into the manifest+`partsLibrary` (BP-09; needs Grok's assets export-clean), ring-gate/landmark *visuals* (the ring-lane *mechanic* is in scope; the pretty gate is Grok's). Build the code seams so these drop in when Grok reports assets ready.
- **No Wave 3 work** (wingman orders, anomaly-POI behaviors, overload/vent, tooltips/accessibility, one-map cutover) — that's the next session, which you will set up in §6.

## 3. Stable contracts (from REVAMP_MASTER §3 — enforce in every subagent prompt)
- **Determinism:** the sim never calls `Math.random()`. Use a seeded RNG domain / `hash32(state.meta.seed, …)` (`src/core/rng.js`). VFX guarded by `typeof window` may use `Math.random`.
- **`factionId` is cosmetic + kill-rep only.** Hostility is `scanner.isHostileToPlayer` (team/archetype/`ai.spawnContext`/security). Never couple them.
- **`spawnBudget` is the single ship-cap arbiter** (MAX 12; ambient headroom 8 in `world.js`; encounters use the rest). Anything that spawns hostiles requests/releases against it.
- **`voiceArbiter` for all player-facing text** (`ctx.helpers.voice.say`), one voice at a time.
- **`sectorZones.js` is the placement substrate** — reuse it; don't reinvent geometry.
- **Merge protocol:** parallel lanes create only their own NEW files + return registration instructions; **you** (orchestrator) do all edits to shared hot files (`combat.js`, `weapons.js`, `story.js`, `narrative.js`, renderer/registry/uiRoot) sequentially at merge. One owner per hot file per wave.

## 4. The advisor (the `advisor` tool is broken — use this instead)
Spawn a **Fable 5** planning subagent for architecture/prioritization and before risky commits:
`Agent(subagent_type: "Plan", model: "fable", name: "FablePlanner", prompt: "<rich digest>. Do NOT call any tools. Reason at maximum depth and return a plan.")`. Resume it later via `SendMessage(to: "FablePlanner"|its agentId)` — it keeps context. **Consult it: (a) before committing to the combat hot-file approach, (b) before wiring endgame Choices A–E, (c) before the flight-feel lane, with the baseline diff in hand.**

## 5. Sequencing & verification (Fable's call)
- **Order:** Combat + Story lanes **first, in parallel** (disjoint; story is low-risk data/event work). Render CODE **second**. Flight-feel **LAST** with advisor sign-off. **Never all four at once.**
- **Verify every merge:** `npm run check:bundle`, `check:mining:2`, `check:ai` stay green; **diff `check:sim:compare` (47-A) against `_BASELINE.md`** — it must still fail *only* on the "projectile-collision precondition"; any new/changed line means you perturbed the golden — investigate before proceeding. Boot the headless preview (`preview_start` "sf-verify"), drive the feature, confirm **zero console errors** and capture proof. For render effects, measure against the 30 fps floor (`check:perf`) with the toggle on.
- **Golden rule:** never edit `test/*.expected.json` to pass.

## 6. WHEN WAVE 2 IS VERIFIED-COMPLETE — hand off to Wave 3 (do this, don't skip)
1. Update `design/CURRENT_BUILD_STATUS.md` (or a `design/revamp/STATUS.md`) with what Wave 2 shipped + verification evidence.
2. Update the `spaceface-revamp-2-1` memory note with Wave 2 results + any new seams/risks discovered.
3. **Author `design/revamp/WAVE3_PROMPT.md`** using THIS file as the template, scoped to the **Wave 3 finishers**: wingman orders → SG-06 tactics (new `src/ai/wingmanOrders.js`); anomaly/POI distinct behaviors (as `encounters.js` data); overload/active-vent player mechanics; **one-map cutover** (BP-03 parity checklist → retire the old `localmap.js`/`starmap.js`); tooltips + text-scale + colorblind palette (BP-10 UX); and **flight-feel** if it slipped from Wave 2. Keep the same **Scope-OUT (no Blender)**, **stable contracts**, **advisor**, **sequencing/verification**, and **self-continuation** sections — and have Wave 3 generate `WAVE4_PROMPT.md` for any remaining BP work, or declare the revamp **code-complete** (all BP-01..BP-10 code lanes done; only Grok's asset production + final PBR/asset-gated wiring outstanding).
4. Tell the human: Wave 2 done, Wave 3 prompt ready at `design/revamp/WAVE3_PROMPT.md`, and whether any Wave-2 items were asset-gated/deferred pending Grok.

Be decisive, verify everything you claim, and leave the tree in a clean, playable state.
