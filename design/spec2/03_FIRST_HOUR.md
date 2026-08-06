# SPEC2/03 — THE FIRST HOUR (onboarding, menus, difficulty ramp)

**Scope:** onboarding pacing and first-session content. `spec2/00_MASTER_TASTE.md` supplies historical
voice examples, not a prose validator.
**Files:** `src/systems/onboarding.js`, `src/systems/story.js`, `src/data/missions.js` STORY_BEATS /
BEAT_CONTENT, `src/contracts/` 47a scenario scripting, `src/ui/screens/{mainMenu,newGame}.js`,
new `scripts/check-first-hour.mjs`. **Do not touch:** comms gating (shipped), control prompts.

## 1. Why: the current open teaches five things at once
The intro modal + tutorial panel + objective + comms all landed in second one (partially fixed by
the one-voice gate). The fix is PACING, not deletion: one beat → one verb → silence → next beat.

## 2. The first fifteen minutes (replaces current STEPS pacing; reuse systems, not new ones)
Timing gates should prevent instructional beats from competing. Tune spacing from reading time,
urgency, input modality, and playtest evidence; write concise lines in the speaker's actual voice.
- **B0 WAKE (0:00)** — no modal. Black → fade in over 2 s. Single line (tutorial tier):
  "Contract 47-A: thrust to the beacon." DONE: within 420 wu of beacon. Teaches thrust toward the marked objective; modality-specific chrome owns physical controls.
- **B1 THE DERELICT (≈1:30)** — derelict wreck near beacon. "Latch it. Massline." → latch → "Winch in. Hold tether to reel." → reel ≤ 60 wu (production `tether:reel` after) → "Cut and coast. Tap tether to cut." DONE: released. Teaches tether trio. The wreck drops 2 salvage pickups on release (vacuum shows itself — no line needed).
- **B2 FIRST SEAM (≈3:00)** — "Pulse the scanner." → scanner lights a marked rock's seams → "Beam
  the bright seams." → first vent-bonus chime gets ONE line: "Release in the amber. Remember that." DONE:
  3 ore collected. Teaches scan + seam aim + heat rhythm.
- **B3 THE SNARE (≈5:00)** — scripted weak pirate interdicts (spawn 700 wu, attackRun telegraph).
  "Trouble. Fire on the raider." He flees at 30% hull, dumping cargo. If player dies: respawn
  at beacon full-heal, pirate stays damaged (no punishment spiral). DONE: pirate dead or fled.
- **B4 DOCK (≈7:00)** — "Helios. Dock when close." The modality-specific dock prompt appears at range. Inside: sell flow
  highlights the SELL tab once (existing hub tab glow), then "Board's got one job for you." —
  mission board shows exactly ONE recommended contract (recommendation engine exists).
- **B5 CHOICE (≈12:00)** — completing that contract opens three side-by-side offers, one per loop:
  HAUL (trade), BOUNTY (combat), SURVEY (explore). Accepting any ends tutorial mode permanently.
  Contextual hints continue only via the existing one-shot hint system.

## 3. Menus & shell polish (mainMenu/newGame)
- Title screen: keep current art; add 12 s idle attract — camera drifts through a live background
  sector (render-only, no sim). Menu items gain 90 ms stagger-in on first show only.
- NEW GAME: pilot-name field autofocuses; difficulty copy ≤ 8 words each; START disabled-state
  never visible longer than 300 ms (async warmup happens behind the veil).
- First-run only: after START, a single full-screen line on black, 2.5 s: "Helios System. Third
  shift. The manifest is wrong." Then B0. No other splash.
- CONTINUE loads into a 1 s black-to-game fade with the location name bottom-left ("HELIOS BELT").

## 4. Difficulty ramp (first hour targets — tune data, not systems)
- Median first kill < 6 min, first 1000 cr < 10 min, first module purchase < 20 min, first jump
  < 30 min (telemetry funnel verifies — `window.__SF_TELEMETRY__`).
- Pirate spawns within 2 sectors of start: max archetype 'pirate', level 1–2, solo or pair. No
  sniper/capital archetypes until the player has jumped once.
- Economy floor: starter sector sell prices guarantee the B2 ore ≥ 180 cr total (verify against
  economy sim, adjust station equilibrium not prices).
  - **Resolved (2026-08-06):** Helios now authors an iron-only equilibrium factor through the shared
    economy construction path. The commodity remains 28 cr at base equilibrium and other listings
    keep their ordinary role targets; `test/first-hour-economy-floor.test.mjs` proves the three-unit
    executable sale stays at or above 180 cr across 512 deterministic fresh-game seeds.

## 5. Acceptance assertions (`scripts/check-first-hour.mjs`)
1. Scripted run: beats fire in order; no beat's text appears before predecessor DONE + 4 s silence.
2. Urgent instructional text is not obscured by competing transients; persistent objective/context
   remains available when useful.
3. Tutorial lines pass `check:player-facing-labels` and are readable during the action they teach.
4. B3 pirate flees at ≤ 30% hull and drops ≥ 1 pickup; player death during B3 respawns ≤ 3 s.
5. `check:onboarding`, `check:first-15-runtime`, `check:new-game-first-run` green (update their
   expectations deliberately in the same PR — this spec supersedes prior first-15 content).
