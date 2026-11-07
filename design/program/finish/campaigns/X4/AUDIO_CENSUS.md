<!-- LIFETIME: CAMPAIGN -->
# X4 audio census — emitters vs the audible top

**Measured** 2026-11-06. Two different counts, and the difference matters:

1. **Emitters** — the event bus tap from a live Swarm round (20 s, 390 events) plus the ordinary-life
   layer the Adventure route adds. `[M]` measured that session; `[A]` mapped from the live recipe
   table (`src/data/audioRecipes.js`) and the sample manifest, not re-measured.
2. **Audible cues** — what survives `resolveCombatActionLifecycleCue` →
   `combatActionLifecyclePlayerRelevant` → `shouldPlayCombatActionCue` and reaches `play()`. This is
   the only count that describes the ear, and it is the one the variant budget must be spent on.

`test/x4-audio-census.test.mjs` drives the real gate over this table's own combat-lifecycle band:
**154 rejected + 136 phases + 47 completed + 45 started = 382 submitted → 175 audible, 7 distinct
cues**. Rejects admit one per four-tick gap (39); completions and starts are 0 because their end/start
cues are deliberately quiet. A scripted lifecycle, not a live round — the live 10-minute listen is
still open.

## The audible top (post-gate)

| # | Heard cue | Emitter in the round | Emits `[M]` | Audible | Variants |
|---|---|---|---|---|---|
| 1 | `combat.action.reject` | `combat:actionRejected` | 154 | 39 | **3 (rotates)** |
| 2 | `combat.action.dash.active` | `combat:actionPhase` | phase band 136 | gate-admitted | **3 (rotates)** |
| 3 | `combat.action.attach.lock` | `combat:actionPhase` | " | gate-admitted | **3 (rotates)** |
| 4 | `combat.action.sling.release` | `combat:actionPhase` | " | gate-admitted | **3 (rotates)** |
| 5 | `combat.action.cut.snap` | `combat:actionPhase` | " | gate-admitted | **3 (rotates)** |
| 6 | `combat.action.burst.fire` | `combat:actionPhase` | " | gate-admitted | **3 (rotates)** |
| 7 | `combat.action.cancel` | `combat:actionCancelled` | — | gate-admitted | **3 (rotates)** |
| 8 | `sfx_ui_click` | `ui:click` | every menu press `[A]` | every press | **3 (rotates)** |
| 9 | `sfx_ui_hover` | `ui:hover` | every pointer move `[A]` | every move | **3 (rotates)** |
| 10 | `sfx_ui_tab` | `ui:tab` | every tab `[A]` | every tab | **3 (rotates)** |
| 11 | `sfx_ui_confirm` | `ui:confirm` | every accept `[A]` | every accept | **3 (rotates)** |
| 12 | `sfx_ui_open` / `sfx_ui_back` | screen push/pop | per screen `[A]` | every screen | **3 (rotates)** |
| 13 | `sfx_loot_collect` | `loot:drop` / pickup | per pod `[A]` | per pod | **3 (rotates)** |
| 14 | `sfx_wpn_pulse_laser` | `combat:fire` | 14 in 20 s `[M]` | per shot | **3 (rotates)** |
| 15 | `sfx_wpn_autocannon` | `combat:fire` | " | per shot | **3 (rotates)** |
| 16 | `sfx_wpn_flak` | `combat:fire` | " | per shot | **3 (rotates)** |
| 17 | `sfx_wpn_railgun` | `combat:fire` | " | per shot | **3 (rotates)** |
| 18 | `sfx_wpn_missile` | `combat:fire` | " | per shot | **3 (rotates)** |

The rotation is `src/audio/cueVariants.js`: a body plus two pitch/form takes (rate 1 / 1.018 /
0.983, gain trimmed), advanced per cue id and applied in `audioSystem.play()`. `AUDIO_BRIEF.md`
permits exactly this ("a body plus two authored pitch/form variants").

## Emitter counts that are NOT cue bodies

These were in the old top 30 and should never have been: they are simulation facts that drive a
synthesized voice or a parameter, and no `play()` call is their owner.

| Event | Emits `[M]` | What it actually is |
|---|---|---|
| `ship:rcsPulse` | 391 | per-craft RCS synth tick (0.12 s per craft), not a cue |
| `ship:thrust` | 40 | engine loop parameter, not a one-shot |
| `audio:cue` | 36 | the routing bus itself |
| `ui:targetNearestHostileToPlayer` | 19 | an input intent; its cue is `sfx_ui_click`/lock |
| `entity:spawned` | 17 | spawn voice is per-archetype, resolved downstream |
| `barkDirector:voice` | 3 | authored voice lines, n/a to variants |

## Still one body (open)

| Event | Owner | Why open |
|---|---|---|
| `physics:impact` light/medium/heavy | collision ladder | one authored body per severity; no repeat take |
| `projectile:hit`, `combat:damage`, `projectile:nearMiss` | impact / damage voice | body authored, no rotation |
| `combat:tumbled`, `combat:statusApplied` | tumble / status | low frequency, one body |
| `massline:latch/release/break` | massline instrument | one body per verb |
| `run:awardRequested/awarded` | reward stinger | one body, 2 needed |
| `mining:tick`, `asteroid:chunked` | mine impact / fracture | loop + per-event body |
| `cargo:pickup/jettison` | loot / cargo | one body |
| `dock:docked` / `undock` | dock recipes | one body each |
| `mission:accepted/completed` | mission / reward | one body each |

## What is authored now

- **5 music stems × 16 s** (`theme_travel`, `theme_combat`, `theme_station`, `theme_wanted`,
  `theme_boss`) + 10 sector beds × 2 s. **6.25 MiB** across **15 files**; the five stems are
  **1,024,044 B each**, the ten beds **128,044 B each**.
- **1569 WAVs** in `assets/audio/` across 15 families (samples + voices + music).
- Runtime music is **synthesized** (`_seqCalm`/`_seqTense`/`_seqCombat`/`_seqDocked`/`_seqBoss`); the
  five WAVs are the authored reference loops, fetched tier-2 on first use, and the evidence the
  stranger-hum and note-window tests read.

## Next X4 pass (not landed)

1. Author repeat takes (or a written exception) for the "still one body" rows.
2. Re-record the 10-minute route and run the blind naming check in `AUDIO_BRIEF.md`.
