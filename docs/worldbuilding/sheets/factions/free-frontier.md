# Faction Sheet — Free Frontier

```yaml
id: faction_free
name: Free Frontier
type: brokers' compact / independent captains' guild
sector: contested band (no headquarters; the clearing station is their front)
voice_register: |
  Nobody's. The Frontier has no customs arm, no song, no flag — only a
  contract board door at the B4 clearing station. The door says FREE CAPTAINS.
  The freight says whatever the Quiet vetted it to say.
the_tell: |
  Every captain on the board believes they are temporary. It is the only
  faction whose members all believe that. None of them are.
what_they_are: |
  A brokers' compact of independent captains with no customs arm of their own.
  The Quiet vets their freight (Mira processes the runs on the back end).
  The Reach recruits their bankrupt graduates. The Frontier is the sector's
  gig-economy hall: temporary work that stays temporary, which is the product,
  and the product is the trap.
what_they_believe: |
  That independence is real. That the next run is the one that changes things.
  That temporary is a phase, not a condition. The belief is the Frontier's
  only export, and the belief is wrong, and the wrongness is what the Reach
  harvests.
what_they_do_not_know: |
  That the Quiet's freight-vetting is the same machinery that files the
  re-categorizations (B1), and that the "discreet route" they fly is the same
  route the mole's channel uses, and that the independence they cherish is a
  line item in a brokerage that treats them as a revolving door. The bankrupt
  go to the Reach. The lucky go back to the board. The door does not close.
dostoyevsky_layer:
  theme: the_temporary_that_isnt
  expression: |
    The faction whose tragedy is that every member believes they are passing
    through. No one is passing through. The door is a turnstile. The belief
    in temporary status is the mechanism that prevents organizing, which is
    the mechanism that prevents change, which is the mechanism that keeps the
    freight moving. The Frontier is the gig economy rendered as a faction.
  where_it_lands: B4 (the Free Captains door), B6 (Mira's back-end processing)
graffiti:
  - "FREE CAPTAINS DOOR. THREE TOOK IT. TWO CAME BACK. ONE JOINED REACH."
  - "TEMPORARY IS NOT A PHASE. IT IS THE PRODUCT."
canon_refs:
  - ../../CREATIVE-DIRECTION.md  # §6 R9
  - ../orgs/factions-CANONICAL.md
  - ../story/chapter-04-pick-a-side.md  # the Free Captains door
  - ../story/CONTEMPORARY-HISTORY.md  # §3 Free Frontier
appears_in_chapters: [B4, B6]
```

## Notes

- R9 settles the B4 contradiction (Free Captains door: Reach vs Quiet vs Free Frontier). The door
  is the Free Frontier's. The freight is Quiet-vetted. The bankrupt graduate to the Reach. Three
  answers, one truth.
- `faction_free` exists in live faction data (`src/data/factions.js`). This sheet is its canon.
- The Free Frontier is the only faction that cannot be joined permanently, because joining
  permanently would be admitting the work is not temporary, and the work is never temporary, and
  the admission is what the door prevents.
