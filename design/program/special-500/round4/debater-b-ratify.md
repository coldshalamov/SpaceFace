<!-- LIFETIME: CAMPAIGN -->
# Round 4 — Debater B ratification (the Curator)

## Verification

**Tally mechanics (reproduced exactly).** I re-implemented `tools/tally.mjs`'s selection logic
in-memory against the three round-3 FINAL-BALLOTs and MY-500s and compared the result with the
shipped catalog: the 520-rank order matches on-disk `CONSENSUS_500.json` with zero differences,
and keeps/kills match for all 500 build entries. The count is honest.

**My round-3 contested positions.**

- All ten of my FINAL-BALLOT kills are absent from build and bench: SP1-048, SP2-016, SP2-055,
  SP2-059, SP2-069, SP2-145, SP3-071, SP3-099, SP3-156, SP3-166. SP3-046, SP2-013 and SP2-014
  died 2-1 on votes (A and C KILL; verified in their ballot lines) — the rule working as agreed.
  Four ids I killed (SP2-016, SP2-145, SP1-048, SP3-071) actually survived the vote at keeps=2 and
  were then cut by score — my kills won in effect either way.
- SP1-098 (my round-3 HONE flip) is absent. I chased this as a suspected tally error: it survived
  the vote (A HONE, B HONE, C KILL = keeps 2 / kills 1) but sorts at position 562 of 565 — all 558
  keeps=3 entries outrank the keeps=2 band regardless of rank-sum, and C's kill adds the 550
  MY-500-absence penalty to its rank-sum (1177 vs the ~1360+ cut line). Cut by the agreed rule,
  not by error. I record the loss, not an objection: the de-prophecied echo beat dies with the
  mechanical rule I signed.
- Merge targets: all 47 targets I voted MERGE into carry their sources in `mergedFrom` with
  vote-attributed reasons — spot-checked SP3-002 (SP1-158, SP1-162, SP3-015, SP3-172), SP1-097
  (SP2-089, SP1-190), SP1-030 (SP2-142, SP2-158), SP3-024 (SP1-149), SP3-005 (SP1-068),
  SP1-001 (SP1-015), SP1-103 (SP1-017), SP1-093 (SP3-148), SP3-144 (SP2-087, SP3-183), and 38 more.
- My SPX-B proposals: all ten present (SPX-B-01 @9, -02 @15, -03 @8, -04 @22, -05 @14, -06 @17,
  -07 @41, -08 @33, -09 @12, -10 @25). All 30 SPX ids are in the catalog.
- My hones rode along: SP3-028 carries "keep ONLY fully decoupled from the eclipse"; SP2-100
  carries the one dry legibility line; SP3-024 carries "the sift" plus the hard daily ice cap;
  SP1-093 carries SP3-148's full audio-null as zone grammar; SP2-190 carries the capped
  re-withhold popup; SP3-048 absorbs SP3-194's jingles into one chime grammar.

**Variety audit.** Kind distribution (build): encounter 66, oneoff-mission 65, easter-egg 92,
anomaly 62, comms-event 79, visual-setpiece 71, world-oneoff 65 — all inside 25–120. Effort:
bespoke exactly 160 of 520 (cap is ≤160; the three bespoke casualties of the cap are SP1-106,
SP1-055, SP3-154 — correctly skipped, not benched), data/data+glue 68% (≥45%). Sectors: 24
distinct sector tokens, nine anchors at 25–51 entries and 15 thin sectors at 1–6 (Dione, Eris
Margin, Orcus Shadow, the Bolus among them) — the thin-sector coverage my SPX-B batch was written
for exists. Top-60 spans all 7 kinds and 14 sectors. Pacing: first-hour texture in the top 15
(SPX-B-01/02/03), early-save beats (SP2-062, SP2-086, SP1-199's first-hull key), save-long arcs
(SP1-103), yearly cadence (SP3-002 once per 40-day year), decade cadence (SP2-116), late letters
(SP2-091). No breach found; no clone families survived — the eclipse stack, numbers stations,
comet window, Ring Rain, silence and bell families each collapse to one anchor.

**Player-experience spot-check, ranks 1–60.** Reads like moments, not features: The Umbra Minute
(a scheduled 45 seconds where the lonely lights take the frame), The Slow Kiss (an obituary for a
collision nobody caused), The Deck Chair (an unmarked rest stop in thin Dione), Dorin's Dead Drop
(fines written before you arrive, both outcomes honest), The Half a Conversation (pauses sized for
answers), Origin Unspecified ("PROVENANCE: HONORED"), The Last Ferry (half-towing for years),
The Census of One (counted, gently, your name underlined). Mood mix holds wonder, dry bureaucratic
wit, grief, warmth and dread; nothing in the top 60 is a stat screen in a lore coat.

**One non-blocking note.** Bench entries in the JSON omit keeps/kills fields (the index likewise).
They are keeps=3 survivors cut by score, so nothing rests on the missing numbers — cosmetic only.

## VERDICT

RATIFY
