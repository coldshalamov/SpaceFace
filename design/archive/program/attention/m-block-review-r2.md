# M-block review — ROUND 2 of 3

Reviewer: independent re-verification (not the orchestrator). Method: read each row's
`-plan.md`, `git diff` every touched file, run the row's tests, check schema law
(additive tails, seeded determinism, no duplicate ids, ordering preserved, no new
machinery, no gameplay-outcome writes in data). Findings cite artifact + file:line.

## Test runs performed

- `node --test` on the nine named files: **73/73 green** —
  station-contact-counters, authored-encounter-bind-scan-latch, rc-34-dead-marks-stay-dead,
  lg-starter-jobs, racing-career, crucible-swarm-arena, black-flag-missions,
  rc-sector-laws-4242, voice-corpus-coverage.
- Extra verification tests the plans themselves name:
  `bounty-mark-posting.test.mjs`, `encounter-barks.test.mjs`, `charon-bounty-board.test.mjs` —
  **19/19 green after the M-04 fix below**.
- Mark-adjacent sweep (hidden-golden hunt): mission-voice-467, the-killers-mark,
  seam-bounty-hunt, ghost-convoy-bounty, infer-nxi-202-229-pooled-marks,
  target-bounty-preview, gravity-mark — green.
- `test/rc-vignettes-459-4242.test.mjs`: 12/13 green; the one red is the known
  foreign massline-tow failure (`physical gate: a REAL massline tow resolves
  tow_settle (order 401)`) — order-401 file carries a foreign prop-reposition hunk
  (`dx/dz 54/-28 → 170/-100`), nothing to do with 391.
- `test/inf-067-void-bounty.test.mjs`: red at HEAD — the test greps
  `src/systems/missions.js` for `_voidLostBountyTargets`, which moved to
  `missionObjectiveOps.js` in the AL-MACH-2 split (commit b55ca88949). Stale
  source-grep, pre-existing, foreign to this block. Not fixed here (outside
  M-block scope).

## Per-row verdicts

### M-01 — 47-A campaign chain (contactDeedMemory.js) — APPROVE

Plan: optional `strained` string per `memory()` record, preferred when value < 0,
shared fallback stays.

Verified: `memory()` gains a defaulted 4th arg (src/data/contactDeedMemory.js:4);
all 15 records carry a `strained` line in the contact's own register (:6–35);
the read path prefers `prose.strained` with the old fallback intact (:45–46);
`band:'strained'` was already computed (:43, unchanged); `castLastCall` picks the
lines up for free via `entry.opener` (:52). Negative-band reachability matches the
plan's honest scope exactly — stationContacts.js mins: `vane.favor` −3 (:19),
`dorin.trust` −1 (:23), `mara.debt` −3 (:26); the other 12 records are
dormant-but-valid data, as planned. File stays read-only (header comment intact),
no counter writes. station-contact-counters green.

### M-02 — lived vignettes 391–566 (encounters/391-*.js) — APPROVE

Plan: one `say` node `a2x` between `a2` and `p2` — one repoint, one node.

Verified: `a2.next` repointed `p2 → a2x`; new node `a2x` (verb `say`, channel
`info`, next `p2`) at src/data/encounters/391-lived-civilian-core-toll-choir-none.js:102–108.
`a2x` occurs exactly twice in file (id + repoint); unique id; chain reads
`a0 say → p0 → a1 say → p1 → a2 say → a2x say → p2 → a3 say → p3 → work`. The
say/say adjacency is the plan's own shape (insert between a2 and p2), not a defect.
Module imports clean; vignette spec tests pass ("all thirty", "two-hour route"
exercises the scene). Foreign hunks in 401–429/536 confirmed foreign (label/prop
edits) — the plan left them untouched, and it did.

### M-03 — authored encounters (encounters.js ENCOUNTER_BARKS) — APPROVE

Plan: +2 each to `bounty_notice`, `ambush_spring`, `convoy_depart`.

Verified: three hunks, each appending exactly 2 lines at the array tail —
`ambush_spring` (src/data/encounters.js:347–348), `convoy_depart` (:412–413),
`bounty_notice` (:456–457). Index-0 shipped lines untouched in all three corpora.
convoy_depart lines use the `{faction}/{cargo}/{dest}` tokens consistently with
siblings. Register fits: hunter grumbling at the posting, lane recognized as set,
crews talking shop on cast-off. encounter-barks green; `bark in ENCOUNTER_BARKS`
validation still holds.

### M-04 — mission board offers (bountyMarks.js MARK_NAMES) — REJECTED → FIXED → APPROVE

Plan: append 4 named marks — `Tane Collateral`, `Wisp Marrow`, `Edda Tollcut`,
`Bram Six-Seals`.

Verified: exactly those 4 names appended at tail (src/data/bountyMarks.js:57–60);
each unique; no collision with existing pool or `bountyHunters.js` roster.
`Edda Tollcut` is a deliberate kin-cross-reference to M-05's `Vex Tollcut`, not a
duplicate.

**Defect found:** the plan named `test/bounty-mark-posting.test.mjs` as
verification and it was RED — "the mark roll is a pure function of (seed, offer
id, sector, tier) — a fixed golden" pins `rollBountyMark({seed:0x5eed,
offerId:'mo_probe_1',…})` → `'Pike Sorrow'`. `rollBountyMark` picks
`MARK_NAMES[h0 % len]` (bountyMarks.js:286–293); growing the pool 30→34 remapped
the probe seed to `'Hollis Merk'`. The seeded pick stays deterministic — this is
the sanctioned-pool-growth golden shift, re-pinned twice before in this repo
(commits `85e7ee930c`, `5eaa5b18a1`).

**Fix applied:** re-pinned the golden to `'Hollis Merk' / 'HOLLIS MERK — WARRANT'`
(test/bounty-mark-posting.test.mjs:184–185). Semantic delta reviewed: name+label
only — archetype, factionId, zoneId, placeName all identical; the dealt name is a
pre-existing pool member, so the append's own names didn't even enter this seed's
pick. Determinism unchanged. Test now green (19/19 with the two sibling files).
Audit of every other mark-touching test found no further pinned names/hails;
3 expected.json fixtures carry none.

### M-05 — starter jobs (starterJobs.js step-3 epilogues) — APPROVE

Plan: one `step: 3` epilogue per chain, existing step types, employer voice.

Verified: kestrel `mining_quota` cmdty_ore_iron ×2 / 840 cr (src/data/starterJobs.js:14);
pelican `tow_recovery` / 960 cr (:24); wasp `bounty_hunt` runnerName `'Vex Tollcut'`
/ 920 cr (:34) — all appended at tail of their `steps` arrays, all schema-native.
Rewards and types match plan exactly. Minor wording drift: pelican title reads
"the harbor-master's own buoy" vs the plan's "harbor-master's buoy home" — same
employer voice, same twist (employer is the client); noted, not a defect. The
foreign `shipCarriesModule` scarred-ram hunk (AL-LG-11, :61–67) is intact and
functional, as the plan required. lg-starter-jobs green.

### M-06 — racing (raceLevels.js contract_textile_rematch) — APPROVE

Plan: one CONTRACTS row — `contract_textile_rematch`, `level_textile_outbound`,
laps 2, steerLock `racing`, racingKind `laps`, 1500 cr / 1200 s,
"The tallyman's rematch".

Verified: row appended at CONTRACTS tail (src/data/raceLevels.js:324–337) with
exactly those fields; id unique (grep: only :325); `level_textile_outbound`
exists (:142); field set conforms to sibling contracts (`contract_textile_qual`
:245, `contract_textile_mark` :291); `racingKind:'laps'` and laps>1 are existing
schema (`contract_veil_laps` laps:3); surfaces through `raceContractById` →
`racingOfferFor` (:357–373). Brief lands the Vesper's-mark callback the plan
promised. racing-career green.

### M-07 — swarm arena (swarmJuice.js wasp_swarmer counter) — APPROVE

Plan: add `wasp_swarmer` to `SWARM_NEWCOMER_COUNTERS`.

Verified: key present with "It packs the room first. Thin it early."
(src/data/swarmJuice.js:241) — matches the file's "body part, then verb" register
law (:236–238). `wasp_swarmer` is a real roster archetype (enemies.js:26) and the
catalog's own note said it was the one uncovered non-boss. Consumption is a
direct keyed lookup (src/systems/swarmJuice.js:398) — object position irrelevant,
no seeded-draw shift possible. Fixed-key map, no machinery. crucible-swarm-arena green.

### M-08 — black flag path (bountyMarks.js MARK_HAIL_LINES) — APPROVE

Plan: append 4 hails in the mark's own voice (Scar rate, Holt signature, poster
lies, framed writ).

Verified: exactly those 4 lines at tail (src/data/bountyMarks.js:96–99), unique.
`bountyMarkHail` picks by `hash32 % len` (:312) — deterministic; sweep found no
test pinning a specific hail string (mission-voice-467 asserts `length >= 24` +
same-seed stability only; now 31 lines). black-flag-missions green.

### M-09 — patrol/law events (barkSituationFill.js faction_scn +3) — APPROVE

Plan: 3 appended lines — `scan`, `demand-cargo`, `patrol-greeting`.

Verified: `'The sweep roster knows your hull…'` appended at `scan` tail
(src/data/barkSituationFill.js:19–20); `'This hold was audited once…'` at
`demand-cargo` tail (:41); `'Marker Twelve-K desk…'` at `patrol-greeting` tail
(:93–94). File header law — index 0 stays the shipped line (:1–2) — holds in all
three cells. Provenance comments mark the lines M-09, adjacent to the S-01
third-shift block as the plan intended. Register: procedural authority,
citation-flavor, grudge memory — all three present. rc-sector-laws-4242 green.

Foreign note (not rejectable): the same file carries S-block row appends
(S-01…S-05 comments) and unmarked copyedits to shipped `distress` lines across
~10 factions (periods → em-dashes/colons). Those hunks belong to other in-review
rows; M-09's hunks are clean additive tails. Flagged for the S-block reviewer.

## Sweep check

Every hunk in the eight M-block data files was read. No foreign work swept into
M-block rows; no M-block hunk damaged foreign work (`shipCarriesModule` AL-LG-11
clause intact; encounters/401–429/536 edits untouched; `index.generated.js`
8201–8205 imports untouched). Known foreign noise left alone.

## Summary

| Row | Verdict |
|-----|---------|
| M-01 | APPROVE |
| M-02 | APPROVE |
| M-03 | APPROVE |
| M-04 | REJECTED → FIXED (golden re-pin) → APPROVE |
| M-05 | APPROVE |
| M-06 | APPROVE |
| M-07 | APPROVE |
| M-08 | APPROVE |
| M-09 | APPROVE |

Round 2 of 3: **APPROVED** (one real defect found and fixed in review —
the bounty-mark golden re-pin in `test/bounty-mark-posting.test.mjs`).
Not committed, per instructions.
