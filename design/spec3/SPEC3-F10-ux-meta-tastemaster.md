# SPEC3-F10 — UX, Meta & the Taste-Master Capstone (specs 40–42)
**Thread:** F10 · **Reads:** GDD §8/§13, constitution, all thread files · **Status:** PLAN
**Thread pitch:** the connective tissue — one attention system that keeps 33 specs from shouting
over each other, a meta layer that proves the game respects your time, and the capstone doc that
holds the whole plan to one standard of taste.

---

## SPEC3-40 — UX & onboarding: the attention arbiter, industrialized
**One-line pitch:** build the single attention arbiter GDD §8.1 specified, extend the first-15
pacing to every SPEC3 system, and make "one voice at a time" a mechanical guarantee.

### 1. Why / what's holding us back
GDD's measured finding: 5 simultaneous text sources in the first second of play. SPEC3 multiplies
speakers (ticker, sieges, war, veins, hunters, Vale). Without a *mechanical* arbiter — not a
convention — the plan re-creates the wall it was written to demolish. `check:first-15-runtime`
currently times out; onboarding truth is static-only.

### 2. The design
- **The arbiter (one queue, five tiers):** `danger > tutorial > objective > comms/story > chatter`.
  One surface (top-center line + optional card). Rules: higher tier preempts (lower re-queues);
  same tier FIFO; chatter drops if stale (>8 s) or if anything above it spoke in the last 4 s;
  danger is the only tier allowed audio+visual simultaneously. EVERY text-speaking system registers
  a tier at init — emitting outside the arbiter becomes a lint failure.
- **Teach-once ledger:** every verb (tether, vent stance, autopursuit, claim, siege repair…) has
  one contextual hint, shown at first *opportunity*, never again after first *use*
  (`state.player.taught[verbId]`). No permanent tutorial furniture (constitution taste rule).
- **First-15 extended, not rewritten:** the 6-beat opening (GDD §8.2) stays canonical. SPEC3 verbs
  enter at their natural systems: first fracture-chunk >20 u triggers the tether hint (mining
  teaches the tether — the designed loop-lock); first amber heat teaches vent; first claim beacon
  teaches claims. The tutorial is the world noticing you, one line at a time.
- **The choice beat hardened:** minute-12's three jobs (haul/bounty/survey) each carry a
  playstyle tag that seeds early OFFER_MIX weighting (+15% their lane for 2 hours) — the game
  leans toward what you picked without locking anything.
- **Settings completeness (professional shell):** control-scheme picker, damage numbers toggle,
  screen-shake slider, reduced-audio, HUD quiet-mode bind, F1 keybind sheet reachable from HUD
  minute one (all specified across GDD/SPEC3 — this spec owns their *existence check*).

### 3. Architecture & wiring
New `src/ui/attentionArbiter.js` (owns the queue + the top-center DOM node; consumed by hud.js).
API: `arbiter.say(tier, line, {card?, ttl?})`. All SPEC3 systems route through it (F1 ticker
registers as `chatter`; F4 barks as `comms`; siege warnings as `danger`). Teach ledger in save.
Lint: `scripts/check-one-voice.mjs` — scripted 10-min run asserts zero overlapping text events and
zero direct DOM text writes outside arbiter/screens (the GDD §13 audit, automated). Repair
`check:first-15-runtime` (probe or boot-path fix) as this spec's gate 0.

### 4. Key code
```js
// The arbiter's entire policy — small enough to be law, strict enough to matter.
say(tier, line, opts = {}) {
  const t = TIERS[tier];
  if (this.current && TIERS[this.current.tier] < t) this.requeue(this.current);
  if (this.current && TIERS[this.current.tier] >= t) {
    if (tier === 'chatter') return;                       // chatter never queues behind anything
    return this.queue.push({ tier, line, opts, at: now() });
  }
  this.show({ tier, line, opts });
}
```

### 5–6. Assets / deps
None / none.

### 7. Build plan
1. Arbiter + hud node + tier registration for ALL existing speakers; `check-one-voice.mjs` green.
2. Repair first-15 runtime probe; extend with SPEC3 verb hints (teach-once ledger).
3. Choice-beat OFFER_MIX lean.
4. Settings existence check + F1 sheet surfacing.
5. Floor: `check:onboarding`, `check-first-hour.mjs`, `check:ui-identity`.

### 8. Anti-patterns
Convention-based discipline (the arbiter is code or it is nothing); tutorial gates that block
verbs (hints ride opportunities, never lock them); teaching in menus what happens in space;
re-showing taught hints "just in case"; two cards at once, ever.

### 9. Ambition ceiling
Stall detection: telemetry notices a player 10+ min without credits/progress delta and has the
*bar NPC* (not a popup) offer a leading rumor — help that stays diegetic.

---

## SPEC3-41 — Save, meta, telemetry & live-ops hygiene
**One-line pitch:** the invisible professionalism — saves that never betray, telemetry that answers
design questions, and a release cadence with proof gates.

### 1. Why
Versioned saves + migrations exist and work; telemetry (`createTelemetry`) is wired-but-dormant;
`CURRENT_BUILD_STATUS` holds a red cluster of runtime probes (flight:clean, first-15, market-first-
loop, claim-base, ui-screen-imports, 47a compare) that gates any honest release claim. SPEC3 adds
~20 systems and ~15 new state fields — without this spec, save integrity and truth-gates rot first.

### 2. The design
- **Save schema discipline for SPEC3:** every new field ships with (a) a migration from the prior
  version, (b) a default for absence, (c) a line in a generated `SAVE_SCHEMA.md` (from code, not
  hand-written — the CONTENT_BIBLE drift lesson, recon §0.2). New SPEC3 state inventory: tether,
  flight mode, taught ledger, claims v2, hunters, war nudges, heat flags, purity lots, blueprints,
  crew/wingmen, discovery additions, ending package. One migration test per version bump replaying
  a golden save through load→play 600 ticks→save→compare.
- **Telemetry, aimed at design questions:** activate the dormant funnel with exactly the GDD §13
  metrics (first-kill <6 min median, first-trade <10 min, save-continue rate) + SPEC3 questions:
  tether adoption % by hour-2, autopursuit usage, siege win rate by claim value, market-chart open
  rate, spec-verb reach (did anyone find vein events?). Local-first: JSON ring in localStorage +
  export button — no network, no consent problem, but the data exists when a playtest happens.
- **The truth-gate ritual:** `check:ci` becomes the release word: the red cluster above must be
  green or *deliberately rebaselined with a dated note* in CURRENT_BUILD_STATUS. SPEC3 threads
  never merge on transcripts — checks only (constitution law, restated as the release bar).
- **Golden-tape governance:** one named batch per sim-shape change (projectile momentum, tether,
  mining signatures), each re-recording 47a + new scenario tapes with a CHANGES.md entry. Never
  incremental drift.
- **Session heartbeat:** autosave cadence audit (dock, jump, claim, siege end, ending) + a
  crash-recovery banner path ("recovered from autosave — 2 min ago") — trust is a feature.

### 3. Architecture & wiring
Migrations live in `save/migrations.js` (pattern exists). Schema doc generator = script walking
`createGameState()` + registered system state contracts. Telemetry: `createTelemetry` activation
behind settings opt-in default ON for dev builds, OFF for release until a consent line ships.
`check:ci` composition in package.json (exists, currently red) — this spec owns sequencing its
repair alongside each thread's gate 0.

### 4. Key code
```js
// Migration contract — every SPEC3 field arrives with its absence story. No exceptions.
registerMigration(12, (save) => {
  save.player.taught ??= {};
  save.tether ??= { jointHandle: null };            // handles never persist; shape does
  save.claims?.bodies?.forEach(b => { b.modules ??= []; });
  return save;
});
```

### 5–6. Assets / deps
None / none.

### 7. Build plan
1. Schema generator + golden-save migration test harness.
2. Telemetry activation + metric set + export.
3. Red-cluster repair sequencing (each item paired to the thread that touches it; ui-screen-imports
   and 47a-compare first — they gate everyone).
4. Golden-batch process doc + first batch (with F4-19/20).
5. `check:ci` green = SPEC3 wave-1 release bar.

### 8. Anti-patterns
Hand-written schema docs (generate or drift); telemetry that phones home (local-first, always);
"temporarily" skipped checks (dated rebaseline note or it didn't happen); autosave during combat
frames (dock/jump boundaries only); migrations that delete on unknown (preserve + flag).

### 9. Ambition ceiling
A `?diag` overlay page rendering the local telemetry ring as charts — playtesters screenshot their
own funnel; you debug pacing from a Discord message.

---

## SPEC3-42 — THE TASTE-MASTER — anti-patterns, the bar, and how it coheres
**One-line pitch:** the capstone: what "good" means here, the failure modes that would quietly ruin
us, and the single narrative of how 33 specs become one game.

### 1. What's actually holding this game back (the honest diagnosis, ranked)
1. **Invisible depth.** The best systems (economy cycles, faction war, cost-basis ledger, the
   tether) are built and mute. The game's core problem is not missing content — it's unexpressed
   content. That's why F1/F7 are surfacing specs before they are content specs.
2. **Unfinished proof surface.** Red runtime probes mean nobody can say what works. Truth-gates
   (F10-41) are load-bearing for every ambition above them.
3. **The verb gap.** One-note interactions (hold-to-mine, shoot-to-kill) under-use a real physics
   sim. F3/F4's momentum verbs are the identity play — they make SpaceFace *SpaceFace* instead of
   "competent Freelancer-like."
4. **A world of ten rooms with the lights half-on.** Sector identity exists on paper (world-identity
   docs) and in palettes, but density/uniqueness is thin (2 claimables, missing archetypes). F6/F7
   turn rooms into places.
5. **Asset pipeline friction.** The whole-ship contract failure shipped silently. F9's executable
   contract is the difference between an art *pass* and an art *capability*.

### 2. The coherence story (how the threads interlock — read this before dispatching anything)
Mining teaches the tether (chunks) → the tether feeds industry (hauling, salvage) and combat
(yank/sling) → industry needs a home (claims) → homes create stakes (sieges) → stakes join the war
(territory) → the war moves prices (economy) → prices reward knowledge (intel UX) → knowledge pulls
you frontier-ward (exploration) → the frontier holds the story's answer (Vale) — and every step is
*visible* (F8), *audible* (F9), *legible* (F10), and *provable* (checks). Cut any spec and note
which arrows break; that's the review question for all future scope decisions.

### 3. The attention-to-detail bible (the standing orders)
- **The five-second test** is the master metric: pause anywhere; a stranger names every entity.
  Every visual/UI change re-takes the test.
- **Numbers are for crime and fitting.** Scan-risk cards and the outfitting screen show numbers;
  the flight HUD shows states (arcs, colors, motion). If a feature "needs" HUD numbers, its
  feedback design is unfinished.
- **Quiet is the default; loud is information.** Rest = still. Every glow, pulse, shake, and sting
  maps to a state change a player can act on. (The audit exists: one-voice check + rest-state lint.)
- **Feel targets are contracts.** Cursor <50 ms, scout 90° <0.45 s, brake <2.5 s, vent chime at
  70–95, siege telegraph 10 s, hunter entrance 10 s. Deviating means editing the spec in the same
  change with one line of why (constitution law — repeated because it's the one that erodes).
- **Physics comedy is content; physics *betrayal* is not.** Emergent chaos from real rules =
  delight (slung rocks, chain-yanks). Fake forces the player can't model = betrayal (rubber-band
  joints, magic brakes on NPCs, G-caps). When in doubt, let the sim be true and make the *feedback*
  louder.
- **Every system speaks once, through its surface:** ticker (world), arbiter line (you),
  target panel (them), map overlays (strategy). A fact appearing in two surfaces at once is a bug.
- **Content earns its place by interacting.** The sector-content lint (`interacts:` field) is the
  taste rule mechanized: no POI, hazard, module, or event that touches zero player verbs.

### 4. The anti-pattern catalogue (genre failures we are explicitly refusing)
- **The spreadsheet trap** (X4/EVE failure mode): depth expressed as tables. Our law: every number
  the player must know has a *spatial or temporal* read first.
- **The empty-map tax** (procedural-genre failure): breadth via generation. Ten authored sectors
  that sing beat forty templates. No procedural sector gen — ever (constitution).
- **The tutorial wall** (sim-genre failure): teaching before playing. Teach-once, in-world, at
  opportunity.
- **The idle drift** (automation-genre failure): the game playing itself. The passive cap
  (A(T)·0.45 funnel) is sacred; bases/fleets are texture and strategy, never the main income.
- **The juice inflation** (indie failure): screenshake as substance. Trauma budgets, momentum
  scaling, and the quiet-default law keep juice meaning something.
- **The lore dump** (worldbuilding failure): fiction delivered as reading. ≤3-line fragments,
  environmental corroboration, systems-triggered story beats.
- **The difficulty lie** (action failure): stat-inflated enemies. Composition, gimmicks, and
  build-reading only.
- **The betrayed save** (live-game failure): migrations that lose player property. Preserve+flag,
  golden-save tests, autosave at boundaries.

### 5. Sequencing doctrine (what to build first and why)
**Wave 1 — Truth & feel:** F10-41 gate repairs, F8-33 stability, F3-16/17 (flight + tether).
The game must *feel* right and *prove* right before it grows.
**Wave 2 — Expression:** F4-19/20/21, F1-10/11, F2-13, F8-34/36, F9-39. Combat reads, market
speaks, mining deepens — the built world becomes visible.
**Wave 3 — Place & stakes:** F6-26/27, F5-23/24, F2-14/15, F9-37 content batches, F8-35.
**Wave 4 — The living whole:** F7-29/30/31, F6-28, F4-22, F5-25, F1-12, F7-32, F9-38 marketing.
Each wave ends at `check:ci` green + a playtest against GDD §13 metrics before the next begins.
Threads within a wave are lane-parallel (constitution dispatch rules).

### 6. The bar (what "matches or exceeds" means, concretely)
- Flight/feel: **beats** Rebel Galaxy Outlaw's assist suite (their autopursuit + our tether ceiling).
- Trading: **matches** Elite's market data honesty, **beats** it on legibility (charts + ticker
  + knowledge-honest advisor, no third-party tools needed).
- Mining: **matches** DRG's rhythm satisfaction in a top-down frame (seams+vent+tracking+veins).
- World life: **matches** Freelancer's indifferent-universe feel at one-tenth the content budget
  via the director + itineraries.
- Bases/defense: **beats** the genre's menu-outposts with the only flown tower-defense in a
  space-trader.
- Readability: **beats** everyone — it's the pillar the whole engine was pointed at.
When a spec's ambition conflicts with this table's honesty, the table wins: we do fewer things at
this bar rather than more things below it.

### 7. Review protocol for everything SPEC3 ships
1. Named checks green + regression floor (`check:sim:compare` hashEqual, tether gameplay).
2. The five-second test on any visual change (screenshot pair in `.devshots/`).
3. One-voice audit clean (no overlapping text events in the feature's scripted run).
4. Feel targets hit or spec edited-with-reason in the same change.
5. The coherence question: which arrows in §2 does this strengthen? (An honest "none" = cut it.)

*Capstone written by the lead session (Fable 5), 2026-07-04. This document outranks enthusiasm.*
