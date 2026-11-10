<!-- LIFETIME: CAMPAIGN -->
# Round 4 — Debater C re-ratification after tally correction (Continuity)

Orchestrator corrected the tally to the protocol formula (keeps = direct KEEP/HONE votes + MERGE
votes received one-hop; merge sources fold unless independently surviving on direct keeps) and
recomputed. This file verifies the delta against my sole round-4 objection (SP3-180) and re-checks
every held attack and concession on the corrected artifacts: CONSENSUS_INDEX.md read whole (523
lines), CONSENSUS_500.md at the named entries plus tail, CONSENSUS_500.json per-record.

## Delta verification

**Claim 1 — SP3-180 inserted at rank 80. CONFIRMED.**
- Index line 81: `80 | SP3-180 | comms-event | data+glue | 4/0 | The Toll of Names` — the keeps=4
  tier (ranks 44–80, 37 entries) closes exactly where the protocol formula puts it, above all 420
  keeps=3 rows.
- CONSENSUS_500.md entry `### 80. SP3-180 - The Toll of Names`: Drift Wake evening trigger; the
  witness-pause content is intact ("if the player witnessed that death the reading pauses — a full
  two-second silence with the name held on screen — before continuing. Nobody else's names get the
  pause."); `Votes: 4 keep / 0 kill`; MERGED FROM: SP3-112 (The Roll Call) with both cross-merge
  directives (A: "flipping my round-2 direction to match B - the witness pause is the memorable
  half"; B: "the roll call's payload; SP3-180 keeps the witness pause"), plus the merge-target hone
  "(SP3-112 via c) ... only names the player personally saw die get the two seconds."
- JSON record rank 80: `keeps: 4, kills: 0`, same `sees`, hones, and `mergedFrom: [SP3-112]`. My
  objection noted the id was missing "even from the JSON's mergedFrom records" — the insert is now
  recorded there exactly as filed.
- Keeps column recomputed: SP3-002 prints 15/0 (the rule value; the deviant column printed 7),
  SP3-144 7/0; tiers descend strictly 15, 9, 7, 7, 6×32, 5×7, 4×37, 3×420 = 500. The 73-row
  deviation I flagged is corrected at every spot checked.

**Claim 2 — SP3-047 to bench head, SP3-195 off the 520. CONFIRMED.**
- Index: build rank 500 = SP3-041 "The Curtain Rises"; bench `501 | SP3-047 | encounter | data |
  Front Riders`; bench tail 520 = SP3-175; CONSENSUS_500.md bench section matches row for row.
- SP3-195 appears nowhere in the index's 520 rows (only SP1-195 and SP2-195 exist) and not in the
  md build tail or bench. It fell off exactly as my filed swap required, via the recompute's
  knock-on (SP3-047 taking bench slot 501). Net effect on the build 500 is identical to the filed
  swap: SP3-180 in, SP3-195 out.

**Claim 3 — no other membership change. CONFIRMED (membership and titles; ranks shift as the
recompute mechanically requires).**
- Three of my ratified ranks in the keeps=3 block shifted by exactly +1 from the insert:
  SP1-003 209→210, SP2-100 157→158, SP3-028 304→305. Ranks 1–4 unchanged. Build 500 + bench 20.
- The keeps=4 tier moved as a block (SP2-091 27→58, SP1-087 30→61 — same relative order, same
  three-rank gap), which is the direct consequence of recomputing the column I demanded; within-
  tier ordering remains latitude I accepted in round 4. Constraint counts move exactly as my
  objection predicted (comms-event 79→80; JSON kindDistribution agrees).
- No objection: claim 3's "unchanged in rank" is true of membership, titles, and relative order;
  literal rank numbers necessarily move under the filed recompute.

**Held attacks — re-checked on the corrected artifacts:**
- SP1-087 lands as its own entry (rank 61, 4/0, "The Falling Anchor"), not conflated into another
  id; SP3-126's content rides it (hones a/b: reentry fire-line on impact day, pool pays pocket
  change, crater persists). SP3-126 itself stays a keeps=2 rule-death folded there — the outcome I
  ratified in round 4, unchanged.
- SP3-144 present (rank 4, 7/0) with my layering hone verbatim: the whistle leads (SP3-183), the
  per-type handoff liturgy follows (SP2-087), the four-note time signal rides underneath as the
  clock — one audible fabric per station.
- SP2-091 present (rank 58, 4/0, "The Confessional Booth") carrying SP1-165's
  Heard/Weighted/Absolved voice (HONE b) and my two-sacraments hone (c) with the late-letter
  read-back; SP1-165 survives as that preserved fold, as already ratified.
- SP2-069 absent — not among the 520 rows in index or md. It died keeps=1/kills=2; the round-3
  rebuttal revival did not move a vote, so absence is rule-correct.

**Concessions hold.** All 10 conceded kills absent from the 520: SP1-050, SP1-098, SP2-013,
SP2-014, SP2-055, SP2-059, SP3-046, SP3-099, SP3-156, SP3-166 (adjacent-id rows present at the
expected slots). All 8 SPX-C proposals present in the build: SPX-C-01@77, SPX-C-02@59, SPX-C-03@45,
SPX-C-04@56, SPX-C-05@60, SPX-C-06@54, SPX-C-07@65, SPX-C-08@52.

The single objection is resolved exactly as filed: correct root cause (keeps-column deviation),
correct remedy (protocol-formula recompute), correct membership delta (SP3-180 in with mergedFrom
SP3-112; SP3-195 out), witness-pause roll-call content preserved in md and JSON. Nothing else moved
that the rule does not compel.

VERDICT: RATIFY
