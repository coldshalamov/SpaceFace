# F0 — Claude Fable Advisor Return

**Date:** 2026-07-17 · **Advisor:** Claude Fable (extra-high effort) · **Read set:** F0 packet, 00_CHARTER, 01_LIVE_TRUTH, 02_MARKET_BAR, CONTEXT_BRIEF, depth 02_PROGRESS, program 02_REMAINING_WORK, program README, ARCHITECTURE.md §0–1.

**Thesis in one line:** the depth worktree has already converted six "IP-CP, rerun everything" rows into focused-green-at-current-HEAD product fixes — the campaign's job is now (a) commit and prove that spine, (b) make the depth content reachable by an *ordinary unassisted player*, (c) fix the three first-hour disasters (dock route, recovery, HUD spam), and (d) spend Kimi only on information hierarchy and feel. Everything else is next campaign.

---

## 1. Stale vs live — top 10 program rows that are wrong

| # | Program row (02_REMAINING_WORK) | Says | Live truth | Correction |
|---|---|---|---|---|
| 1 | Depth roll-up header "0 DONE, 16 IP-CP, 15 TODO" | Aggregate counter | A1, A2, K1-fix, SP1-fix, GT1-pin, F2-harness are focused-green **at current HEAD** in the depth worktree (uncommitted) | Counter is stale; re-run after Grok commits the spine. Do not stamp DONE (packet rule), but stop planning as if these need rediscovery |
| 2 | A1 The Band — "Materialize physical Quiessence/Hush actors" | The core remaining action | Done: `poi_quiessence` + 17 stamped census hulls on Pallas Drift, `poi_hush` on Eunomia Gulf; `check:depth-program:a1` GREEN | Remaining slice is only canonical proximity **capture** + full gate |
| 3 | A2 Ship's Ledger — "Verify player reachability" | Open question | Decided and wired: pause-menu route, `shipLedgerScreen.js`, `check:depth-program:a2` enforces it | Remaining slice is panel capture + UI gate only; the station-redesign question is closed (answer: no) |
| 4 | K1 five factions — "Revalidate live behavior/data" | Generic revalidate | A REAL product bug was found and fixed: EMP disruptor 45→96 so the disable verb actually works; k1 GREEN | Row should say: EMP fix landed; remaining is unassisted faction-exposure review only |
| 5 | SP1 — "Real unassisted human-duration observation" | Implies content was ready to observe | It wasn't: `destStationId` null meant investigation missions **could never complete** (REAL). Fixed; 10 routes modeled; sp1 GREEN | Observation routes are now actually runnable; that's the whole remaining slice |
| 6 | GT1 — "Rerun the loot-leak audit" | First action | Done: audit rerun, live 13 combat tables pinned (historical 8 was STALE); gt1 GREEN | Remaining: archive full `npm run check`, ~40-shot gallery, first-hour route |
| 7 | M4-ECOLOGY — "RED CHECK … fix the registry/save initialization-order assertion" | Treated as product repair | LIVE_TRUTH classifies it STALE/HARNESS: contract expects a debug list; registry order is already correct | This is a **check contract fix + save/reload proof**, not a product bug hunt. Small codex task, not a milestone blocker narrative |
| 8 | S4 — "registry/package wiring" among remaining | Wiring listed as open | `titlesSystem` registered after `story`; `registry.get('titles')` works; 11/11 focused | Remaining narrows to: real `title:holdResolved` producers, morale/decal/news consumers, fleet proof, B16–B20 assets |
| 9 | F2 validators/loader — "Rerun the full repo gate and bad-fixture matrix" | Implies unknown state | The F2 soak failure was HARNESS (sector-local vs galactic-global coords); fixed, indexes regenerated, GREEN | Remaining is the cold full-repo rerun only — expect green, budget it as verification not repair |
| 10 | M0-EVIDENCE — "RED … 13 issues across 20 records" | Contract + corpus both broken | `check:alpha:evidence:contract` is GREEN (the front-door assertion was STALE and was fixed); the *live corpus* is N/A in the clean worktree (no `.devshots`) | Split the row: contract = fixed; corpus = must be **regenerated at the committed revision**, which only makes sense after the spine commit (see W3 task 12) |

Honorable mention: W1 planet states was already corrected from TODO→IP-CP inside the row itself; Mining rows anywhere that imply greenfield are overruled by LIVE_TRUTH ("largely present — polish/feel/onboarding only").

---

## 2. Failure taxonomy guidance for builders

Classify every RED before touching anything, in this order:

1. **Reproduce at current HEAD in the depth worktree.** If it doesn't reproduce there, it's someone else's dirty tree (master menu/HUD WIP) — write N/A and move on.
2. **HARNESS** — the test's boot, injection, coordinates, or environment is wrong; the product is fine when driven through public inputs in the real app. Known live traps, check these *first*:
   - Sector-local authored coords vs galactic-global runtime positions (`sectorLocalToGlobalForSector` in `src/data/sectorCoordinates.js`) — this was the entire F2 soak failure.
   - sf-sim curated subset does not register every system (no tetherGameplay/masslineTelemetry historically) — read combat attachments instead of assuming a system exists.
   - Playwright websocket reset mid-Electron run (the M2 red).
   - Hidden-tab rAF throttling — tick manually in headless captures.
   - The preview-env gremlin: untracked new files vanish — `git add -N` immediately.
   Fix the harness; do not touch product code; class = HARNESS.
3. **STALE** — the product changed *intentionally* and the test pins the old world (GT1's 8 tables, alpha front-door wiring, M4's debug-list contract). Re-pin against **live data queried at test time or a freshly counted constant**, never loosen to "anything passes." Every golden/telemetry re-pin requires one written line in your return: what was pinned, why the old pin is obsolete, who decided. Charter rule 3 is absolute: no silent golden weakening.
4. **REAL** — an ordinary player following public inputs hits wrong behavior (K1 EMP residual HP, SP1 null destStationId). Fix the product, keep the test as-is, and add a fixture that would have caught it.

Tie-breaker heuristics: a number that moved because content grew → STALE. A failure that vanishes under real public input → HARNESS. A failure a player would file a bug about → REAL. When genuinely ambiguous, escalate to Fable with a 5-line repro instead of guessing — a wrong STALE call destroys a golden; a wrong REAL call burns a day.

---

## 3. Ranked wave plan (W1–W4) — 15 build tasks

Budget: Codex 9, Kimi 3, Grok 3 (continuous integration duty on top). Fable tasks are §5 and are not counted here.

### W1 — Commit and prove the spine (nothing merges on top of an uncommitted spine)

| # | Owner | Outcome | Acceptance | Likely files | Risk |
|---|---|---|---|---|---|
| 1 | **grok** | The entire depth-worktree change-set lands as 4–6 logical commits (harness fixes / K1+SP1 product fixes / A2 UI / S4 registry / A1 POIs / docs), then a cold full `check:depth-program:contracts` run from the committed tree | `npm run check:depth-program:contracts` exit 0; `git log --oneline` shows logical commits; all 12 focused gates resampled green | everything in 02_PROGRESS's change-set list | LOW — but it blocks all other merges, so it is task #1 by fiat |
| 2 | **codex** | M4 ecology gate 9/9: fix the STALE debug-list contract expectation and add the save/reload proof | `npm run check:m4:regional-ecology` 9/9 + save/reload assertion green | `scripts/check-m4-*`, possibly `src/core/registry.js` read-only confirmation, ecology test fixtures | LOW — pre-classified STALE/HARNESS; do not "fix" registry order, it's already correct |
| 3 | **codex** | Post-Game-Over recovery settles naturally after Hunter defeat: `player:respawn` fires, Game Over hidden, player berths lawful and collision-clear, control returns | New `check:m3:recovery` script green + public-input route log; no SF injection | `src/systems/` respawn/recovery path, possibly world berth selection; new `scripts/check-m3-recovery.mjs` | MED — touches death/save seams; must not disturb save goldens without a re-record note |
| 4 | **codex** | The strict M1 Helios route reaches and *holds* the dock prompt (current best 294.777 WU, needs to close 324.520): fix ordinary autopilot terminal approach, no injection | Uninjected New Game→objective→map→flight→dock route script exits 0 (name it `check:m1:helios-route`) | `src/systems/flightV3.js` autopilot terminal phase, dock-prompt radius logic, route script | MED-HIGH — flight is shared with master WIP fears; stay out of `input.js` entirely, autopilot-only |

### W2 — Natural discovery: make the depth thesis player-visible (the campaign's heart)

| # | Owner | Outcome | Acceptance | Likely files | Risk |
|---|---|---|---|---|---|
| 5 | **codex** | ONE shared unassisted-route driver (public inputs only, multi-seed, browser first / Electron flag) that R1/R2/E1/SP1/GT1 route checks all reuse, built to Fable's harness spec (§5.1) | Driver self-test + R1 rumor→bearing→scan→salvage route green on 2 seeds: `npm run check:depth-program:r1` full | new `scripts/lib/naturalRoute.mjs`, `scripts/check-depth-program-r1*.mjs` | MED — the highest-leverage harness of the campaign; do it once, not five times |
| 6 | **codex** | R2 + E1 natural acceptance on the shared driver: 12 wrecks revalidated with surfaced carriers; 8 canonical encounters reached uncompressed (2 banked follow-ons stay honest stubs) | `check:depth-program:r2` and `:e1` full gates + route logs | route configs per wreck/encounter, `src/systems/encounterDirector.js` read-mostly | MED — encounter spawn timing under natural play may expose REAL density gaps → feed to task 8 |
| 7 | **codex** | V2 missing producers land: ad-board producer, Quiessence producer, Hush producer (physical actors from A1 give them anchors), wreck-rumor reachability closed | `check:depth-program:v2` full gate | `src/data/flavor/*`, `src/systems/bandRadio.js`, flavor index regen **on spine only** (see §9) | LOW-MED — content wiring, but index.generated.js is single-writer (Grok) |
| 8 | **codex** | D1 living opposition: original nine + Helix doctrines get natural fleet carriers via encounterDirector/spawn-budget policy (Fable rules the policy, §5.7) so carriers appear in ordinary sector play | Soak check showing ≥1 Helix carrier group per N-minute crowded-sector soak, doctrine ID visible in contacts; existing doctrine 23/23 stays green | `src/systems/encounterDirector.js`, spawn budget data, doctrine carrier defs | MED-HIGH — spawn-budget changes historically threaten goldens; use the 47a lazy-spawn-to-protect-golden recipe |

### W3 — First hour and information hierarchy

| # | Owner | Outcome | Acceptance | Likely files | Risk |
|---|---|---|---|---|---|
| 9 | **kimi** | NAV-HUD hierarchy: one objective, one immediate action, one threat — repeated objective/action/threat spam removed, contact roster and protected station UI untouched, one-voice arbiter respected (extend, never bypass) | UI/a11y checks green + before/after screenshots; no `voice:surface` regression (`check:one-voice` soak) | `src/ui/hud.js`, alerts/one-voice consumers, `src/ui/uiRoot.js` CSS block | MED — HUD three-anchor + one-voice decisions are load-bearing; Fable spec (§5.3) fences it |
| 10 | **kimi** | V2 Contracts/Bar presentation: rumor corpus surfaces in the Contracts screen and the Bar gets a station identity, presentation-code only, no station-shell redesign | Station tab checks green + captures; `check:depth-program:v2` presentation assertions | `src/ui/station/` instrument screens, `styles/station.css` (sx-* scoped) | LOW-MED — Orbital Command sx-* system exists, work inside it |
| 11 | **codex** | SP1 human-duration observation: success/failure/retry set-piece routes run unassisted on the shared driver at real durations (no time compression) | `check:depth-program:sp1` full gate + duration logs for ≥3 of the 10 routes incl. investigation | route configs, `test/depth-program-sp1-duration.test.mjs` | LOW — the REAL blocker is already fixed; this is proving it |
| 12 | **grok** | Alpha evidence corpus regenerated at the committed spine revision: 20 records repaired/migrated with valid hashes/schemas, baselines re-bound from `6e27aa2b+dirty` to the spine commit | `check:alpha:evidence` + `check:alpha:evidence:contract` green with live corpus present | `.devshots/alpha` regeneration, evidence manifests (durable, since .devshots is git-ignored) | LOW — mechanical but only valid **after** task 1; produce the durable manifest the program demands |

### W4 — Closeout and chrome

| # | Owner | Outcome | Acceptance | Likely files | Risk |
|---|---|---|---|---|---|
| 13 | **codex** | M2 Electron seamless revalidation: repair the Playwright websocket reset (HARNESS) and re-establish the combined browser+Electron seamless-world green | `npm run check:m2:seamless-world` green, browser+Electron full-24 route | Electron launch harness scripts | MED — environment-flaky; timebox, and if the reset is machine-specific, document class=HARNESS with evidence rather than thrash |
| 14 | **grok** | GT1 closeout: archive full `npm run check` from the integrated tree, build the ~40-shot gallery, run the unassisted first-hour Candle Fleet→ticker→bearing→unique→Band route on the shared driver | Gallery manifest + route evidence + archived check log | capture harness, gallery script | LOW — last, by definition, because captures at any earlier revision are stale on arrival |
| 15 | **kimi** | Mining feel slice (see §7): first-five-minutes juice — hit/latch feedback readability and first-drill prompt cadence; zero system rewrite | Existing mining checks unchanged; `check:drill-smooth` no worse than its documented pre-existing red; before/after capture | mining feedback presentation surfaces, drill prompt copy | LOW — feel-only fence keeps it safe from the graphics lane and from mining internals |

Cut line: anything not in this table (B0–B7 story routes, ownership specializations, careers 90-min ×3, props PR1/PR2, landmarks H1a–h, ship families S1/S2, planet states, Living Hull, perf, Wasp classification, store capture) is **next campaign** unless a wave finishes early — see §8.

---

## 4. Kimi (2–3 only) — where scarce taste budget goes

1. **NAV-HUD information hierarchy (task 9).** The single highest taste-per-line task in the program: the game currently *tells* players things repeatedly instead of ranking them. This decides whether the first hour reads professional. Must work inside the one-voice arbiter and the three-anchor HUD layout, both of which are settled decisions.
2. **Contracts/Bar presentation (task 10).** Depth content is only as real as its front door; a rumor corpus nobody sees is a database. Pure presentation code inside the existing sx-* station system — exactly Kimi's fence.
3. **Mining feel juice (task 15).** Only if slots 1–2 land cleanly. Feel/feedback presentation, not systems.

If Kimi budget shrinks to 2, cut #3 (Grok can do a reduced version); never cut #1.

---

## 5. Fable self-tasks (5–7)

1. **Natural-route harness spec** — write the contract for the shared unassisted-route driver (task 5): public-input vocabulary, seed policy, duration/compression rules, evidence format, browser-vs-Electron switch, pass/fail semantics. One page, before Codex starts W2. This is the architecture decision that makes five acceptance rows cost one harness.
2. **Failure-classification adjudication** — standing review of every RED classification and every golden re-pin during the campaign; Fable signs each re-record decision (charter rule 3). Builders classify; Fable ratifies.
3. **Information-hierarchy ruling** — a precise extension of the one-voice tiers covering objectives/actions/threats (what may speak, when, at what priority, what is permanently silent), so Kimi's task 9 executes an authority doc instead of taste-by-vibes.
4. **Discovery-funnel audit** — trace the rumor→bearing→wreck→ledger loop as an ordinary player (with the W1 spine committed) and produce the ranked friction list; this reorders W2 sub-priorities with evidence instead of assumption.
5. **D1 spawn-policy ruling** — decide how doctrine carriers enter ordinary play (budget class, sector-danger gating, despawn contract) before Codex touches encounterDirector, using the established active-map-budget and lazy-spawn idioms.
6. *(Optional)* **M4 registry/save init-order contract note** — one paragraph stating the canonical order so the fixed check pins the right invariant forever.
7. *(Optional)* **End-of-campaign integration review** — final merged-tree pass against this return before Grok stamps anything in `design/program/**`.

---

## 6. Polish opportunities vs the 2020s bar

Ranked against MARKET_BAR's weakness zones, with my judgment applied:

1. **Natural discovery friction (zone 1) — the campaign.** SpaceFace's differentiator ("the galaxy keeps receipts") currently exists mostly as compressed-capture proof. W2 converts it to lived experience. Nothing else matters if content players never see stays invisible.
2. **Information hierarchy (zone 2) — the biggest cheap win.** One objective/action/threat is a taste decision plus deletions. Every reference game on the bar (Freelancer, Rebel Galaxy) wins by *ranking* information, not adding it.
3. **Recovery/death (zone 3) — trust.** A 2020s Steam player forgives dying; they refund a stuck Game Over. Task 3 is small and non-negotiable.
4. **Living opposition density (zone 7).** Doctrines that are audit-green but never naturally met are a tech demo. Task 8 is what makes "world keeps moving for reasons" true sitting still.
5. **First-hour front door (zones 6/2).** The Helios dock route (task 4) plus HUD hierarchy is the professional first hour.
6. **Save/Continue trust (zone 10).** Fold into recovery + evidence acceptance (bearings/titles/Band survive reload) rather than a standalone task.
7. **Mining mastery (zone 8).** One feel slice, §7.
8. **Deferred with reasons:** visual presentation (zone 4) → graphics lane owns it; performance (zone 5) → measured-cause discipline says no perf work without fresh profiles, and the user's no-quality-reduction rule stands — next campaign with profiling first; story embodiment (zone 6/B0–B7) → too big for 15 tasks, keep SP1/E1 observation as the down payment; map-as-truth (zone 9) → spot-check during the GT1 first-hour route only.

---

## 7. Mining — polish YES, one slice

**Verdict:** polish yes, rewrite no. Implementation is largely present (mining:2, drill, massline, careers per LIVE_TRUTH).

**Exact slice (task 15, Kimi):** the first five minutes of mining feel — (a) hit/latch feedback readability (does the player *feel* the beam biting: impact response, yield tick visibility), (b) first-drill onboarding cadence (one prompt, once, through the one-voice arbiter, then silence). Presentation and prompt-copy surfaces only.

**Fences:** no `mining.js`/`drill.js` system rewrite, no ore/economy retune (ARCHITECTURE pins the 18 ore-HP/s and 40u math), no thruster/particle asset work (graphics lane), and `check:drill-smooth` has a documented pre-existing red — no worse, and don't claim to have fixed what you didn't.

---

## 8. Explicit non-goals

1. **No graphics work**: assets/**, thruster/material remasters, heavy `src/render` presentation — `codex/graphics-overhaul` is a peer, leave it alone.
2. **No menu overhaul and no `src/systems/input.js` edits** — master has dirty concurrent menu/HUD WIP; collision guaranteed.
3. **No station shell redesign** — Orbital Command is the station UI; work inside its screens only.
4. **No mining greenfield** (§7).
5. **No B0–B7 story completion, ownership specializations, 90-minute career triples** — next campaign; only the SP1/E1/GT1 observation slices here.
6. **No landmark/prop/ship-family authoring** (H1a–h, PR1/PR2, S1/S2, W1/W2 planet visuals, A3) — art-heavy, graphics-adjacent, out of budget.
7. **No performance work** — requires fresh profiles first and the no-quality-reduction rule; unbudgeted speculation forbidden.
8. **No golden/telemetry weakening without a written Fable-signed re-record decision.**
9. **No SF-injection as primary acceptance** — public inputs or it doesn't count.
10. **No new frameworks** — sew `encounterDirector`, `bandRadio`, `shipLedger`, `world`, one-voice; the systems exist.
11. **No `design/program/**` status edits by builders** — Grok integrates status; Fable ratifies; feature owners return proof only.

---

## 9. Integration order (anti-thrash)

1. **Spine first, absolutely.** Task 1 (Grok commits the depth worktree) precedes every other branch. No `SpaceFace-orch-*` branch is cut before the spine commit exists; anything already cut rebases onto it.
2. **Single-writer file map for the campaign:**
   - `src/data/*/index.generated.js` — Grok regenerates on the spine only; builders never commit regenerated indexes.
   - `src/core/registry.js` — frozen except by Fable ruling (§5.6); it was just fixed, order is correct.
   - `src/data/weapons.js` — frozen after the K1 EMP fix; and the `typeof window` vent gate is intentional, do not "fix" it.
   - `src/ui/uiRoot.js` / `pause.js` — spine-owned (already modified); Kimi branches after spine and touches HUD/station files only.
   - `docs/evidence/**` and `.devshots` manifests — Grok only.
3. **Merge order inside each wave:** Codex sim/backend first (they can move goldens and pinned counts), then Kimi presentation (rebased on the new spine so screenshots reflect real backend state), then Grok evidence/captures last — **captures are only valid at the revision they'll ship at**; taken earlier, they're stale on arrival.
4. **Gate after every merge** — full focused-gate resample on the spine after each integration, before the next branch merges. One red merge stops the queue; classify (§2) before proceeding.
5. **Wave boundaries are rebase points** — if master or the graphics lane moves, the spine rebases only between waves, never mid-wave.
6. **Ordering dependencies to respect:** task 12 (evidence corpus) after task 1; task 11 (SP1 observation) and task 6 (R2/E1) after task 5 (shared driver); task 14 (GT1 gallery/first-hour) dead last; task 8 (D1) after Fable's §5.5 ruling.

---

## Charter return block

```
LIVE AUDIT: read-only advisory pass over the 8 packed context files + ARCHITECTURE.md §0–1; no repo grep beyond packet allowance.
DIFF SUMMARY: one new file — docs/evidence/orchestration/returns/F0_FABLE_ADVISOR_RETURN.md. No code, no design/program edits.
GATES: none run (advisory packet; F0 forbids implementation).
FAILURE CLASS: N/A.
PLAN DRIFT: §1 documents 10 stale program rows; headline drift = depth roll-up counter and the six already-fixed IP-CP rows; M4 reclassified STALE/HARNESS.
RESIDUAL: Fable self-tasks §5 (harness spec, one-voice extension ruling, D1 spawn policy) should be produced before W2/W3 dispatch; Grok to confirm exact npm script names for the two new checks (m1 route, m3 recovery) at dispatch time.
```
