# SPEC2/03 — THE FIRST HOUR (onboarding, menus, difficulty ramp)

**Owner lane:** systems+content agent. Read `spec2/00_MASTER_TASTE.md` (§5 copy voice is law here).
**Files:** `src/systems/onboarding.js`, `src/systems/story.js`, `src/data/missions.js` STORY_BEATS /
BEAT_CONTENT, `src/contracts/` 47a scenario scripting, `src/ui/screens/{mainMenu,newGame}.js`,
new `scripts/check-first-hour.mjs`. **Do not touch:** comms gating (shipped), control prompts.

## 1. Why: the current open teaches five things at once
The intro modal + tutorial panel + objective + comms all landed in second one (partially fixed by
the one-voice gate). The fix is PACING, not deletion: one beat → one verb → silence → next beat.

## 2. The first fifteen minutes (replaces current STEPS pacing; reuse systems, not new ones)
Timing gates: a beat's text may only fire when the previous beat's DONE condition fired AND ≥ 4 s of
text silence has passed. All lines ≤ 12 words, dry-rigger voice.
- **B0 WAKE (0:00)** — no modal. Black → fade in over 2 s. Single line (tutorial tier):
  "Thrust to the beacon." DONE: within 420 wu of beacon. Teaches: mouse-nose + W.
- **B1 THE DERELICT (≈1:30)** — derelict wreck near beacon. "Latch it. Massline." → latch → "Winch in. Hold tether to reel." → reel ≤ 60 wu (production `tether:reel` after) → "Cut and coast. Tap tether to cut." DONE: released. Teaches tether trio. The wreck drops 2 salvage pickups on release (vacuum shows itself — no line needed).
- **B2 FIRST SEAM (≈3:00)** — "Pulse. C." → scanner lights a marked rock's seams → "Beam the bright
  seams. RMB." → first vent-bonus chime gets ONE line: "Release in the amber. Remember that." DONE:
  3 ore collected. Teaches scan + seam aim + heat rhythm.
- **B3 THE SNARE (≈5:00)** — scripted weak pirate interdicts (spawn 700 wu, attackRun telegraph).
  "Trouble. Guns follow your cursor." He flees at 30% hull, dumping cargo. If player dies: respawn
  at beacon full-heal, pirate stays damaged (no punishment spiral). DONE: pirate dead or fled.
- **B4 DOCK (≈7:00)** — "Helios. E when close." Auto-dock prompt at range. Inside: sell flow
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
  - **Open item (2026-07-03):** the B2 yield (~3 ore at `cmdty_ore_iron` basePrice 28) sells for
    ~84 cr, below the 180 cr floor. Equilibrium/`basePrice` live in `src/data/commodities.js` +
    `src/systems/economy.js` (outside the spec2/03 ownership lane). The `first1000cr` funnel milestone
    that gates this ramp *is* wired in `scripts/check-first-hour.mjs`; the B2-alone 180 cr floor
    itself is NOT asserted there because the economy sim is out of lane. The fix belongs to the
    economy lane. Acceptable for this pass: the onboarding B2 beat teaches the seam mechanic; the
    credit floor is met over B2+B4 (ore + first contract), not B2 alone.

## 5. Acceptance assertions (`scripts/check-first-hour.mjs`)
1. Scripted run: beats fire in order; no beat's text appears before predecessor DONE + 4 s silence.
2. Text overlap count == 0 across the full scripted first-15 (one-voice audit, automated).
3. Every tutorial line ≤ 12 words, passes check:player-facing-labels.
4. B3 pirate flees at ≤ 30% hull and drops ≥ 1 pickup; player death during B3 respawns ≤ 3 s.
5. `check:onboarding`, `check:first-15-runtime`, `check:new-game-first-run` green (update their
   expectations deliberately in the same PR — this spec supersedes prior first-15 content).
