# SPEC2/07 — AUDIO IDENTITY (procedural, zero-asset, layered)

**Owner lane:** audio/systems agent. Read `spec2/00_MASTER_TASTE.md`. The synth stack
(`src/audio/{audioSystem,synth}.js` + `src/data/audioRecipes.js`) stays 100% procedural — that is a
shipping advantage (tiny build, infinite variation). This spec gives it a spine.
**Files:** the three above + hooks reading existing bus events ONLY (no new sim events).
Mix rule of law: the game at rest is QUIET. Silence is the canvas; sounds are information.

## 1. The mix architecture (buses exist — enforce budgets)
Master ≤ −6 dBFS. Buses: engine (−18 target), world/ambient (−24), combat (−12), UI (−20),
comms (−16), music/pads (−26). Sidechain: combat bus ducks ambient+pads by 6 dB (120 ms attack,
900 ms release). Never more than 12 simultaneous voices; steal oldest-quietest.

## 2. Engine & motion (continuous layers, all driven by existing state)
- Engine hum: 2-osc drone (saw+sine, detune 6 ct) pitched by thrust tier — idle 55 Hz, combat
  thrust 78 Hz, boost 110 Hz + noise layer, cruise 65 Hz clean fifth. Portamento 300 ms.
- Dash: 80 ms filtered-noise whoosh + sub thump (ship:dash event, exists).
- Brake (helm): reverse-thruster hiss while actions.brake && speed > 20 (white noise, band 800 Hz–
  2.4 kHz, gain ∝ decel).
- Tether: latch clunk (two 30 ms wood-metal knocks); hum while phase='loaded' (sine at
  90 + strain×220 Hz, gain ∝ strain — reads tension without any HUD); whipcrack on release
  (exists as event); snap = crack + 200 ms detuned twang on 'tether:broke'.
- Cruise: charging = rising two-tone (spec2/02); engaged = low even drone; SNARED = pitch-bend down
  a fourth over 300 ms.

## 3. Combat & world (event one-shots — bind to the spec2/02 juice table 1:1)
Every row of the juice table gets exactly one recipe id in audioRecipes.js, named
`sfx.<event>` (e.g. `sfx.shieldBreak`). Shield hits pitch-stack: consecutive hits within 2 s climb
+1 semitone (max +4) — the classic "you're winning" ladder. Kill crump: 60 Hz sine burst + noise
tail 400 ms; capital kills add two pre-detonations. Impulse charge: 45 Hz thump, radius-scaled gain.
Mining: beam = filtered pink noise (center 1.2 kHz) + heat-pitch rise; vent-bonus chime = major
third pair, 90 ms, THE reward sound — never reuse it elsewhere; seam hit tick at ≤ 2/s.

## 4. Place & ambience (palette-class pads — the sector identity in your ears)
One evolving pad per palette class, 4-voice, LFO-slow (0.05 Hz), volume −26 dB:
core = clean fifths (A2+E3) with soft bell every ~45 s; belt = detuned drone + distant rumble
(brown noise LP 120 Hz); fringe = minor seconds, sparse radio-static ticks; anomaly = inharmonic
partials (ratio 2.76) + reversed swells. Crossfade 4 s on jump:arrive. Station interiors: pad
drops, add room tone + PA murmur loop (noise-shaped, unintelligible).

## 5. UI & comms
UI: hover = 2 ms tick (−26 dB), confirm = short fifth up, error = muted thud (never a buzzer),
chip appear = single 1.5 kHz tap. Comms: each line opens with a 120 ms squelch tuned per category
(story=violet-warm sine, ambient=dry click, danger=harsh band) — the EAR learns the tiers.
One-voice applies to audio: comms squelches never overlap (queue by the same gate).

## 6. Acceptance assertions (`scripts/check-audio-identity.mjs`)
1. Recipe coverage: every juice-table event id resolves to a recipe (static audit of
   audioRecipes.js vs the spec table). Missing = fail.
2. Mix budget: scripted 60 s combat scene — master peak ≤ −6 dBFS, voice count ≤ 12 at all times
   (instrument the scheduler).
3. Tether hum gain tracks strain monotonically in the harness (0 → 0.9 strain sweep).
4. Pads: jump between two palette classes crossfades ≤ 4.5 s, no click/pop (zero-crossing check).
5. Mute/volume settings apply within 100 ms; per-bus sliders in Settings→Audio work (extend the
   existing screen only with buses that lack sliders).
