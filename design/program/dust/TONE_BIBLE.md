<!-- LIFETIME: STABLE for the DUST program -->
# The DUST Tone Bible — broody, bureaucratic dark comedy

Owner direction, 2026-10-31: give SpaceFace a broody Fallout-type aesthetic — areas and communities
with their own story and personality, quirky and edgy in a **dark comedy** register. This bible is
the binding voice contract for all content written under the DUST program
([README.md](./README.md)). It composes with, and never contradicts, the living-world district
spec pack (`design/program/living-world/`) and `design/SECTOR_IDENTITY.md`; where they name a place,
their names win.

## 1. The one-sentence worldview

**The war is over, the invoices survived.** People are making home in the wreck of somebody's
bigger plan. The galaxy is run by systems that outlived their authors — toll schedules, claim
registries, insurance ledgers, safety liturgies — and the comedy is that these systems still
*work*, faithfully, at the worst possible moment. Nobody in this galaxy is stupid; the systems are
absurd and the people are competent, tired, and fond of their terrible home.

That is the SpaceFace version of Fallout's "war never changes": **paperwork never dies.**

## 2. Voice rules (binding for every line of DUST content)

1. **Understatement beats wackiness.** A hull breach is "a scheduling problem." Write the second-
   funniest line, not the first — the first is a joke, the second is a world.
2. **Absurd systems, competent people.** The stationmaster who charges a 1-credit toll with a
   40-credit processing fee believes in the toll. Play her straight; the structure is the joke.
3. **Stakes mismatch is the engine.** People fret about parking permits during reactor events.
   The bigger the disaster, the smaller the concern voiced aloud.
4. **Never wink at the player.** No "aren't we quirky", no fourth wall, no meme voice. The world
   does not know it is funny.
5. **Cruelty has a paper trail.** Every dark beat lands through a document, a fee, a form, a
   ledger line — never through gore. A death is a claim number; a massacre is a staffing shortage.
   Violence is real (the sim stays lethal) but the *voice* reports it as administration.
6. **Jokes must survive two reads.** If it only works once, cut it. If it works three times
   (setup, echo, payoff across a community's arc), it earns a running gag slot.
7. **Specific nouns or nothing.** Not "scrap" — "a kiln-back cask, third owner, still warm."
   Not "the corporation" — the claim-auditors, the toll sect, the memorial registry.
8. **Restraint format stays.** The house style is already right: 12-word comms cap
   (`campaign47a/embodiedDialogue.js`), one-line-then-silence onboarding, "the story is in the
   paperwork." DUST writes *inside* those limits. No text walls (A_LIST §8 ban).
9. **The world remembers, deadpan.** Deed memory, ace grudges, hull scars, graffiti — when the
   world recalls the player's acts, recall them like a clerk: date-stamped, itemized, faintly
   resentful. ("You wrecked the Fourth Toll gantry. We rebuilt it. We noticed who docked after.")
10. **Dark, not hopeless.** Every community is holding something together, badly and on purpose.
    The brood must always have a pilot light — a garden, a radio, a named dog, a stubborn
    institution. Fallout's settlements endure; ours file for an extension and endure.

### Calibration lines (use to tune writers; do not ship verbatim)

- Toll station ID: *"Fourth Toll Station. The toll is one credit. The processing fee is forty. We
  take both."*
- Claim auditor: *"Nothing out here is abandoned. Some of it just hasn't been invoiced yet."*
- Memorial docent: *"We memorialize the ship. The crew has their own wall, in the back."*
- Salvage broker, on a fresh wreck field: *"Tragedy closes at eighteen hundred. Inventory doesn't
  wait."*
- Station radio, sign-off: *"Solar weather today: passive-aggressive. Dress accordingly."*

## 3. Community personality cards — the schema

Every named community (station, district, sector hub, outpost) that DUST touches gets one card.
Cards live as data (`src/data/communityPersonality.js`, see README P1) so vignettes, barks, radio,
signage and station screens all draw from one source of truth.

| Field | Meaning | Rule |
|---|---|---|
| `id` | matches the existing station/sector id | never invent a new place; deepen a real one |
| `bit` | The one-sentence thing this place *is* | concrete, imageable, slightly wrong |
| `wound` | The history it won't talk about | drives the community's quiet arcs; ≤1 line |
| `institution` | Its absurd system-with-a-purpose | the comedy engine; must be usable in gameplay (fee, rite, registry, toll) |
| `obsession` | Local economy's true religion | ore grades, salvage provenance, toll punctuality, knot-tying |
| `runningGag` | The echo line that recurs | pays off on the third appearance |
| `voiceSamples` | 3–5 calibration lines | written per §2, in this community's diction |
| `silhouette` | Visual signature cue for the look pass | practicals color, signage shape, one landmark prop (feeds P3) |
| `radioAccent` | How the local channel sounds | deadpan pace, liturgical, auctioneer, static-poet (feeds PULSE-RADIO rows 432/434) |

**A card is a promise:** every field must eventually be readable on the ordinary route — a bark, a
vignette choice, a station screen line, a sign. A card with no player-facing reader is not done
(`AGENTS.md`: no disconnected systems).

### Worked examples (ground in real catalogs before shipping; these set the bar)

- **Helios Prime (trade hub):** *bit* — the mall at the end of the world, still honoring gift
  cards. *institution* — a lost-and-found so rigorous it borders on a faith. *obsession* —
  provenance paperwork; they can tell you who owned a bolt. *runningGag* — the arrival board is
  always one war behind. *wound* — the hub was built to service a fleet that never came home.
- **Ceres wreck fields:** *bit* — a company town whose company is a graveyard. *institution* —
  the wreck registry, which grades tragedies like produce. *obsession* — clean cuts; a neat
  breakline is a moral act. *runningGag* — "pre-owned, barely sank." *wound* — the first shift
  never came up; the clock still runs their hours.
- **Fourth Toll:** *bit* — a toll booth with a sector's worth of gravity. *institution* — the
  schedule of fees, amended hourly, enforced gently and absolutely. *obsession* — punctuality as
  sacrament. *runningGag* — every fee is small; the total is not. *wound* — ask what the tolls
  are *for* and the room goes quiet.

## 4. Where the voice lives (surfaces, in priority order)

1. Ambient encounter vignettes — the lived 5xx families get card-driven rewrites, one community
   at a time, choices intact (P1).
2. Barks and radio — faction registers gain community accent lines; PULSE-RADIO channels adopt
   `radioAccent` (aligns with rows 432/434, owned there).
3. Station glass — one card line per surface (market tickers, contracts board footer, bar
   chatter), never a wall.
4. Environmental storytelling — signage, shrines, welded couches, graffiti ledger lines; fills
   dead frame space (feeds P3's dead-band pass; protected by `historyWear` wear rows).
5. Codex/postcards/recap — the archive tells each community's `wound` in its own diction.

## 5. Do / don't

- Do keep factions capable and dangerous — a toll sect that can actually impound you.
- Don't cartoon the elites; absurd structure, competent operators.
- Don't use real-world brands, current memes, or Earth-side politics as punchlines.
- Don't let comedy soften lethality or dodge consequence systems — the joke is never "nothing
  mattered."
- Don't rewrite the campaign 47-A spine's literary register wholesale; DUST deepens communities
  around it. Campaign tone shifts go through the owner.
- Do run every new line past rule 6 (two reads) and the 12-word comms cap where applicable.
