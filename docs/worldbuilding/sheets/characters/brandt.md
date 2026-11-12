# Character Sheet — Brandt (The Karla Mirror)

```yaml
id: npc_brandt
name: Brandt   # surname only; no first name, no gender pronoun in canon
role: |
  Defected Concord Intelligence officer, now runs the Routers — the Quiet's
  intelligence cell in the Veil Nebula. The adversary on the other side of
  the river. Marsh's former classmate. The buyer (via the Quiet) of the first
  Vethari fragment fourteen years ago — the "man who paid well and didn't
  give a name" that Callum sold to.
station_sector: world_veil (S8, Veil Nebula — the Routers' salon, a converted cargo hold with the best air in the outer sectors)
faction: faction_quiet   # defected from Concord Intelligence to the Quiet fourteen years ago
voice_register: |
  The mirror of the Reading Room. Measured, educated, never raised — but the
  Routers' salon has the hum of the nebula behind it, and Brandt's cadence
  carries the conviction of someone who made the harder choice and has had
  fourteen years to polish the reasoning. Brandt speaks in the same grammar
  as Marsh. They learned the grammar in the same room.
the_tell: |
  Brandt's tell is that Brandt is right about the diagnosis. Concord is too
  corrupt to survive. The allocation system is a slow murder. The Quiet's
  business (the ATMO TOKEN brokerage) is the system's true business. Brandt
  is correct about all of it. Brandt is wrong about the cure — the Quiet's
  brokerage profits from the disease it treats, and Brandt has structured
  the Routers to defend the disease because the disease is the Quiet's
  revenue. The tell is the gap between the right diagnosis and the self-
  serving cure.
private_motive: |
  Brandt defected because the first Vethari fragment proved Concord would
  never acknowledge inconvenient evidence. Brandt concluded the Quiet — the
  gap-fill the system created and refuses to acknowledge — was the only
  honest actor, because the Quiet's business IS the system's true business.
  Brandt has spent fourteen years building the Routers into a policy layer
  that decides which sectors breathe (by deciding which tokens to broker at
  markup). Brandt believes this is harm reduction. The Routers' books show
  it is also revenue.
what_they_do_not_know: |
  Brandt does not know (or refuses to know) that the Quiet's harm-reduction
  argument is the same argument the Reading Room uses to justify keeping the
  Vethari file unresolved. Both salons have convinced themselves they are
  the adults in the room. Both salons produce the Slow Gray downstream. The
  mirror is exact. Brandt, who defected to escape the Reading Room, has
  rebuilt the Reading Room on the other side of the river, with better air
  and a hum instead of coffee.
dostoyevsky_layer:
  theme: the_double   # the adversary who is the protagonist's mirror
  expression: |
    Brandt is Marsh's double — the version who made the other choice in the
    same year, over the same evidence. The Cold War between them is also the
    friendship that ended. The mole hunt is the letter they never wrote.
lecarre_layer:
  theme: the_mole_and_the_mirror
  expression: |
    Brandt is the Karla mirror. The brilliant adversary who believes the
    opposite of what Marsh believes and is the more effective for it.
    Brandt receives Aldiss's file-status leaks and uses them to keep the
    Vethari evidence suppressed — because acknowledging alien life would
    destabilize the allocation system the Quiet's brokerage feeds on.
    Brandt was the buyer of the first fragment (via the Quiet, via Callum).
    Brandt is the channel the mole Aldiss reports to.
  where_it_lands: B5 (the Callum buyer reveal — "the man who paid well and didn't give a name" was Brandt), B7 (the ledger names the channel)
graffiti: []   # Brandt generates no graffiti. Brandt generates ATMO TOKEN positions.
canon_refs:
  - ../LECARRE-LAYER.md#the-mole-and-the-mirror
  - ../LECARRE-LAYER.md#the-salon-and-the-grubby-work
  - ../story/STORY-STRUCTURE.md#b5-proving-ground   # Callum's buyer
  - ../DOSTOYEVSKY-LAYER.md#the-double
appears_in_chapters: [B5, B7]   # discoverable via the Callum trace; named at B7
```

## Quick facts

- **The buyer.** Callum's "man who paid well and didn't give a name" (`STORY-STRUCTURE.md#B5`). The first fragment, fourteen years ago, was bought by the Quiet on Brandt's authorization. Callum has been an unwitting node in the mole network for fourteen years — the civilian broker who moved the evidence without knowing what it was or who was receiving it.
- **The mirror salon.** The Routers operate out of a converted cargo hold in the Veil Nebula with the best air in the outer sectors. The Vael built their own recyclers; the Quiet, brokering tokens, can afford to run the same. The Routers' salon is the Reading Room's mirror: bound inquiry reports, a long table, three analysts, measured voices. The hum of the nebula instead of coffee. Both rooms produce the same downstream outcomes.
- **The defection.** Same year, same fragment, opposite directions. Marsh stayed to fix the service. Brandt left to fix the world. Both fixes failed. The fourteen-year silence between them is the mole hunt's other name.
- **No face, no pronoun.** Same discipline as Vale and Marsh. "Brandt" is a surname.

## Design note

Brandt is the Le Carré adversary as the corpus requires: right about the diagnosis, wrong about the cure, never caricature, never a villain. The Quiet's brokerage IS harm reduction in the outer sectors — without the Routers, sectors would fall into the Slow Gray faster. The brokerage is also the revenue stream that gives the Routers a structural incentive to keep the system failing. Both facts are true. Brandt has lived inside both facts for fourteen years and has stopped noticing the contradiction, the way Drift stopped noticing that "the moisture loss will retire him" is one sentence with two meanings.
