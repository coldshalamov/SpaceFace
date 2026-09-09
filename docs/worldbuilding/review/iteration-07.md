**REVIEW ITERATION 07 — CAST EXPANSION: GANGS, RIVALS, CREW, SHIPS**

*The "is this enough characters?" pass. After iteration-06 (Le Carré layer), the user asked whether
the cast, ships, factions, and gang density do justice to the source-material lineage (Le Carré,
Ritchie, Leonard, Freelancer, Rebel Galaxy, Endless Sky). The honest answer was no — the corpus was
thematically dense but palette-narrow, with four empty mechanical systems (crew, gangs, rivals,
ship-identity) and zero variety in voice or moral position across the eight NPCs. This iteration
fills the four systems with fifteen new sheets, each character a distinct voice running a distinct
scheme, all obeying the user's directive: "characters like a Guy Ritchie or Elmore Leonard story
that think they're the main character or the center of the universe and all have plots and schemes
going on, threads of stories with emotional weight woven together."*

---

## I. The diagnosis (what was empty)

| System | Pre-iteration-07 | Source-matter precedent |
|---|---|---|
| Crew/wingmen | `wingmen.js` exists mechanically; **zero named crew** | FTL crew, Endless Sky hired crew |
| Gangs/clans | 8 institutional factions + 2 salons; **zero street-level gangs** | Rebel Galaxy's Red Devil Cartel, Freelancer's Hogosha |
| Rival pilots/bounty hunters | The Iron Maw (one boss); **zero recurring rogues** | Every source game's rogues gallery |
| Ships as characters | 13 ship defs, **0 with narrative identity** (only the Tessera, in prose) | Freelancer's Shillelagh, Rebel Galaxy's signature ships |

The PROTAGONIST.md literally said "The game's crew system introduces NPCs who ride with the player" — and named none.

## II. What was built (15 new sheets, 4 new subdirs)

### Wave 1 — Gangs & pirate clans (`sheets/gangs/`, 4 sheets)
Four clans, each with a captain whose voice and scheme are distinct:
- **The Ashwalkers** (Captain Corvus — *the monologuer who believes every word*): salvage cartel that strips sectors Concord condemns. Thinks he's the rightful reclaimer. Voice: rehearsed tribunal speech.
- **The Tetherers** ("Mother" Maren — *the courteous functionary of cruelty*): tow-lock extortionists who pirate ships, not cargo, and file it as "towing assistance." Voice: customer-service-escalation over a massline harpoon.
- **The Maw Brotherhood** (Jhira the Maw-Bride — *the liturgical*): cult that worships the Iron Maw dreadnought as a sleeping god. The dreadnought destroys them on contact. Voice: scripture around a spawn script.
- **The Vindel Schism** (Othrik the Witness — *the doctrinal debater*): heretical Choir splinter authenticating "inert" relics, accidentally hunting the Vethari evidence the mole suppresses. Voice: seminary footnotes.

### Wave 2 — Rival pilots & bounty hunters (`sheets/rivals/`, 4 sheets)
Four recurring rogues, each the protagonist of their own caper:
- **Sable Vohn** (*the competitor*) — rival courier buying back her sister's debt, rhymes structurally with Kessler. Her debt is engineered by the Quiet. Ship: *Last Receipt*.
- **Grier Holt** (*the professional*) — Concord-licensed bounty hunter with a procedural code that assumes the license is clean (it isn't). The B2 beat in recurring form. Ship: *Honest Wage*.
- **Pek Wayland** (*the raconteur / wild card*) — smuggler running from three debts, two marriages, and a Choir misunderstanding. Carries intelligence both salons want, doesn't know it. Ship: *Probable Cause*.
- **Aven Derric** (*the coerced*) — bounty hunter buying back a sibling the Quiet already released four years ago. The redemption not suppressed but *fictional*. Ship: *Conditional Release*.

### Wave 3 — Crew/wingmen (`sheets/crew/`, 4 sheets)
Four hireable crew with combat roles, distinct voices, and coercion hooks:
- **Tor Grenn** (engineer, *the monosyllabic professional*) — talks to the ship in single words. Saving for a yard the Quiet already bought. The Kessler rhyme in the engine room.
- **Yara Esti** (gunner, *the gallows humorist*) — narrates kills because counting is the only memorial. Hunting a clan leader who is already dead (the B2 beat as coping mechanism).
- **Selvik Rame** (navigator, *the pedant*) — searching for a system the Choir filed INERT sixteen years ago. The system is the Vethari home. Selvik's quest converges on Wren's Thread B coordinates from the opposite direction. Neither knows.
- **Ida Fane** (medic, *the too-calm / coerced*) — buying back a child the Quiet is raising as a Quiet-internal asset. The redemption not suppressed but *replaced*. Ida's medical logs are Quiet intelligence on the player.

### Wave 4 — Ships as characters (`sheets/ships/`, 3 sheets)
- **The Tessera** — full narrative treatment of the protagonist's ship: transponder palimpsest, the body that keeps the score (Dosto), the operation's deployment vehicle (Le Carré). The ship as the corpus's quietest character.
- **The Iron Maw** — the dreadnought as *gate*, not just boss. The system's last enforcement, filed as "frontier security." The Maw Brotherhood's god, which is a procedural spawn.
- **Signature ships index** — the recurring named vessels (Last Receipt, Honest Wage, Probable Cause, Conditional Release, Variance Adjustment). Each ship announces its captain before the captain speaks; each name is the captain's thesis (a joke, a claim, a leash, a key).

## III. The voice diversity (per the user's directive)

The user asked for "a variety of different voices… sophisticated characters hiding viciousness behind a veneer, and criminals, and connections, and people manipulating each other, and characters forced or coerced." The fifteen new characters map to fifteen distinct registers:

| Character | Voice register | Moral position |
|---|---|---|
| Corvus | rehearsed tribunal monologue | self-justifying reclaimer |
| Maren | courteous customer-service cruelty | procedural extortionist |
| Jhira | liturgical scripture | true believer in a machine |
| Othrik | seminary footnotes | heretic with the better evidence |
| Sable | dry poker-count competitive | rival, family-debt |
| Grier | precise craftsperson contempt | licensed killer with a code |
| Pek | raconteur survival-humor | pluralist chaos agent |
| Aven | clipped reluctant professional | coerced, hunting a ghost |
| Tor | monosyllabic calibrated | saving for what's already bought |
| Yara | gallows operational accounting | counting to cope |
| Selvik | pedantic clause-heavy | searcher for the INERT-filed |
| Ida | too-calm maternal veneer | coerced, redemption replaced |
| (plus Marsh/Brandt from iter-06) | salon-measured / mirror-salon-measured | handler / adversary |

No two voices overlap. Each character thinks they're the main character of their own scheme (Ritchie). Each scheme intersects 1-2 others (Leonard). The coercion is specific and emotional (Le Carré). The Dosto/Le Carré layers are threaded through (every new character carries a `dostoyevsky_layer` and most carry a `lecarre_layer`).

## IV. The interconnections (threads of emotional weight)

The cast is not a roster; it's a web. Selected threads:
- **Sable's sister ↔ the Quiet** ↔ the Routers' brokerage ↔ Ida's child (the Quiet's leverage mechanics run through three characters).
- **Selvik's search ↔ Wren's Thread B coordinates** (the convergence the operation flagged "do not assign").
- **Grier's licenses ↔ Rook's double-bills** (the two bounty economies billing the same targets, neither knowing).
- **Yara's clan leader ↔ the Reading Room's Reach intelligence** (Marsh letting a ghost-hunt produce field intelligence).
- **Othrik's relic hunt ↔ the Vethari file ↔ the mole** (the cell one authentication from surfacing the file the operation suppresses).
- **Aven's sibling ↔ Derric, K.** (the sibling already free, hunting Aven back, neither finding the other).

## V. Diff-back verification (all green)

| Check | Result |
|---|---|
| Voice diversity (15 distinct registers) | ✅ verified — no two overlap |
| Protected canon lines intact | ✅ "fit two children," "savings is the prayer," "priest does not look in the hold" all verified |
| Tic regression | ✅ 0 instances of "this is the point" / "counters change" in new sheets |
| Le Carré / Dosto name-drops in body prose | ✅ 0 (layers cited by theme id only) |
| New entity coverage | ✅ all 15 new sheets resolve; INDEX updated with 5 new sub-sections |

## VI. What this iteration did NOT do

- Did not introduce tonal comedy that violates the corpus voice. Pek's humor and Yara's gallows wit are *survival mechanics*, not quips — the comedy is in the recognition that chaos is structural.
- Did not duplicate existing characters. Each new character has a distinct voice, scheme, and structural rhyme with (but not copy of) existing figures.
- Did not touch game code or data. All new entities are canon/story; wiring them into `src/data/` (ship defs, faction spawns, crew hire rosters) is implementation work for the respective system owners.
- Did not displace the Dosto or Le Carré layers. Every new character carries both substrates.
- Did not weaken the existing eight-NPC ecology. The new cast *surrounds* it — the eight functionaries remain the systemic core; the gangs/rivals/crew are the world they function inside.

## VII. Files added this iteration (15 sheets)

- `sheets/gangs/{ashwalkers,tetherers,maw-brotherhood,vindel-schism}.md` (4)
- `sheets/rivals/{sable-vohn,grier-holt,pek-wayland,aven-derric}.md` (4)
- `sheets/crew/{tor-grenn,yara-esti,selvik-rame,ida-fane}.md` (4)
- `sheets/ships/{tessera,iron-maw,signature-ships-index}.md` (3)
- `sheets/INDEX.md` (updated — 5 new sub-sections)
- `review/iteration-07.md` (this log)

## VIII. Total corpus state after this iteration

- **~66 sheets** (17 characters + 8 factions + 11 worlds + 6 commodities + 8 chapters + 2 groups + 4 gangs + 4 rivals + 4 crew + 3 ships — plus README/INDEX).
- **~40 named characters** with distinct voices (15 from iter-05 + Marsh/Brandt from iter-06 + 15 new this iteration + the embedded Aldiss/Elroy/Lida/old-crew).
- The cast now runs the gamut the source material requires: salon sophisticates (Marsh, Brandt, the Reading Room), weary functionaries (the eight NPCs), charismatic criminals (Corvus, Maren, Pek), coerced agents (Aven, Ida), true believers (Jhira, Othrik), professionals with codes (Grier, Tor), and the rival/crew layer that makes the world feel lived-in rather than empty.
- The corpus no longer feels empty. It feels *populated* — by people who each think they're the main character, whose schemes collide, whose coercion is specific, and whose voices are distinct. The mass is still 12.4 tonnes. The system still files everything under the same code. There are just more people filed under it now.
