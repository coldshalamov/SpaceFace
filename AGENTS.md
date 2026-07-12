# SpaceFace Agent Policy & Orientation

> **Read this first. It is the front door to the whole repo.**
> If you do nothing else, read §1 (where to start), §3 (the uncommitted-tree trap),
> §5 (which implementation is LIVE), and §7 (common-bug routing). The rest is reference.
>
> **Authority chain when documents disagree:**
> `ARCHITECTURE.md` (technical contract) > `design/GDD_2_0.md` (design authority)
> > `design/spec2/00_MASTER_TASTE.md` (taste constitution — its Forbidden list rejects diffs)
> > `design/vision/ALPHA_PROGRAM.md` (current solo-alpha execution order and scope)
> > the specific `design/spec2/` or `design/spec3/` spec activated for the task > supporting docs.
> `design/CURRENT_BUILD_STATUS.md` is the live "what's built / what's red" map — but it drifts;
> trust the actual `check:*` output over it (see §11).

---

## 1. Where to start — pick your lane

| You are… | Read these in order, then stop reading and do the work |
|---|---|
| **Product sprints / “what do we build?” / goal prompts** | (1) **`design/vision/README.md`** · (2) `design/vision/ALPHA_PROGRAM.md` · (3) `design/vision/01_CURRENT_STATE.md` · (4) the specific spec or prompt the alpha ledger activates |
| **Overnight / full autonomous pipeline (go to bed)** | Soft (allows partial): `design/vision/OVERNIGHT_GOAL.md`. **Strict (no early stop):** `design/vision/OVERNIGHT_GOAL_STRICT.md`. Morning: `design/vision/WAKE_REPORT.md` |
| **Implementing a feature or fix** | (1) this file §3 + §5 + §7 · (2) `design/vision/01_CURRENT_STATE.md` (or `design/CURRENT_BUILD_STATUS.md` as secondary) · (3) the spec / vision wave your brief names · (4) `docs/MODULE_MAP.md` for the file you're touching · (5) `ARCHITECTURE.md` only the section your work touches |
| **Adding or fixing a ship/station/place model** | `assets/AGENTS.md` (visual asset catalog + ship pipeline), then `design/spec3/SPEC3-F9-asset-pipeline.md` |
| **Running parallel graphics sprint threads** | `design/graphics-sprints/GOAL_PROMPTS.md` (copy-paste thread prompts) → `00_ORCHESTRATION.md` |
| **Wiring portraits, cinematics, or "what assets exist?"** | `assets/AGENTS.md` §1 master catalog · `assets/portraits/AGENTS.md` · `assets/concept/AGENTS.md` (reference-only) |
| **Debugging combat / AI / hostility / "I get attacked on spawn"** | `docs/COMMON_BUGS.md` §"Spawn attack / friendly fire." **Read it before grepping** — the hostility system is subtle and the live code differs from HEAD. |
| **Tracing an event ("who emits/handles `combat:fire`?")** | `docs/EVENT_ROUTING.md` — generated, 263 events × all emit/subscribe sites with file:line. Regenerate after structural changes: `npm run build:indexes`. |
| **Finding what a system does / its update order / what it emits** | `docs/SYSTEM_REGISTRY.md` — generated, all 33 systems in init+update order with line counts + top events. |
| **Doing perf/render/feel work** | §10 below + `design/PERF_BUDGET.md`; run `npm run check:flight:clean` → `check:assets:live` → `check:perf` before claiming a fix |
| **Designing new systems or content** | `design/GDD_2_0.md` (vision/pillars) → `design/spec2/00_MASTER_TASTE.md` (taste) → the relevant `design/spec3/SPEC3-Fx-*.md` thread |
| **Lost / "where is X"** | `docs/MODULE_MAP.md` first. If it's not there, `docs/COMMON_BUGS.md`. If still stuck, the file-ownership map in `design/BUILD_PLAN_2_0.md` §0. |

`design/vision/00_CONSTITUTION.md` and `design/vision/03_MASTER_BUILD_PLAN.md` are supporting only when `ALPHA_PROGRAM.md` activates them; they are not default product-sprint routing.

**Do not** read the whole `design/` folder. It's 5,400+ lines across three suites plus 21 loose files, much of it historical. Use the dispatch maps above.

---

## 2. What SpaceFace is (30 seconds)

A **semi-3D top-down space game** for PC/browser: fly a ship, mine asteroids, trade on a living supply/demand economy, fight pirates, upgrade ships/modules, jump between sectors, take missions, build passive income. Inspired by Freelancer, Endless Sky, Star Valor, Rebel Galaxy, the X series.

**Tech:** Three.js (r0.160, vendored ES modules + importmap, no bundler required for dev; esbuild bundle for packaged release), DOM/CSS overlay UI, 100% procedural Web Audio, zero-dependency static dev server, optional Electron shell for desktop packaging.

**Architecture in one breath:** a single flat `GameState` (`src/core/gameState.js`), an event bus (`src/core/eventBus.js`), and ~40 self-contained "systems" (each `init(ctx)` + `update(dt, state)`) wired into a registry (`src/core/registry.js`) and run in a fixed `UPDATE_ORDER` by a **60 Hz fixed-timestep sim** (`src/core/loop.js`) decoupled from rendering. Content is data-driven (`src/data/*`). Sim **never** imports Three.js; UI emits intents only; gameplay is on the **XZ plane** (y=0); determinism via `state.rng` (never `Math.random()` in sim).

**Boot flow** (`src/main.js`): boots to **Main Menu** (`state.mode='menu'`). New Game → `game:new` event → `startNewGame()` → calls each system's `newGame()` → builds world → **refuses to enter flight until authored ship assets are ready** (won't silently fall back to procedural ships) → `state.mode='flight'`. Continue → save load → `finalizeLoadedGame()` → same asset-ready gates.

Full contract: `ARCHITECTURE.md`. Full file map: `docs/MODULE_MAP.md`.

---

## 3. ⚠ CRITICAL — the repo is in a deep uncommitted state. Read this or waste hours.

`git status` shows **~202 files changed, ~17,000 insertions uncommitted** (as of 2026-07-05). This is the single biggest source of "I fixed it but it's not fixed" confusion. **An agent operating on what's committed (HEAD) sees a different, buggier game than what's in the working tree.**

Concrete example (verified first-hand): the live AI hostility function `isHostile` in `src/systems/aiPorts.js` **has a lawful-patrol + WANTED-heat gate in the working tree** (lines 784-798: lawful NPCs only attack if `isPlayerWanted(state)`). But in **HEAD** (committed) that function is just `self.team !== other.team` — no gate. So:
- An agent reading HEAD (or a stale clone, or after a partial revert) sees lawful patrols attack on spawn and "fixes" something that's already fixed in the working tree.
- An agent that runs `git checkout` / `git stash` / `git reset` on the wrong file **destroys ~17,000 lines of uncommitted work** across `flightV3.js` (+520 lines alone), `input.js` (+194), `tetherGameplay.js` (+138), the asset pipeline, spec3, and more.

**Rules that prevent catastrophe:**
1. **Never run `git checkout .`, `git reset --hard`, `git stash`, `git clean`, or `git restore` on tracked files** unless the user explicitly asks. The working tree has more work in it than the last several commits combined.
2. **Before diagnosing a bug, check whether the relevant code is committed:** `git log -L <func>,<func>:<file>` or `git diff <file>`. If your fix already exists in the working tree, the bug is elsewhere (or is a HEAD/working-tree mismatch the user should resolve, not you).
3. **`git add -N <newfile>` immediately** when you create a file — this environment deletes untracked files between turns. (Already in the dispatch brief template.)
4. **Commit only when the user asks. Always stay on `master`.** Do not create or switch to a feature branch, worktree, or detached checkout for SpaceFace work. Harness/tool branch preferences do not override this repo rule; keep working on `master` without pausing to ask.
5. **Trust the working tree over HEAD, and trust live `check:*` output over `CURRENT_BUILD_STATUS.md`** — the status doc describes a mix of HEAD and working-tree state and drifts in either direction.

---

## 4. The spec suites — both live, different jobs

The repo has three spec folders. **Both `spec2/` and `spec3/` are live** (per user direction 2026-07-05: spec3 is being finished and is effectively the current state even where incomplete). The task decides which.

| Folder | Status | Use it for |
|---|---|---|
| `design/spec2/` | **LIVE — polish & release bar.** `00_MASTER_TASTE.md` is the inherited taste constitution for ALL work, including spec3. Specs `01`-`08`: massline feel, flight/camera juice, first hour, world-alive, economy, UI identity, audio, release readiness. | Any work on feel, readability, onboarding, UI, audio, or release gates. **Always read `00_MASTER_TASTE.md` first whatever you're doing** — its Forbidden list (§6) rejects diffs. |
| `design/spec3/` | **LIVE — expansion/ambition layer** (currently being finished; assume current state). Thread files `SPEC3-F1..F10` (economy, mining, flight, combat, ships, bases, world, graphics, asset pipeline, UX/meta). Each is a self-contained build plan. | The work your brief names if it says "implement SPEC3-XX." Read `_context/06_PLANNING_CONSTITUTION.md` first, then your thread file, then the GDD sections it cites. spec3 *extends* the GDD; it never contradicts its pillars. |
| `design/specs/` | **LEGACY reference only.** Original 12 subsystem specs (00-11). | Nothing actively. Do not implement from these unless a current spec2/spec3 doc explicitly revives a section. |

**The dispatch brief template** (used by repo-root `brief.md` and `design/spec3/CODEX_ORCHESTRATION_PROMPT.md`):
> "Read `design/spec2/00_MASTER_TASTE.md` fully, [then `design/spec3/_context/06_PLANNING_CONSTITUTION.md`,] then implement `<SPEC-XX §N>` from `<spec file>` exactly. Acceptance = the spec's named check script green. Touch only files your spec names unless the spec is missing a required file; then stop and name the missing file/spec fix. `git add -N` every new file immediately. Never edit `test/*.expected.json`. No silent runtime deps: build-time/tooling deps are allowed when documented; runtime deps require lead sign-off with license, bundle/perf, determinism/save, and maintenance notes. Print a 10-line summary."

If your brief points at spec3, **spec3 is current for that task** — do not re-litigate it against spec2. The taste constitution (spec2/00) still applies on top.

**The earlier contradiction is resolved:** old policy said "spec2 only"; live briefs dispatched spec3. Both are now sanctioned (§4). `README.md` line 87 still mentions only spec2 — that's stale; this file supersedes it.

**Loose `design/*.md` files** (`V2_MASTER_PLAN`, `IMPROVEMENT_IDEAS`, `HUD_REVAMP_DESIGN`, `GRAPHICS_*`, `FLIGHT_*`, `SKILLS_*`, `STATION_MARKET_UI_REVAMP`, etc.) are **unmanaged drift** unless explicitly revived by a current doc. `GDD_2_0.md` outranks all of them. (The stale `design/ARCHITECTURE.md` handoff blurb that used to collide with the repo-root `ARCHITECTURE.md` has been archived to `design/_ARCHIVE/handoff_architecture.md`; the **repo-root** `ARCHITECTURE.md` is the only authoritative one.) **Archived 2026-07-08:** `HUD_REVAMP_DESIGN.md`, `STATION_MARKET_UI_REVAMP.md`, `GRAPHICS_SPEC.md`, `GRAPHICS_MASTERPLAN.md`, `GRAPHICS_UPGRADE_PLAN.md` are now in `design/_ARCHIVE/` with drift banners — a frontend agent reading `design/` will no longer find a forbidden visor HUD presented as a live spec. The live UI authorities are `design/spec2/06_UI_IDENTITY.md`, `design/spec3/SPEC3-F8-graphics-visuals.md`, `design/spec3/SPEC3-F10-ux-meta-tastemaster.md`, and the surface inventory `design/revamp/FRONTEND_REBOOT_AUDIT.md`.

---

## 5. CRITICAL — most core systems have TWO implementations. Know which is LIVE.

This is the #2 reason fixes "don't get applied" (after the uncommitted-tree trap). The engine has flag-selected backend swaps. **The defaults pick one; the docs and even file names often point at the other.** Defaults are force-stamped onto every save (`src/save/saveSystem.js:1411-1413`), so old saves cannot resurrect the legacy backend.

| System | 🟢 LIVE (default-on) | ⚪ LEGACY (fallback / test-fixture only — editing has no effect in normal play) | Selection site | Default flag |
|---|---|---|---|---|
| **Flight controller** | `src/systems/flightV3.js` | `src/systems/flight.js` (**not dead** — statically imported by `registry.js:13`, `scripts/sf-sim.mjs`, and every legacy `check:sim` gate; CI-load-bearing but never the registered controller under default `flightBackend:'v3'`) | `src/core/registry.js:180-186` `selectFlightSystem` | `flightBackend:'v3'` |
| **Flight physics math** | `src/core/flight/` (`propulsionCatalog.js`, `propulsionKernel.js`, `flightTelemetry.js`) | `src/core/flightDynamics.js` (still imported by `aiPorts.js:13` for legacy compat + legacy `check:sim`) | follows the flight flag | — |
| **AI** | `src/systems/tacticalAI.js` + `src/ai/*` library + `src/systems/aiPorts.js` (the "SG-06 tactical" stack) | `src/systems/ai.js` (**not dead** — statically imported by `registry.js:9`, `scripts/sf-sim.mjs`, and several `check-ai-*.mjs` CI gates; CI-load-bearing but never the registered controller under default `aiBackend:'sg06-tactical'`) | `src/core/registry.js:170-176` `selectAISystem` | `aiBackend:'sg06-tactical'` |
| **Physics backend** | `rapier-dynamic` (Rapier, dynamic bodies, single authority via `physicsAuthority.js`) | `custom` (legacy manual integrator in `physics.js`) | `src/core/registry.js` + `src/core/gameState.js:16` | `physicsBackend:'rapier-dynamic'` |
| Combat | `src/systems/combat.js` (the registered system) calling into `src/combat/` shared library (`kernel.js`, `damage.js`, `attachments.js`, etc.) | — | `registry.js:17` | n/a — layered, not duplicate |
| Presentation | `src/systems/presentationOrchestrator.js` + `presentationAdapters.js` (registered) consuming `src/presentation/` (data) | — | `registry.js:31-32` | n/a — layered |

**Rules:**
- **Editing the legacy file will appear to work but have no effect in normal play.** If your fix to `flight.js` or `ai.js` "didn't apply," this is why (or §3 — check if it's already fixed in the working tree). Always edit the LIVE column. **They are not dead code** — they're statically imported by `registry.js` (lines 9, 13) and pinned by CI (`check:sim` legacy runs them; `check:sim:v3` runs V3). Treat them as frozen fixtures: do not edit for gameplay fixes, and do not delete without removing the legacy check scripts that import them.
- **Both flight systems export `name: 'flight'`** and both AI systems fill the `'ai'` slot — the registry addresses the slot by name (`registry.js:84-85`), so `registry.get('flight')` returns whichever won the flag, never both. (Both are imported unconditionally at the top of `registry.js`; the `selectX` functions only decide which gets *registered*.)
- **The legacy flight/AI files are retained because CI runs `check:sim` (legacy) AND `check:sim:v3`** — both controllers must keep passing their golden telemetry. Do not delete them without removing the legacy check scripts too.
- **Even the GDD points at legacy files.** `design/GDD_2_0.md:25` cites `src/systems/flight.js:169` as the location of the "hard to fly" problem — true when written, but `flightV3.js` is the live controller now. Cross-check before assuming a cited file is live.
- **ADR-0003** (`design/adr/0003-flight-physics-controller.md`) is **stale** — it documents "custom controller, Rapier optional." The V3 migration made `rapier-dynamic` + V3 mandatory and default.

**Stale ownership line:** `design/BUILD_PLAN_2_0.md:42` names `flight.js` + `flightDynamics.js` as Claude-owned. That reflects the pre-V3 split. The current V3 reality is `flightV3.js` + `src/core/flight/`.

---

## 6. Standing policies (do not violate)

### One Game Path
- Browser (`http://localhost:8123/`), Electron dev (`npm run electron`), Chrome probes, and packaged desktop builds **boot the same player-facing game route and entrypoint** (`src/main.js`, same `createGameState()` defaults, same systems, same release-authored assets).
- Launcher differences may cover only shell concerns: window chrome, fixed local port (41788), packaging, GPU process hints, production debug stripping.
- A launcher must **not** change gameplay, assets, renderer features, UI availability, settings defaults, scenario defaults, or feature reachability. `check:launch-policy` enforces this.
- **Single source of truth for serving (do not duplicate):** `server.js` (browser) and `electron/main.cjs` (desktop) are thin wrappers around **`scripts/lib/gameServer.cjs`**, which owns the MIME table, dev-freshness logic, static-serving core, and containment check. They were previously copy-pasted and drifted — adding an asset type in one but not the other caused silent 404s. Now: **to add an asset type or change serving behavior, edit `scripts/lib/gameServer.cjs` ONLY.** Never re-inline a MIME table, freshness function, or HTTP server into either launcher — `check:launch-policy` actively rejects that.
- Normal play uses the **release-authored runtime assets** under `assets/ships/release/parts/`. Source assets under `assets/ships/parts/` are authoring/build inputs, not an alternate default game.
- Debug probes, screenshots, capture routes, and inspection globals (`window.SF`, `window.__SF_FLIGHT_V3__`) are tooling. They must not be required to see normal game content.

### Wired Feature Policy
- Player-facing features, assets, settings, controls, missions, screens, and systems must be **reachable in the default game or intentionally removed**.
- Do not leave "sometimes wired" feature work behind. If it is not good enough for default play, improve it, delete it, or keep it only as a clearly named tool/test fixture.
- Browser and desktop manual testing exercise the same assets and defaults. If a probe needs a special mode, it must prove instrumentation, not a different game.

### HUD design rule (standing user preference)
Clean **NON-diegetic** HUD. No first-person/visor/cockpit motifs — no screen-edge arcs, no helmet avatars, no pilot portraits on the HUD. Non-negotiable across all spec suites. (See `design/spec2/00_MASTER_TASTE.md` §3.)

### Determinism is sacred
- 60 Hz fixed-timestep sim. The 47a golden replay and the `check:*` harness gate the build.
- **Never edit `test/*.expected.json` goldens to make a check pass** — fix the code, or flag the golden for a deliberate re-record batch (with a named reason).
- `Math.random()` is forbidden in sim code (use `state.rng`). Wall-clock time is forbidden in sim (use `state.simTime`). VFX/particles may use `Math.random()` (cosmetic, not serialized).
- The `typeof window`-gated heat vent in `weapons.js` exists **to preserve determinism** in headless sim — do not "fix" it.
- Sim-affecting changes must describe how they preserve or deliberately re-record goldens.

### Input contract (LOCKED — do not edit `src/systems/input.js` except the lead)
No agent edits `src/systems/input.js` except the lead. The raw axis fields on `state.input` (from `gameState.js:85`): `moveX, moveZ, turnIntent, boost, brake, fire, fireGroup, autoFire, deployCountermeasure, aimWorld{x,z}, aimAngle, mouseNdc{x,y}, pointerScreen{x,y,active}`.

The edge-triggered verb fields live on **`state.input.actions`**, created lazily at `src/systems/input.js:300-303`. Consumer systems may read these guaranteed fields:
`actions.brake, actions.cruise, actions.tetherFire, actions.tetherCut, actions.reelDelta (float, scroll), actions.chargeThrow, actions.chargeDetonate, actions.scanPulse, actions.autopursuit, actions.deployBeacon`.

Test via scripted inputs in the sim harness (`scripts/sf-sim.mjs --inputs`), not via keyboard.

### Concurrent graphics work
- Treat `assets/ships/release.__lock/`, `assets/ships/release.__building/`, `assets/ships/release.__previous/`, running Blender/asset-export processes, and active graphics-agent edits as **ownership signals**.
- Do not edit, regenerate, delete, clean, format, revert, or stage `assets/**`, ship manifests, release outputs, or `src/render/**` while another graphics/asset lane is active unless the user explicitly redirects ownership.
- Performance work must not "fix" graphics conflicts by rolling assets back. If render or asset structure is the bottleneck during active graphics work, report the evidence and leave the graphics lane untouched.

### Performance policy
- **Do not solve performance by silently lowering visible quality, disabling authored assets, or making browser and desktop diverge.**
- Measure before and after in Chrome/Electron-compatible runtime paths; keep screenshots when render changes are involved.
- Prefer structural fixes: batching, instancing, cache reuse, allocation reduction, frame pacing, avoiding duplicate system work.
- Authored model exports should merge static bolts, ribs, panels, and repeated detail into a small number of submeshes per material/animated role.

### Single-writer ownership (ARCHITECTURE §0.6 — summarized)
- **Credits** — only `economy` writes `state.player.credits`; others emit `economy:grantCredits`/`chargeCredits`.
- **Reputation** — only `factions` writes `state.factions[id].rep`, via `applyRep()`; others emit `faction:repDelta`.
- **Cargo** — only `cargo` writes `state.player.cargo`, via `addCargo`/`removeCargo`.
- **Ship derived stats** — only `ships` writes `entity.derived`, via `getDerivedStats()`.
- **WANTED heat** — only `heat` writes `state.player.heat`. Canonical "is player wanted" check: `heat.isPlayerWanted(state)` (`heat.js:147`, `WANTED_THRESHOLD = 0.15` at line 33). Do NOT use the dead `ai.playerWanted` field.
- **Sector ownership** — `factions` writes `state.world.sectors[id].owner` (war resolution only); `world` reads it.

---

## 7. Common-bug routing — read this before grep

When a fix "doesn't apply" or a bug resists diagnosis, it is almost always one of these. Full playbooks with file:line entry points: `docs/COMMON_BUGS.md`.

| Symptom | Real cause | Entry point |
|---|---|---|
| "I made a fix and nothing changed" | (a) You edited a **legacy** file (`flight.js`/`ai.js`/`flightDynamics.js`); defaults run V3+tactical. OR (b) the fix **already exists in the uncommitted working tree** — check `git diff` before diagnosing. | §3 + §5 above. |
| "I get attacked by enemies on spawn" / "friendlies hostile" | Subtle. The live `isHostile` (`aiPorts.js:784`) **does** gate lawful patrols on `isPlayerWanted(state)` — but only in the **working tree**; HEAD is team-only. There's also a squad fallback clause (`squad.js:272`) that can vote hostile when `contact.hostile` is undefined + team mismatch + threat > 0. | `docs/COMMON_BUGS.md` §2. **Read it before grepping** — three interacting factors. |
| "My new ship model doesn't render" | Asset pipeline is 5 steps with 3 registries. A broken model **silently** falls back to procedural geometry (no error). The whole-ship map (`WHOLE_SHIP_FILE_BY_DEF_ID`) is currently **EMPTY** — default play uses modular hulls (`HULL_FILE_BY_DEF_ID`). | `assets/AGENTS.md` + `docs/COMMON_BUGS.md` §3. |
| "After wiring assets, the main ship is a turd / floating antennas" | You wired a **broken export** masquerading as a detailed model. The 10-14MB wholeship GLBs are accessory-only (no hull body). Check `status:"blocked"` in `parts_manifest.json` and run `npm run check:asset-status` — file size does NOT mean "good model." | `docs/COMMON_BUGS.md` §3b. |
| "Game refuses to start / 'authored ship assets did not preload'" | `main.js:196-199, 203-206` **refuses to enter flight** if authored assets aren't ready (won't silently degrade). This is intentional. Fix the asset, don't weaken the gate. | `main.js` boot gates. |
| "Friendlies labeled as heat / threat" | **"heat" means three different things**: (1) WANTED heat `state.player.heat` (`heat.js`), (2) weapon overheat `w._heat` (`weapons.js`), (3) sector danger index (`dangerModel.js` — offscreen sim, NOT combat). Grep lands you in the wrong one. | `docs/COMMON_BUGS.md` §4. |
| "I changed a faction/rep number and combat didn't react" | The live combat AI reads `ai.lawful` + team + (via `isPlayerWanted`) heat — **not** raw faction rep. Faction rep affects docking, missions, and (via `faction:aggro`→heat) the WANTED path. | `docs/COMMON_BUGS.md` §5. |
| "My perf fix made the frame worse / browser diverged" | You silently disabled an authored asset or lowered quality. Forbidden. | §Performance policy + `design/PERF_BUDGET.md`. |

---

## 8. The system update order (so you know what runs before/after what)

From `src/core/registry.js:77-80`. Each step: `core.preStep` → `UPDATE_ORDER` systems → `core.lifetimeSweep`. Render phase (`renderUpdate`) runs every frame: `render` → `vfx` → `feel` → `ui`.

```
input → scanner → ai → aiEncounter → actions → beacons → flight → cruise → aiPorts →
weapons → countermeasures → impulseCharges → physics → combat → tetherGameplay →
mining → cargo → automation → wingmen → crafting → economy → intervention →
world → factions → sectorSim → missions → story → scenarioRuntime → heat →
traffic → drill → claims → onboarding
```

Read the rationale comments at `registry.js:60-76` before reordering. Key invariants: AI submits commands before actions resolve; actions before flight; weapons before physics; beacons after AI/actions and before flight (lure override); heat late (piracy events from combat/factions this tick landed before decay); traffic after world (sector:enter spawned stations) and after heat; sectorSim after world+factions; onboarding last (reads state only).

---

## 9. Verification — what to run and when

| After you… | Run |
|---|---|
| Touch launcher, asset-mode, packaging, or debug surfaces | `npm run check:launch-policy` |
| Touch flight or render loop | `npm run check:flight:clean`, then `npm run check:assets:live`, then `npm run check:perf` before claiming a smoothness fix |
| Touch assets / manifests / `src/render/**` | `npm run check:asset-reachability`, `npm run check:assets:live`, `npm run check:visual-stability` |
| Touch shared systems or launch policy (broad handoff) | `npm run check` (the full gate — slow but comprehensive) |
| Touch sim / anything affecting determinism | `npm run check:sim:compare` (hashEqual:true is the pass bar while the 47a golden re-record is pending) + `node scripts/check-tether-gameplay.mjs` |
| Touch UI / a11y / contrast | `npm run check:ui-a11y`, `npm run check:wcag-contrast`, `npm run check:ui:perf` |

**Acceptance ritual for any spec2/spec3 task** (from `00_MASTER_TASTE.md` §7): the spec's named acceptance check green + the no-regression floor + a screenshot pair into `.devshots/` for anything visual. **Transcripts are not proof — checks are. Never accept an agent's claim without file evidence.**

---

## 10. Concurrent-agent file ownership (from `design/BUILD_PLAN_2_0.md` §0)

When multiple agents run in parallel, do not cross these lanes. Full map in `design/BUILD_PLAN_2_0.md`.

- **Lead (Claude):** `src/systems/input.js`, `src/systems/flightV3.js` *(the stale line names `flight.js`; V3 is live)*, `src/core/flight/*` tuning constants, `src/ui/hud.js`, `src/ui/uiRoot.js`, `styles/ui.css`, `src/ui/comms.js`, `src/ui/alerts.js`
- **Tether lane:** `src/combat/attachments.js`, `src/data/combatDefs.js`, `src/systems/weapons.js`, `src/systems/tetherGameplay.js`
- **Perf lane:** `src/render/renderer.js`, `src/render/vfx.js`, `src/core/loop.js`, `src/render/precompile.js`, `scripts/check-hitch-budget.mjs`
- **Maps/scanner lane:** `src/ui/bindings.js`, `src/ui/screens/starmap.js`, `src/ui/screens/localmap.js`, `src/systems/world.js` (discovery init only), `src/systems/scanner.js`
- **Graphics/asset lane:** `assets/**`, ship manifests, release outputs, `src/render/**` — coordinated by `assets/ships/release.__lock/` and `release.__building/`. See `assets/AGENTS.md`.

---

## 11. Status-doc drift warning

`design/CURRENT_BUILD_STATUS.md` and `design/BUILD_PLAN_2_0.md` are useful maps but **they drift** in both directions — some "missing" scripts now exist (e.g. `scripts/check-cruise.mjs` exists but CURRENT_BUILD_STATUS calls it missing), and some "built" items may have regressed in the uncommitted tree. Verified first-hand 2026-07-05:
- `scripts/check-cruise.mjs` — **EXISTS** (status doc says missing — stale).
- `src/systems/encounterDirector.js` — **BUILT** (2026-07-06): full campaign director (two-deck
  pressure model, phases/choices/receipts, named captains) + `src/systems/encounterScripts.js` +
  expanded `src/data/encounters.js`. Checks: `check:encounter-director`, `check:living-universe`,
  `check:encounter-voice` (SPEC2/04 + SPEC3-21/29 core).
- `scripts/check-release-soak.mjs` — **EXISTS**: `npm run check:release-soak` passes the deterministic
  quick campaign and `test/release-soak-contract.test.mjs` passes 13/13. The broader M6 platform,
  performance, capture, and clean-wave acceptance matrix remains open.

**Always trust the actual `check:*` output and `git status`/`git diff` over the status docs.** If a doc and a live check disagree, fix the doc in the same pass.

---

## 12. Skills, MCPs, and tooling dirs (don't get distracted)

- `skills/` (repo root) — vendored generic game-dev/Three.js skills, NOT SpaceFace policy. The live agent skills come from `~/.agents/skills/` (user home, outside this repo).
- `.claude/`, `.codex/`, `.agents/` — currently empty of policy (`.claude/launch.json` is VS Code configs only). `.serena/` is a code-nav tool's memos; mildly stale, consistent with this file.
- `mcps/` — MCP tool manifests (Blender, grok github/notion). Pure tooling config, no policy.
- `terminals/` — runtime transcripts of multi-agent terminal sessions (YAML header + stdout). Forensic evidence of what each subagent did; not policy. Useful for "what did that agent actually change?"

---

*Built collaboratively by a fleet of AI subagents against a single architectural contract. This file is the contract's front door — keep it accurate; drift here becomes 20-prompt debugging sessions downstream. Every claim above was verified first-hand against the working tree on 2026-07-05.*
