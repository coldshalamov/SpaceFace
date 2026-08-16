<!-- LIFETIME: DURABLE -->
# 50 — RACING & CHALLENGES: the flight-skill playground

Pure flight-model content: the handling is good, so let people *play* it. Low cost (routes +
timers + existing world), high charm.

## The events

- **Gate-ring time trial**: buoy rings through a belt, posted at stations; medal times
  authored per course. Pays credits + a trail tint (44) at gold.
- **Slalom**: dense-pocket thread-the-needle course; touching a rock kills your time, not
  your ship.
- **Slingshot course**: checkpoints only reachable at tether-slingshot speeds — the Bond-tree
  showcase (46). Teaches the game's signature skill as sport.
- **Skim run**: atmosphere-rim time trial (04 zones): how low can you burn without burning.
- **Arena ladder** (at one station): optional wave arena for pure combat scores — the one
  place waves are *explicitly* a mode; rewards are cosmetic + credits so it never becomes
  the optimal farm (05's world stays the game).

## Rules

- All courses are real places (existing sectors, existing physics); ghosts are your own best
  run (stored locally, deterministic replay from input+seed — the repo's determinism makes
  this nearly free).
- Leaderboards: local-only at launch.

## Acceptance

- Per course: completable within medal bands by a reference bot at silver; ghost replay
  round-trips byte-identical.
