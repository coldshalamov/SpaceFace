**REVIEW ITERATION 06 — LE CARRÉ LAYER + DRUMMER GIRL THREAD + 2 CHARACTERS + 2 GROUPS**

*The sophistication pass. After iteration-05 (Dosto layer + sheet architecture + canonical
chapters), this iteration adds the Le Carré thematic substrate the corpus was already structurally
primed for (the audit named Le Carré as a presiding influence; Vale is the Smiley-becomes-Karla's-
mirror move). The layer is *deepened and named*, then threaded through the chapters as a staged
"second reading" that recontextualizes the player's entire career as a mole-hunt operation.*

---

## I. What was built

### A. The Le Carré layer (`LECARRE-LAYER.md`, ~3,400 words)
One scaffolding document — paired with `DOSTOYEVSKY-LAYER.md` as the two places author names appear.
Canonicalizes five themes for this world:

1. `the_handler_and_the_cast` — the "selector" (`PROTAGONIST.md:131`) is a Concord Intelligence
   handler (Marsh). Wren's personal quest is real to Wren *and* the cover for a mole hunt.
2. `the_mole_and_the_mirror` — Brandt (Karla mirror, defected to Quiet) + Aldiss (the mole inside
   the Reading Room, leaking Vethari-file status for fourteen years).
3. `controlled_leak_and_the_honey_trap` — the second fragment, planted in Wren's hold six months
   before B0, is a controlled leak. Wren is the honey-trap. Aldiss is the target.
4. `the_salon_and_the_grubby_work` — sophistication alongside the seediness. The Reading Room
   (Concord Intelligence salon) and the Routers (Quiet's mirror salon) are the decision layer the
   existing grubby cast executes without knowing exists.
5. `betrayal_as_love_the_human_layer` — Marsh/Brandt were classmates; Aldiss was Marsh's mentor.
   The mole hunt is the student hunting the teacher, the unfinished letter between the defectors.

Plus §III: the **staged-reveal table** — every beat B0–B6 has a civilian reading (what the player
sees) and an operation reading (what the handler was doing). The reveal lands at B7 as a page in
the Kurtz figure's ledger, in Concord Intelligence internal correspondence format. The player who
reads it re-reads the whole game with the new lens; the player who doesn't has the civilian
reading intact. Both are true.

### B. Two new characters
- **Marsh** (`sheets/characters/marsh.md`) — the handler. The "selector." No face, no pronoun
  (same discipline as Vale). The operation runs through Marsh's authorizations and Marsh's
  absences. Never on-screen until B7; presence is via comms/auth/redacted-co-author-fields.
- **Brandt** (`sheets/characters/brandt.md`) — the Karla mirror. Defected to the Quiet, runs the
  Routers. Was the buyer of the first fragment ("the man who paid well and didn't give a name").
  Right about the diagnosis, wrong about the cure.

### C. One embedded NPC (no standalone sheet — by design)
- **Aldiss** — the mole. Senior Reading Room analyst, fourteen years of "UNRESOLVED"
  assessments, embedded in `groups/reading-room.md`. Aldiss never appears on-screen — Aldiss is
  the file the operation is closing. The ambient Aldiss signature (a leaking Concord Intelligence
  internal popup) plants across B1, becoming legible only at B7.

### D. Two new groups (new `sheets/groups/` subdir)
- **The Reading Room** (`sheets/groups/reading-room.md`) — Concord Intelligence salon, Helios
  Prime, behind Logistics Oversight. ~3 analysts. Bound inquiry reports, the long table, coffee
  that doesn't taste like an apology. The sophistication layer. Where the mole hunt is authorized.
  Where Aldiss sits.
- **The Routers** (`sheets/groups/routers.md`) — Quiet intelligence cell, Veil Nebula, Brandt's
  operation. The mirror salon. Same measured cadence, better air. The harm-reduction argument
  (broker ATMO TOKENS to failing sectors) is also the revenue stream that gives the Routers a
  structural incentive to keep the system failing.

### E. The Drummer Girl thread, threaded through chapters
Seven chapters updated with either a "second reading" annotation block (B0, B2, B5, B7) or an
in-line operation-reading addition (B3 comms popup, B6 settlement offer) or an ambient plant
(B1 Aldiss signature popup). The thread is designed so it cannot be perceived on first
playthrough and cannot be unseen on second. The B7 reveal is a page in a ledger, not a cutscene.

---

## II. Diff-back verification (all green)

| Check | Method | Result |
|-------|--------|--------|
| Le Carré name-drops in body prose | grep Le Carré/Smiley/Karla/Haydon/Control/Kathy/Drummer Girl across story/sheets/vibe/orgs/contracts (excluding `LECARRE-LAYER.md`) | **0 matches** |
| Dosto regression | grep Dosto/Raskolnikov across same | **0 matches** (Dosto layer intact) |
| Earlier tic regression | grep "this is the point" / "counters change" | **0 matches** (iteration-04 holds) |
| Protected canon lines intact | grep the LITERARY-AUDIT §I protected lines in prose homes | **all verified** ("fit two children," "savings is the prayer," "priest does not look in the hold" all in original locations) |
| New entity coverage | every Le Carré entity has a sheet | ✅ marsh, brandt (chars); reading-room, routers (groups); aldiss (embedded in reading-room by design) |
| Sheet wiring | INDEX updated with new chars + groups section | ✅ added Marsh, Brandt, Aldiss (embedded), Reading Room, Routers |

---

## III. The two-reading design (the Le Carré contract with the reader)

The thread obeys Le Carré's contract with the reader: the second reading is the *reward for
attention*, and the first reading is *never invalidated*. Concretely:

- **B0**: the pre-loaded cargo reads (civilian) as the system's pre-filing / (operation) as the
  controlled leak's deployment. The `CO-AUTH: [FIELD REDACTED]` is standard *and* the operation's
  signature.
- **B1**: the manifest re-categorization reads (civilian) as the system's first mercy / (operation)
  as the mole's first response — Aldiss's network reclassifying to flag the cargo for retrieval.
  The Aldiss internal popup is noise *and* the channel leaking.
- **B2**: the Elroy kill reads (civilian) as a lawful bounty / (operation) as the operation letting
  a competing thread die because intervening would expose the operation. The cruelty is systemic
  *and* operational.
- **B3**: "your recent work has been noted" reads (civilian) as Vale's flattery / (operation) as
  the handler's progress report — the salon's word "noted" is the giveaway.
- **B5**: Callum's buyer reads (civilian) as an institution / (operation) as Brandt via the Quiet,
  making Callum an unwitting fourteen-year mole-network node.
- **B6**: the 47-A settlement offer reads (civilian) as a courtesy / (operation) as operational
  housekeeping — the handler formalizing the bait's routing before B7.
- **B7**: the page in the ledger. The reveal. The five Choices each become a relationship to the
  operation. "Good work. Keep it clean." becomes deliberately-unreadable-as-Vale-or-Marsh.

The player cannot "win" the intelligence game. Aldiss is closed (or not) by Marsh, off-screen,
regardless of the player's choice. The player is the bait, not the hunter. This is the Le Carré
verdict: the bait who learns they were bait is still thanked for the performance, by a voice that
belongs to whichever service the bait needs to believe is grateful.

---

## IV. The sophistication layer (per the user's brief)

The user asked for "elements of sophistication that live alongside the seediness and crime." The
corpus was previously ~95% grubby (the Pit, the Slow Gray, Kessler's thumb, Quinn's bar, Rook's
bounty board). This iteration adds the *salon* — the layer where decisions get made in rooms with
good air:

- The **Reading Room**: bound inquiry reports, the long table, coffee that doesn't taste like an
  apology, three analysts who have never raised their voices because they have never needed to.
  The worst outcomes in the sector are produced here by people who would be offended to be called
  corrupt. The Pit is downstream. The Reading Room has never visited.
- The **Routers**: the mirror salon. Same measured cadence, better air, the hum of the nebula.
  The harm-reduction argument as cover for the revenue stream that depends on the disease.

The contrast is the point. The salon and the Pit are the same system at different altitudes. The
sophistication is not a reprieve from the seediness; the sophistication *is* the seediness, one
floor up, in better air. The Dosto layer's `guilt_as_physiology` lands harder for the contrast:
the Slow Gray kills forty thousand people downstream of the salon's measured, educated decisions,
and the salon's coffee tastes fine.

---

## V. The "Little Drummer Girl" thread mechanics (per the user's brief)

The user asked for "complex threads like The Little Drummer Girl that run through the story,
where elements of the story have greater meaning because of what the characters know, and what
has happened previously." The mole hunt IS that thread:

- **What the characters know that the player doesn't:** Marsh knows Wren is bait. Brandt knows
  the first fragment was bought. Aldiss knows the file is being kept unresolved. The Kurtz figure
  knew they were the dead-drop. Callum knows nothing. Wren knows nothing until B7.
- **What has happened previously that gives later elements greater meaning:** the first fragment
  (fourteen years ago) is the event that broke the Reading Room cohort (Marsh stayed, Brandt
  defected, Aldiss began the mole work). The same fragment is the one Callum later stole, Wren
  later carried, and the operation later used as controlled leak. Every fragment in the game is
  the same fragment at a different point in its chain of custody. The player who knows this at B7
  reads every prior fragment reference as a node in the mole network.
- **The recontextualization:** on second playthrough, B0's "cargo loaded before the player
  accepted" reads as the operation's opening move; B2's kill reads as operational; B5's buyer
  reads as the adversary; B7's "Good work" reads as the handler. The first-playthrough civilian
  reading is the cover the operation cultivated. Both readings are canon.

---

## VI. What this iteration did NOT do

- **Did not name any Le Carré character or work in body prose.** Only `LECARRE-LAYER.md` carries
  the names (Smiley, Karla, Haydon, Control, Kathy). Chapters cite the doc by theme id.
- **Did not let the player win the intelligence game.** The mole hunt's resolution is off-screen.
  Wren is bait, not hunter. The agency the player gets is the agency to choose how to feel about
  having been operated — which is the only agency Le Carré ever gives the bait.
- **Did not invalidate the civilian reading.** Every beat works on first playthrough without the
  operation layer. The Le Carré layer is the reward for the player who replays or reads closely,
  not a tax on the player who doesn't.
- **Did not displace the Dosto layer.** The two interlock: Dosto `crime_without_punishment` is
  how the operation keeps its bait functional; Dosto `the_double` is what the operation produces;
  Dosto `the_holy_fool` is now ALSO Marsh (the salon's innocent being operated by the salon),
  doubling Hale. The layers are substrates, not competitors.
- **Did not touch the protected canon lines** or the existing prose voice. All Le Carré material
  is *additive* — annotation blocks, ambient plants, the B7 ledger page. The civilian reading of
  every prior chapter is unchanged.
- **Did not change game code or data.** Story/canon only. The Aldiss popup, the redacted
  co-author fields, and the B7 ledger page are narrative artifacts, not new mechanics.

---

## VII. Files added/modified this iteration

**New — Le Carré layer (1 file):**
- `docs/worldbuilding/LECARRE-LAYER.md`

**New — character sheets (2 files):**
- `docs/worldbuilding/sheets/characters/marsh.md`, `brandt.md`

**New — group sheets (2 files, new `groups/` subdir):**
- `docs/worldbuilding/sheets/groups/reading-room.md`, `routers.md`

**Modified — chapters (the Drummer Girl thread threaded through, 6 files):**
- `story/chapter-00-cold-start.md` (+ second-reading block: the redacted co-author / controlled leak)
- `story/chapter-01-honest-work.md` (+ ambient Aldiss plant popup)
- `story/chapter-02-first-blood.md` (+ second-reading block: the operation let Elroy die)
- `story/chapter-03-bigger-boat.md` (+ operation reading of "your recent work has been noted")
- `story/chapter-05-proving-ground.md` (+ second-reading block: Callum as unwitting mole node)
- `story/chapter-06-empire-seed.md` (+ operation reading of the settlement offer)
- `story/chapter-07-deep-reach.md` (+ THE PAGE IN THE LEDGER reveal section + operation-named section + reframed "Good work" + updated footer)

**Modified — chapter sheets (Le Carré fields added, 4 files):**
- `sheets/chapters/B0.md`, `B1.md`, `B2.md`, `B5.md`, `B7.md` (added `lecarre_beat` field + new entities in `npcs_present`/`groups_present` + LECARRE-LAYER canon_refs)

**Modified — character sheets (1 file):**
- `sheets/characters/wren.md` (added `lecarre_layer` field — Wren is the cast)

**Modified — index (1 file):**
- `sheets/INDEX.md` (added Marsh, Brandt, Aldiss-embedded; new Groups section with Reading Room + Routers)

**This log:**
- `docs/worldbuilding/review/iteration-06.md`

---

## VIII. Total corpus state after this iteration

- **3 scaffolding layer docs** (`LITERARY-AUDIT`, `DOSTOYEVSKY-LAYER`, `LECARRE-LAYER`) — the only
  places author names appear.
- **51 sheets** (17 characters + 8 factions + 11 worlds + 6 commodities + 8 chapters + 2 groups
  — wait: 17 chars now with Marsh+Brandt; the original 15 + 2).
- **9 chapter files**, with 6 of them now carrying the Drummer Girl second-reading thread.
- The corpus now operates on **two readings simultaneously**: the civilian reading (the systemic-
  rot story, intact from iteration-05) and the operation reading (the Le Carré mole hunt, layered
  on top). The player who reads the B7 ledger page gets both. The player who doesn't has the first.

The sophistication lives alongside the seediness. The salon has good coffee. The Slow Gray still
kills forty thousand people downstream. The mole hunt closes (or doesn't) off-screen. The bait is
thanked for the performance. The mass is still 12.4 tonnes. The system files everything under the
same code.
