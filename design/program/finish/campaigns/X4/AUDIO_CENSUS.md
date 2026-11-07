<!-- LIFETIME: CAMPAIGN -->
# X4 audio census — the 30 most frequent events

**Measured** on 2026-11-06 in a live Swarm round (20 s, keyboard bus tap, 390 events), plus the
ordinary-life layer the Adventure route adds. `[M]` measured this session; `[A]` mapped from the
live recipe table (`src/data/audioRecipes.js`) and the sample manifest, not re-measured.

"Variants now" counts **distinct authored bodies for the same event**. Light/medium/heavy collision
rows are three *severities* (different events), not three takes of one event, so an impact event
still has one body. That is the gap this table exists to expose.

| # | Event | Source | Count / band | Audio owner | Variants now | Variants needed |
|---|---|---|---|---|---|---|
| 1 | `ship:rcsPulse` | [M] | 391 | RCS voice (`rcs` synth) | 1 | 3 |
| 2 | `combat:actionRejected` | [M] | 154 | action-denial cue | 1 | 3 |
| 3 | `combat:actionPhase` | [M] | 136 | doctrine cue | 1 | 3 |
| 4 | `combat:actionCompleted` | [M] | 47 | doctrine cue | 1 | 3 |
| 5 | `combat:actionStarted` | [M] | 45 | doctrine cue | 1 | 3 |
| 6 | `ship:thrust` | [M] | 40 | engine loop | 1 | loop-safe (no variants) |
| 7 | `audio:cue` | [M] | 36 | generic cue bus | — | routed, not a body |
| 8 | `ui:targetNearestHostileToPlayer` | [M] | 19 | `ui_lock` | 1 | 3 |
| 9 | `entity:spawned` | [M] | 17 | spawn cue | 1 | 3 |
| 10 | `combat:fire` | [M] | 14 | weapon recipes (`wpn_pulse/cannon/rail/flak`) | 1 per weapon | 3 per weapon family |
| 11 | `combat:hitstunImpulse` | [M] | 10 | impact | 1 | 3 |
| 12 | `physics:impact` | [M] | 9 | collision ladder (`ladder_<mat>_<light/medium/heavy>`) | 1 per severity | 3 per severity |
| 13 | `projectile:hit` | [M] | 6 | impact | 1 | 3 |
| 14 | `combat:damage` | [M] | 6 | damage voice | 1 | 3 |
| 15 | `projectile:nearMiss` | [M] | 3 | `near_miss` | 1 | 3 |
| 16 | `barkDirector:voice` | [M] | 3 | voice (`voice` bus) | authored lines | n/a (voice) |
| 17 | `combat:tumbled` | [M] | 2 | tumble | 1 | 3 |
| 18 | `combat:statusApplied` | [M] | 2 | status | 1 | 3 |
| 19 | `massline:latch/release/break` | [M] | 2 each | massline instrument | 1 per verb | 3 per verb |
| 20 | `loot:drop` | [M] | 2 | `ui_loot` | 1 | 3 |
| 21 | `run:awardRequested/awarded` | [M] | 2 each | reward stinger | 1 | 2 |
| 22 | `ui:click` | [A] | every menu press | `ui_click` | 1 | 3 |
| 23 | `ui:hover` | [A] | every pointer move | `ui_hover` | 1 | 3 |
| 24 | `ui:tab` | [A] | every tab | `ui_tab` | 1 | 3 |
| 25 | `ui:confirm` | [A] | every accept | `ui_confirm` | 1 | 2 |
| 26 | `mining:tick` | [A] | 5–10 Hz while mining | `mine_impact` / beam loop | 1 | 3 |
| 27 | `asteroid:chunked` | [A] | per fracture | `mine_fracture` | 1 | 3 |
| 28 | `cargo:pickup/jettison` | [A] | per pod | `ui_loot` / cargo | 1 | 3 |
| 29 | `dock:docked` / `undock` | [A] | per visit | `ui_dock` / `ui_undock` | 1 each | 2 each |
| 30 | `mission:accepted/completed` | [A] | per contract | `ui_mission` / reward | 1 each | 2 each |

## What is authored now

- **5 music stems × 16 s** (this pass): `theme_travel`, `theme_combat`, `theme_station`,
  `theme_wanted`, `theme_boss`; plus 10 sector beds × 2 s. 6.25 MiB total at 32 kHz mono.
- **1569 WAVs** in `assets/audio/` across 15 families (samples + voices + music).
- The collision ladder (material × light/medium/heavy) is the only place with authored severity
  bodies; it does not provide repeat variants within a severity.

## Next X4 pass (not landed)

1. Add an id-array form to `SAMPLE_BINDINGS` and a rotation counter in the sample runtime; the top
   30 rows above become the acceptance list.
2. Extend `assets/audio/generate-samples.mjs` with a `variants: 3` field: three deterministic takes
   per event (slightly different noise seed, modal ratio and attack), written to `<id>_1..3.wav`.
3. Re-record the 10-minute route and run the blind naming check in `AUDIO_BRIEF.md`.
