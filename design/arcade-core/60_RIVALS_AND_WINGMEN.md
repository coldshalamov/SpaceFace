<!-- LIFETIME: DURABLE -->
# 60 — RIVALS, WINGMEN & RELATIONSHIP-LITE

`wingmen.js`, `wingOrders.js`, `aceMemory.js` exist. The social layer stays *lite* (VISION:
not a dialogue RPG) but present — a few persistent names among the crowds.

## Wingmen (hired guns, not pets)

- Hire at bars: named pilots with a fit, a voice (29), a daily rate, and a *loyalty* that
  moves with how often they survive your decisions.
- Orders are four verbs: follow, hold, attack-my-target, scatter. Deliberately small —
  they're extra guns with personality, not an RTS.
- A wingman who survives 10 sorties gets a title (29) and a discount; one who dies because
  you ordered a bad hold stays dead, and the bar mentions it once.

## Rivals & regulars (16/52 tie)

- The Rival arc (52) plus small regulars: the miner you keep buying from raises a toast; the
  customs officer you've fooled twice gets suspicious (49 heat, personal flavor).
- aceMemory audit: recurring aces remember *their* fights with you (16) — within I-7, memory
  is personal and bounded, never a systemic grudge web.

## Rules

- Relationships are texture + small mechanical hooks (discounts, tips, heat), never required
  progress.
- All relationship state is per-NPC scoped and serializes small (SAVE_SCHEMA stays honest).

## Acceptance

- Route: hire → order verbs all obey → loyalty move after N sorties → wingman death branch
  persists and is acknowledged once in-world.
