# M-block review — ROUND 3 of 3 (final gate)

Reviewer: independent third pass (not the orchestrator, not the r2 reviewer). Method: re-ran
every named test myself, `git diff` on all nine touched files, re-checked corpus law (unique
ids, deterministic seed ordering, line-shape/register), and confirmed each plan engages a
real surface. Findings cite file:line. Prior rounds: r1 self-audit APPROVED; r2 APPROVED
with one reject→fix (M-04 golden re-pin) — re-verified holding below.

## Test runs performed (this round)

- `node --test` on the ten named files — **89/89 green**:
  station-contact-counters, authored-encounter-bind-scan-latch, rc-34-dead-marks-stay-dead,
  lg-starter-jobs, racing-career, crucible-swarm-arena, black-flag-missions,
  rc-sector-laws-4242, **bounty-mark-posting** (the r2 re-pin: green),
  voice-corpus-coverage.
- Plan-named extras: `encounter-barks.test.mjs` + `charon-bounty-board.test.mjs` — 3/3 green.
- `rc-vignettes-459-4242.test.mjs` (M-02's named check): 12/13. Sole red is the known
  foreign order-401 massline-tow failure — the prop at `dx/dz 170/-100`
  (src/data/encounters/401-*.js:56–57) is a foreign prop-reposition hunk, same red r2
  documented. Not rejectable; the 391 scene itself is exercised green by "all thirty"
  and "two-hour route" in the same file.
- Known foreign noise left alone per instructions: dirty tree, foreign test reds
  elsewhere (inf-067-void-bounty stale source-grep), S-block + distress copyedit hunks
  in barkSituationFill.js, ledger churn.

## R2 fix re-verification (M-04 golden re-pin)

Holds. `test/bounty-mark-posting.test.mjs:184–185` pins `rollBountyMark({seed:0x5eed,
offerId:'mo_probe_1',…})` → `'Hollis Merk' / 'HOLLIS MERK — WARRANT'`; `'Hollis Merk'`
is a pool member (src/data/bountyMarks.js:54, pre-append). `rollBountyMark` remains the
pure `MARK_NAMES[h0 % len]` pick (:287–293) — deterministic; only the dealt name moved.
The appended names are present exactly once each (:57–60). Test green this round.

## Per-row verdicts

### M-01 — contactDeedMemory.js `strained` lines — APPROVE

`memory()` gains defaulted 4th arg (src/data/contactDeedMemory.js:4); all 15 records
carry a `strained` line in the contact's own register (:6–35); read prefers
`prose.strained` with the shared fallback intact (:45–46); `band:'strained'` pre-computed
(:43). Honest scope verified against source: exactly three counters can go negative —
`vane.favor` min −3, `dorin.trust` min −1, `mara.debt` min −3
(src/data/stationContacts.js:19,23,26; no other `counter(` carries a negative min). The
other 12 lines are dormant-but-valid, as the plan states. File stays read-only (header
law intact), no counter writes; `castLastCall` inherits via `entry.opener` (:52).

### M-02 — encounters/391 a2x insert — APPROVE

One `say`/`info` node `a2x` between `a2` and `p2`; `a2.next` repointed `p2→a2x`;
`a2x.next='p2'` (391 file :97–108). `a2x` occurs exactly twice (repoint + id); every node
id in the file unique (a,b,c,spawn,hail,move,a0,p0,a1,p1,a2,a2x,p2,a3,p3,work,…).
Chain: a0→p0→a1→p1→a2→**a2x**→p2→a3→p3→work — one repoint, one node, exactly as planned.
Foreign 401/417/429/536 hunks untouched.

### M-03 — encounters.js ENCOUNTER_BARKS +2×3 — APPROVE

Three hunks, each appending exactly 2 tail lines: `ambush_spring` (:347–348),
`convoy_depart` (:412–413), `bounty_notice` (:456–457). Index-0 shipped lines untouched;
`convoy_depart` uses `{faction}/{cargo}/{dest}` tokens consistent with siblings.
Register matches plan (hunter grumble, recognized-lane, crew shop-talk). Corpus
validation still holds (encounter-barks green).

### M-04 — bountyMarks.js MARK_NAMES +4 — APPROVE (r2 fix holding)

`Tane Collateral`, `Wisp Marrow`, `Edda Tollcut`, `Bram Six-Seals` at tail (:57–60).
Pool: 34 names, 0 dupes (node check). No collision with `bountyHunters.js` roster.
`Edda Tollcut` ↔ M-05's `Vex Tollcut` is the deliberate kin cross-reference the plan
authored, not a dupe. Seeded golden re-pinned under the sanctioned pool-growth rule —
see §R2 above.

### M-05 — starterJobs.js step-3 epilogues — APPROVE

Three `step: 3` rows appended at their `steps` tails: kestrel `mining_quota`
cmdty_ore_iron ×2 / 840 cr (:14); pelican `tow_recovery` / 960 cr (:24); wasp
`bounty_hunt` runnerName `'Vex Tollcut'` / 920 cr (:34). All schema-native types and
fields; rewards match plan. Pelican title reads "the harbor-master's own buoy" vs the
plan's "harbor-master's buoy home" — the same minor wording drift r2 noted; same
employer voice and the same client-twist; not a defect. Foreign `shipCarriesModule`
AL-LG-11 scarred-ram clause intact and functional (:64–67).

### M-06 — raceLevels.js contract_textile_rematch — APPROVE

Row appended at `CONTRACTS` tail (:324–337): `level_textile_outbound` (exists :142),
laps 2, steerLock `racing`, racingKind `laps` (existing schema — `contract_veil_laps`
carries laps:3, `racingKind` field used throughout :250–381), 1500 cr / 1200 s,
"The tallyman's rematch" with the Vesper's-mark brief callback. Id unique (sole
occurrence :325). Surfaces through `racingOfferFor`/`raceContractById` (:357–373+).

### M-07 — swarmJuice.js wasp_swarmer counter — APPROVE

`wasp_swarmer: 'It packs the room first. Thin it early.'` added to
`SWARM_NEWCOMER_COUNTERS` (src/data/swarmJuice.js:241). `wasp_swarmer` is a real roster
archetype (src/data/enemies.js:26, used in wave tables :159,:255). Consumption is a
direct keyed lookup `SWARM_NEWCOMER_COUNTERS[newcomer.enemyId]`
(src/systems/swarmJuice.js:398) — object position irrelevant, zero seeded-draw shift.
Register matches the file's own law ("body part, then verb", :236–238 header).

### M-08 — bountyMarks.js MARK_HAIL_LINES +4 — APPROVE

Four hails appended at tail (:96–99) — Scar rate, Holt signature, poster lies, framed
writ — exactly the plan's four. Pool: 31 lines, 0 dupes (node check). `bountyMarkHail`
picks `hash32 % len` (:312) — deterministic; r2's sweep found no test pinning a
specific hail string; mission-voice-467 asserts `length >= 24` + seed stability only
(still green this round via the named batch).

### M-09 — barkSituationFill.js faction_scn +3 — APPROVE

Three M-09-commented tail appends: `scan` (:20, after the S-01 block as planned),
`demand-cargo` (:41), `patrol-greeting` (:93–94). File law holds — index 0 stays the
shipped line (:1–2 header; `topUpBarkSituationCells` appends only, :1338–1358).
Register: procedural authority + citation flavor + grudge memory — the ledger's column
for this row. Foreign hunks (S-01…S-05 comment blocks; distress copyedits — periods →
em-dashes/colons across ~10 factions) untouched and intact; those belong to in-review
S-rows, flagged there, not here.

## Corpus-law check (batch)

- **Unique ids**: `a2x` unique in 391; `contract_textile_rematch` unique; 34/34 mark
  names and 31/31 hails dedupe-clean; no duplicate keys introduced anywhere.
- **Deterministic seed ordering**: every append is a tail append; `rollBountyMark`/
  `bountyMarkHail` remain pure hash-mod-length picks (the M-04 golden re-pin is the
  sanctioned pool-growth shift — same flow used twice before per r2: commits
  `85e7ee930c`, `5eaa5b18a1`); the swarm counter is a fixed-key map; bark fills ride
  the append-only top-up with index-0 pinned.
- **One-sentence voice**: the enforced shape law (voice-corpus-coverage
  `assertLineShape`, ≤2 enders, ≤160 chars) covers `BARKS.distress` + the law corpora +
  contact hails — the fill cells M-09 touched (scan/demand-cargo/patrol-greeting) match
  their sibling two-beat register and would pass the strict shape anyway. The foreign
  distress copyedits reduce enders (periods → em-dashes), no violation. M-01's
  `strained` lines are cast-memory prose, not a radio corpus; they match the
  two-beat sibling register exactly.
- **Register match**: per-row register columns hold — noir corporate (M-01), lived
  scene (M-02), per-class encounter voice (M-03), posting-desk surnames (M-04),
  gentle onboarding (M-05), sport+grudge (M-06), arcade menace counter-voice (M-07),
  outlaw writ-voice (M-08), procedural authority (M-09).
- **Plans engage real surfaces**: all nine plans name real files, real schema seams,
  and verification tests that exist and pass; each records an honest limitation where
  the row asked for more than the appendable schema allows (M-02 no follow-on channel;
  M-07 seeded-draw-locked pools and foreign-dirty runtime; M-08 keyed-closed arc).
  That is the sanctioned smallest-honest-slice pattern, documented, not a dodge.

## Verdicts

| Row | Verdict |
|-----|---------|
| M-01 | APPROVE |
| M-02 | APPROVE |
| M-03 | APPROVE |
| M-04 | APPROVE (r2 reject→fix re-verified holding) |
| M-05 | APPROVE |
| M-06 | APPROVE |
| M-07 | APPROVE |
| M-08 | APPROVE |
| M-09 | APPROVE |

No new defects found this round; zero rejections (the count does not reset).
Round 3 of 3: **APPROVED — THE M-BLOCK IS APPROVED FOR LANDING.**
Not committed, per instructions.
