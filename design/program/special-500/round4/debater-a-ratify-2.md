<!-- LIFETIME: CAMPAIGN -->
# Round 4 pass 2 — Debater A delta verification (the Builder)

Scope: verify the orchestrator's corrected tally (tools/tally.mjs: merge votes count one-hop toward
target keeps; merge sources fold unless independently surviving on direct keeps) against the single
objection filed in round4/debater-a-ratify.md. Read in full or in the named part:
DEBATE_PROTOCOL.md, CONSENSUS_INDEX.md (all 520 rows + header), the rank-80 entry of
CONSENSUS_500.md, the SP3-180 record in CONSENSUS_500.json (header counts, build entry, bench), the
FINAL-BALLOT and MY-500 sections of all three round3 files, and tools/tally.mjs.

## Delta verification

**Method.** Independent in-memory re-run of the protocol formula over the three round3 FINAL
ballots (630-id pool parsed exactly as tools/tally.mjs parses it: keeps = KEEP + HONE votes +
one-hop MERGE votes received; survive iff keeps >= 2 and keeps > kills; merge sources fold unless
they independently survive on direct keeps >= 2; merge cycles resolve to their strongest member;
order by keeps desc then sum-of-MY-500-ranks asc with the 550-penalty; cap fill kind 25-120,
bespoke <= 160, data/data+glue >= 45%; title dedupe). The recomputed 520 was diffed rank-by-rank
against CONSENSUS_INDEX.md: zero mismatches — all 520 rows identical in id and title. The produced
list is exactly the corrected mechanics; no membership beyond the claimed delta exists.

**Delta fact 1 — SP3-180 restored.** FINAL votes: on SP3-180, A HONE + B KEEP + C MERGE->SP3-112;
on SP3-112, A MERGE->SP3-180 + B MERGE->SP3-180 + C HONE. keepsOf(SP3-180) = 2 direct keeps + 2
one-hop merge receipts = 4, kills 0 — index row 80 reads "80 | SP3-180 | comms-event | data+glue |
4/0 | The Toll of Names". The "### 80." entry in CONSENSUS_500.md shows "Votes: 4 keep / 0 kill",
two HONE directives, and "MERGED FROM: SP3-112 (The Roll Call)" carrying both merge reasons (a and
b); the entry body is the folded SP3-112 roll-call sequence with the witness pause, and the JSON
record matches (keeps 4, kills 0, hones[2], mergedFrom[SP3-112]). SP3-112 (1 direct keep — C's
HONE — under the 2-keep floor) is absent as a standalone and correctly folded, exactly as my
objection stated ("dies under every reading").

**Delta fact 2 — SP3-047 displaced.** SP3-047 (encounter, data) sits at bench head, index row 501;
build rank 500 is now SP3-041 "The Curtain Rises" (3/0).

**Delta fact 3 — knock-on.** The bench is 20 entries; former tail SP3-195 fell off the 520 (absent
from index, JSON bench, and the recompute). New bench tail: 520 | SP3-175 "The Broken Clock".
Correction to my own filed text, not to the delta: my objection's parenthetical named SP3-149 as
the exiting id — wrong on my side; SP3-149 "The Toll Echo" shifted 501 -> 502 and stays on the
bench. The mechanical consequence of my own concrete swap (insert SP3-180 at rank 80; SP3-047 to
bench head) is exactly this tail-drop, so the applied delta stands and this raises no new
objection.

**Delta fact 4 — nothing else moved.** The exact 520-row reproduction from the FINAL ballots
confirms ranks and titles for all other 499 build entries. Spot-checks: SP3-180 present at 80;
SP3-112 absent standalone (folded into SP3-180 with receipt); SP3-047 bench 501; SP3-195 absent;
SP1-048 absent; SP2-013 absent; SP3-156 absent; SP3-002 still rank 1 (15/0, The Umbra Minute);
all 12 SPX-A proposals present (ranks 64-79).

**A's stated condition — kind caps stay legal.** Kind distribution over the 500 build entries:
encounter 65, oneoff-mission 65, easter-egg 92, anomaly 62, comms-event 80, visual-setpiece 71,
world-oneoff 65 — every kind within 25-120 (and matching my filed prediction: encounter 66->65,
comms-event 79->80). Effort: data 67 / data+glue 273 / bespoke 160 — bespoke at but not over the
160 cap; data + data+glue = 340/500 = 68% >= 45%. Build 500 + bench 20; survivors 572 of pool 630.

The claimed delta matches the objection I filed in every operative particular: the one repair I
demanded was applied, the fold receipt and hones are carried, the kind caps are legal, and the
list is otherwise exactly what the corrected protocol formula produces from the round3 FINAL
ballots.

VERDICT: RATIFY
