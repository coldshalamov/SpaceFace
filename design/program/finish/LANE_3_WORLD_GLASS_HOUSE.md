<!-- LIFETIME: STABLE -->
# Lane 3 — THE WORLD, THE GLASS & THE HOUSE (medium complexity)

**Written only by Lane 3.** Other lanes append one line to *Inbox* and nothing else.
Program law: [`README.md`](./README.md). Commands: [`TOOLS.md`](./TOOLS.md). Prompt: [`PROMPT_LANE_3.md`](./PROMPT_LANE_3.md).

**The outcome:** Adventure is mentally stimulating — a first hour a stranger finishes, an economy
you can play, a story with faces and voices that builds to an ending, a world where you arrived in
the middle of everyone's day — every 2D screen and the HUD is one finished instrument (ORRERY), the
game sounds like itself, and the repository is cut back to what an agent can read in one sitting.
Status words: `OPEN`, `ACTIVE`, `LANDED <sha>`, `SKIPPED (<reason>)`.

## Claimed paths (beyond README §3)

## Inbox (other lanes append one line: date, lane, path, what/why)

## Defects (this lane's share of the demo defect ledger — delete a row in the commit that fixes it)

| # | What a stranger sees | Where | Next step |
|---|---|---|---|
| D261 | Phone 390 flight HUD: TOP SPEED crosses the hull-ring text; crescent/lock instruments collide | `node scripts/ui-bench.mjs --phone`; speed/travel HUD owners | packet G1 |
| D267 | Flight HUD tests red on clean master (`test/hud-contact-roster-visibility.test.mjs` 2 of 7) | HUD contact roster | packet G1 |
| D222 | CI `static (2)` red: UI budget digest drifted (333 files) | `scripts/check-ui-budgets.mjs`, `test/ui-frame-references/budgets.json` | packet G1 |

## Day-one reviews (from `LANDED_REVIEW.md`; hand them to Codex as one batch, fix what it finds, delete each row there)

R-8962e68 (ORRERY sweep, 45 surfaces), R-d1a68ec (faction_understory), R-26f29b7 (physical Adventure
encounters / Vesta carrier-loss recovery), R-710f1e1 (faction_verge), R-d0891f7 (Helios buoy / Vesta
chute accounting), R-cc96d0c (rookBooth salvage market), R-3a9d5dc (moralMemory). When Lane 2's
R-36df771 is also gone, archive `LANDED_REVIEW.md` (ruling 3) and remove the review step from the
docs that describe it.

Batch verdicts in (`.devshots/finish/lane3/batch-{a,b,c}/RECEIPT.md`):
- batch-b: **d1a68ec VERIFIED** (row deleted); **710f1e1 DEFECT** — warden return-to-post dies on
  sector unload (return target lives only on the live entity); fix implementer running
  (`fix-verge-return` packet).
- batch-c: **26f29b7 VERIFIED** (Vesta ledger conserved, 30/30); **d0891f7 VERIFIED** (winch
  exception scoped, 17/17+30/30); **cc96d0c VERIFIED** (rookBooth writers all in-band, 24/24);
  all three rows deleted. **3a9d5dc FIXED 0376013b331** — `moralMemorySystem` registered in
  both production order tables + calendar clock (self-gates 30 s); production-runtime tick
  proof escalates a vengeful debt with `moralMemory:escalated` on the bus. Row deleted.
  **710f1e1 FIXED 6b470a4eb45** — bounded `v.returns` ledger in `state.verge` rides the
  vergeCourt slot; repro test proves a sector-unloaded warden re-claims and walks home. Row deleted.
- New OPEN row found at top of ledger: **R-c1225fa** (presentation craft: palette skin, market
  SOLD OUT, bar rail bands, HC focus signal) — not in the original seven; needs a ui-bench
  breakpoint pass, queue in the next review batch.
- Localization debt (nearby flags, W3 material): hard-coded player strings in
  `faction_understory.js` (:1069,:1134,:1154,:1735-1906), `faction_verge.js` (:137-161 via _log
  :534), `vestaWinnowRecovery.js` (:98-104,159,342,552-553), `starterWorkday.js` (:9-22),
  `rookBooth.js` (:401-429), `moralMemory.js` (:423-436,913-997,1185-1195).
- System deep-reviews (`.devshots/finish/lane3/review-*/REVIEW.md`): save-b READ path scored
  8/10 — its HIGH defect landed as **fd7b2bd6a60** (importFile's FileReader.onerror now
  re-checks the restore sequence before emitting `save:error`; the rest of the async lanes
  were already guarded by in-flight work; 4/4 race test + save-fuzz 5000 clean). Two mediums
  flagged: gzip slot preview inventing ship facts (needs the saveLoad.js call site to honor
  `meta.gz` — src/ui, ours, packet it in Wave G), index-cache trusting `_blobHash` (tractable
  in-file — add integrity sniff in a later save pass). lawsec-a: missing-method defect absent
  (already fixed); chain review continuing. save-a (write path) + lawsec-b (impound/heat)
  relaunched after the context wall.

## The ordered packets

### H0 — The first razor cut (do first, so every lane navigates a smaller repo)
**LANDED a054f36530a (2026-10-28).** 2,820 files moved via `git mv` into `design/archive/` +
`docs/archive/` (dated run folders, finish-expansion pack, roadmap receipts/evidence/retired/sprint
docs minus the live keepers `README`/`00_EXECUTION_PROTOCOL`/`program-queue.json`/`active/`/
`receipts/playtests/`, ~59 PERF_* folded into `design/perf/README.md`, superseded frontend direction,
docs/ui-polish+perf-evidence+handoffs). 1,470+ kept-file refs rewritten to archive paths incl.
`program-queue.json`; banners on `design/program/README.md`, `build_map.md` (pre-existing) and
DEMO_READINESS §6. **design+docs markdown outside archive/vm-drop: 3,662 → 951.** Checks green:
check-program-docs PASS, check-plan-integrity PASS, check-inference-control PASS.
Deferred to H1: `design/inference-workflows/` (pinned by check-inference-control until the new
INFERENCE law exists), `docs/worldbuilding` (live data readers), program root `*.md` control
surface, `design/program/{jules,atlas,special-500,starter-integration,lab,receipts}` (live-script
readers/provenance, tiny). Judgment calls recorded: `attention/` (179 md), `player-truth/` (108),
`experience/` (54), `demo-prep-2026-10-27` (9) archived as obviously dated beyond the §7 list —
needed to reach the count; all recoverable under `design/archive/program/`.

### W0 — Green the world floor
D265 and D266 (above). Done when both tests are green on seed 4242.
- **D265 DONE 1406c221a39** — the salvor already flew a real job; the red was a committed
  duplicate import making `test/lived-frontier-pockets.test.mjs` a SyntaxError. 28/28 green.
- **D266 in review** — root cause was the harness, not the game: `bootSim` wiped the
  auto-installed `campaign47a:` cold-start contract and the prospector never docked at the sell
  station, so beat 0's mine→skim→dock could never settle. Fix preserves campaign-tagged
  missions (no `nextId` reset) and emits dock:docked/undocked on the sell leg like a live pilot.
  Miner now banks 14 RP @90m; test todo→real 6 RP assertion. 13/13 cohort tests green.
- Found while at it, FIXED: `test/story-spine-memory.test.mjs` + `test/pq-178-03-ledger.test.mjs`
  red on master — legacy whole-beat fills stamped receipts with the current book list's last
  stepId (which never ran) and the ledger trusted stepId over the receipt's own signal. Fix in
  `campaignTransitions.js` (LEGACY_FILL_STEP_ID knock/pull/tow) + `storyLedger.js` (authored
  clause final only when signal ∈ step.accept). 22/22 + regression suites green.
  Follow-up row (foreign/adjacent, not this fix): `w534-books-3-4` (11), `fb-spine-back-half` (2),
  `story-spine-route` (2) fail at `campaign47a:b1:infested` materialization — investigate whether
  master-red or another lane's in-flight dirty `src/ai`, `weapons`, `salvageTender` work.
- Pipeline live: audit split wrote 303 packets (669k lines); wave 1 = 8 packets done,
  wave 2 = 209-packet queue on 8 window-free launchers (4 Grok + 4 Gemini, direct-node, real-user
  env). Codex reviews running under `codex-auto-review` (the only model this client accepts on
  ChatGPT auth — the `gpt-*` slugs demand a newer CLI): day-one batch (7 rows), saveSystem,
  lawSecurity/heat.

### Wave W1 — the first hour is gold (M1)
Rows are the spec (`build_map.md` §31–§32; read each row's prose before briefing):
- **Row 457 RC-FIRST-MINUTES — DONE** (cc56ac32122 + 9beb18845a8). Verified per item: F8/NumLock
  rail labels + both in Help sheet + lessons (clean); threat markers yield to instruments via
  reservedRects + 8-pass slide (clean); in-world names fixed (Fleeing Raider masks trainer reg,
  Bright Seam, Range Drone); visual:false lines captioned (trackerCaptionId path, clean); wu/wu/s
  in range + tender copy fixed. 14/14 + 21/21 pinned suites green; 3 onboarding-suite fails traced
  to foreign dirty `src/core/*`/`weapons.js` — watch, not ours.
- **Row 473 RC-FRONT-DOOR** — interactive title ≤ 10 s, mm:ss clock, destination slate, first-light preset, settings density (load-time half is Lane 1's M9; coordinate in its Inbox).
- **Row 429 AL-HUD-1** — no internal ids on screen (`ZONE_CERES_DERELICT`), no Overhead/Circuits buttons over the target card, no overlapping shipworks list text.
- **Row 479 RC-SCREENS-TRUE** — no screen admits it is unfinished: mission log, tab-rail clipping, game over, map strip, voice ring, empty states.
- **Row 459 RC-VIGNETTES** — lived vignettes worth meeting.
- **Row 553 ATT-E01** — onboarding rail texture, tier-0 life, ambient traffic.
- **Row 546 W-TEACH** — teach by situation; First Light keeps its offer with Play primary.
- **Row 454 GOLD-M1** — the integration pass: play the first hour on the real route, fix until every first-hour system is gold or names its missing file.

### Wave G — the glass (every 2D surface; DeepSeek via OpenCode builds, Claude Sonnet reviews every ~5)
Direction: `design/frontend/ORRERY.md`, `ORRERY_RUBRIC.md`; method: `docs/UI_VISUAL_ITERATION.md`
(`node scripts/ui-bench.mjs --shot=<id>`, open the PNG, fix, `--walk`).
- **G1 — HUD defects** D261, D267, D222.
- **G2 — The surfaces the ORRERY handoff left open:** flight HUD, comms, power rail, drill, base,
  sandbox (loading belongs to Lane 1), and the 8 "partial" surfaces from R-8962e68.
- **G3 — Phone and short screens** across every surface (`ui-bench --phone`).
- **G4 — Split the UI monoliths:** `galaxyMap.js` (12,332 lines: pure layout/search/route out, drawing stays),
  `saveSystem.js` (10,040: migrations / import / slots / serialize / storage), the largest screen files.
- **G5 — UI cost.** Per-frame DOM reads and forced layouts in HUD paths (the caption and callout
  fixes of 2026-10-27/28 are the pattern); every HUD write batched per frame.

### Wave W2 — an economy you can play and a long game that lasts
- **Row 544 W-ECONOMY** — travel ≤ 50 % of time, a play-changing purchase every 15–25 minutes, pay by the tonne.
- **Row 465 RC-MARKET-WHY** — the market explains itself. **Row 480 RC-MARKET-PLAY** — Convoy Shares, Forward Slip, Auditor Penn, Dump Chute, Cold Chain, Labor Stoppage (after 465).
- **Row 401 AL-LONG-3** — hulls you commit to (two irreversible refits, ladder to hour 15, deed-priced resale).
  **Row 469 RC-FIT-VISIBLE** — the fit shows on the hull (the drawn-module half is Lane 1's; Inbox).
- **Row 399 AL-LONG-1** — seen at minute one, moved at hour fifteen (≥ 8 `revisitNeed` one-offs).
- **Row 452 GOLD-INSPECTOR** — the inspector's shift, a fourth career branch.

### Wave W3 — a story with faces and voices
- **Row 535 W-BOOKS-5-7**, **Row 536 W-DOORS** (the Five Doors, one playable act each), **Row 538 W-ARCS** (fourteen faction arcs × three missions), **Row 539 W-CULL** (the Cull ladder).
- **Row 425 AL-STORY-3** — faces on the radio (the row asks for an owner ruling; the owner delegated judgment calls on 2026-10-28 — decide, record the decision here, build it). **Row 543 W-FACES** — canon, new and culture portrait pools (authored 2D images are allowed, owner ruling 2026-10-03).
- **Row 432 PULSE-RADIO** — ≥ 2 h per channel before a repeat, live-fact segments, The Margin as a show.
- **Row 434 PULSE-CHATTER** — every ship is somebody; ≥ 3,000 hail/chatter lines (grunt-author through Grok/Gemini, cut hard in review).
- **Row 555 ATT-T02**, **Row 478 RC-STATION-STAGE** — the station is a stage. **Row 558 ATT-E04** — secrets layer. **Row 472 RC-VENUES** — toys out of the drawer.

### Wave W4 — the open reach (living world, `design/program/living-world/`)
`node scripts/living-world.mjs --next` lists dependency-ready briefs; `--task=LW-xx` prints one.
Order: **LW-01** Lantern Ward → **LW-02** reusable district composition (unblocks Lane 2's LW-04/05/14) →
**LW-03** Switchyard → **LW-06** Widow's Run → **LW-07** Nine-Mouth Cut → **LW-08** Iron Maw →
**LW-09** Memorial Gardens → **LW-10** Fourth Toll → **LW-11** Gate Audits → **LW-12** THE WEIGHT with an
open future → **LW-13** the other seventeen sectors. Art kits LW-A1…A4 come from Lane 1 (watch your Inbox).

### Wave X — Strategic Chaos, the world half
From `design/program/strategic-chaos/` (`node scripts/strategic-chaos.mjs brief SC-06`): **SC-06**
Physical Infrastructure, **SC-09** Supply-Line Warfare, **SC-10** Personal Consequences. Lane 2 builds
SC-01 Causal Playground and SC-12 Scenario Forge first; use them to prove yours.

### In flight elsewhere — integrate when it lands
Another agent's opening-experience work (open PR "Create Adventure, Swarm, Tethys, Ceres, Cinder/Rook,
and Compost opening experiences", plus files staged in the shared index under
`design/program/opening-experience-2026-10-27/`). Do not take or merge that branch. When it arrives on
`origin/master`, fold its openings into Wave W1 and re-run the first-hour pass. Also read
`design/program/alive-world-plan-2026-10-27.md` alongside the living-world pack before W4.

### Wave S — the ear
Every verb has a voice, the mix has a hierarchy, silence exists (`FINISH_LANES.md` lane 8 checklist,
`src/audio/**`). Audit first: list verbs with no sound or a placeholder, then fix in batches.

### H1 — The full razor (last, when the other lanes no longer cite old docs)
README §7 end state: `AGENTS.md` ≤ 150 lines, `build_map.md` ≤ 600 lines, one perf document, one
INFERENCE law (fold `INFERENCE_LANES.md` + `design/inference-workflows/` + `INFERENCE_GOAL.txt`), stale
`NOW.md`/`FINISH_LANES.md`/`FINISH_THE_GAME.md` folded or archived, every nested `AGENTS.md` still true.
Write the new front door so the next agent after this program knows where the game stands.

## Systems review — every system you own, to a studio bar (README §5.7; runs alongside the waves from day one)

**Critical systems — each gets a Codex deep review, then packets:** the economy and markets
(`economy.js`, `src/economy/**`, trade), missions and contracts (`missions.js`, `src/missions/**`,
`src/contracts/**`), the world and sector simulation (`world.js`, `src/world/**`, `traffic.js`,
`npcJobsRuntime.js`), law and heat (`lawSecurity.js`), the encounter director (`encounterDirector.js`),
story, factions, characters and careers (`src/story/**`, `src/characters/**`, `src/careers/**`),
onboarding and the first hour (`onboarding.js`), save and migrations (`src/save/saveSystem.js`), the
HUD and UI root (`hud.js`, `uiRoot.js`, the ORRERY library `src/ui/orrery/`), the galaxy map
(`galaxyMap.js`), station screens, audio (`src/audio/audioSystem.js`), localization (`src/localization/**`).
**Then everything else you own**, ranked by how much a player touches it. Keep the list here with a
status per system: `UNREVIEWED → REVIEWED (<n> findings) → AT BAR <sha>`.

## The audit — read every line you own

Split your owned paths (`src/ui/**`, `styles/**`, the world/economy/story systems, `src/world/**`,
`src/story/**`, `src/careers/**`, `src/economy/**`, `src/missions/**`, `src/characters/**`,
`src/localization/**`, `src/audio/**`, `src/save/**`) into modules of ≤ ~3k lines and hand them evenly
to Grok and Gemini (`TOOLS.md`): each run reads every line and writes
`.devshots/finish/lane3/audit/<module>.md` — bugs, facts written and never read (`build_map.md` §31.0
fault 1: *no new fact lands without a simulation reader the player can fly into*), stand-ins counted as
done, internal ids leaking to screens, save-compat risks, dead code, and the three cheapest wins.
Turn real findings into packets below this line.

## INFERENCE (seed ≈ 45 lines in the brainstorm packet, README §6)

Seed directions — ground each in a live owner, write it in player words, give it a done check:
dock and someone remembers your last visit; prices that move because of something you did; a
freighter you saved sending cargo later; patrols reacting to your heat before they see you; a bar
regular whose story advances each visit; radio that mentions your kill; mission text in the voice of
the person giving it; empty states that tell a tiny story; a map that shows rumours and danger you
learned about; station announcements tied to the live economy; a ship's name and captain on hail;
wrecks with readable histories; a reason to come back to the first sector at hour ten; failure that
teaches by situation; tooltips that explain *why* in one line; every screen's last row visible
(open catalog line RC-49 carries over: station tabs hide their last row).

## Traps

- Save compatibility: every new persistent field needs a migration and a reload test (`src/save/`).
- Single writers: economy→credits, factions→reputation, cargo→cargo (`AGENTS.md` §6) — emit intents, do not write another system's state.
- Localization: four of five locales are machine-filled; new player text goes through the localization pipeline, never hard-coded.
- `design/program/vm-drop/` is remote-authoritative; never write under it locally.
- Git-bash `sed` strips CRLF; check `git diff --numstat` after scripted edits of mixed-ending files.
