# H/T/V/E/U-block review — ROUND 3 of 3 (independent, fresh eyes)

Reviewer: third distinct pass. Method: ran the named suites on their real filenames, read every
dirty hunk in the claimed file set, checked corpus laws (unique ids, register voice, deterministic
data), spot-read plans against diffs, and re-checked the two open no-seam rows.

## Suite evidence (run this sitting, post-fix)

- `node --test test/bar-faction-greetings.test.mjs test/new-game-embark-present.test.mjs
  test/audio-recipe-integrity.test.mjs test/depth-program-flavor-loader.test.mjs
  test/pulse-437-codex-pages.test.mjs test/voice-corpus-coverage.test.mjs
  test/world-remembers-codex.test.mjs test/fb-codex-world-tab.test.mjs` → 55/55 pass, 0 fail.
- Post-fix re-run of the six primary named suites → 43/43 pass, 0 fail.
- `npm run check:player-facing-labels` → "Player-facing label polish checks OK".
- Named-file corrections: bark-coverage suite is `voice-corpus-coverage.test.mjs`; codex-pages is
  `pulse-437-codex-pages.test.mjs`; embark is `new-game-embark-present.test.mjs`.

## Diff audit

All 17 claimed files: additive tails only. Every hunk is `+`-line data (strings, frozen-object
entries, recipe rows); the only in-place edits are content appends (`line:` strings in
newGameDefaults, `casualty` keys on three hull overlays, meta tails in automationPanel,
empty-label constants in footprint). No machinery, no deletions, no foreign hunks touched.
Test-side bump in `test/depth-program-flavor-loader.test.mjs` is a pure count update
(353→369 / 365→377 / 311→323) matching the landed rows; assertions unchanged.

Corpus laws: programmatic dupe sweep over the touched banks — ad ids (369), tag ids (377),
roaming-event ids, paint ids, audio recipe ids, hull names, frontier name banks, passenger
lines, beats, tourist register, headline arrays — zero duplicates. ('bare' appears once in
hull paints and once in finish stock: separate namespaces, pre-existing at HEAD.) Deterministic:
all additions are static literals; selectors unchanged.

## Per-row verdicts

| Row | Verdict | Evidence |
|-----|---------|----------|
| H-01 | APPROVED | +12 names (plan: 12), +4 hull paints +3 accents with hex+sentence, `casualty` on kestrel/pelican/wasp — all three land, Vols named per plan |
| H-02 | APPROVED | `HISTORY_RECOGNITION` kills +1 × 8 factions, first/last names +8/+8, why +4; beats +4 board / +2 midrun / +2 arrive (plan said +2/beat — over-delivery, in-register, harmless) |
| H-03 | APPROVED | `MODULE_OVERLAYS` +23 (plan says +24 — count off-by-one noted); casualty exactly on shield_booster/cargo_scanner/quarantine_locker per plan; every key maps to a real module id |
| H-04 | APPROVED | `WEAPON_OVERLAYS` +16 (plan says +17 — count off-by-one noted); casualty on heavy_beam_l + siege_lance_l citing Charon Expanse / Station Kessel per plan; every key maps to a real weapon id |
| T-01 | APPROVED (observation) | 12 ads land live — billboard corpus draws all non-conflict entries regardless of sector. 12 `tag_t01_dock_*` rows are dormant: no consumer reads the graffiti pack by sectorId/factionId and they carry no `set` (every other entry has one). Consistent with this pack's authored-ahead-of-system precedent (BUILD_PLAN: "content dormant until its system lands"), and the loader test's keyedTags contract counts them. If a wall consumer lands, the rows may need a `set` — not blocking. |
| T-02 | APPROVED | `BAR_GREETING_BARKS` barkeep +8, one per live faction (scn/mts/dmc/reach/quiet/free/vael/choir) — matches plan exactly |
| V-02 | APPROVED | `MANIFEST_ALREADY_SIGNED` → B1 airlock (delayS 5), `THIRD_TAG_MEANS_SURVIVOR` → B2 bulkhead; both consumed via story.js `graffiti:show` |
| V-03 | REJECTED → FIXED | `cmdty_ore_platinum` matched no commodity (real id: `cmdty_ore_platinium`) — dead overlay, Platinum Ore page silent. Minimal fix: key renamed. `pulse-437-codex-pages` re-run green (8/8). Remaining +8 commodity overlays all verified against real ids |
| V-04 | APPROVED | `SHIP_LEDGER_TEMPLATES.loss` +3 underwriter/line-item lines, placeholders valid |
| E-01 | APPROVED | `TOURIST_HAIL_REGISTER` +2 insurance/schedule lines |
| E-02 | APPROVED | `REASON_WORD` +6 in saveNotices — dormant rows for reasons the save layer doesn't currently emit (fallback `it could not be used` covers all unknowns; same shape as pre-existing speculative keys like `no_backup`). Plan named exactly these six |
| E-03 | APPROVED | `HEADLINE_TEMPLATES` +7 across shortage/freight_loss/event (plan says +8 — count noted); `{station}`/`{noun}`/`{name}` all resolved by generic `fillTemplate` |
| E-04 | APPROVED | `slow_fleet.lines` +4 on scan/hail/news surfaces inside the existing rare-epic pool |
| U-01 | APPROVED | starter `line` ×3 extended (line, not blurb — no conflict with H-01's rejected blurb rewrites) |
| U-02 | APPROVED | same saveNotices REASON_WORD +6 as E-02 — both rows claim the identical hunks; ledger double-claim noted, code is single and correct |
| U-04 | APPROVED | footprint empty labels deepened, voice consistent |
| U-05 | APPROVED | Orbital Gallery blurb +1 clause, in-register |
| U-07 | APPROVED | `PROGRAM_OPTIONS` meta ×3 deepened, no mechanics touched |
| U-08 | APPROVED | secondRinseAudio +2 recipes matching existing schema (oscillator/noise_filtered fields complete); code comment names a third "runoff hiss" witness that was not landed — trivial wording drift vs the plan's own +2 |
| U-09 | APPROVED | `WRECK_LOSS_NOUN` +6; `patrol`/`pirate`/`tanker` are live emitted loss kinds in scanner.js — real coverage, not dormant |
| U-03 | stays OPEN — no-seam claim verified | `check-cause-ledger.mjs` enforces a two-way pin: phrase bank must cover every `classifyDrivers` tag and contain nothing it can't emit; appending un-pinned copy = dead strings. Schema-blocked, not laziness |
| U-06 | stays OPEN — format-pin verified | `runShareSummary` token order pinned by `test/pq-160-02-share-code.test.mjs` exact-string assertions; theater/replay copy sits inside ORRERY-claimed screens |

## Defects found and disposition

1. **V-03 dead overlay key** (`cmdty_ore_platinum` → `cmdty_ore_platinium`) — fixed in place,
   suite re-run green. Marked REJECTED-then-FIXED per protocol; the fix is uncommitted working-tree
   change as instructed.
2. T-01 tag dormancy + E-02/U-02 unemitted reason words — observations only: dormant copy is this
   corpus's established pattern; nothing reads wrong, nothing is unreachable-that-was-reachable.
3. Plan-vs-diff count drift (H-03: 23/24, H-04: 16/17, E-03: 7/8, H-02 board beats 4/2) — noted,
   all additive and in-register; no action.

## Final verdict

**APPROVED FOR LANDING** — round 3 of 3. One real defect found, fixed minimally, and re-verified;
all other rows verified additive, deterministic, unique, and in-register against their plans.

## Approvals

- Round 3 reviewer (independent): APPROVED FOR LANDING — 2026-10-24
