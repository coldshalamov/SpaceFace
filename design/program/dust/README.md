<!-- LIFETIME: VOLATILE — the DUST program board -->
# The DUST Program — broody worlds, open libraries, frames that sell

**Owner direction, 2026-10-31.** Two asks in one: (1) a broody Fallout-type aesthetic — communities
with their own story and personality, quirky and eddy in a dark-comedy register
([TONE_BIBLE.md](./TONE_BIBLE.md), binding); (2) attack the 2026-10-31 blind-spot report's
highest-ROI gaps autonomously, in ROI order, until done. This folder is that program. It exists by
owner direction and supersedes lane routing **only for the exact paths it claims below**; every
other Finish Program rule stays in force (shared checkout, exact-path commits, no `git add -A`,
fetch/merge before push, never force-push, never touch `design/program/vm-drop/`).

## Scope — which deficiencies this program owns (7 of 10 + 1 decision)

From the 2026-10-31 blind-spot report: **P1** exposure chasm (BS-1), **P2** first-hours wallet +
ending meter (BS-2), **P3** broody frame: hero-at-camera + fill (BS-3/4), **P4** starmap
wayfinding (BS-6), **P5** icon language (BS-5), **P6** AI brain spread (BS-7), **P7** latent-test
safety net (BS-9a). Recorded decisions, not built here: BS-8 (VO — recommendation: extend
`barkVoice` with DUST community registers; needs one owner yes/no before spend), BS-10 (session
shape — open design question for the owner). Out of scope: everything on the Finish lane boards
(perf M-waves, save writelane, living-world district runtime build-out) — DUST composes with those,
never duplicates them.

## Claimed paths (exact; foreign dirty paths are excluded)

- `design/program/dust/**` (this folder)
- `src/data/communityPersonality.js` (new), named `src/data/encounters/**` files rewritten under
  P1d, `src/systems/encounterDirector.js`, `src/systems/telemetry.js`,
  `src/observability/sessionReport*.js`
- `src/data/modules.js` / pricing data touched under P2, `src/ui/station/dust/*.js` (new files)
- `src/ui/screens/starmap.js` and its focused test
- `src/ui/icons/**` (new), icon hook points limited to named files
- `src/ai/combatDoctrine.js` variant rows + `src/data/enemies.js` archetype fields under P6
- `scripts/dust-*.mjs`, `test/dust-*.test.mjs`, and the focused tests of files listed above

**Sequencing rule (concurrency):** as of 2026-10-31 `src/render/renderer.js`, `src/ui/comms.js`,
`src/ai/egressExit.js`, `scripts/run-actual-game-playthrough.mjs`,
`scripts/lib/bench/playthroughPilots.mjs`, `test/performance-worker-save-ui-audio.test.mjs` and
three other test files are under foreign edits. Do not touch them until clean; route around
(e.g. P3's renderer.js-dependent increments wait; skybox/env-file increments proceed if they live
outside `renderer.js`).

## Hard contracts (in addition to AGENTS.md / ARCHITECTURE.md)

1. **Determinism:** `state.rng`/`state.simTime` only; no ambient randomness. Never re-record
   `test/*.expected.json` goldens to pass. If a P1b widening change would alter an existing
   deterministic digest, structure the change so default-route sequences are preserved (additive
   lanes, separate streams); if that is impossible, STOP that increment and record it here for an
   owner decision.
2. **Player-facing on the ordinary route:** every outcome ships reachable by default play. No
   hidden flags, no test-only readers.
3. **Perf:** visual additions (P3) must hold the Finish README frame budget on the owner's laptop
   within-session A/B, or they don't ship by default.
4. **Tone:** all new player-visible strings comply with TONE_BIBLE.md §2; community content draws
   from one card source of truth (§3).
5. **Checks:** each packet lands with its focused tests green and, where a screen changed, a real
   capture or `ui-bench --walk` result. Batch rule = Finish README §2.11 (no fixed quotas).

## Packets, ROI-ordered — attack top-down; each has a first increment sized for one sitting

### P1 — Open the world: encounter exposure + community voice (BS-1) — HIGHEST ROI
The 355-module encounter library rolls 12 ambient scripts; most authored content is dark; the
new aesthetic lives exactly there. Increments:
- **P1a Exposure audit (read-only):** map every encounter module → route(s) that can present it
  (ambient roll / owner placement / story / career); quantify dark fraction; identify widening
  seams in `encounterDirector.js` and every determinism golden that constrains it. Output:
  `design/program/dust/EXPOSURE_AUDIT.md`.
- **P1b Widen ambient rolls:** raise the number of authored modules the ambient director can
  present per hour, preserving existing default-route digests (contract 1). Community vignettes
  become reachable in their home sectors first.
- **P1c Exposure telemetry:** per-encounter-id presentation counters in `telemetry.js`, surfaced
  in the session report; a weekly-style digest command `scripts/dust-exposure-digest.mjs`.
- **P1d Community cards + voice pass:** `src/data/communityPersonality.js` with cards for the
  first 6–8 real communities (schema TONE_BIBLE §3, grounded in `sectors.js`/station catalogs);
  pilot rewrites of that many communities' vignettes/bark accents, choices and verbs intact.
- **Done when:** a 20-hour simulated ordinary route crosses ≥3× more distinct authored encounter
  ids than the P1a baseline (measured by P1c counters), and ≥6 communities read in their own
  voice on the default route.

### P2 — First-hours wallet + ending meter (BS-2)
- **P2a Curve pass:** audit hours 0–2 income (story beats 400–3,000 cr) vs first-tier fitting
  prices (6k+); make the first *meaningful, felt* purchase land ≤30 min on the ordinary route —
  prefer adding honest early-tier goods (data-side) over repricing the ladder. No second writer
  of credits (single-writer contract).
- **P2b Ending-gate meter:** read-only progress readout toward `endingDefs.js` gates (net worth /
  rep / branch) on a station surface (new `src/ui/station/dust/` component), styled to bible.
- **Done when:** a focused test proves the ≤30-min purchase is reachable in the 0–2h economy
  model; the meter renders in a real station capture with no new state writers.

### P3 — The broody frame: hero at camera + fill + sky (BS-3/4)
- **P3a Sky first:** fix mid-frame nebula-to-void seams; starfield to frame edge; planets get a
  terminator and contribute light. Files outside `renderer.js` if that's where the env modules
  live; renderer.js increments wait for a clean tree.
- **P3b Hero at camera:** player hull reads at gameplay distance — key/rim treatment, idle
  thruster life, visible in default framings. Budget-checked (contract 3).
- **P3c Dead-band fill:** mid-ground interest anchors (community silhouette props from cards,
  §3 `silhouette`) in the two highest-traffic frames: default flight + first dock approach.
  Look check at gameplay camera per Finish §5.4.
- **Done when:** a fresh capture set shows no frame >2/3 void, seams gone, player hull hero-lit;
  frame budget held vs within-session baseline.

### P4 — Starmap wayfinding (BS-6)
Port the in-session galaxy map's proven pattern (route line from current position, reachability
highlight, clickable affordance, route CTA, legend that decodes marks) into the N-map
(`src/ui/screens/starmap.js`); demote CLOSE from loudest affordance. No route recomputation
logic duplicated — reuse `navigationWaypoint.js` projection owners.
**Done when:** a new player can pick a destination and see the route on the map in one capture;
focused starmap tests + ui-bench walk green.

### P5 — Icon language (BS-5)
One vector icon system: 66 commodity glyphs (category-shaped, not 66 circles), mission-type tags
on the contracts board, tab icons for the station strip. `src/ui/icons/**` + data-driven maps;
hook points minimal and named. **Done when:** contracts board and market render with type icons
in a real capture; no regressions in station bench.

### P6 — AI brain spread (BS-7)
Port the 9-verb `enemyMind` to 2–3 additional archetype clusters with per-archetype verb weights;
give 2 miniboss capitals distinct doctrine variants (the `capital_broadside_ala` pattern).
Determinism contract 1 applies. **Done when:** focused AI tests show distinct verb distributions
per archetype in simulated fights; combat balance spot-checks green.

### P7 — Latent-test safety net (BS-9a)
A discovery runner (`scripts/dust-suite-discover.mjs`) that enumerates every `test/*.test.mjs`
not wired into any npm script and runs them in shards, **report-only** (no gating), with a
summary artifact. Feeds Finish T1's manifest-runner work; does not replace it.
**Done when:** the runner executes the currently-unrouted set and emits a categorized
pass/fail/timeout report without touching the check chain.

## Decision log
- 2026-10-31 — BS-8 VO: **recommended** extend `barkVoice.js` with DUST community registers
  (owner's tone direction implies it); awaiting explicit owner yes/no before spend.
- 2026-11-01 — BS-10 session shape: open question; DUST adds no session-gating mechanics.
- 2026-11-01 — P6 scope: kilnback/pallet_jack doctrine split needs one-line edits in
  `src/data/kilnback.js` / `src/data/palletJack.js` (outside DUST paths; `test/kilnback.test.mjs:200`
  pins roster identity). Owner decision before touching.
- 2026-11-01 — P3 look gate: first increment PARTIAL — see Board state punch list; mechanisms
  compile and run clean on the real route but the frame is still ~half dead.

## Board state (2026-11-01)
| Packet | State | Evidence |
|---|---|---|
| P1a Exposure audit | **DONE** | `EXPOSURE_AUDIT.md`: 354 modules, 195 (55.1%) dark, seams + rng design |
| P1b Widening | **DONE** | `test/dust-encounter-widening.test.mjs` 8/8: legacy digest `d54f2e8e` bit-preserved; lane deterministic; 20 h ordinary route crosses ≥210 distinct ids (baseline ~70); rank-below-legacy + per-day cap + fire-gap cap |
| P1c Exposure telemetry | **DONE** | counters in `telemetry.js` + `sessionReport` exposure section + `scripts/dust-exposure-digest.mjs`; test green |
| P1d Community voice | **DONE** | `communityPersonality.js` (8 cards, grounded ids), 8 vignette rewrites (text-only, verbs intact); checks: encounter-shapes 354 ok, one-voice ok, index regen byte-identical; test 7/7 |
| P2 Wallet + ending meter | **DONE** | early-rung fittings in `modules.js`; `src/ui/station/dust/endingMeter.js` + ledger hook (read-only); tests green |
| P4 Starmap wayfinding | **DONE** | route preview via shipped planner, reachability ring (incl. wormhole), GOAL reticle, Engage Route CTA, CLOSE demoted, honest legend; 7/7 tests + ui-bench shot/walk |
| P5 Icon language | **DONE** (look sign-off) | `src/ui/icons/` (~47 glyphs) + market/contracts/tab hooks; test 7/7; captures: rows/tabs/board SHIPS. Follow-ups: ledger↔missions glyph twins, escort chevron ≈ dispatch affordance |
| P6 AI brain spread | **DONE in scope** | `ENEMY_MIND_ARCHETYPES` (brood/grinder/specter/bulwark) + 4-of-6 samey enemies split + nest_carrier/furnace_maw broadside act variants; `test/dust-ai-spread.test.mjs` 10/10 (pairwise verb divergence TV≥0.15; determinism); ~350 focused gate tests green; kilnback/pallet_jack blocked (decision log) |
| P7 Suite discovery | **DONE** | `scripts/dust-suite-discover.mjs` + `SUITE_DISCOVERY_REPORT.md`: 4,248/4,957 unrouted (85.7%); 15-file sample 15/15 pass, ~3 h full serial estimate |
| P3 Broody frame | **PARTIAL — punch list below** | landed: deep-tone composite uniforms, deep-star population (appended, low-parallax), planet terminator GLSL + per-material uniforms + `SF_PlanetLight`, `heroRig.js` key/rim, idle plume floor 0.06→0.085. Real-route: `pageErrors: []`, `errorCount: 0` (`.devshots/dust/verify/`, incl. webms). Tests: `dust-sky-hero-frame` + `background-bake-program-lifetime` 5/5 green |

### P3 punch list (next increment, in order)
1. Star-floor coverage is still banded (ceres mid/bottom, veil right) — raise deep-plane density or
   widen distribution so no >30% contiguous dead band at gameplay FOVs.
2. Ceres hard nebula-to-void seam remains ("reads as a decal on black" below ~35% height) — extend
   that sector profile's haze tail or add a lower shelf plate.
3. Terminator covers one paint path only — veil's ringed gas giant still uniformly lit; find the
   second planet-material path (bake vs atlas) and adopt the same uniforms.
4. Hero rig absent in some sectors (ceres) — likely per-scene light-budget gating; make the rig
   participate in (or explicitly override) the budget census.
5. Idle thruster glow not visible in any at-rest capture — verify the 0.085 floor actually reaches
   the default chase zoom; may need a size floor, not a throttle floor.
6. Re-capture with real at-rest + in-motion flight frames (one verify frame was a loading screen).

### Integration notes (shared checkout)
- 2026-11-01 ~04:40Z: `src/systems/combat.js` is temporarily unimportable — a concurrent lane's
  mid-flight extraction (`enemySpawnSpec.js`, untracked, missing `WPN` export). Tree-wide; any test
  importing the combat graph fails while it lasts (DUST: `dust-encounter-widening`,
  `dust-ai-spread` when co-loaded; both 8/8 and 10/10 green solo before the break). Lane 2 inbox item.
- Pre-existing defects found (fail at HEAD, not DUST-caused; per Finish §5.6a → owning lane):
  `test/foreman-open-route` TTK band 32.0 s vs 15–30 (reads only unchanged hull/weapon data);
  `test/kilnback-visuals` "cask handoff native revision".
