# Character Sheet — Marsh (The Handler)

```yaml
id: npc_marsh
name: Marsh   # surname only; no first name, no gender pronoun in canon
role: |
  Concord Intelligence handler, Reading Room. The "selector" (PROTAGONIST.md:131)
  who placed the second Vethari fragment in Wren's hold six months before B0.
  Running the mole hunt against Aldiss. Brandt's former classmate. Aldiss's
  former student.
station_sector: world_helios (S1, Helios Prime — the Reading Room, behind Logistics Oversight)
faction: faction_scn   # Concord Intelligence (a sub-service, not on the public org chart)
voice_register: |
  Never raised. The Reading Room register: measured, educated, the cadence of
  someone who has never needed volume because the decisions are made before
  the meeting. Marsh's voice is the sound of the salon — coffee that doesn't
  taste like an apology, bound inquiry reports, the long table. Marsh speaks
  in the same grammar as Vale's authorization lines: correct, procedural, the
  syntax of a system that files things rather than feeling them.
the_tell: |
  Marsh does not appear in any contract text, any comms popup sender field, or
  any graffiti. Marsh exists only as the careful absence of a name on the
  things that are clearly being done by someone. The forwarding chain that
  doesn't quite make sense. The reference code on the wrong file. The popup
  routed through a station that has no reason to be on the chain. Marsh is the
  author of the absences.
private_motive: |
  Close the mole. Aldiss was Marsh's mentor. Marsh learned to write the
  assessments in Aldiss's Reading Room. Twelve years later Marsh recognized
  that Aldiss's last fourteen assessments had been written to keep the Vethari
  file "UNRESOLVED." The mole hunt is the student hunting the teacher. It is
  also the unfinished letter to Brandt — the classmate who defected in the
  opposite direction over the same fragment fourteen years ago. Marsh stayed
  to fix the service. Brandt left to fix the world. Both fixes failed. The
  mole hunt is what Marsh has instead of the conversation Marsh and Brandt
  never had.
what_they_do_not_know: |
  Marsh does not know (or refuses to know) that the mole hunt is also the
  operation's cover for keeping the Vethari file classified. The Reading Room
  wants Aldiss closed because Aldiss is a leak. The Reading Room also wants
  the Vethari evidence to stay "UNRESOLVED" because "INERT" closes the
  sub-office and "ACTIVE HAZARD" creates a directorate with audits. Marsh
  believes the hunt is purely counter-intelligence. The service that employs
  Marsh has a quarterly interest in the file's status word that Marsh has not
  noticed, because Marsh trusts the service the way Hale trusts the
  regulation.
dostoyevsky_layer:
  theme: the_holy_fool   # the handler as the salon's innocent
  expression: |
    Marsh is the Reading Room's Hale — the competent adherent whose adherence
    is load-bearing for the structure. Marsh believes the hunt is clean. The
    service is using Marsh's belief the way REG 44-C uses Hale's.
lecarre_layer:
  theme: the_handler_and_the_cast
  expression: |
    Marsh is the handler. Wren is the cast. The operation runs through Marsh's
    authorizations and Marsh's silences. Marsh cast Wren for the truth of
    Wren's motive (find Lida) and placed the fragment where Wren's
    competency would surface it. The Drummer Girl move: the actor chosen for
    the truth of their feeling, then placed where the feeling is useful.
  where_it_lands: B0 (the controlled leak — the pre-loaded cargo), B3 (the comms popup — the operation's first acknowledgment), B7 (the reveal — the ledger page)
graffiti: []   # Marsh generates no graffiti. Marsh generates forwarding chains.
canon_refs:
  - ../story/PROTAGONIST.md#six-months-ago   # the "selector" passage — Marsh is the selector
  - ../LECARRE-LAYER.md#the-handler-and-the-cast
  - ../LECARRE-LAYER.md#iii-the-drummer-girl-thread-staged-reveal
  - ../DOSTOYEVSKY-LAYER.md#the-holy-fool
appears_in_chapters: [B0, B3, B6, B7]   # never on-screen until B7; presence is via comms/auth/absence
```

## Quick facts

- **The selector.** The "someone" in `PROTAGONIST.md:131` ("Someone selected him. The job was placed for him to find."). Marsh is that someone.
- **Cohort:** Marsh, Brandt, and (as mentor) Aldiss were the Reading Room's tightest circle fourteen years ago, around the first Vethari fragment. Marsh and Brandt defected in opposite directions the same year. Aldiss stayed and began writing the assessments that kept the file unresolved. The fragment that broke the circle is the same fragment Callum later stole and Wren later carried.
- **No face, no pronoun.** Same discipline as Vale. "Marsh" is a surname. The handler is a signature on an authorization the player has to look very hard to find — and even then, the signature is an absence (the popup with no sender, the chain that doesn't quite make sense).
- **The operation's tragedy:** Marsh genuinely believes the hunt is counter-intelligence. The service is using Marsh the way REG 44-C uses Hale. The student hunting the teacher is also the salon's innocent being operated by the salon.

## Design note

Marsh is the Le Carré handler as the corpus's discipline requires: never confided in, never confrontable, present only as the grammar of the operation. The player cannot meet Marsh and "win." The player can only, at B7, read the page in the ledger and understand that the career was the cast. The agency the player gets is the agency to choose how to feel about it — which is the only agency Le Carré ever gives the bait.
