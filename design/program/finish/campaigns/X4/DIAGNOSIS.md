<!-- LIFETIME: CAMPAIGN -->
# X4 — Sound and music: diagnosis

**Campaign:** X4 (Lane 6, LOOK & SOUND). Written 2026-11-06, at the start of the campaign's
implementation; the audio source was read before any audio edit.
**Evidence:** the live audio tree, a 20-second event census from a live Swarm round (below), and
`src/audio/scoreDirector.js` / `themeMatrix.js` / `themeCompose.js`.

## 1. What the player hears

- **A short loop, not a score.** The authored music is 4 theme stems at **4 s** and 10 sector beds at
  **2 s** — about 36 s total. A fight that lasts a minute repeats the same bar fifteen times.
- **The boss has no music.** `MUSIC_STEMS` labels stem D "Boss" but its `themeState` is `station`
  and its authored sample is `theme_station`; the score director maps `dock → D`. So the boss fight
  plays the station body, and the station plays a stem labelled Boss. The label and the data
  disagree, and there is no fifth stem.
- **Repetition at the top of the event list.** The most frequent events have one authored sample
  each. The collision ladder carries light/medium/heavy (three *severities*), but the same body is
  heard on every hit of that severity.

## 2. The measured cause chain

**Live event census** — 20 s of a live Swarm round, a keyboard bus tap, 390 events:

| Rank | Event | Count | Audio owner |
|---|---|---|---|
| 1 | `ship:rcsPulse` | 391 | RCS voice |
| 2 | `combat:actionRejected` | 154 | action denial |
| 3 | `combat:actionPhase` | 136 | doctrine cue |
| 4 | `combat:actionCompleted` | 47 | doctrine cue |
| 5 | `combat:actionStarted` | 45 | doctrine cue |
| 6 | `ship:thrust` | 40 | engine loop |
| 7 | `audio:cue` | 36 | generic cue |
| 8 | `ui:targetNearestHostileToPlayer` | 19 | UI lock |
| 9 | `entity:spawned` | 17 | spawn cue |
| 10 | `combat:fire` | 14 | weapon recipe |
| 11 | `combat:hitstunImpulse` | 10 | impact |
| 12 | `physics:impact` | 9 | collision ladder |
| 13 | `projectile:hit` | 6 | impact |
| 14 | `combat:damage` | 6 | damage voice |
| 15 | `projectile:nearMiss` | 3 | `near_miss` |
| 16 | `barkDirector:voice` | 3 | voice |
| 17 | `combat:tumbled` | 2 | tumble |
| 18 | `combat:statusApplied` | 2 | status |
| 19 | `massline:*` | 2 each | Line |
| 20 | `loot:drop` | 2 | `ui_loot` |
| 21 | `run:awardRequested/awarded` | 2 each | reward |

The rest of the top 30 is the ordinary-life layer the Adventure route adds (UI click/hover/tab,
mining tick, cargo, dock/undock, mission/lock). The table lives in
[`AUDIO_CENSUS.md`](./AUDIO_CENSUS.md).

**Music:** 5 authored bodies needed; 4 exist, one of them mislabelled. `THEME_STEM_SECONDS = 4`
(`themeCompose.js:17`), `THEME_BED_SECONDS = 2`; `MUSIC_STEMS` has four rows; `STEM_KEYS` did not
exist, so eight fader loops in `audioSystem.js` were hard-coded `['A','B','C','D']`.

## 3. Is the design the bottleneck?

**No — the engine is right and the content is thin, plus one data defect.**
`scoreDirector` already resolves phases (arrival/travel/work/threat/fight/aftermath/dock/departure)
to a stem, quantises changes to the phrase grid, holds a sector key/mode and exposes continuous
intensity. `themeMatrix` already carries per-state stem weights, per-sector beds and faction stings.
The audio host already runs crossfaded stem faders and a gesture gate. Replacing that would cost
weeks and lose the adaptive behaviour that already works.

What is missing is: (a) a **fifth authored stem** for the boss and the correct station row; (b)
authored bodies long enough to survive a 60–90 s round without a 4-bar loop; (c) a **variant**
seam for the events the player hears most.

## 4. The chosen road

1. **Five stems, one grid.** Add `boss` to `THEME_STATES`/`THEME_MOTIFS` and a real `stem_e` row
   (`theme_boss`, 132 BPM, drums/bass/synth/brass/choir/strings). Fix `stem_d` to Station. Add a
   `STEM_KEYS` constant and route every fader loop through it. The boss is detected from the
   existing `entity:spawned`/`entity:killed` events (`isBoss`, `bossDressing`, `capital_boss`), not
   a per-frame scan. `scoreStemWeights` returns the authored boss row instead of a phase remix.
2. **Longer authored bodies.** `THEME_STEM_SECONDS` 4 → 16; the composer phrases the motif across
   the loop, adds the motif's own chord pad and a bar bass pulse, and keeps the lead dominant so the
   stranger-hum test still identifies the theme. Beds stay 2 s loops under it.
3. **A variant seam (next pass).** `SAMPLE_BINDINGS` will accept an id array and the host will
   rotate variants per event; the 30-event table names exactly which families need three bodies.
   This campaign lands the music and the census; the variant bodies are the remaining X4 work.

**Verify:** the five stems are byte-identical on regeneration, the boss row plays on a boss spawn
and releases on its death, the stranger-hum test passes on the 16 s travel loop, and the top-30
table is committed with each event's variant count.
