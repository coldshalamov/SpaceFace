<!-- LIFETIME: STABLE (research deliverable, 2026-10-16) -->
# SPACEFACE — The A-List Roadmap

**Status: ADVISORY BLUEPRINT — not a queue.** This is the deliverable of an owner-commissioned
research project (2026-10-16): what to build next to make SpaceFace an A-list game. Method:
eight independent expert panels (vision, systems, combat feel, UX/onboarding, worldbuilding,
technical, market, retention) brainstormed from separate lenses; three adversarial reviewers
(producer, creative champion, red-team skeptic) debated the synthesized slate; four specialist
gauntlets (engineering feasibility, market survival, vision cohesion, player-value) attacked the
revised plan against the live repo. Every load-bearing claim below was verified against code,
or is labeled as estimate. Adoption happens through the existing program surfaces
(`build_map.md` §1C, `program-dispatch`, `FINISH_LANES`) — this document names outcomes and
their acceptance shapes, in priority order.

Product authorities unchanged: `design/VISION.md` (emphasis), `design/GDD_2_0.md` (design),
`design/program/` (status). Where this document and the GDD describe the same thing, the GDD
and VISION win; this roadmap only sequences and emphasizes.

---

## 1. The verdict

SpaceFace is **under-converged, not under-built**. Eight independent reviews agree on the
diagnosis from eight different angles:

- The simulation is real where it touches the player (stock-curve pricing, freight conservation,
  law/heat, aftermath wrecks, seven authored characters, a nemesis with a wound) and hollow
  where it doesn't (exogenous price cycles, offscreen pressure fields, 14 of 25 sectors with
  `signatureToy: 'explicitly none'`).
- The signature fantasy — *"I understand how this world moves and I can cause ridiculous chain
  reactions"* — is **built and left to luck**. The program's own acceptance gate for the
  60-second chain fantasy, `FEEL_CONTRACT.md` B12, reads **"Not attempted"** (`design/FEEL_CONTRACT.md:80`,
  PQ-141 open). Nobody has ever reliably played the game's trailer.
- The world **remembers silently**. AceMemory, contact trust/grudge counters, moral memory,
  wreck succession, deed records — the state exists; its voice does not.
- The pitch sells the wrong shelf. "Mine, trade, fight, upgrade" is the feature list of every
  space sim since 2014, shelved against free (Endless Sky) and $50 (Everspace 2). The winnable
  shelf is the physics-comedy sandbox (Besiege/Teardown lineage), and the Massline is the only
  defensible asset on it.
- The frame budget is eaten by **presentation, not simulation** (latest runtime witness: render
  p95 ~15.7 ms + UI ~4.0 + VFX ~3.1; admission avg ~1.4 ms with per-system sim sampling
  unavailable in that report) — which breaks the popular theory that
  the dormancy scheduler is "the next 50%," and redirects Phase 0.
- Every verification instrument in the repo proves **presence, not legibility**. B12 as written
  can pass with eleven beats no human can read. This is the structural risk the whole program
  carries, and Phase 1 fixes it with a new instrument (§5.1.3).

The strategy follows directly: **convergence, not expansion.** One pocket, one chain, one clip a
stranger sends a friend — then give the world its voice — then deepen what bites. Freeze the
map's size. Make existing features collide.

> **The A-list sentence this plan serves:** a stranger watches sixty seconds of play and sees a
> pirate become a projectile, cargo spill, a patrol arrive because somebody witnessed it — and
> the player grab a pod and leave at ridiculous speed. On demand. Then the game *tells them
> what they just did*, and remembers it tomorrow.

---

## 2. Five hard truths (all evidence-verified)

1. **The chain fantasy is unproven on demand.** B12 = "Not attempted." Yet its instrument
   already exists: `src/testing/lab/proofSixtySeconds.js` (1,864 lines; 11 beats, 5 seeds,
   ≥9-beat bar, boots the Ceres Refinery+Ambush pockets on the production runtime). The work is
   making the beats *fire*, not building the gate.
2. **The performance pole is the render/presentation lane.** Witness numbers above; Adventure
   p99 pose gaps ~65 ms; worst recorded frames 33–212 ms across routes
   (`design/program/MATURITY_2026_10_15.md`). A governor that only demotes cadence cannot buy a
   10–20 ms render deficit. The dormancy scheduler is a hypothesis to test (one witness re-run
   on the worst route, with per-system sim sampling this time), not a committed program.
3. **The world's memory is mute.** `chronicler.js`, `aceMemory.js`, `moralMemory.js`,
   `deedRecord.js` (25 durable deed kinds), `wreckSuccession`, station-contact counters — all
   exist and persist. Only fragments speak (`pickDeedToTell` fires in two contact paths). The
   UVP sentence "a universe that remembers what you did" is currently box copy.
4. **Demo economics punish everything except the fantasy.** Median Next Fest demo converts
   ~19% of players to wishlists; median total gains (~200–800) are mid-list death against the
   ~7–10k needed for Popular Upcoming visibility. Conversion happens in the first eight
   minutes — a hitching or unreadable minute one is unrecoverable.
5. **Two "cheap wins" the plan originally budgeted are already shipped** (verified): the
   autosave feedback toast (`uiRoot.js` `wireSaveFeedback`) and deed-based contact hails
   (`contactHail.js:954`). The remaining trust defects are real: `unlock_*` story flags are
   written (`missions.js:12075`) and read by nothing (zero readers verified); the first dock
   opens an 8-tab wall (`stationApp` TARGET_MAP) that the repo's own first-session map calls
   its worst cliff.

---

## 3. The strategy in one page

| Phase | Name | What it ships | Gate that says done |
|---|---|---|---|
| **0** | **The Floor** | Frame budget honest on the demo route; perf instruments wired; min-spec defined | 60 FPS + zero >50 ms pose gaps on the demo route at defined min-spec (measured on the quiet-host lane); probe `--compare` blocks PRs |
| **1** | **The Demo — "one pocket, one chain, one clip"** | The Ceres reference minute; the chain captured and spoken back; trust repairs; Massline-first positioning | B12 flipped via `proofSixtySeconds` **+ legibility bench (§5.1.3) + reliability gate (§5.3)**; Next Fest demo live |
| **2** | **The Voice** (post-demo) | The world speaks its memory; rumors buy hunters; a personal nemesis; failure becomes the next mission; same-session kill-cam | A memory event that changes no downstream state does not ship (the law below) |
| **3** | **The Depth** (1.0) | Industry that moves real prices; causal attribution; rim chokepoints; 4 sectors at the identity bar; recurring humans; ecology slice | "Food rose because the Dione convoy died" is true and readable in the market UI |

**Release strategy (unanimous across market, producer, adversary):** Next Fest demo is the
market test → **straight to 1.0 at $17.99–19.99** (launch discount). NO Early Access: an
agent-fleet-built game cannot keep dated public roadmap promises, and missed EA patch dates are
the documented review-bomb. The one launch shot argues for converging everything into the
strongest possible 1.0 rather than spreading thin.

**Capacity reality (4-slot fleet, one checkout; estimates from the engineering gauntlet):**
Phase 0 ≈ 0.7–1 slot-months (as revised in §4 — the worker lane was resequenced OUT);
Phase 1 ≈ 3–5; Phase 2 ≈ 2–3; Phase 3 ≈ 4–6.

---

## 4. Phase 0 — The Floor (revised by the gauntlets)

The debate round produced this phase; the engineering gauntlet broke half of it. Revised:

1. **Split the perf exit criterion.** The >50 ms pose-gap half is cadence/admission work
   (admission spikes to ~113 ms are first-contact costs) — the governor helps here. The 60 FPS
   half on integrated-class GPUs is a **render-lane problem** and must be attacked as render
   work (batching, residency, draw-call and UI cost — per the repo's own perf program,
   `design/program/PERF_*`), never by demoting authored visuals. Write both numbers down as
   the exit; measure on the **quiet-host lane** (this box never produces certifying captures —
   `QUIET_HOST_PROGRAM`).
2. **Define min-spec before promising anything.** The dev box itself is ANGLE/Intel integrated;
   "min-spec-representative" is currently undefined in the repo. One line of definition makes
   the exit criterion measurable; without it the criterion is theater.
3. **Frame-budget governor, pocket-aware — scoped to the pose-gap half of the exit criterion
   (§4.1).** The cadence lever already exists
   (`src/core/activityScheduler.js` `shouldRunOnTick`, `SIM_TIER` S0–S4 in
   `src/world/activityClassification.js`), and pocket exemption is implementable
   (`CERES_ACTIVITY_POCKETS_BY_ID` + radius). Law: the governor demotes **cadence, never
   visuals**, and **the demo pocket is the visual target** — it is exempt from any demotion.
4. **Wire `probe-frame-solid.mjs --compare` as a standing PR gate** on changes touching
   `src/systems/**`, `src/render/**`, `src/core/registry.js` — the tool already implements
   PASS/FAIL with `exitCode=1`. Keep it to the 3–4 worst routes, not all cells (no rituals).
5. **Re-run the runtime witness on the worst route (with per-system sim sampling) before ANY
   scheduler or cadence-governor implementation spend.** If sim does
   not dominate p95 — and current evidence says it won't — the dormancy ledger dies as a
   priority and the render lane owns Phase 0.
6. **Resequenced out of Phase 0:** the whole-sim worker lane is a **renderer refactor
   masquerading as a flag** (`src/core/simWorkerHost.js` header: production route
   "intentionally null"; renderer still owns a main-thread snapshot). It is the largest single
   item in the original plan. It moves to post-demo (Phase 2 era, alongside the phone/startup
   work it also serves). **Compact saves ride PR424** (open, active, another lane's) —
   integrate when it merges; never parallel-build it.

---

## 5. Phase 1 — The Demo: one pocket, one chain, one clip

The demo is the game's thesis statement: the Ceres refinery pocket performing the VISION.md
60-second fantasy on demand, captured, spoken back, and sold Massline-first.

### 5.1 The Reference Minute (the spine)

**5.1.1 Authored opportunity, never scripted inputs.** The 11-beat chain
(shove → tether-swing → release → pirate-as-projectile → collateral → cargo spill → fleeing
hauler → patrol arrives → grab-and-run WANTED) is staged through three world properties, not
choreography:

- **The domino rig:** a loaded cargo rack beside a fuel tender beside a crane arm in the Ceres
  pocket, tuned so one thrown pirate can cascade three stages. **Acceptance clause (cohesion
  gauntlet):** every object passes VISION's *"I am here because ______"* test independent of
  the player — the fuel tender exists to fuel the hauler and *can* cascade; a prop that exists
  only to cascade is a theme park. Pocket objects today are `runtimeStatus: 'descriptor_only'`
  (`src/data/sectorActivityPockets.js`) — materialization into world-owned dynamic Rapier
  bodies is real work and is the rig's true cost. (`combatDefs.js` `maxAttachments` is
  equipment sockets, not physics joints — the rig needs world bodies, not more attachments.)
- **Ammunition density:** a director rule that every fight spawns ≥2 ammunition-class bodies
  near geometry worth slapping into (`src/ai/fodderCohort.js`, `specialistPlans.js`). This is
  the property that makes the rig a *tutorial for the world*, not a set-piece — the cascade
  must be emergently reproducible away from the reference site.
- **Predation rhythm:** raiders hit a real hauler on a learnable cadence; the patrol actually
  chooses; wrecks stay; prices move. The response machinery is built and idle
  (`pirateDoctrines.js`, `lawSecurity`, `aftermathWrecks.js`, `traffic.js`).

**Acceptance:** B12 flips from "Not attempted" to passing — `proofSixtySeconds` ≥9/11 beats on
fixed seed — **with three amendments** the gauntlets added:

**5.1.2 Multi-seed variety, not a golden run.** The gate passes across the instrument's 5
seeds, and the emergent-world check (player-value gauntlet): the same class of cascade fires
N times/hour in unscripted play. One tuned golden run inverts the vision ("the player walks
onto a set").

**5.1.3 The legibility bench (the new instrument — no-playtest-gates compliant).** Presence ≠
legibility; this closes the gap B12 leaves open:

- Extend `proofSixtySeconds` onto the lab's Chromium host (`src/testing/lab/chromiumHost.js`),
  sampling frames at each beat's bus-event tick ±window.
- Compute deterministic invariants per beat: screen-space displacement of the acted-on body
  (projected through the shipping camera), on-screen duration of the causal agent,
  event→visible-change latency (frames until hitstop/callout/VFX), callout-line presence.
- An **independent agent review** then opens the per-beat frame strip and answers a fixed
  sheet ("which body moved; what did it hit; why") against bus-recorded beat facts — the
  repo's sanctioned "the picture you opened is the evidence" mode.
- Pass = invariants over threshold AND agent answers match recorded facts for ≥9/11 beats.
  Amend B12's stale "headed capture" wording to name this instrument (it already conflicts
  with the 2026-09-16 owner capture ruling).

**5.1.4 The reliability gate (market gauntlet — new).** Physics-comedy games live and die on
verb reliability: a week of streamers whiffing tether connections produces anti-marketing
footage at scale ("the physics feels random" is the genre's death sentence). Before Next Fest,
measure and gate on the demo route: novice-usable Massline acquisition (acquisition target
generosity, miss forgiveness), whiff recovery time, and cascade opportunity frequency —
measured by the agentic instruments only (a fixed-seed probe route scripting novice-grade
input traces, plus one capped session-SHAPE run per `docs/VALIDATION_WORKFLOW.md`), never by
a human-playtest gate. The chain must fire for a median player, not a designer.

### 5.2 Feel composition (makes the chain *sing*)

- **Mass-audio, re-scoped by the engineering gauntlet:** the premise was outdated —
  `audioSystem.js` `resolveCollisionCue` (~958–1090) ALREADY maps mass→pitch (>1 octave,
  RATE 1.6→0.5), closing speed→gain, force→pitch-bend, and a kiss/knock/slam/broadside tier
  ladder; tether strain creak exists. What's genuinely missing (~⅓ of the old budget):
  the **material-pair matrix** (rock/hull/ice/station), a continuous **Δstrain/Δt channel**
  (creak on load, whipcrack on release), and **engine-bed sidechain** so heavy hits punch
  through the boost tone.
- **Impact grammar finishes (B5/B11 as the FEEL_CONTRACT already specs):** shove displacement
  ≥1 screen-depth over 2 s (today ~1 hull length); Massline release whipcrack + FOV punch
  (machinery exists: `masslineInstrument.js` release grading, `src/render/feel.js` FOV
  generic); the universal hitstun curve as one function of (ΔV ÷ cruise) × (attacker mass ÷
  victim mass).
- **ONE specialist in the demo: the line-cutter** — a telegraphed enemy that cuts the
  Massline. This is the *letter* of the near-unbreakable law (GDD §4.3: a snapping line is an
  engineered event, never ambient; counterplay scripts already exist under
  `check:47a:counterplay`). Condition: loud 0.5 s telegraph, never random — else it
  re-creates the misery the rule fixed. (The mass-trap anchor and volatile hauler wait for
  1.0's roster.)

### 5.3 Capture and speech-back (the "tell a friend" engine)

- **Stunt callouts:** already wired (`src/ui/stuntCallout.js`, mounted at `hud.js:1651`;
  adventure mode already speaks named acts — FB-012). Demo work = coverage, not construction.
- **The causality card — the demo's signature artifact.** Built from the fight's real
  telemetry: `deedRecord.js` (durable, saved, 25 labeled deed kinds) + a new in-fight event
  accumulator; `classifyImpactResponsibility` already authors verdict lines ("You threw what
  hit them"). **Two hard laws from the gauntlets:**
  - **Never canned stats.** A poster with invented numbers is the dead-unlock bug repeating at
    the climax — fatal. Every line must trace to recorded sim facts.
  - **Diegetic or dead.** Not a centered results screen ("I completed Mission 17"); an
    in-world artifact — a station bounty board entry, an insurance claim, a patrol hail
    reading it back — composed from `src/ui/orrery/` library elements (ORRERY-lane
    compatible; the card is the one demo item near redesign scope, so keep the data layer
    clean and the surface minimal).
- **Timing (market gauntlet):** a **mini-card fires at the first big stunt (~minute 4)**
  ("Ceres control: we saw that."), immediately followed by the wishlist ask — most Next Fest
  sessions never reach a 15-minute finale. The full card is the finale for those who do.
- **Memory sliver, upgraded to 2+ callbacks:** one hail line at the stunt (above) + the
  patrol/hunter referencing the player's earlier deed on approach. One line in 15 minutes
  reads as flavor; two-plus reads as a system.

### 5.4 Trust repairs (the honesty pass)

| Item | Truth today | Demo fix |
|---|---|---|
| `unlock_*` story rewards | written, zero readers | Wire readers, or re-purpose the beat to award something real |
| Tech purchases | verb invisible at purchase | Print the verb (`verbForNodeId` exists, `techVerbLadder.js:396`) **+ a 10-second prove-it moment** — buy a verb, the game hands you a body to use it on |
| First dock | 8-tab wall (repo-named worst cliff) | Staged reveal: top-3 tabs (market/contracts/shipworks), rest unlock on use |
| Tether load language | cyan→amber→red hue-only risk | Verify shape redundancy (whip wave, load chevrons) carries meaning with hue removed |
| New impact grammar | FOV kicks, whipcrack, freeze-frame | Reduced-motion/flash coverage from day one (AGENTS §6 is binding; the plan had named color-blind only) |
| One-voice channel | callouts/hails/ticker/receipts collide | An arbitration pass naming which moment owns the transient voice (GDD pillar 3) |
| ~~Autosave receipt~~ | **already exists** (`wireSaveFeedback` toast) | cut |
| ~~Deed hails~~ | **already exist** (`pickDeedToTell`) | coverage check only |
| Overview strip + off-screen arrows | unimplemented (GDD §7.5/7.6) | **First on the cut line** if slots tighten |

### 5.5 The demo arc (minute by minute)

- **0:00** — drop mid-scene. One diegetic line: *"Ceres control to unfamiliar vessel: you're
  cleared nowhere. Behave."* No tutorial text.
- **0:20** — a pirate harasses a hauler. The invitation is the world already working.
- **0:45** — the first physics-kill *opportunity* presents (domino rig + density rule). The
  player performs it; the game never does.
- **1:00–5:00** — predation rhythm: patrol waves, cargo lanes, the line-cutter introduced as
  an escalation beat. First big stunt → mini-card → wishlist ask (~min 4).
- **5:00–12:00** — role-kit toys unlocked *by* the set-pieces (not by menus); WANTED
  escalation; the second memory callback.
- **~9:00 (mid-demo, not a cliffhanger)** — a named hunter comes for the player, legible as
  *their WANTED's* consequence. Being chased proves "remembers" experientially.
- **12:00–15:00** — climax is the player's own biggest stunt → **finale causality card**
  (freeze-frame of their actual wreck field, in-world artifact) → "The universe remembers.
  1.0 continues from here."
- **Quiet spine ≤3 minutes total** (market gauntlet: a quiet minute in a Next Fest demo is a
  quit): short travel/lane beats between set-pieces so the world breathes without boring.
  Support with the idle-breath audio layer (distant traffic chatter, dock noise) — the
  cheapest "alive not empty" signal.
- **Post-card** — the pocket re-opens as a free-sandbox stunt-challenge node ("kill two
  pirates with one pirate"). Zero new content; a replay reason; a purpose-built clip
  generator.
- **Demo→full-game handoff (player-value gauntlet's hole):** the demo save *continues* into
  the full game. No 12-beat-rail replay after the climax (bored), no skip (unlocks and
  tutorial economy break). The demo IS onboarding beats B0–B4; the full game resumes at B5.

### 5.6 Positioning (merged into Phase 1 — not a separate lane)

- One-liner: **"Swing. Slingshot. Steal. A physics sandbox where enemies are ammunition."**
  ("The universe remembers" is clause two — a promise that becomes the review headline if 1.0
  ships it thin.)
- Trailer beat 1: a pirate swung into an asteroid — before any market/mining/jump-gate frame.
  Real captured gameplay at final art.
- Screenshots/tags/first gif: Massline-first. The capsule must not read AI-fleet-generic
  against Teardown/Everspace thumbnails — the look program (`LOOK.md`, look-bench) owns this.
- One flagged-for-owner item (market gauntlet, sensitive): the name "SpaceFace" reads as
  joke/asset-flip at thumbnail scale to some buyers. Renaming is an owner decision, not this
  plan's — but the store capsule art and tagline must over-communicate craft to compensate.

---

## 6. Phase 2 — The Voice (post-demo, pre-1.0)

The world starts speaking the memory it already stores. One law governs the phase:

> **A memory event that changes no downstream state (a price, a spawn, an offer, a hunter, a
> hail) does not ship.** Memory as flavor text is the No Man's Sea precedent — the exact
> UVP sentence becoming the negative review headline.

1. **The Chronicle (read-model, no new writers):** existing memory systems speak through
   existing moments — contacts hail what they know (trust/grudge counters → lines), the news
   ticker covers the player when heat spikes, the load screen reads the ship's history
   (already a named lane-five milestone in `FINISH_LANES.md` §8). All sources verified present
   (`aceMemory`, `stationContacts`, `moralMemory`, `wreckSuccession`, `chronicler.js`,
   `deedRecord.js`).
2. **The Return Pass:** on load, a ~10-second diegetic digest of what the world did without
   you (the raided convoy, the moved price, the ripened rumor), each line a clickable hook
   into a live situation. World-caused only; never streak timers. Pattern exists: STORY-08
   dockside digest.
3. **Rumors about you:** the convoy you robbed generates rumor cards *other actors buy* —
   hunters come looking the way the player hunts marks. Deterministic, capped (existing
   receipt-limit pattern). This is "the world was here before you" inverted: the strongest
   aliveness signal available.
4. **The personal nemesis arc (day-3+ goals):** the pirate you humiliated escalates over days.
   Fully scaffolded already — `nemesisRival.js` (authored rival, 4 chapters/kits),
   `src/nemesis/` model/learning/encounterHost, persisted in `saveSystem.js`. Rules:
   permanently killable; the world remembers it lost; not day-gated against binge players;
   a thread exists for pacifist/trader players too (a rival *profiteer* feeding off the
   player's market moves).
5. **Failure-successor clauses:** every mission type carries one authored named successor
   (the interrogation target died → recorder hunt; the escort died → salvage-rights standoff
   at the persistent wreck). One per type per faction — no variant explosion. This is
   VISION's "failure should create content" made data-deep; twist-clause and
   wreck-succession machinery exists.
6. **Second acts for named characters** (Vesper has none — verified): state counters unlock
   new lines **and one real world-change each** (cohesion ruling: a line that changes nothing
   is acceptable only if it leaves evidence).
7. **Same-session kill-cam** (timeboxed): `killReplay.js` already keeps a 5-second ring +
   30-second pose tape. Same-session, same-build snapshot re-sim only. Cross-build replay and
   clip export are **post-1.0** (the adversary's break: input tapes aren't persisted;
   cross-engine float variance; build-pinned clips — "nearly free" was the most expensive
   sentence in the original plan).
8. **The ship as personal machine** (cohesion gauntlet's gap — VISION weights it twice):
   begin the scars/repairs/strange-fittings/recognized-hull thread here; it matures in 1.0
   ("my fucking ship," not ship_tier_07).
9. **Live reaction in the moment** (player-value gauntlet's cheapest win): the world *gasps*
   as the cascade happens — one voice line keyed to the event, routed through the arbiter.
   Its sibling, the **undock "now what?" hook** — one line on undock after a goal closes,
   pointing at the next live situation — is the cheapest mid-session retention tool in the
   game and rides the same channel.
10. **Worker lane + compact saves land here** (resequenced from Phase 0): the renderer-refactor
    work that takes the sim off the presenting thread — it also serves the phone/startup line.
    Compact saves integrate PR424 when it merges.

---

## 7. Phase 3 — The Depth (1.0)

1. **Industry that actually bites.** The gap is narrower than the panel claimed (engineering
   gauntlet): `automation.js` DOES emit `economy:applyTradePressure` — the real defect is that
   courier credits bypass market-clearing through the `creditPassive` token bucket
   (`automation.js:2035`) and pressure lands "without crediting" (`economy.js:1630`). Fix:
   attended sales settle as real trades against the live station book (deplete stock, ride
   the marginal curve); offline accrual stays capped. Guard (cohesion): industry must emit
   **traffic and geometry the player can physically interfere with** — never a portfolio
   screen.
2. **Causal price attribution.** `economyCycles.js:109–161` draws phases/amplitudes from rng
   independent of world events (verified event-blind) and multiplies them into every mid.
   Either replace regimes with authored world-driven schedules, or tag every delta with a
   cause string — the read-layer half already exists (`causeLedger.js` renders price-causality
   tooltips). Target sentence: *"food rose because the Dione convoy died"* — true and readable
   in the market UI. (This is a re-architecture, honestly priced.)
3. **Rim sectors as operative chokepoints:** route the existing offscreen pressure field
   through authored chokepoints each rim sector owns (blockade or open a supply pipe in one
   ship; core prices answer). Makes the graph legible and interferible — deepens what
   `sectorSim` *projects*, never what it *is* (the anti-X4 line).
4. **Four sectors to the identity bar, then stop.** `SECTOR_IDENTITY.md`'s score table (6 of 8
   columns differ, seed 4242, pinned by `test/sector-identity.test.mjs`) is the metric and its
   provenance. Pin Tethys/Vesta/Pallas/Sker with signature toys and *honest* crime rows (both
   current rows are the doc's own "honestly false"); the rest ship dark rather than thin
   (producer's cut-by-half; 4 sectors at 6/8 beat 8 at 4/8). Lock owner-swappable sector
   names BEFORE generating content against them.
5. **Recurring named humans in traffic:** 2–3, memory-driven (the tender pilot who appears at
   every hull the player leaves disabled — gratitude or grudge, and her route changes).
   Authored and small; the roster must not imitate persons procedurally.
6. **The alien-ecology vertical slice:** one infected region readable as class→cause→history
   using the existing wreck grammar, one fauna verb. Geography becomes strange — the late
   game — without new systems. Must stay a slice.
7. **Vignette curation:** kill/replace the 20% most GENERIC generated lines — judged by
   *specificity*, not systemic connectivity (the quiet shrine stays; cohesion ruling).
8. **The two-speeds pillar, protected and surfaced:** earned momentum and the draw-path mode
   are a whole VISION pillar absent from the demo plan — Phase 3 protects FEEL_CONTRACT B1
   from regression under the governor and surfaces draw-path where the demo's role-kit
   unlocks live.
9. **Provenance-based trade identities:** purchase-lot provenance through the cargo owner —
   salvage, mining, and trading become genuinely different economic identities with honest
   margins. Already specified in the economy campaign (E3); cheap; compounds with items 1–2.

---

## 8. The not-do list (binding; merged from all 17 reviewers)

1. **No feature #181 on the tick** before the perf pole is confirmed and budgeted
   (presentation-dominates evidence in hand).
2. **No content firehose.** Freeze map size; the inference lanes' generative capacity is a
   liability at demo scale — every generic vignette dilutes seven authored characters and two
   proven sectors.
3. **No HP sponges, no tether nerfs, no TTK challenge.** Challenge comes from numbers,
   geometry, specialists, law. Never from time-to-kill (owner's hand-tuned equilibrium,
   `PHYSICAL_PLAY_GRAMMAR.md` §9.8).
4. **No text walls, no modal tutorial cages.** Fixes are re-cut playable moments and
   legibility channels, never paragraphs.
5. **No calendar-based reward drips** — no streaks, no timed bonuses. Meaning here is physical
   and causal, not wall-clock.
6. **No depth-shelf marketing.** No store surface leads with galaxy size, commodity counts, or
   "inspired by Freelancer/X." Every surface shows a pirate becoming a projectile or it is
   marketing somebody else's game.
7. **No X4-style empire manager, no watched ledgers.** Depth the flight stick cannot touch is
   the aquarium the vision forbids.
8. **No scripted-input quicktime in the reference minute.** Authored opportunity, free-play
   verbs, multi-seed variety.
9. **No Early Access.** Straight to 1.0; Next Fest is the market test.
10. **No flavor-only memory.** The §6 law.
11. **No replay/export promises before they're real** (input-tape persistence + versioned
    builds are unpaid prerequisites).
12. **No perf work that demotes the demo pocket's visuals.** The pocket IS the visual target;
    E serves the minute, never the reverse.

---

## 9. Risk register (weak links with teeth)

| # | Risk | Mitigation (owner) |
|---|---|---|
| R1 | **Illegible spectacle** — B12 passes, humans can't read it; Next Fest is the first legibility test, billed in wishlists | The legibility bench (§5.1.3) gates the demo |
| R2 | **Verb-failure footage** — streamers whiff the Massline; "physics feels random" at scale | The reliability gate (§5.1.4): novice acquisition, whiff recovery, cascade frequency |
| R3 | **Set-piece island** — the rig works, 12 minutes of filler around it | Emergent-reproduction acceptance (§5.1.2); ammunition density everywhere; post-card sandbox node |
| R4 | **Render-lane perf** — 60 FPS exit unreachable via cadence alone | Split exit criterion (§4.1); render work named as the lane; min-spec defined + quiet-host measurement |
| R5 | **Canned-stats climax** — the finale card lies; trust broken at the exact peak | Real-telemetry law (§5.3); every line traces to `deedRecord`/fight accumulator facts |
| R6 | **Hour-1 hole** — minutes 15–90 unspecified post-demo | Demo-save continuity (§5.5); the demo IS onboarding B0–B4 |
| R7 | **Wallet canyon partial** — the 12k-module wall vs 8.5–13k bank (2–3 h grind) survives the demo | Role-kit set-piece unlocks + mid-priced purchase ladder tuning in Phase 2 (grade: PARTIAL, tracked) |
| R8 | **One-shot 1.0** — no EA safety net; "is this worth $20 finished" | Price $17.99–19.99; conversion math front-loaded into the demo; wishlists (7–10k) as the visibility gate |
| R9 | **Thumbnail trust** — generic art or joke-name read at capsule scale | Look program owns capsule craft; Massline-first key art; naming flagged for owner |
| R10 | **PR424/worker dependency drift** — compact saves and worker lane move under the plan | Integrate-don't-parallel-build (§4.6); worker lane resequenced post-demo |
| R11 | **Day-3+ threads too combat-flavored** — pacifist/trader players get no arc | Rival-profiteer thread (§6.4); churn grade tracked as PARTIAL |

---

## 10. Sequencing, capacity, and tripwires

- **Order:** Phase 0 (revised, ~0.7–1 slot-month) → Phase 1 (3–5) → Phase 2 (2–3, with the
  worker lane) → Phase 3 (4–6). F's correctness fixes and G's sector work start strictly after
  demo content-complete; the only Phase-3 leak-through into the demo is the convoy-death price
  ticker line (visible causality for events that occur in the demo anyway).
- **Demo-freeze-minus-3-weeks tripwire (producer):** if B12 isn't passing at target frame rate
  by then, freeze the reference minute at whatever length is currently TRUE, dump every slot
  into Phase 0 + demo defects, and cut the demo route's content — shrink the world, never the
  floor.
- **Trade-away order under slip:** causality card (keep callouts + mini-card) → second/third
  specialists → overview strip/arrows. Never trade: the chain, the reliability gate, or the
  perf floor.
- **First claims for the fleet (mapping to existing surfaces — this doc does not queue):**
  the B12/PQ-141 packet grows the two amendment gates; the trust-repair items are demo-ledger
  rows; Phase 2 items adopt through `FINISH_LANES` area ownership; the perf split belongs to
  the `PERF_*` campaign docs.

---

## 11. The bench (strong ideas deliberately deferred, not killed)

Preserved so future sittings don't re-derive them: the Snarl/Capstan eight-ship tether web
("everything went wrong beautifully" — the L-cost clip verb, post-1.0); daily-seed Crucible
challenges + ghost races (needs the capture layer first); the remaining two specialists
(mass-trap anchor, volatile hauler); clip export + cross-build replay (post-1.0, timeboxed);
the declarative content catalog + generalized Forge publish (the content-velocity multiplier
for the owner-who-doesn't-read-code — grows in value the moment content authoring becomes the
bottleneck); chunked sector saves (with offline sector catch-up); sector-wide telemetry funnel
wiring (GDD §8.3's dormant instrument — becomes the retention tuning source in Phase 2);
worker-phone consolidation.

---

## 12. Method appendix (provenance)

Eight independent panel reports (vision director, systems/economy architect, combat-feel
artisan, first-hour/UX host, worldbuilder, technical director, market analyst, retention
psychologist) → synthesis into an eight-pillar slate → three adversarial debate reviews
(producer: re-scope/split/defer with tripwires; creative champion: the demo ending + domino
rig + free-play guardrail; red-team adversary: broke "scheduler = next 50%" via runtime-witness
evidence, broke "replay nearly free," named the presence-vs-legibility structural risk) → four
specialist gauntlets on the revised plan (engineering: verified assets exist, re-sequenced the
worker lane, split the perf exit, re-scoped mass-audio to ~⅓, cut two already-shipped items,
designed the legibility bench; market: reliability gate, mini-card timing, price correction,
stunt-node second beat, verb-failure risk; cohesion: reason-to-exist clause, diegetic card law,
multi-seed law, three vision gaps — ship-as-machine, two-speeds, reduced-motion; player-value:
hour-1 hole, telemetry-honesty law, live-reaction win) → final red-team review of this
document. Sixteen agents; the strongest finding of the whole project is that the spine is
mostly pre-built — the game's A-list gap is convergence and voice, not construction.
