<!-- LIFETIME: CAMPAIGN -->
# Round 4 — Debater A ratification (the Builder: feasibility / seams / performance / determinism)

Read in full: `DEBATE_PROTOCOL.md` (Round 4 + mechanical rule), `CONSENSUS_INDEX.md` (all 520 rows),
my `round3/debater-a-final.md`, the header counts and ~35 selected entries of `CONSENSUS_500.json`,
the FINAL-BALLOT lines of `round3/debater-b-final.md` and `round3/debater-c-final.md` for every
contested id, and `tools/tally.mjs` (the applied mechanics). Independent recomputation of the full
tally from the three FINAL ballots was run and diffed against the produced list.

## Verification

**My kills — all honored.** SP2-013, SP2-014, SP2-069, SP3-046, SP3-156, SP3-166 are absent from the
520. The resolutions I argued for all landed: one numbers station survives (SP3-168, rank 496, the
forecast verb), one Silence (SP1-093, rank 19, with SP3-148 folded in), and SPX-C-03 (rank 6)
replaced SP3-156.

**My merges — all honored.** All 47 of my MERGE sources are absent; every named target is present
with its `mergedFrom` receipt. Spot-checked: SP3-002 (rank 1, 7/0, carrying all four eclipse legs
SP1-158/SP1-162/SP3-015/SP3-172), SP1-030 (rank 3, 5/0, both fraud legs), SP3-144 (rank 4, 5/0,
SP2-087 + SP3-183), SP2-007 (rank 5, 4/0, SP2-197's receipt recorded even though SP2-197 itself
sits below the cut exactly as I predicted in round 3), SP1-097 (rank 2, 5/0), SP1-103 (rank 13),
SP1-063 (rank 11), SP1-062, SP1-004, SP1-093, SP1-159, SP2-086, SP1-199, SP1-056, SP1-084,
SP2-062, SP1-002, SP3-019, SP3-003, SP3-005-adjacent folds, SP3-006, SP3-010, SP3-012, SP3-024,
SP3-044, SP3-048, SP3-051-family, SP3-065 (rank 67, my H-38 sleep-bounds transferred), SP3-081,
SP3-083, SP3-085, SP3-106, SP3-113, SP3-143, SP3-151, SP3-155, SP3-162, SP3-170, SP3-171,
SP3-182, SP1-183, SP1-059. No merge source survived alongside its target anywhere in the 520.

**My hones — carried.** Eighteen directives verified verbatim in the JSON hones arrays: SP3-002,
SPX-C-01, SP1-056, SP1-199, SP3-065, SP2-100, SP1-011 (all three debaters converged on my 12-16
cap), SP3-007 (my gain-envelope correction, adopted by B and C), SP3-031, SP1-137, SP1-115,
SP2-118, SP2-120, SP3-144, SP1-103, SP1-093, SP3-024, SPX-C-05. The rest of my HONE ids are
present in the list.

**Contested holds resolved mechanically, not by fiat.** SP2-059 dies on B kill + C kill (1 keep /
2 kills — C conceded to B in round 3, I accept it). SP1-048, SP1-050, SP1-098, SP2-145 survive the
rule at 2 keeps / 1 kill but sit below the line under the keeps-3 flood (ranks 80-500 are all
3-keeps); SP1-190, SP2-197, SP2-043, SP3-126 were each kept by two debaters but merged out by the
third — the tool removes merge sources from the pool entirely, which is membership-neutral here (I
verified they would sit below the keeps-3 cut regardless). Painful for me in three cases, correct
per the rule in all of them.

**SPX.** All 30 present; my 12 SPX-A at ranks 36-69; both other debaters KEEPed all 30 (verified
per-voter). SP3-156's replacement SPX-C-03 landed at rank 6.

**Constraints hold** (JSON header + independent count): kinds 62-92, all within 25-120; bespoke
exactly 160 of 520 (at cap, legal); data + data+glue 340/500 = 68% (>= 45%); 102 distinct sectors;
exactly 500 build + 20 bench from a 630 pool; no produced entry violates keeps >= 2 and
keeps > kills under my independent recount.

**Top-100 feasibility.** The known seam lie is corrected in the entry: SP3-002 carries my hone
(author as a new mood-overlay data file via beginLookMood/tuneLook + LOOK_POST_UNIFORMS) plus C's
naming the real function. Repo check: `resolveLookPost` (lookMoods.js:339) and
`resolveLookLighting` (lookMoods.js:359) both exist, and beginLookMood / LOOK_POST_UNIFORMS /
contactDeedMemory / weatherMeteors / stationOffsetS / poi_helios_tally / NAMED_CAPTAINS all check
out — so SP3-002 is buildable through a verified seam. Honest note against myself: my round-3
hone's parenthetical "resolveLookLighting does not exist" was too absolute (it exists in
lookMoods.js, not look.js as the original proposal claimed); the operative direction of the hone is
correct and the entry is better for it — not objection-worthy. Other suspicious top-100 seams
(SPx-B-01 lane-rock decal, SP1-056 hull-decal claim, SPX-C-01 berth identity, SP1-199 loadout
ledger, SPX-B-10 berth flags) all carry the corrective hones. No unbuildable entry found in the
top 100.

**Tally deviations found** (from tools/tally.mjs + my recount): (1) the proposer auto-KEEP inflates
all 30 SPX keeps to 4 — ordering-only, no membership effect, noted not pressed; (2) merge-source
removal and the 550-penalty rankSum tiebreak for ids missing from a MY-500 account for ~14 tail
swaps around ranks 389-500 — genuine tiebreak ambiguity I agreed not to relitigate; (3) one real
defect, below.

## VERDICT

OBJECTIONS
OBJECTION | SP3-047 | SP3-180 | Tally error, not a rank preference. By the protocol's written rule (keeps = KEEP + HONE votes + MERGE votes received), SP3-180 "The Toll of Names" (comms-event, data+glue; seam: the SP3-112 roll-call sequence with a witness check against already-recorded chronicler facts) holds 4 keeps / 0 kills - A HONE + B KEEP + two MERGE receipts, since A and B both voted MERGE SP3-112->SP3-180 in the FINAL ballots - and my letter-tally ranks it 80. tools/tally.mjs's cycle dissolution (resolveMerge returns the source for both legs of the A/B: 112->180 vs C: 180->112 fork) zeroed both receipts, dropping it to keeps=2 and out of the 520 entirely - the A+B majority's directly-named merge target was erased while SP3-112 correctly dies under every reading (1 keep). Insert SP3-180 at its letter rank (80); SP3-047 (rank 500, encounter, data) falls to bench 501 and SP3-149 (bench 501) exits the 520; kind caps stay legal (encounter 66->65, comms-event 79->80) and the bench keeps its comms-event spare (SP3-184). I do not press the six additional tail ids my per-vote recount would restore (SP1-055, SP1-106, SP2-162, SP3-124, SP3-133, SP3-154) - those hinge on the per-vote vs per-source receipt reading, which is legitimate interpretive room the orchestrator filled reasonably. The cycle case is different: no reading of "MERGE votes received" yields zero receipts for a target two debaters named directly.

Apart from that one repair, the list is the consensus the process promised, and I ratify it.
