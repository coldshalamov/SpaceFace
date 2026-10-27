<!-- LIFETIME: CAMPAIGN -->
# Round 4 — Debater C ratification (Continuity)

Round 4 protocol read; CONSENSUS_INDEX.md read in full (520 rows); CONSENSUS_500.json consulted
per-id; my round-3 FINAL ballot used as the reference; and — because ratification is a check of the
tally, not of taste — I recomputed the mechanical rule independently from the three round-3
FINAL-BALLOT sections (parse: 630 ids, 630 votes per debater).

## Verification

**My conceded kills (10) — absent, as conceded.** SP1-050, SP1-098, SP2-013, SP2-014, SP2-055,
SP2-059, SP3-046, SP3-099, SP3-156, SP3-166 appear nowhere in the index or the JSON. Correct.

**My SPX-C proposals (8) — all present.** SPX-C-01…08 at ranks 6, 16, 18, 23, 28, 29, 37, 65, each
4/0. Correct.

**Held attacks — checked each against the vote record, not the outcome:**

- Landed as separate entries: SP1-087 (rank 30, 4/0), SP3-144 (rank 4, 5/0 — my layering hone
  recorded verbatim as hone (c): whistle leads, liturgy follows, clock underneath; SP2-087 and
  SP3-183 died keeps=1 under the rule, A and B having both merged them in — rule-correct, and the
  layered fabric is what I asked for), SP1-003 (rank 209), SP2-100 (rank 157), SP3-028 (rank 304),
  SP2-091 (rank 27). Correct.
- Cut by the rule with content preserved: SP1-015, SP1-165, SP3-126, SP1-190, SP2-043, SP2-197 each
  finished FINAL-ballot keeps=2 (I held; one of A/B held with me; the third merged away). Keeps=2
  ranks below the 559 keeps≥3 survivors that fill all 520 slots, so their absence is the mechanical
  rule working, not a tally error — and each is recorded as a mergedFrom fold carrying the canon
  content: SP1-015→SP1-001 ("examiner folds in as the Concord variant"), SP1-165→SP2-091 (with my
  two-sacraments hone on SP2-091), SP3-126→SP1-087 (reentry fire-line), SP1-190→SP1-097,
  SP2-043→SP1-191, SP2-197→SP2-007. No objection — I agreed to the rule.
- SP2-069: died keeps=1 / kills=2 (A flipped to KILL in round 3; B KILL in both rounds). My
  cross-referenced repair failed to move either vote; rule-correct death.

**Independent recount.** FINAL-ballot-only tally: 573 survivors (keeps≥2 and keeps>kills). All 520
listed entries pass the survival rule — zero listed entry violates it, and no entry that received a
FINAL kill vote is listed. Order mismatches vs my recomputation (517 rows) come from the unspecified
MY-500-sum convention for ids absent from a MY-500 (and B's MY-500 having 501 lines); within-tier
ordering is latitude I accepted, not a defect.

**The one hard membership error: SP3-180.** FINAL ballots: A `SP3-180 | HONE`, B `SP3-180 | KEEP`,
C (me) `SP3-180 | MERGE->SP3-112`; and both A and B voted `SP3-112 | MERGE->SP3-180`. By the rule,
keeps(SP3-180) = KEEP + HONE + MERGE votes received = 1 + 1 + 2 = **4, kills 0**. Keeps-first
sorting places SP3-180 above every one of the 469 keeps=3 entries in the list (43 keeps≥5 and 6 of
7 keeps=4 survivors are all present). SP3-180 is absent from the index, the bench, and the JSON
entirely — not even a mergedFrom record — so the witness-pause roll-call content (Drift Wake "The
Toll of Names", with SP3-112 as its cross-merge twin) is lost from the catalog. This is
convention-independent: score sums only order entries within a keeps tier.

**Root cause, for the record:** the printed keeps column deviates from the protocol formula
(keeps = KEEP + HONE + MERGE-received on FINAL ballots) on 73 of 500 build rows — it appears to
count distinct keepers plus merged sources (SP3-002 prints 7; the rule gives 15). Under the deviant
figure SP3-180 scored as a keeps≈3 and fell below the score cut. I verified the deviation has no
OTHER membership consequence: every other keeps≥4 FINAL survivor is present, and all 520 listed
entries validly survive. The column should be recomputed per the protocol formula when the swap
below applies.

**Hones.** 27 ids spot-checked (SP1-111, SP1-155, SP2-157, SP2-190, SP3-092, SP3-095, SP3-108,
SP3-129, SP3-143, SP3-199, SP2-091, SP1-115, SP1-028, SP2-118, SP2-120, SP2-127, SP2-128, SP3-053,
SP1-100, SP2-050, SP1-001, SP1-087, SP2-086, SP3-024, SP3-002, SP1-053, SPX-C-03): every registered
hone is on its id verbatim (mine labeled (c); adopted hones credited "(C)" / "adopted from C");
every merge target carries mergedFrom with the fold directive. SP3-002's mergedFrom is exactly the
eclipse family (SP1-158, SP1-162, SP3-015, SP3-172); SP3-024 carries SP1-149 per the 2-1 hold I
joined. Correct.

**Canon audit.** Every load-bearing proper name verified against live src/data: Vael, Concord,
Scissorwake (enemies.js/oneOffCast.js), Rubric (rubric.js), Bracket (bracket.js), the machine-people
four (Morrow/Vesper/Quill/Ruud), Wren, Senna, Understory, Kurtz, Maera Vols, Voss, and the moon
names (Eunomia, Haumea, Sedna, Triton, Orcus, Phoebe, Nereid, Proteus, Hyperion, Kepler, Dione).
Titles that contradicted canon or register (the "Drift Choir" borrowings on SP3-092/SP3-108/SP3-143/
SP2-157, "The Brood Mare", "Sable Iask", the Wren-coincidence in SP3-129, the SP3-199 meta "500s")
all carry registered rename/verify hones on their ids — the index prints round-1 titles; the
directives live on the entries where the build will read them. No invented faction mashup, no
unique-wreck collision, no campaign-47a contradiction found without its corrective hone.

**Constraints.** Kinds: encounter 66, oneoff-mission 65, easter-egg 92, anomaly 62, comms-event 79,
visual-setpiece 71, world-oneoff 65 — all within 25–120. Bespoke exactly 160 ≤ 160 (bench adds
none). data + data+glue = 340/500 = 68% ≥ 45%. Distinct sectors ≥ 10. Build 500 + bench 20. All
hold; the swap below preserves them (comms-event 79→80, world-oneoff 65→64, data+glue +1).

## VERDICT

OBJECTIONS

OBJECTION | SP3-195 | SP3-180 | Tally error: SP3-180 "The Toll of Names" has FINAL-ballot keeps=4 (A HONE + B KEEP + MERGE votes received from A's and B's `SP3-112 | MERGE->SP3-180` lines), kills=0 — under the agreed keeps-first sort it ranks above all 469 keeps=3 entries listed, yet it is absent from the index, bench, and JSON entirely. Remove SP3-195 (rank 520, bench tail — the lowest-scored keeps=3 occupant) and insert SP3-180 (lands in the keeps=4 tier, ~ranks 44–50). On insert, record mergedFrom SP3-112 (the cross-merge: A's and B's MERGE->SP3-180 plus my MERGE->SP3-112) so the witness-pause roll-call content survives in the catalog. Also recompute the keeps column per the protocol formula (73 rows currently deviate; SP3-002 is 15 by the rule, printed 7) — no other membership consequence (verified).
