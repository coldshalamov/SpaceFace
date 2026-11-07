<!-- LIFETIME: CAMPAIGN -->
# X4 — Sound and music: status

**State: the boss stem has an audible body; the authored WAV reference develops, and the heard
two-bar boss motif now plays its full A–D–A–F# phrase. The 10-minute listen, the blind naming
check and the unresolved census/payload rows remain open.** Written 2026-11-06, revised after the
second independent X4 review pass and the final Gate E review.

## Done

### The boss has a voice (P0)
- `audioSystem.js` dispatched sequencers for A/B/C/D only while `STEM_KEYS` carried E, so a boss
  fight raised a gain node no oscillator fed. `STEM_SEQUENCER_BY_KEY` now maps **every** stem key to
  its `_seq*` method (E → `_seqBoss`), and the focused test runs `_seqBoss` over two bars of a fake
  `AudioContext`: **48 oscillators created, 52 sources started**.
- `_seqBoss` is a different piece, not the fight louder: 100 BPM (combat 130), a two-bar Am/Dm
  phrase, half-time kick, long bass, and the layer set `stem_e` advertises — choir (slow-attack
  triad), brass (short filtered answer), strings (low pedal). The Warden motif (A D A F#) plays on
  its own two-bar grid. **The heard form is a ~9.6 s loop, not the 16 s WAV development**; scope
  the "develops" claim to the WAV until the sequencer is ported.
- **Motif fix (final review):** `_playThemeMotif` now plays EVERY bar of a multi-bar phrase —
  `phraseBars <= 1` keeps the long-standing every-four-bars hook — and reads the written step on
  `bar % phraseBars`. The boss's bar-1 F#3 answer sounds. `test/x4-boss-stem.test.mjs` now drives
  the real 64-step scheduler pass (`macroBar 0`, `bar = floor(step/16)`) and records the motif
  frequencies: **A2/D2/A2/F#3 at steps 0/8/16/24**, repeated on 32/40/48/56 (110.0 / 73.4 / 110.0 /
  185.0 Hz). The earlier test called `_seqBoss` with `step % 16`, so both "bars" were totalBar 0 and
  could not see the skip.
- Focused checks (final review): `test/x4-boss-stem.test.mjs` **14/14**,
  `test/x4-audio-census.test.mjs` **1/1**, `test/pq-158-03-themes.test.mjs` **12/12** — **27/27**
  together. The 64-step motif case is the new frequency proof.
- Boss arrival mid-fight now moves the E fader: the boss maps to the `combat` music state, so the
  equal-state branch of `_recomputeMusic` was the only place its authored row could land. That
  branch now applies the authored boss row when the boss mixes in (and puts the fight mix back when
  it dies); the stem-diff test includes `E`; `_applyStemTargets` picks E as a lead for quantization.
- The latch reads the canonical boss marks: `isBoss` / `encounterBoss` / `missionBoss` (the flags
  `data/enemies.js` `isEliteCombatant` reads) plus `bossDressing` and `missionTag === 'capital_boss'`.
  It is cleared in `_sessionBoundaryReset`, re-seeded once on `save:loaded` from the live entities,
  and cleared on `capitalBoss:ended`.

### The authored stems
- `themeCompose.js` note time is bar-aware: `t0 = (bar * 16 + beat) * sixteenth`, and the end
  calculation includes `bar`. `beat` is the sequencer's sixteenth index (`step % 16`), so a bar is
  sixteen steps — the review's `bar * 4` would have moved the boss's bar-1 note by one beat.
  Measured on `theme_boss.wav`: A2 energy **0.1825** vs F#3 **0.0018** in 0.05–0.5 s, and F#3
  **0.2119** vs A2 **0.0379** in 3.7–4.5 s. The F# is the second bar's answer, not the opening.
- The 16 s **WAV reference** develops instead of tiling: four passes (A written, B the same line
  walked backwards with a fill, A with a fill and a held fifth, C from the second degree with the
  pad on the fourth), each a phrase long. Measured autocorrelation of `theme_travel.wav` at 4.00 s
  fell from **0.976 to 0.055**; no WAV exceeds **0.19** at 2/3/4 s. This is a claim about the
  authored WAV reference, not the heard `_seq*` runtime, which remains a short loop.
  `node assets/audio/generate-themes.mjs` → `15 authored themes, 6251 KiB total`;
  `--check` reports byte-identical.
- The boss tempo is 100 (was 132) with a two-bar phrase and rests; station is 72. The **authored
  theme tempo** has one source: the `MUSIC_STEMS` row in `src/data/audioRecipes.js`, read by
  `themeMatrix` (motif), the WAV renderer and the boss sequencer. The Adventure sequencers keep
  their own **arrangement** temp table (`scoreDirector.STEM_BPM` A 122 / B 124 / C 128 / D 116)
  because their 16th patterns and the stunt layer's 59–65 ms double-time contract are written for
  it — a different musical layer, not the station 116/72 drift the review found.
- Residency: the five 16 s loops are tier 2 and are **no longer force-acquired** at audio-graph
  build (~5.1 MB encoded, ~10 MB decoded). **The dead lazy fetch is removed (final review):**
  `_setMusicState` no longer calls `acquireThemeStem`; the heard score is `_seq*`, so nothing
  consumed it and the call pulled a ~1 MB loop on first state use. `themeCompose.acquireThemeStem`
  stays exported for a future listening mode; no runtime path polls it. Do not count either the
  tier-2 gate or the removed fetch as a shipping win until that mode exists. `_startStem` also
  copies `scoreDirector.STEM_BPM` inline; it should import the table. Both are recorded, not fixed
  here.

### Census and variants
- The census counted emitters, not cues. The real post-gate tap
  (`resolveCombatActionLifecycleCue` → `combatActionLifecyclePlayerRelevant` →
  `shouldPlayCombatActionCue` → `play`) over the table's own lifecycle band (154 rejects, 136
  phases, 47 completions, 45 starts) measures **382 submitted → 175 audible, 7 distinct cues**.
  Rejects admit one per four-tick gap (**39**), completions and starts are **0** (their end/start
  cues are deliberately quiet). `ship:rcsPulse` (391) is not a cue at all.
- `src/audio/cueVariants.js` rotates **three form takes** (rate 1 / 1.018 / 0.983, gain trimmed)
  per heard cue: the 7 scored combat-action cues plus 12 routine UI/loot/weapon recipes. Applied in
  `play()` through `cueVariantFor`, reset at the session boundary.

## Not done / open

- **The 10-minute ordinary-route recording and the blind naming check** are not recorded. This is
  the X4 acceptance step; the shared tree's boot was intermittent.
- **18 of the 30 census rows still have one body** (open, not raised): `physics:impact` severities,
  `projectile:hit`, `combat:damage`, `projectile:nearMiss`, `combat:tumbled`,
  `combat:statusApplied`, the massline verbs, `loot:drop`, the run awards, `mining:tick`,
  `asteroid:chunked`, cargo pickup/jettison, dock/undock and mission accept/complete. They are named
  in `AUDIO_CENSUS.md`; only the 19 rows that actually reach a `play()` call have the rotation.
  The sample library was 13.92 MiB across 157 samples against a 12 MiB payload ceiling.
  **Fixed 2026-11-07:** the five 16 s stems are canonical 16 kHz/16-bit mono PCM (512,044 bytes
  each), taking the library to **11.48 MiB**. The ceiling was not raised; the audio tests still
  pass 38/38 (`pq-158-00`, `pq-158-03`, `x4-boss-stem`).
- **The runtime score is synthesized, not the WAVs.** The five 16 s files are the authored
  reference loops (tier 2, test evidence, the listening/motif source); the heard stems come from
  `_seq*` sequencers and the motif data. The earlier "five authored stems are the heard score"
  claim was wrong and is retracted here. **The heard `_seq*` forms are short loops (~9.6 s for the
  boss); the 16 s development claim belongs to the WAV, not the heard score.**
- No live listening pass against `AUDIO_BRIEF.md` yet.

## Known red in the shared tree (not this pass's contract)

- ~~`test/pq-158-00-sample-library.test.mjs` — 13.92 MiB against the 12 MiB ceiling.~~ **Fixed
  2026-11-07** by the 16 kHz stem delivery above: 11.48 MiB, test green. The trade is top-end air
  above 8 kHz on five music loops; the note-window, hum and 4 s autocorrelation evidence is
  unchanged. A future lossless/compressed music format can revisit it, but the payload gate is met.
- `test/ear-score-host.test.mjs` — fails on `threat: quantised (21.666… → 21.666…)`. It is on the
  2026-10-27 bughunt re-fail list and predates this pass; the failing assertion is the first
  `threat` phase's fader boundary, which is stale because the tension stem idled during 20 s of
  travel. Not touched here.

## Next

1. Record 10 minutes of the ordinary route (Adventure + one Swarm round + boss), judge against
   `AUDIO_BRIEF.md`, run the blind naming check.
2. Author bodies (or write the exception) for the 18 open census rows.
3. Measure the music payload/residency on the E10 dashboard — the tier-2 gate keeps the stems out
   of first load; the removed dead fetch is not itself a measured residency win.
