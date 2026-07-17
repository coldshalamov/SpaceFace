# SpaceFace — Polish/Improvement Briefing (evidence-first)

> **Read this paragraph twice.** This briefing is built from **code analysis**, not status docs. Every
> target below is traced to a provable code fact: a file:line, a quoted snippet, or a measured metric
> (import counts, commit churn, line spans). The reason is deliberate: this repo's `design/` and
> `docs/` narrative is mostly the team's *own running commentary on work it is already doing* — so if
> you plan from the docs you will (a) re-polish the same five files that are already being polished,
> and (b) miss everything the docs don't talk about. **The highest-leverage targets are precisely the
> ones no doc mentions.** Treat any doc claim as a *lead to verify against the code*, never as ground
> truth. The single biggest mistake a planner can make here is to echo `design/program/` priorities.
>
> **Generated 2026-07-16 from six parallel code-level investigations** (shadow-impl archaeology, git
> churn, import-graph coupling, deep code-smell read, blind-spot mapping, contract-vs-code audit).
> Working tree carries concurrent work newer than HEAD — always `git status` + `git diff <file>` first.

---

## 0. What kind of codebase this actually is (matters for "polish")

SpaceFace is a Three.js + Rapier space trader/combat sandbox, deterministic 60 Hz fixed-timestep sim
on the XZ plane, decoupled from render, browser + Electron sharing one path. ~567 `.js` files / ~233k
lines under `src/`, ~277 test files.

The most important framing the docs underplay: **this is an unusually disciplined codebase at the
contract level, with its debt concentrated in a few specific, locatable failure modes** — not a mess.
Proof points the docs barely emphasize:
- **The import graph is a DAG — zero circular imports** (Tarjan SCC over all 567 nodes). Real strength.
- **Determinism, event-naming (`:` delimiter across 1,234 emit calls), XZ-plane (every sim `.y=0`),
  and the credits/rep/derived-stats single-writers are genuinely clean** — verified against code, not
  asserted. Do *not* plan "cleanup" here; there is nothing to clean.
- The whole `src/` tree was big-bang-imported **2026-06-16**; "churn since creation" ≈ "all churn."
  Commit-count recency is the useful signal, not first-added date.

So "polish" here should mean: **(a) fix the specific places where the code silently disagrees with its
own contracts, (b) reduce the duplicated/divergent logic that will drift, (c) bring tests/docs to the
load-bearing blind spots, and (d) decompose the genuine god-functions.** Not "harden the sim" (it's
hard) and not "rework the features the team is actively reworking."

---

## 1. The ten highest-leverage targets (evidence-ranked, not doc-ranked)

Each entry names the **code evidence**, **why it's leverage**, **the exact files involved**, and a
**"is this already being touched?"** flag so you don't duplicate in-flight work.

---

### T1 — The three divergent commodity sell-price quote paths (silent player-facing bug)
**Evidence (verified, different behavior for the same question):**
- `src/ui/marketDriverPresenter.js:25` `marketQuoteValue()` → live quote → raw `commodity.basePrice`.
- `src/ui/screens/market.js:95` `staticRolePrice()` → re-derives via role + station size + elasticity, ±4% fallback.
- `src/ui/screens/stationHub.js:117` `holdUnitSellPrice()` → live quote → **`player.marketMemory`** (a path neither other uses) → raw basePrice. **This one is called by the LIVE `src/ui/station/stationApp.js:321`.**

**Why leverage:** players can be shown *stale remembered prices as if current*, and the three screens
disagree on the same commodity at the same station. This is exactly the "economy is the crown jewel,
make it legible" goal — and the legibility is currently *wrong*, not just absent.
**Files:** the three above + `src/systems/economy.js` (sole credits writer, owns the honest quote),
`src/systems/economyCycles.js`, `src/ui/marketIntelligence.js`, `src/ui/demandDriverSummary.js` (new),
`src/economy/demandModel.js` (new, in dirty tree).
**In-flight?** YES — the dirty tree is mid-stream on exactly this lane (demand profiles, market-driver
presenter). **Coordinate, don't parallelize.**

---

### T2 — The physics single-writer membrane is aspirational, not enforced (~17 violations)
The contract (ARCHITECTURE §0.6/§7.3): only `physicsAuthority` writes pos/vel/rot. **The code
disagrees, in load-bearing hot paths:**
- `src/systems/flight.js:245-248` — flight's own drag path writes `vel`/`angVel`/`rot` directly (the system that's *supposed* to feed the authority bypasses it).
- `src/systems/weapons.js:337-339` — missile homing mutates projectile `vel`/`rot` every tick.
- `src/systems/automation.js:582-584, 605, 689` — mining drones write `rot`/`angVel`/`vel` to hover-and-face rock.
- `src/systems/bountyHunt.js:277-280`, `src/systems/uniqueLootAbilities.js:188-189` — entity/player teleport by direct `pos` write.
- `src/systems/world.js:80-91` (sector entry), `src/systems/onboarding.js:987-990`, `src/systems/e1EncounterRuntime.js:491-495`, `src/systems/impulseCharges.js:146-149,182-186`.
- **UI writing sim physics (breaks §7.15 too):** `src/ui/uiRoot.js:748-749` zeroes `player.vel`; `src/ui/uiRoot.js:791-793` animates `player.pos`/`player.rot` during drill fade.

**Why leverage:** this is the single biggest "code vs. contract" gap and the root of subtle jitter /
desync bugs. Note `flight.js` is the *legacy* controller — but `weapons.js` missile homing, automation,
and the UI writes are all on the live path.
**Files:** `src/core/physicsAuthority.js` (the membrane), `src/core/physics.js`,
`src/core/sg02DynamicBodyOwner.js`, `src/core/rapierCollisionWorld.js`, plus every violator above.
**In-flight?** No — untouched. **High-value, low-coordination-cost target.**

---

### T3 — The `heat` integration seam (admitted, shipping as a fallback)
**Evidence:** `src/systems/flightV3.js:1101-1102` writes `entity.heat` (and `entity.energy`) directly,
with the comment: *"Integration seam: canonical ship energy/heat/fuel systems should consume these
deltas. This fallback is save-safe…"* The player is an entity (§0.19), so this is the player-heat field
`heat.js` is the sole documented writer of.
**Why leverage:** a known TODO that ships; two writers for player heat is exactly the class of bug that
produces "why did I suddenly overheat" reports. Small, surgical, high clarity payoff.
**Files:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`, `src/systems/heat.js`,
`src/combat/{damage,kernel,actions,runtime}.js` (these write a *derived per-tick* combat heat —
distinct, clarify the relationship).
**In-flight?** No.

---

### T4 — Copy-pasted RNG with one algorithmically WRONG copy (determinism landmine)
**Evidence:** canonical `mulberry32`/`hash32` live in `src/core/rng.js:5`. **Six copies exist**:
`src/render/trailTexture.js:9`, `src/render/spaceBackground.js:30`, `src/render/canvasTextures.js:15`,
`src/render/planetFactory.js:4`, and — **the divergent one — `src/ui/screens/bar.js:48`**, which uses
`t | 1` (not `1 | t`) and a different mixing step, so it produces a *different sequence* for the same
seed. `hash32` is likewise re-implemented in `spaceBackground.js:39`, `planetFactory.js:14`,
`systems/mining.js:910` (`hash32Local`).
**Why leverage:** the repo is justifiably proud of determinism — and a divergent bar.js RNG plus a
wrong `hash32` copy is a quiet hole in that pride. Cosmetic today (bar avatars), but a trap for any
future "make X deterministic" work. Cheap to fix; high correctness narrative value.
**Files:** `src/core/rng.js` (single source), all six copy sites. `src/core/rng.js` has **81 importers
and no dedicated test** — see T7.
**In-flight?** No.

---

### T5 — The load-bearing blind spots (live, high-fan-in, ZERO doc, ZERO test)
*This is the category a doc-based analysis completely misses, and it is the most valuable.* Files that
are imported by many live modules but have no test file and no `.md` mention:

| File | Fan-in | What it does | Risk |
|---|---|---|---|
| `src/core/rng.js` | **81** | the deterministic PRNG the whole sim depends on | **no dedicated test** — the determinism root |
| `src/data/encounters/catalog.js` | **42** | `buildEncounterCatalog` + ordering/dup validation + `deepFreeze` | validator with no test, imported by 42 files |
| `src/core/spatialQuery.js` | **14** | spatial-hash radius query (audio/physics/combat/scanner/mining/weapons/massline) | core proximity primitive, 13 LOC, no test |
| `src/render/ships/shipKit.js` | **10** | **687-line** procedural ship construction kit shared by every faction ship builder | no test |
| `src/ui/effects/effectRuntime.js` | **11** | shared view-only effect runtime; enforces "no sim/no THREE/no mutation" | the discipline has no proof |
| `src/systems/e1EncounterRuntime.js` | **13** | **587-line** encounter phase-handler table, added 07-14 | brand-new, load-bearing, no test |
| `src/combat/trace.js` | 8 | hand-rolled **FNV-1a rolling hash digest** for combat-event provenance | crypto-like logic, no test |

**Why leverage:** these are the files most likely to silently break the most neighbors, and they have
the thinnest safety net. Adding focused tests *here* is force-multiplication — it hardens everything
that imports them. This is the "polish" target with the best leverage-to-effort ratio in the repo.
**In-flight?** None of these are in the dirty tree. They are unattended.

---

### T6 — God functions worth decomposing (the readability + testability win)
Verified by brace-depth, not eyeballing:
- **`src/ui/hud.js` `createHud()` L640–3520 ≈ 2,880 lines**, a single closure enclosing **47 nested
  helpers** (`frame` alone is L3078–3375, 297 lines). None are independently testable. The single
  biggest maintenance hazard in the UI layer. Also: `hud.js:2963` writes `state.player.targetId`
  directly (a UI-file mutating sim state — minor role leak).
- **`src/ui/galaxyMap.js`** — four ~315–329-line draw functions (`_drawSystem` L3683–4012,
  `_updateInspector` L2802–3126, `_drawGalaxy` L3367–3683, `_drawLocal` L4012–4327) that share a
  near-identical span→scale→`sx/sz` preamble **without sharing a helper**, and inline magic numbers
  (`2.2`, `0.85`, dash arrays, rgba strings) copy-pasted across them.
- **`src/systems/world.js`** — one `export const world = {...}` object (from L158) cramming ~6
  subsystems, delineated by its own `// ====` banner comments (residency / spawn / jump / placement) —
  the banners are doing the job module boundaries should.
- **`src/systems/automation.js` `_loseAsset()` L1369–1625 (256 lines)** — the only 250+ function across the systems files.
- **`src/audio/audioSystem.js` `init()` L539–780 (241 lines)** hand-inits ~60 audioRuntime fields.

**Why leverage:** decomposition here unlocks *testability* of the helpers, which is the precondition
for safely doing anything else in those files. `hud.js` and `galaxyMap.js` are also player-facing.
**In-flight?** `hud.js` and `galaxyMap.js` have heavy churn (galaxyMap is a churn leader) — coordinate.

---

### T7 — Silent error-swallowing that hides real bugs
**Evidence:**
- **`src/audio/audioSystem.js` has 45+ bare `catch (_) {}` blocks** (L174, 815, 935, 945, 966, 999,
  1126, 1128, 1363, 1392, 1394, 1398, 1451, 1520, 1657, 1694, 1755, 1812, 2031, 2131, 2149…), several
  with nested `catch (__) {}`. Intentional (audio must never crash a frame), but **genuine WebAudio
  programming errors are now indistinguishable from expected start/stop throws.**
- **`src/render/assetLoader.js`** — 10 module-level scratch THREE objects (L76–85) shared across
  callers (aliasing hazard); 16+ silent `return null`/`return false` failure paths (L102, 262, 330,
  337, 340, 354, 377, 382, 387, 391, 393, 402, 412, 439, 462, 790, 1238); a module-global
  `warned = new Set()` (L71) that throttles repeat load failures to a **single** console line.
- **`src/render/partsLibrary.js`** — every authored-asset swap wrapped in `console.warn('…; retaining
  fallback', error)` (L884, 909, 1333, 1626, 1629, 1658, 1713, 1718), so real asset bugs surface only
  as a warn + silent visual downgrade.
- **`src/core/sg02DynamicBodyOwner.js:1013-1030`** — monkey-patches `console.warn` globally to suppress
  a Rapier warning, restored in `finally`. *The code confessing.*

**Why leverage:** none of these crash, but all of them make diagnosis of *other* bugs harder. A
debug-mode logger behind the audio catches, replacing the `warned` throttle with a bounded counter,
and routing the Rapier warning through a real option instead of console-swapping — each is small,
each pays back every future debugging session.
**In-flight?** `partsLibrary.js`, `renderer.js`, `bloom.js` are in the dirty tree (render-warmup
feature) — coordinate the render-side pieces.

---

### T8 — Duplicated/divergent constants & helpers (drift surface)
**Evidence:**
- **`2200` (pursuit/scan/hail radius) hardcoded in 4 semantic sites:**
  `src/careers/origins/careerOrigins.js:102`, `src/careers/ladders/hunterLadderDefs.js:30-31` (**with a
  comment literally admitting "matches careerOrigins HUNTER_PURSUIT_RANGE_SQ = 2200²"** — manual sync),
  `src/data/scanReveal.js:10`, `src/data/enemies.js:23,210`.
- **`1200`** in 4 sites: `src/data/scanReveal.js:9`, `src/data/pirateDisguise.js:10`,
  `src/audio/audioSystem.js:312`, `src/systems/ambushSignatures.js:14`.
- **`clamp` redefined independently in 4 files:** `missions.js:147`, `world.js:125`, `economy.js:101`,
  `automation.js` — instead of sharing.
- **`finite()` cloned in 15+ files** with drifting signatures (`(v,fb)` vs `(value,fallback=0)` vs
  `(value)`): audio, combat, core, data — sample at `src/ai/contracts.js:204` (the canonical one).
- **`distSq` re-implemented 3× with different null contracts:** `missions.js:4013` (→0 on null),
  `careers/ladders/hunterLadderFsm.js:210` (→Infinity), `ui/navigation/localSpaceMapModel.js:307`
  (→`finite()`). A null entity gives three different distances depending on caller.

**Why leverage:** pure consolidation — no behavior change, but it removes the *next* drift bug before
it happens. Pairs naturally with T4 (RNG) as a "single-source-of-truth" theme.
**Files:** a new `src/core/tuning.js` (or extend `src/core/math.js`) + the ~30 call sites.
**In-flight?** No.

---

### T9 — Half-finished migrations (adapters kept forever)
**Evidence:**
- **Faction migration:** `src/data/factions/index.js:47` builds `FACTION_META = FACTION_KITS.map(toLegacyMeta)` with "keep byte-equivalent"; `src/data/factions.js` is a 3-line re-export; **~10 consumers still import the legacy `FACTION_META`, zero import `FACTION_KITS`.** Structurally done, adoption not done.
- **Legacy station screens kept as helper libraries:** `src/ui/station/screens/market.js:14` imports `computeBestTrades` from `../../screens/market.js`; `station/screens/bar.js:5` from `../../screens/bar.js`; `stationApp.js:28` from `../screens/stationHub.js` (a **4,008-line** legacy file). `uiRoot.js` itself documents: *"legacy screens/stationHub.js stays on disk for its helper exports."* **This is the root cause of T1** — pricing logic was never extracted out of the dead screen bodies.
- **Encounter data split:** shapes moved to `src/data/encounters/index.generated.js` + per-file modules, but barks/text/helpers (`NAMED_CAPTAINS`, `ENCOUNTER_BARKS`, `tollAmountFor`, `encountersByTier`) stayed in the legacy flat `src/data/encounters.js:47-309`. Two homes for "encounter data."
- **`src/systems/combat.js`** is a 778-line adapter over `src/combat/*` (`legacyHitToDamagePacket`, `scalarHitToDamagePacket`) — the naming confirms in-flight migration where old callers still pass scalar hits.
- **`src/core/rapierCollisionWorld.js`** — a physics backend swap (toggled by `physicsBackend==='rapier'`, `physics.js:628-660`) **structurally identical to the documented flight.js/flightV3.js twins but NOT in the documented twin list.**

**Why leverage:** finishing (or explicitly accepting) each migration removes a class of "which
implementation am I in?" confusion. T9→T1 is the highest payoff: extract pricing into a real module
and the three-quote-path bug largely disappears.
**In-flight?** The station/economy lane is active; the faction + combat + encounter migrations are not.

---

### T10 — Latent save-corruption drift in the dual serialize path
**Evidence:** `src/save/saveSystem.js:161` uses `_callSerialize('missions') || _serializeMissions()`
for 20+ save keys. If the live system's `serialize()` throws and the `||` fallback fires, the shape
silently changes: e.g. live `missions.js:3730 serialize()` strips transient fields
(`targetEntityIds`, `_escorteeId`) and adds `setPieceSettlements`/`careerContracts`/`postEndingReplay`;
the fallback `_serializeMissions()` (`saveSystem.js:267`) just `clonePlain`s the raw state —
**persisting transient entity IDs**. Same dual pattern for `automation`, `crafting` (`saveSystem.js:165-166`).
**Why leverage:** save integrity is trust-critical and this is a silent shape change waiting for the
first throwing serialize. Also note `src/save/saveSystem.js` is 3,020 lines built to run in
browser/worker/Node (18+ `typeof localStorage/URL/Blob` guards) — a beast, but well-structured.
**In-flight?** `saveSystem.js` is a churn leader (5 commits/150) but not in the current dirty tree.

---

## 2. Two things that look like targets but AREN'T (save your budget)

- **The documented "M1 docking route / station redesign / massline rungs / M6 perf / economy
  legibility" priorities.** These are real, but they are the team's *active* lanes (heavy commit
  churn + dirty-tree work). A planner who scopes here is shadow-boxing in-flight work. **Exceptions:**
  T1 (price-quote correctness) and the render-warmup pieces of T7 *are* inside those lanes — engage
  them as coordination, not greenfield.
- **"Harden determinism / event naming / XZ-plane / single-writer credits-rep-derived."** Verified
  clean. There is nothing to fix. (The single-writer that IS broken is *physics* — that's T2, separate.)

---

## 3. A note on the `momentumInherit` dead flag (curiosity, not a target)
`src/data/featureFlags.js:29` `momentumInherit: false` is the only hard-`false` default; it gates a
branch at `weapons.js:575-577` that can never run and forces `ai/gunnery.js:80 leadModelIsExact()` to
always return `true`. Self-documented ("a feel gamble that can't be tuned in one session"). Worth
deleting for clarity; not worth a target slot.

---

## 4. The contracts in play (so any plan stays buildable)
- **Single-writer** (ARCHITECTURE §0.6/§7.3): economy→credits, factions→rep, cargo→cargo, ships→derived,
  heat→WANTED heat, physicsAuthority→pos/vel/rot. **T2 and T3 are literally about enforcing this.**
- **Determinism:** `state.rng`/`state.simTime` only in sim; never `Math.random()` in sim paths; never
  edit `test/*.expected.json` to pass. **T4 reinforces this.**
- **One game path:** browser/Electron/probes/package share gameplay+assets+entrypoint.
- **Live vs legacy backends:** `flightBackend:'v3'`, `aiBackend:'sg06-tactical'`,
  `physicsBackend:'rapier-dynamic'`; selection in `src/core/registry.js`. `flight.js`/`ai.js`/
  `core/flightDynamics.js` are default-off compat fixtures **still statically imported** — editing them
  has no effect on play (the #1 historical time-sink; see `docs/COMMON_BUGS.md` §1).
- **Wired features must be reachable on the default route** — a local candidate/report/flag is not done.
- **Performance is quality-preserving** — never pass perf gates by removing authored visuals or
  lowering default quality (AGENTS.md §6).
- **Save order is deps-first**; `canonicalStringify` is the hash basis. **T10 touches this — careful.**

---

## 5. Authority map (only when you must verify intent — prefer the code)
- The contract: `ARCHITECTURE.md` (repo root).
- Which file is LIVE vs legacy: `docs/MODULE_MAP.md`.
- The bug traps: `docs/COMMON_BUGS.md`.
- Front door: `AGENTS.md`.
- **Status/roadmap:** `design/program/` — **read for context on what's in-flight, never as ground
  truth for what needs doing.** Its priorities are the team's commentary on work already underway.

---

## 6. How to use this
- The cheapest, safest, highest-multiplier wins are **T5 (tests for blind spots), T4 (RNG), T8
  (constant/helper consolidation), and T3 (heat seam)** — small, isolated, no coordination needed.
- The biggest *player-facing* correctness win is **T1 (price quotes)**, but it's in an active lane.
- The biggest *structural* win is **T2 (physics membrane) + T9 (finish the migrations)** — they're
  intertwined: the adapter shims exist because migrations stalled, and the membrane bypasses exist
  partly because the authority was never made the sole writer in practice.
- Sequence to reduce risk: do T5 tests *first* (they de-risk everything under them), then T4/T8/T3
  (cheap correctness), then the god-function decomposition (T6) which *enables* safe work in T1/T2/T7.
- For every target, first move is `git status --short` + `git diff <file>` — the tree is ahead of HEAD.
