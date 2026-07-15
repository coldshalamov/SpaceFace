# SPEC3-F10 — UX, Meta & the Taste-Master Capstone (specs 40–42)
**Thread:** F10 · **Reads:** GDD §8/§13, constitution, all thread files · **Status:** PLAN
**Thread pitch:** the connective tissue — one attention policy that keeps the game's systems from
competing incoherently, a meta layer that proves the game respects your time, and the capstone doc that
holds the whole plan to one standard of taste.

---

## SPEC3-40 — UX & onboarding: the attention arbiter, industrialized
**One-line pitch:** build the attention arbiter GDD §8.1 specified, extend the first-15 pacing to
every SPEC3 system, and make primary-message priority a mechanical guarantee without suppressing
useful persistent, contextual, or accessible redundancy.

### 1. Why / what's holding us back
GDD's measured finding: 5 simultaneous text sources in the first second of play. SPEC3 multiplies
speakers (ticker, sieges, war, veins, hunters, Vale). Without a *mechanical* arbiter — not a
convention — the plan re-creates the wall it was written to demolish. `check:first-15-runtime`
currently times out; onboarding truth is static-only.

### 2. The design
- **The primary transient arbiter:** begin with semantic priority classes such as danger, tutorial,
  objective, comms/story, and chatter, then tune preemption, queuing, staleness, and pacing from
  scripted stress runs and playtests. The arbiter owns competing transient announcements, not every
  word on screen. Persistent status/objectives, spatial labels, target/context panels, player-opened
  screens, captions, and accessibility or multimodal equivalents may coexist when hierarchy and
  layout keep them intelligible. Systems that emit transient announcements register their class and
  dedupe key; bypassing that path is a lint failure.
- **Teach-once ledger:** every verb (tether, vent stance, autopursuit, claim, siege repair…) has
  one contextual hint, shown at first *opportunity*, never again after first *use*
  (`state.player.taught[verbId]`). No permanent tutorial furniture (constitution taste rule).
- **First-15 extended, not rewritten:** the 6-beat opening (GDD §8.2) stays canonical. SPEC3 verbs
  enter at their natural systems: first fracture-chunk >20 u triggers the tether hint (mining
  teaches the tether — the designed loop-lock); first relevant heat state teaches vent; first claim
  beacon teaches claims. The tutorial is the world responding at a pace that preserves control and
  situational awareness.
- **The choice beat hardened:** minute-12's three jobs (haul/bounty/survey) each carry a
  playstyle tag that seeds early OFFER_MIX weighting (+15% their lane for 2 hours) — the game
  leans toward what you picked without locking anything.
- **Settings completeness (professional shell):** control-scheme picker, damage numbers toggle,
  screen-shake slider, reduced-audio, HUD quiet-mode bind, F1 keybind sheet reachable from HUD
  minute one (all specified across GDD/SPEC3 — this spec owns their *existence check*).

### 3. Architecture & wiring
New `src/ui/attentionArbiter.js` owns the primary transient queue and its presentation slot; persistent
and contextual surfaces register their region, salience, and collision behavior with the HUD layout.
API: `arbiter.say(tier, line, {card?, ttl?, dedupeKey?, modality?})`. SPEC3 transient speakers route
through it (F1 ticker as `chatter`; F4 barks as `comms`; siege warnings as `danger`). Teach ledger in
save. Evolve `scripts/check-one-voice.mjs` into an attention-policy check: scripted stress runs assert
priority/preemption, dedupe, stale-message cleanup, readable region occupancy, reduced-motion behavior,
and preservation of captions/accessibility equivalents. It rejects competing urgent transients and
unsanctioned transient DOM writes, not all simultaneous text. Repair
`check:first-15-runtime` (probe or boot-path fix) as this spec's gate 0.

### 4. Key code
```js
// The primary transient policy is centralized; contextual and accessibility surfaces remain available.
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
1. Arbiter + HUD slot + registration for existing transient speakers; evolve and pass the
   attention-policy assertions in `check-one-voice.mjs`.
2. Repair first-15 runtime probe; extend with SPEC3 verb hints (teach-once ledger).
3. Choice-beat OFFER_MIX lean.
4. Settings existence check + F1 sheet surfacing.
5. Floor: `check:onboarding`, `check-first-hour.mjs`, `check:ui-identity`.

### 8. Anti-patterns
Convention-based transient priority (the arbiter is code or it is nothing); tutorial gates that
block verbs (hints ride opportunities, never lock them); teaching in menus what happens in space;
re-showing taught hints without a contextual or accessibility reason; simultaneous urgent cards that
obscure each other or player control.

### 9. Ambition ceiling
Stall detection: telemetry notices a player 10+ min without credits/progress delta and has the
*bar NPC* (not a popup) offer a leading rumor — help that stays diegetic.

---

## SPEC3-41 — Save, meta, telemetry & live-ops hygiene
**One-line pitch:** the invisible professionalism — saves that never betray, telemetry that answers
design questions, and a release cadence with proof gates.

### 1. Why
Versioned saves + migrations exist and work; telemetry (`createTelemetry`) is wired-but-dormant.
The current program acceptance matrix owns release-gate status. SPEC3 adds substantial system and
state surface area, so save integrity and evidence quality must evolve with it.

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
- **The truth-gate ritual:** the current acceptance matrix defines the checks and player routes for
  a release claim. Rebaselines require an explicit reason and matching program update. Transcripts
  are context, not acceptance evidence.
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

### 3. Attention-to-detail review heuristics
- A paused representative frame should communicate identity, threat, objective, and interaction
  affordances quickly. Evaluate this with players and current screenshots rather than a universal
  time threshold.
- Use numbers, bars, motion, sound, spatial cues, or combinations according to the decision. The
  flight HUD may show precise values when precision improves play.
- Ambient presentation may create life and atmosphere. Actionable changes must remain more salient,
  and reduced-motion/flash settings must preserve meaning.
- Treat response, handling, telegraph, and cue timings as tunable targets. Record current measured
  values in checks/telemetry, not as permanent design law in this capstone.
- **Physics comedy is content; physics *betrayal* is not.** Emergent chaos from real rules =
  delight (slung rocks, chain-yanks). Fake forces the player can't model = betrayal (rubber-band
  joints, magic brakes on NPCs, G-caps). When in doubt, let the sim be true and make the *feedback*
  louder.
- Give each message a clear primary surface. Redundant presentation is useful when it improves
  accessibility, urgency, persistence, or cross-scale navigation; avoid simultaneous clutter.
- Content should support play, atmosphere, fiction, navigation, or world credibility. Not every
  valuable place or detail needs a direct gameplay verb.

### 4. The anti-pattern catalogue (genre failures we are explicitly refusing)
- **The spreadsheet trap:** use tables when comparison is the actual task; otherwise pair data with
  spatial, temporal, visual, or contextual explanation.
- **The empty-map tax:** authored identity matters more than raw count. Procedural assistance is
  allowed when it produces curated, coherent places rather than repeated templates.
- **The tutorial wall** (sim-genre failure): teaching before playing. Teach-once, in-world, at
  opportunity.
- **The idle drift:** automation should create strategic decisions and progression rather than erase
  active play. Tune its value from economy telemetry and desired career fantasy.
- **The juice inflation** (indie failure): screenshake as substance. Trauma budgets, momentum
  scaling, and the quiet-default law keep juice meaning something.
- **The lore dump:** match delivery length and medium to context; combine concise in-flight cues with
  optional deeper reading, environmental evidence, and system-triggered story.
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

### 6. The bar (comparison targets, not content ceilings)
- Flight/feel: **beats** Rebel Galaxy Outlaw's assist suite (their autopursuit + our tether ceiling).
- Trading: **matches** Elite's market data honesty, **beats** it on legibility (charts + ticker
  + knowledge-honest advisor, no third-party tools needed).
- Mining: **matches** DRG's rhythm satisfaction in a top-down frame (seams+vent+tracking+veins).
- World life: **matches or exceeds** Freelancer's indifferent-universe feel through authored places,
  credible traffic, encounters, schedules, and consequences.
- Bases/defense: **beats** the genre's menu-outposts with the only flown tower-defense in a
  space-trader.
- Readability: **beats** everyone — it's the pillar the whole engine was pointed at.
When scope and quality conflict, prioritize coherent player-facing results while retaining valuable
future work in the program backlog. Do not use this table to cap content or asset ambition.

### 7. Review protocol for everything SPEC3 ships
1. Named checks green + regression floor (`check:sim:compare` hashEqual, tether gameplay).
2. Representative visual-change screenshot comparison and player-route review.
3. Attention-policy audit clean: primary transients arbitrate correctly, persistent/contextual
   surfaces remain legible, and accessibility redundancy is preserved in the scripted stress run.
4. Feel targets measured and judged against the current experience goal.
5. The coherence question: which arrows in §2 does this strengthen? (An honest "none" = cut it.)

This capstone supplies coherence questions and comparison targets; it does not override the current
program, architecture, GDD, or player-facing evidence.
