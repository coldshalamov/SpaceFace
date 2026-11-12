# Character Sheet — Mira

```yaml
id: npc_mira
name: Mira
role: sealed-freight handler, Bourse
station_sector: world_io (S4–S5, Bourse freight annex)
faction: faction_quiet
voice_register: working — relay procedural; "Route's clear. Payment on delivery."
the_tell: "Swaps the manifest codes while the comms window stays open on the prior client's channel."
private_motive: |
  Funding a passage offworld — one ticket, one-way, to a system where no one
  has heard of Bourse or the Quiet or her name. She has the ticket picked out.
  She has been two jobs away from it for four years. There are always two more
  jobs.
what_they_do_not_know: |
  The thing that keeps her at the relay is not the money, which is enough.
  It's the suspicion that the moment she stops swapping codes, the system will
  notice she existed. She cannot prove this. The suspicion is the cage. Also:
  her code-swap is the physical pivot of the eight-node ecology — without it,
  the extraction side cannot hand off to the laundering side. She re-registers
  the ongoing skim as "INDUSTRIAL COMPONENTS" under VALE-ALA-47A, riding the
  clean authorization the grid's legal transfer established.
dostoyevsky_layer:
  theme: suffering_as_epistemology_redeemed_and_refused
  expression: |
    The two-jobs-away number is the Underground Man's climb, gentled into hope
    and then frozen there. The ticket stays bought but unclaimed. The cage is
    manufactured entirely inside her head and is therefore the strongest cage
    the system has, because the system didn't have to build it.
  where_it_lands: B1 (the swapped manifest), B6 (the ticket still unclaimed)
graffiti:
  - "THE SEAL WAS NEVER YOURS."                          # inside the cargo hold
  - "MIRA NEVER TOUCHES THE CRATE. THAT'S HOW YOU KNOW WHAT'S IN IT."  # dock, different hand
canon_refs:
  - ../story/NPCs-CANONICAL.md#MIRA
  - ../story/NPC-ECOLOGY.md#the-graph   # "the structural center is MIRA (the physical pivot)"
  - ../DOSTOYEVSKY-LAYER.md#suffering-as-epistemology-redeemed-and-refused
appears_in_chapters: [B1, B6]
```

## Notes

- Mira is `NPC-ECOLOGY.md`'s declared **structural center** (the physical pivot between extraction and laundering). Without her code-swap, the physical transaction breaks. This makes her the most load-bearing of the eight for the system — and the one whose private motive (escape) most directly contradicts her structural role (she *is* the hand-off).
- Mira and Quinn are the work-crew pair (`NPC-ECOLOGY.md` — "two years on the same work crew. They don't talk anymore.").
