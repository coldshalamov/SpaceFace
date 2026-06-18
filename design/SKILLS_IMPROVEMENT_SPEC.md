# SpaceFace — Skills-Driven Improvement Spec

> **What this is.** A delta-focused improvement plan derived from analyzing the 19 game-dev skills
> vendored into `skills/` against the *actual* SpaceFace codebase and its two existing planning docs
> (`design/V2_MASTER_PLAN.md`, `design/IMPROVEMENT_IDEAS.md`). It is **additive**: it deliberately does
> *not* restate the V2 vision or the in-flight cut-list. Its job is to surface what 19 professional
> lenses see that the existing (already very exhaustive) plans **miss, under-specify, or get wrong** —
> and to convert that into sequenced, traceable, buildable work.
>
> **Provenance.** Analyzed at commit `c1be57b` (2026-06-17). Skills analyzed: the 10 `game-*` production
> personas + the 9 `threejs-*` craft skills vendored from AlterLab GameForge and the Three.js game-skills
> collection (see `skills/README.md`). Method: one read-only agent per skill, each grounding findings in
> real `file:line`, then a synthesis pass that collapsed overlap clusters. New skills dropped into `skills/`
> later slot in as their own appendix row without disturbing the rest of this doc.
>
> **Coordination note (live).** A second developer is concurrently executing the `IMPROVEMENT_IDEAS.md`
> cut-list (the V2 §12 UX-polish + bugfix + automation track). Items already LANDED by them are **dropped
> from this spec, not re-proposed**. Items they have **planned** are flagged and explicitly sequenced
> *after* their work — never started in parallel. This spec's own buildable work is partitioned into
> **non-colliding new files (build now)** vs **wiring/edits (after the cut-list lands)**.

---

## 0. Executive read

Across 19 lenses, the single highest-value delta is **not a feature** — it is that **SpaceFace has zero
runtime measurement layer**, so none of V2's exhaustive balance/onboarding/feel targets can currently be
*verified*. That is precisely the project's documented pathology (a history of overstating completeness
from passing evals). Six independent lenses (playtest, analytics, balance-check, debug-profiler,
economy-designer, game-designer) converge on the same hole. Fixing it is cheap — the event bus already
fires ~90 events and nothing subscribes for measurement — and it converts the entire roadmap from
"we think" to "we measured."

Beyond measurement, the skills expose four genuine blind spots the existing plans do not cover:
**accessibility as compliance** (not a deferred nicety), **release/debug-surface hygiene**, a latent
**economy single-writer correctness bug**, and an **observe-order/event-timing contract for feel**. Plus a
cluster of **cheap, already-90%-built unblocks** (ACES tone mapping, engine-pitch-follows-throttle, ambient
beds) that are one wire short of paying off.

Most "what should we improve" findings were V2 restatement and were collapsed out. What remains below is the
lens-driven residue the existing plans miss.

---

## 1. The eight blind spots (the crown jewels)

These are the genuine gaps in `V2_MASTER_PLAN.md` + `IMPROVEMENT_IDEAS.md` that the professional lenses
expose. Everything in §3–§5 traces back to one of these.

1. **No measurement/telemetry layer.** 1030 lines of design intent with zero instrumentation to verify any
   of it — no onboarding funnel, no faucet/sink telemetry, no perf counters, no archetype earn-rate
   sampling. *The plan cannot tell whether its own targets are being hit.* — `game-analytics-setup`,
   `game-playtest`, `game-balance-check`, `threejs-debug-profiler`, `game-economy-designer`, `game-designer`

2. **Accessibility is genuinely absent, not deferred.** Verified zero `prefers-reduced-motion`, `colorblind`,
   or `aria-label` in `src/`. V2 §12 names only text-scale + colorblind; `IMPROVEMENT_IDEAS` buries it at
   #12 (4.8, deferred). Unaddressed: colorblind palettes *with shape redundancy*, photosensitivity
   granularity (separate flash vs camera-shake toggles), one-handed gamepad presets, UI-key rebinding
   decoupled from flight keys, screen-reader labels, cognitive-accessibility objective logging. EU EAA
   (in force June 2025) applies — the game has commerce **and** comms. — `game-accessibility-specialist`,
   `game-ux-designer`, `threejs-game-ui-designer`

3. **Release & debug-surface hygiene — including two confirmed packaged-build blockers.** V2 never asks
   "what would a Steam build refuse to ship with?" Reported: `window.SF` ships unguarded (`main.js:36`), boot
   `console.log`s ship, `preserveDrawingBuffer:true` (`renderer.js:24`) has no reader in the packaged build,
   and the dev `server.js` MIME/route table **diverges from the packaged Electron build**. Two of these are
   **confirmed critical bugs** (verified against the code, not just reported):
   - **SAVE-1 — packaged saves vanish on relaunch.** `electron/main.cjs:32` calls `server.listen(0, …)` — a
     *random ephemeral port every launch*. Chromium keys `localStorage` by origin (`scheme://host:port`), and
     `saveSystem.js` persists there, so a new port ⇒ new origin ⇒ **every prior save is invisible after a
     restart.** Dev never sees this (launch.json pins port 8123). Fix: a fixed loopback port, or a file sink
     under `app.getPath('userData')`.
   - **ASSET-1 — packaged build 404s its own art.** `package.json build.files` =
     `["index.html","styles/**","vendor/**","src/**","electron/**","package.json"]` — **no `assets/**`** — yet
     `styles/ui.css:54,178,203` loads the menu background + HUD icon atlas from `assets/`. Dev serves repo root
     so it works; the installed build loses them. Fix: add `"assets/**"` to `build.files`.
   — `threejs-qa-release`, `game-technical-director`, `threejs-debug-profiler`

4. **The economy single-writer correctness contract is violated.** `ARCHITECTURE.md` declares `economy.js`
   the sole credit writer, but `state.player.credits` is written elsewhere and `isPlayer=true` is hardcoded
   (`economy.js:424`), making NPC money flows opaque. This sits **directly under** the in-flight NPC-economy
   work (cut-list #2/#14) — it is the *root cause* beneath it. — `game-code-review`, `game-technical-director`,
   `game-economy-designer`

5. **No observe-order / event-timing contract for feel.** V2's law is "feel is infrastructure," but it never
   specifies that an effect must be *visualized on the same frame its cause fires*. Result: hit-stop lands
   ~16 ms (one frame) after its collision audio because `feel.frame` runs after the sim tick — gutting the
   weight of every impact. The plan treats feel as a list of techniques, not a frame-timing contract.
   — `threejs-gameplay-systems`, `game-code-review`

6. **No dominant-strategy / build-viability validation.** V2 §17 lists "single optimal build" and
   "stat-scaled clones" as anti-patterns but gives no *method* to detect them. The new `scripts/balance-sim.mjs`
   measured the real spread: M-slot DPS spread is **2.13×** (Plasma 102 / Railgun 48 — the synthesis's "3.3×"
   was overstated), with Plasma M (1.55× median) dominant and Railgun M (0.73×) a dead pick; L-slot Siege
   Lance is also dominant (1.31×). Still a real meta-ossification risk, now *measured* instead of asserted.
   Two adjacent data findings the sim surfaced: `automation.js` `overflowEff 0.25` is **not used** in the live
   cap path (overflow is hard-clamped to zero — the passive ceiling is simply `passiveCapFrac × activeRef`),
   and `MISSION_TUNING.BASE` disagrees with the hardcoded base in 6/10 `rewardFormula` strings
   (`missions.js:6-10`). — `game-balance-check`, `game-economy-designer`

7. **No save-schema evolution testing.** Migrations are at v1 with none written; the first version bump
   (inevitable when drones/automation land) has no round-trip or corrupt-save test. A failed migration
   orphans a player's entire save. — `threejs-qa-release`, `game-technical-director`

8. **Factions have no mechanical or vocal identity.** The 8 factions have colors and a relationship matrix
   but no voice or behavioral signature — a Navy ship barks and behaves like a pirate. Reputation is a
   number with no felt character behind it. V2 has tier-identity progression but does not address faction
   *voice*. (Related: the bar/contact system hardcodes 2 contacts with stub replies, no memory, no
   tier-gated roster.) — `game-narrative-director`

> Status note: blind spots **1, 2, 3, 5, 7, 8** are net-new relative to the existing docs. **4** is the
> verified root cause of in-flight work (coordinate, don't duplicate). **6** is a method for an anti-pattern
> V2 names but never operationalizes.

---

## 2. How to build this without colliding (sequencing contract)

The other developer uses targeted `git add <file>` (the untracked `skills/` folder has survived dozens of
their commits), which means **editing any tracked file risks my edits being swept into their commit**.
Therefore work is partitioned:

- **Phase A — non-colliding, buildable now.** *New files only*, never editing a tracked file. These are the
  measurement layer, the accessibility module, the balance sim, the diagnostics module, and the process docs.
  They are wire-ready but **not wired** (wiring is a tracked-file edit → Phase B).
- **Phase B — wiring + edits, after the cut-list lands.** Wire the Phase-A modules into `registry`/`main`/
  `settings`/`renderer`/`index.html`; do the small in-place edits (ACES, engine pitch, HUD tooltips, faction
  barks, hit-stop reorder); then the full review/bugfix/polish pass.
- **Phase C — layers that ride on the in-flight automation work.** Only after cut-list #28/#14/#21 exist.

§3 marks every item `A`, `B`, or `C`.

---

## 3. Game-improvement waves

Each item carries **`from:`** (skill traceability), **effort**, **impact**, **status vs the existing docs**,
and **phase**. `couples-existing` is preferred over `new-system` throughout (build on what's there).

### Wave 1 — Instrumentation foundation *(Phase A — do first; unblocks verifying everything else)*

| # | Item | What | from | Eff/Imp | Status |
|---|------|------|------|---------|--------|
| 1.1 | **Local telemetry sink** | One subscriber on the live eventBus → ring buffer + localStorage aggregates (trades, earn-rate, deaths-by-cause, mission outcomes, milestone timestamps). No server, no consent, all local. The foundation for the funnel, the balance audit, and a future career-stats screen. | analytics-setup, playtest | M / **high** | **new** |
| 1.2 | **Onboarding funnel** | Instrument the 5 onboarding objectives as a timestamped funnel: time-to-first-mine/trade/kill/dock, skip/retry rates, first-failure cause per step. **Bug to fix while here:** the "mine" step completes on `economy:tradeCompleted`, which a buy-resell false-triggers — key it off the real mining event instead. This is the game's null hypothesis: *does it teach its own core loop?* | playtest, ux | S / **high** | **new** |
| 1.3 | **Renderer diagnostics object** | `window.__THREE_GAME_DIAGNOSTICS__` mirroring `renderer.info` (draw calls, triangles, geometries, textures) + rolling frame-time avg/min/max/p95 + FPS. Without it every perf decision is blind and regressions are silent. | debug-profiler | S / **high** | **new** |
| 1.4 | **Death/lifespan heatmap** | Log spawn/destroy with position+cause; aggregate first-death locations. 3+ new players dying at the same spot is a level-design signal, not bad luck. | playtest | S / med | **new** |

### Wave 2 — Correctness & hygiene *(mixed A/B — protect the in-flight work; ship before more lands)*

| # | Item | What | from | Eff/Imp | Status / Phase |
|---|------|------|------|---------|--------|
| 2.1 | **Economy single-writer contract** | Route every out-of-band `state.player.credits =` write through `economy:grantCredits/chargeCredits`; replace hardcoded `isPlayer=true` (`economy.js:424`) with an explicit `actor` param so NPC flows use a synthetic wallet. | technical-director, code-review, economy | M / **high** | **root cause of in-flight #2 — coordinate; Phase B** |
| 2.2 | **Gate debug surfaces out of release** | Guard `window.SF` (`main.js:36`) + boot `console.log`s behind a debug flag falsy in Electron; drop `preserveDrawingBuffer:true` (`renderer.js:24`) from the packaged build; add a debug-surface grep gate. | qa-release, debug-profiler | S / **high** | **new — Phase B** (edits tracked files) |
| 2.3 | **Packaged-build smoke + save round-trip QA** | Run the QA matrix on the *actual* Electron binary (its MIME/route table differs from `server.js`); add old-save→new-code + corrupt-save-doesn't-crash-boot tests before the first schema bump. | qa-release | M / **high** | **new — Phase A** (QA harness/docs are new files) |
| 2.4 | **Observe-order fix for hit-stop** | Spawn hit-stop + explosion VFX *synchronously* with the damage event instead of a frame later in `feel.frame`. Document an Update-Order Ledger so future mechanics name their create/observe/visualize steps. | gameplay-systems | S / med | **new — Phase B** |
| 2.5 | **Economy tick rate-limiting** | Cap economy ticks-per-frame (e.g. `MAX_TICKS_PER_FRAME=2`) so a GC pause / alt-tab can't fire 10 ticks in one step and "time-travel" the market. Orthogonal to the already-fixed boom/shortage bug. | technical-director | S / med | **new — Phase B** |
| 2.6 | **SAVE-1: fix packaged-save persistence** *(CONFIRMED bug)* | `electron/main.cjs:32` uses `server.listen(0)` (random port → new localStorage origin each launch → saves vanish). Pin a fixed loopback port (or move the save sink to `app.getPath('userData')`). **Release blocker.** | qa-release | S / **high** | **new — Phase B** |
| 2.7 | **ASSET-1: ship `assets/**` in the build** *(CONFIRMED bug)* | Add `"assets/**"` to `package.json build.files` so the packaged build doesn't 404 the menu background + HUD icon atlas referenced by `styles/ui.css:54,178,203`. | qa-release | S / **high** | **new — Phase B** |
| 2.8 | **Mission reward-formula data fix** | Reconcile `MISSION_TUNING.BASE` with the hardcoded bases in the 6/10 mismatched `rewardFormula` strings (`missions.js:6-10`) so mission payouts match the tuning table. | balance-check | S / med | **new — Phase B** |

### Wave 3 — Player-facing delta that does NOT collide *(mixed A/B)*

| # | Item | What | from | Eff/Imp | Status / Phase |
|---|------|------|------|---------|--------|
| 3.1 | **ACES tone mapping + exposure** | `renderer.toneMapping = ACESFilmicToneMapping; toneMappingExposure ≈ 1.1`. Bloom is already wired; tone mapping is the missing wire that stops emissive materials reading flat. ~5 min; enables the deferred color-grading idea. | aaa-graphics, game-director, image-generator | S / **high** | refines deferred #6 — **Phase B** |
| 3.2 | **Engine pitch follows throttle/boost** | Modulate the engine-voice base frequency from `state.player.throttle`/boost via `setTargetAtTime` — the ship sounds fast before it looks fast. ~3 lines; currently static. | audio | S / **high** | in V2 §10, unimplemented — **Phase B** |
| 3.3 | **Accessibility compliance pass** | Colorblind palettes (protan/deuter/tritan) **with shape/icon redundancy** on radar blips + status bars; separate flash vs shake toggles; one-handed gamepad presets (rebinder already supports it); decouple UI-key from flight-key rebinding; UI scale to 200% with reflow. | accessibility, ux, game-ui | M / **high** | materially larger than deferred #12 — **A (module/CSS) + B (wire)** |
| 3.4 | **HUD tier-visibility + tooltips + fixed-width numerics** | Gate HUD complexity by progression (survival stats always on; tactical/strategic tiers reveal as systems unlock) so minute-1 isn't a cockpit of pips; hover/hold tooltips for mystery numbers (HEAT/WPN/signature); monospace fixed-width on credits/speed/cargo so values don't jitter in combat. | ux, game-ui, accessibility | M / med | tooltip refines #11; tier-visibility **new** — **Phase B** |
| 3.5 | **Responsive HUD constraints** | Replace absolute-px HUD positioning with `clamp()` sizing + `safe-area-inset` so the HUD survives ultrawide (3440×1440) → laptop → mobile (390×844) without clipping. CSS-only. | game-ui | M / med | **new — A (CSS) + B (link)** |
| 3.6 | **Ambient audio beds** | Station-hum / solar-wind / scanner-pulse loops as crossfaded stems keyed to sector safety, ducking under combat music. Kills dead-silence space; stem infra already exists. | audio | M / med | in V2 §10 — **Phase B** |
| 3.7 | **Faction mechanical + vocal identity** | `factionId`-filtered barks + per-faction NPC behavior flavor so reputation is "standing with a living faction," not a number. (Blind spot #8.) | narrative | M / med | **new — Phase B** |
| 3.8 | **Bar/contact state + consequence** | Replace the 2 hardcoded stub contacts with lightweight NPC state (faction alignment, has-offered-work flags, tier-gated roster via the deterministic mission-board seeding pattern). | narrative | M / med | **new — Phase B** |

### Wave 4 — Layers that ride on the in-flight automation work *(Phase C — sequence AFTER cut-list #28/#14/#21)*

| # | Item | What | from | Eff/Imp | Depends on |
|---|------|------|------|---------|--------|
| 4.1 | **Drone-as-character** | Deterministic names, rolling event logs (success/damage/loss), one-line personality so the intervention loop has FTL/Rimworld stakes. | narrative, economy | M / **high** | in-flight #28 |
| 4.2 | **Drone spatial presence** | `automation.js` is a pure state record — drones never enter the entity list, so they're invisible. A `dronePresence` system spawns transient drone entities near the player and lerps them along their program → the living economy becomes *visible*. | gameplay-systems, 3d-generator | L / **high** | in-flight #28/#14 |
| 4.3 | **Intervention dialogue + stakes** | The rescue-or-abandon moment is a bare notification — add 1–2 NPC lines + a time-pressure cue + a post-resolution line so it's drama, not an optimization prompt. | narrative | S / med | in-flight #21 |
| 4.4 | **Mining `directToCargo` feedback** | The upgrade flag (`gameState.js:39`, `modules.js`) toggles silently — emit an event + HUD/particle feedback so its value is legible. | gameplay-systems | S / low | — |

---

## 4. Process & tooling upgrades

V2 is entirely *what to build*; it says nothing about *how the project is run*. The production lenses own
that, and it is the least-redundant, highest-durability layer. These are deliverables/cadences, distinct
from game features. (Most are **Phase A** — new docs/scripts that don't touch live code.)

1. **Seeded archetype Monte-Carlo balance gate.** On any commit touching `ships/weapons/modules/missions/
   economy/combat` data, a deterministic headless sim runs three archetype profiles (casual/average/hardcore)
   and asserts: casual reaches the T1-ship milestone within target hours; ≥2 viable weapon picks per tier
   (DPS within ~1.2× of tier median); earn-rate spread across mining/trading/missions within ±25%; the
   passive cap (`passiveCapFrac`/`overflowEff`) actually holds under a full automation stack. *The deterministic
   RNG + pure-data tables already make this possible.* — `game-balance-check`, `game-economy-designer`
2. **AI regression playtest of the first-5-minutes loop.** A scripted agent drives `state.input` through
   fresh-game → dock → trade → mine → sell every commit, failing the build if onboarding breaks or exceeds
   5 min. `window.SF` is already exposed for it. — `game-playtest`
3. **Performance budget + diagnostics baseline.** `PERF_BUDGET.md` with frame-time allocations + a before/after
   capture (FPS/draw-calls/tris/memory) committed in any render/VFX PR. Pairs with Wave-1 diagnostics.
   — `threejs-debug-profiler`, `game-technical-director`
4. **Event taxonomy + telemetry-owner discipline.** One `EVENT_TAXONOMY.md` pinning each bus event to a design
   question and a consistent `domain.object.action` name; a periodic audit that every tracked event is actually
   queried. Keeps the new measurement layer high-signal. — `game-analytics-setup`
5. **Systems dependency-graph validation + ADR process.** A build-time check that the ~23-system registry has
   no circular deps and that save-restore order matches dependency order, plus a lightweight ADR folder for
   architectural forks. `ARCHITECTURE.md` is ADR-lite but has no template/process. — `game-technical-director`
6. **Accessibility + responsive QA gate.** A live `ACCESSIBILITY.md` mapping each feature to motor/visual/
   auditory/cognitive status, plus a 4-viewport responsive-fit screenshot pass before any UI patch ships.
   — `game-accessibility-specialist`, `threejs-game-ui-designer`, `game-ux-designer`
7. **Pre-merge game-code-review checklist.** Delta-time usage in velocity updates, hot-path allocation,
   state-machine validity assertions (e.g. impossible flag combos like `docked && boosting`), resource
   lifecycle/disposal. — `game-code-review`
8. **Visual-target & milestone ledgers.** A "source reference → procedural replica" ledger for major materials,
   and per-milestone phase-gate ledgers demanding *evidence over claims* (the project's documented weakness).
   — `threejs-image-generator`, `threejs-game-director`

---

## 5. Recommended order of execution

1. **Phase A (now, non-colliding new files):** telemetry sink (1.1) + funnel (1.2) + death heatmap (1.4),
   diagnostics object (1.3), accessibility module + CSS (3.3a), balance Monte-Carlo sim (process #1),
   and the process docs (EVENT_TAXONOMY, PERF_BUDGET, ACCESSIBILITY, QA_MATRIX, PLAYTEST_SCRIPT, ADRs).
   *None of these edit a tracked file; all are wire-ready.*
2. **Confirm the other developer's cut-list is complete** (no new commits; cut-list items present in code).
3. **Phase B (wiring + in-place edits):** wire the Phase-A modules in; ACES (3.1); engine pitch (3.2);
   debug-surface gating (2.2); economy single-writer + tick limit (2.1, 2.5, coordinated); hit-stop reorder
   (2.4); HUD tooltips/tier-visibility/fixed-width + responsive CSS link (3.4, 3.5); faction barks + bar state
   (3.7, 3.8). Then the **full-repo review/bugfix/polish pass**.
4. **Phase C (only if automation landed):** Wave 4 drone character/presence/intervention layers.

---

## 6. Per-skill appendix (the lens of each, for thoroughness & future slot-in)

Each row: the unique lens, its single highest-leverage pick, and the methodology/process worth adopting.
New skills appended to `skills/` get a new row here.

### Game-production personas

- **game-designer** — *Lens:* core-loop health at four timescales (30s / 5min / session / progression), with
  pain→relief progression mapping. *Top pick:* measure the 30-second flight loop (input latency, decision
  density, mastery gradient) before building on it. *Adopt:* the four-timescale validation matrix as a
  pre-implementation gate.
- **game-economy-designer** — *Lens:* the economy as a real monetary system (explicit faucets/sinks, inflation
  is under-sinking). *Top pick:* write the stock-flow balance sheet from the existing data tables now. *Adopt:*
  a three-checkpoint economy sign-off (pre-alpha sheet → alpha sim → live valves).
- **game-narrative-director** — *Lens:* ludonarrative consonance — every mechanic tells a story; make it
  coherent. *Top pick:* wire tier progression to explicit identity shifts in NPC dialogue/missions. *Adopt:*
  a per-milestone one-page consonance audit. *(Blind spot #8: faction voice, bar state.)*
- **game-technical-director** — *Lens:* shipped-stability backbone (perf budgets, dependency discipline,
  cross-platform). *Top pick:* a CI-validated systems dependency graph. *Adopt:* PERF_BUDGET + ADR process +
  single-writer enforcement.
- **game-ux-designer** — *Lens:* HUD information hierarchy + onboarding-through-play + accessibility. *Top pick:*
  the Information-Tier-Visibility HUD gated to progression. *Adopt:* a quarterly usability-test cadence (3–5
  players, recorded).
- **game-accessibility-specialist** — *Lens:* accessibility as design excellence + market, architected in not
  retrofitted. *Top pick:* colorblind palettes with shape redundancy on radar + bars. *Adopt:* a live
  ACCESSIBILITY.md compliance matrix as a release gate.
- **game-balance-check** — *Lens:* power-curve divergence + DPS-cluster viability + missing telemetry. *Top
  pick:* compress the ≈3.3× M-tier weapon DPS spread to ≤1.4×. *Adopt:* a seeded-sim balance gate in CI.
- **game-playtest** — *Lens:* behavioral measurement turns design docs into verified outcomes. *Top pick:*
  instrument the onboarding funnel (with the mine-step false-positive fixed). *Adopt:* AI regression gate +
  structured first-session protocol.
- **game-analytics-setup** — *Lens:* solo-dev *content-validation* telemetry (validate CONTENT_BIBLE curves,
  not business metrics). *Top pick:* the single local eventBus sink. *Adopt:* the EVENT_TAXONOMY discipline.
- **game-code-review** — *Lens:* shipping-game bug classes generic reviewers miss (frame-rate dependence,
  hot-path alloc, state-machine fragility, resource lifecycle). *Top pick:* state-validity assertions in
  `flight.applyPlayerIntent()` / `ai._think()`. *Adopt:* a pre-merge gameplay code-review checklist.

### Three.js craft skills

- **threejs-game-director** — *Lens:* end-to-end completion orchestration with phase gates + evidence-over-claims.
  *Top pick:* formalize the M0 feel/audio gate with screenshot evidence. *Adopt:* per-milestone ledgers.
- **threejs-gameplay-systems** — *Lens:* explicit update-order discipline; verify every mechanic reaches the
  render layer. *Top pick:* fix the hit-stop one-frame render-observer latency. *Adopt:* an Update-Order Audit
  checklist per new mechanic.
- **threejs-aaa-graphics-builder** — *Lens:* rendering craft (tone mapping, grading, material depth, event
  lights) without external assets. *Top pick:* ACES tone mapping + 1.1 exposure (5-min unblock). *Adopt:*
  renderer-diagnostics capture per graphics milestone.
- **threejs-game-ui-designer** — *Lens:* renderer-side UI quality across form factors + motion sensitivity +
  stat comprehension. *Top pick:* `safe-area-inset()` + `clamp()` responsive HUD. *Adopt:* a 4-viewport
  responsive QA gate.
- **threejs-debug-profiler** — *Lens:* the measurement layer for Three.js perf. *Top pick:*
  `window.__THREE_GAME_DIAGNOSTICS__`. *Adopt:* a perf-baseline capture protocol before any render PR.
- **threejs-qa-release** — *Lens:* the shipped artifact must match the tested artifact; debug surfaces must not
  leak. *Top pick:* the dev-server-vs-packaged-Electron divergence. *Adopt:* a packaged-build smoke test in
  the release checklist.
- **threejs-image-generator** — *Lens:* visual reference generation to anchor procedural look-and-feel. *Top
  pick:* render target-mood references for the bloom/grade work before implementing. *Adopt:* a visual-target
  ledger. *(Note: prior generated `.jpg` assets were captioned contact-sheets, not usable sprites — kept
  procedural; do not re-add as textures.)*
- **threejs-3d-generator** — *Lens:* asset-pipeline gatekeeping — what generated assets cost to integrate, when
  hero models justify it. *Top pick:* a GLB import + AnimationMixer pipeline *if/when* visible drones/NPCs
  justify leaving pure procedural (Phase C). *Adopt:* an Asset Intake checklist as a merge gate.
- **threejs-audio-generator** — *Lens:* audio production discipline (planning matrix, variant pooling, spatial
  fx, the premium-vs-left-generated audit). *Top pick:* engine pitch follows throttle. *Adopt:* an audio
  planning matrix + pre-ship audit gate.

---

*This spec is a delta on top of `V2_MASTER_PLAN.md` + `IMPROVEMENT_IDEAS.md`, not a replacement. Its
load-bearing claim: build the measurement layer first, so every other improvement — and every V2 target —
becomes something you can verify instead of assert.*

---

## 7. Implementation status (this session)

Built and **verified live** (boot clean, `npm run check` green, save/load round-trip exact, console
error-free, Access tab + colorblind palette confirmed in the running game):

**Measurement layer (Wave 1) — DONE & wired**
- `src/systems/telemetry.js` — local sink on the live eventBus (15 verified events), onboarding funnel
  (mine-step keyed off `mining:yield`, not trades), death heatmap, career stats. Wired in `main.js`.
- `src/render/diagnostics.js` — `window.__THREE_GAME_DIAGNOSTICS__` (draw calls/tris/memory + frame
  timing; fixes `info.autoReset` so bloom's 5 passes count). Wired in `renderer.js renderFrame`.

**Accessibility (Wave 3.3) — DONE & wired**
- `src/ui/accessibility.js` + `styles/accessibility.css` — colorblind palettes with **shape redundancy
  on the radar canvas** (`radar.js`), high-contrast, separate motion/flash flags, dyslexia font,
  safe-area HUD. New **Access** settings tab; UI-scale double-scaling conflict resolved (shipped
  `--ui-scale` owns it, slider extended to 2.0).

**Correctness & hygiene (Wave 2) — DONE**
- **SAVE-1** fixed — `electron/main.cjs` now uses a fixed port + single-instance lock + EADDRINUSE
  fallback, so packaged-build localStorage saves survive relaunch.
- **ASSET-1** fixed — `package.json` ships `assets/cinematics/menu_background.jpg` (the only actually-
  loaded asset; the ore/reticle/icon sheets are dead refs — `getExternalTexture` has zero call sites).
- Debug-surface gating — `window.SF`, boot logs, and `preserveDrawingBuffer` are gated on `?prod=1`
  (set by the packaged Electron build); dev/preview keep them. (UA sniffing was wrong — the desktop
  preview is itself Electron.)
- Mission `rewardFormula` strings synced to `MISSION_TUNING.BASE`; **`balance-sim.mjs` made
  self-validating** (it had been printing a hardcoded finding — a bug in the Phase-A deliverable itself).

**Review fixes — pass 1 (whole-repo adversarial review, 6 domains)**
- Salvaged wrecks now set `_salvaged` so the intervention loop reports `recovered=true` (`mining.js`).
- `physics.collide()` reuses a preallocated `Set` instead of allocating one every frame.
- Transient state (salvage interventions, active drill session) is cleared on load so stale
  cross-save entity-id references can't dangle (`saveSystem.js`).
- Reviewer's "serialize interventions" proposal was **declined** with reason: the wrecks are
  non-persistent entities, so serializing the tracking array alone would fire spurious `recovered=true`
  closes on load. Clearing is the correct minimal fix.

**Review fixes — pass 2 (runtime playtest of every path + static review of combat/ai/audio/ui/vfx)**
The runtime playtest (fly/fire/mine/trade/jump/all 16 screens/combat-death-respawn/automation/
save-load/drill, plus edge cases) was **console-error-clean**. The static pass found, and I fixed:
- **Beam weapons dealt zero damage** — `weapons.js` wrote rays to `state.combat.beams` but nothing
  consumed them. `combat.update()` now sweeps beams and damages the first entity along each path.
- **Drill lens worked only on first open** — screens mount once + cache; the drill did its session
  setup in `mount()` with an empty `onShow()`. Split DOM-build (mount) from session-start (onShow).
- **Declined as non-bugs** (verified): flat-armor fully absorbing weak hits is intentional (not a
  missing damage floor); music stems + stationHub/drill bus listeners register once under the
  mount-once lifecycle and *must* persist (adding `bus.off` would break refresh — the reviewers
  missed the lifecycle).
- **Deferred — balance-affecting incomplete features:** weapon `splashDmg`/`splashRadius` and
  `armorPierce` are present in data but unread. Wiring them is real (like the beam fix) but changes
  damage balance the other dev tuned — do it *with* the balance-sim gate + a playtest, not blind.

**Process/tooling docs — DONE (new files):** `EVENT_TAXONOMY.md`, `PERF_BUDGET.md`, `ACCESSIBILITY.md`,
`QA_MATRIX.md`, `PLAYTEST_SCRIPT.md`, `adr/` (template + 2 retroactive ADRs), `scripts/balance-sim.mjs`.

**Deferred (needs an interactive eyes-on / ears-on tuning session — documented, not skipped):**
- **ACES tone mapping** — NOT a one-liner here: `bloom.js:22-26` deliberately uses `NoToneMapping` to
  hold its bloom-on/off invariant; naive ACES diverges the two paths. Doing it right means moving an
  exact-match tonemap into the composite shader + visual A/B. Left to avoid regressing the hand-tuned look.
- Engine-pitch-follows-throttle, ambient audio beds (audio can't be verified in this harness),
  hit-stop observe-order reorder (feel.js, subtle), HUD tier-visibility/tooltips/fixed-width numerics,
  faction barks + bar state. All are real and scoped above; they want a human in the loop to tune.
- Wave 4 (drone-as-character / spatial presence / intervention dialogue) layers on the now-landed
  automation work and is the natural next milestone.
