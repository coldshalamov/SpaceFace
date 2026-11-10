<!-- LIFETIME: CAMPAIGN -->
# Round 4 (pass 2) — Debater B re-ratification after the SP3-180 correction (the Curator)

## Delta verification

Method: I re-implemented the tally in-memory from the three round-3 FINAL-BALLOTs and MY-500s
(pool 630, 630 ballot lines per debater; I did not execute tools/tally.mjs — it rewrites the
catalog — so the shipped files could not be disturbed) and diffed the result against the
corrected catalog on disk: zero order differences across all 520 ranks, zero field differences
on all 500 build rows (id, rank, title, kind, where, trigger, sees, payoff, seam, effort, keeps,
kills). The corrected catalog is the honest mechanical output of the protocol formula, and my
first-pass ratification conditions are all preserved under it.

Claimed delta, item by item:

- SP3-180 "The Toll of Names" at rank 80, comms-event, data+glue, 4 keeps / 0 kills — verified in
  both CONSENSUS_500.md and CONSENSUS_500.json. The 4 is the protocol formula working (my KEEP +
  A's HONE + the two MERGE receipts from A's and B's `SP3-112 | MERGE->SP3-180` lines); it is
  the last slot of the keeps=4 tier, which matches its rank-sum under C's MERGE-away vote. It
  carries two HONEs (the witness-pause directive via c, A's roll-call anchor) and MERGED FROM
  SP3-112 with vote-attributed reasons. The objection was right: no reading of "MERGE votes
  received" yields zero receipts for a target two debaters named directly, and the exclusion was
  a tally defect, not the rule. I withdraw my first pass's silent acceptance of that state.
- SP3-047 "Front Riders" at bench head 501; SP3-195 absent from index, catalog, and JSON
  entirely — the former bench tail fell off the 520 exactly as claimed.
- All other membership unchanged: every non-SP3-180 id in the build and bench is the same id in
  the same kind and effort as the list I ratified. Kinds now encounter 65, oneoff-mission 65,
  easter-egg 92, anomaly 62, comms-event 80, visual-setpiece 71, world-oneoff 65 — my recomputed
  counts, the on-disk header, and the claimed 65/65/92/62/80/71/65 all agree (comms-event +1,
  encounter -1 via SP3-047). Effort 67/273/160 recomputed = on disk = claimed; bespoke still
  exactly 160 of 520, at cap and legal.

One correction to the delta as narrated, recorded so the file stays honest: the orchestrator also
recomputed the keeps column per the protocol formula (the pre-correction list printed a deviant
count on 73 rows — C's objection named this), so within-list ranks re-sorted broadly beyond the
rank-80 insertion. SP3-002 now prints 15/0 as the written rule gives (was 7/0); SP2-007 sits at
44, not 5; my SPX-B batch reads ranks 47–69, not the 8–41 I recorded from the pre-correction
list. This is membership-neutral — verified above — and the recomputed column is more faithful
to the rule I signed than the list I first ratified, so it is a repair, not a hidden delta. My
first pass's rank citations were accurate for the list as it then stood; the conditions I
ratified were membership, quality, and constraint conditions, and every one of them is checked
again below against the corrected list.

Conditions re-checked under the corrected catalog:

- My ten round-3 FINAL-BALLOT kills remain absent from build and bench: SP1-048, SP2-016,
  SP2-055, SP2-059, SP2-069, SP2-145, SP3-071, SP3-099, SP3-156, SP3-166. SP1-098 (the
  de-prophecied echo beat I chased in pass 1) is still absent — the mechanical loss stands.
- My rank-1 legend entry SP2-012 "The Question, Answered Wrong" is present, now rank 81
  (comms-event, bespoke, 3/0), displaced one rank by the SP3-180 insertion exactly as claimed.
- All 30 SPX ids are in the catalog (A proposed 12, I proposed 10, C proposed 8). My SPX-B-01
  through -10 all present and carry my hones.
- The top-60 still reads as moments, not features: The Umbra Minute, The Slow Kiss, The Deck
  Chair, Dorin's Dead Drop, The Half a Conversation, Origin Unspecified, The Last Ferry and The
  Census of One all hold their places; all 7 kinds appear inside the top 60; the pacing beats I
  named (first-hour texture, early-save keys, save-long arcs, yearly and decade cadence, late
  letters) are all still in build.
- My hones still ride along: SP3-028 (eclipse decoupling), SP2-100 (dry legibility line),
  SP3-024 (the sift), SP1-093 (SP3-148's audio-null), SP2-190 (capped re-withhold popup),
  SP3-048 (one chime grammar) — verified on the entries. Merge receipts intact: SP3-002 at rank 1
  carries SP1-158, SP1-162, SP3-015, SP3-172.

Curator constraints, final state: no kind over 120 (largest easter-egg at 92); bespoke exactly
160 ≤ 160; data + data+glue = 340/500 = 68% ≥ 45%; 102 distinct sectors; 500 build + 20 bench
from a 630 pool; every listed entry survives keeps ≥ 2 and keeps > kills under my recount; no
clone family regained a second member.

The correction did what objections are for: it enforced the rule two of us watched get broken,
cost the list its weakest bench occupant, and changed nothing else it should not have.

VERDICT: RATIFY
