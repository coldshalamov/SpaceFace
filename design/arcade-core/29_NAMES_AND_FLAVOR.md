<!-- LIFETIME: DURABLE -->
# 29 — NAMES, BARKS & FLAVOR WRITING: the voice standard

`barks.js`, `titles.js`, `contactHail.js`, `commodityFlavor.js`, `causePhrases.js` exist.
This is the *writing* standard that makes breadth feel authored instead of generated.

## Voice

Working-class space. Terse, wry, competent. People name their ships like trucks and their
stations like bars. No epic fantasy register, no military-thriller register, no jokey
wink-at-camera register (except in designated Easter eggs, 30).

## The layers

- **Ship names/registries**: faction-flavored name banks (pirates name ships after knives and
  debts; guilds after grandparents; navy gets hull numbers). Player-visible on scan.
- **Station slogans**: one per station, painted on the hull, repeated in the bar. "Helios:
  You Are Leaving." 
- **Barks**: context-tagged (chasing, fleeing, winning, dying, docking, scanned, robbed).
  Each faction archetype (17) gets its own bark voice. Dying barks stay short. Barks route
  through the attention arbiter (GDD pillar 3) — flavor never talks over danger.
- **Commodity flavor**: one line per commodity that's actually funny/true ("Synthetic protein:
  legally food").
- **Cause phrases** (kill/loss feeds where UI text *is* appropriate): factual, never
  celebrating for the player (I-4 applies in-world; logs are fine).
- **Titles** (titles.js): earned handles from deeds — "Rockbreaker" (N terrain kills),
  "Smokewalker" (survived atmosphere), "Undertow" (N tether kills). Worn in hails.

## Rules

- Volume discipline: a bark nobody hears twice in an hour beats ten heard constantly.
  Per-tag cooldowns in data.
- Everything localizable-safe: no puns that break in translation files.

## Acceptance

- Content review pass by the owner on the banks (this is taste; it gets a human gate).
