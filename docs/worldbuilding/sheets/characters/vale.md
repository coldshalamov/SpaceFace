# Character Sheet — Director Vale (Antagonist)

```yaml
id: npc_vale
name: Director Vale
role: Concord Auxiliary, Mid-Sector Administrative Division, Logistics Oversight
         (the real division: Atmospheric Logistics Allocation)
station_sector: world_helios (S1, Helios Prime — Logistics Oversight offices)
faction: faction_scn
voice_register: |
  None in person. Vale has no face, no gender pronoun, no physical description
  (design note: not coyness, accuracy — "a signature on a document you had to
  look very hard to find"). One direct line, ever: "Good work. Keep it clean."
the_tell: |
  The initial. "D." on contract authorizations; "V. Director, acting" on the
  B4 clearing-station records. The initial that makes it legal without making
  it a choice.
private_motive: |
  None theatrical. Vale is a practical person who understands what the system
  is and has concluded that understanding what the system is requires
  participating in it, which requires not thinking too hard about what
  participation means. The gray man at the desk.
what_they_do_not_know: |
  Nothing — and the audit's structural fix means this is now accurate. Vale
  does not choose which sector's air gets cut. The allocation algorithm flags
  underutilized assets and *recommends* reallocation; the recommendation
  crosses Vale's desk, and Vale initials it, because refusing would cost effort
  Vale has no reason to spend. The algorithm chose the Pit. The algorithm
  chooses every cycle. The signature makes it legal. The signature does not
  make it a choice.
dostoyevsky_layer:
  theme: crime_without_punishment_system_stolen + the_double
  expression: |
    Vale is the signature that files the crime as lawful — the system-stolen-
    punishment made into a job title. Vale is also the player's future double
    in Choice A: the warm room and the food that doesn't taste like an
    apology, reached by signing the orders.
  where_it_lands: B1 (authorization line), B3 (comms popup), B6 (47-A settlement offer), B7 (Choice A mirror, "Good work. Keep it clean.")
graffiti: []   # Vale generates no graffiti. Vale generates reference codes.
canon_refs:
  - ../story/ANTAGONIST-THE-ADMINISTRATOR.md   # authoritative prose bio
  - ../story/STORY-SPINE-NARRATIVE-OVERLAY.md#b3-bigger-boat   # sighting schedule
  - ../vibe/vibe-04-the-pit.md#the-resource   # allocation algorithm
  - ../DOSTOYEVSKY-LAYER.md#crime-without-punishment-system-stolen
  - ../DOSTOYEVSKY-LAYER.md#the-double
appears_in_chapters: [B1, B3, B4, B5, B6, B7]
```

## Quick facts

- **Division:** Atmospheric Logistics Allocation, buried in the org chart under "Logistics Oversight." Decides which stations receive recycler maintenance budget each cycle. This is the allocation that decides whether a station breathes.
- **The mechanism:** a sector that can't move ore accumulates ATMO DEBT → doesn't get recyclers serviced → Silt degrades to Chalk → CO₂ rises → Slow Gray → less productive → more debt → cycle closes. Vale processes the reversion when the sector becomes uninhabitable. The paperwork is always correct.
- **The sighting schedule:** B1 authorization line ("APPROVED: VALE, D. / MID-SECTOR ADMIN / REF 44-C") → B3 comms popup (forwarded through four stations, one is Gate 3) → B4 clearing-station "V. Director, acting" → B5 "VALE HOLDINGS LLC" registry → B6 "D. VALE / ADMIN / PRIORITY" settlement → B7 ledger line item under BENEFICIARY + "Good work. Keep it clean."
- **What happens to Vale:** nothing. Vale continues to administer. In Choice A, the player's name appears above Vale's on the first Concord Auxiliary document. The system runs fine.
