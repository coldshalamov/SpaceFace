# NOTICE-01 — Repeats stop flooding Adventure; the tutorial raider is latchable

Evidence: `.devshots/fleet/runs/ACCEPT-03-first-hour.hydrogen.*/RECEIPT.md` and `.devshots/fleet/accept03/adventure/`
(390 non-HUD notices in 8 min, 94 unique).

## 1. The tutorial raider says TOO HEAVY (blocks the opening)
After the first throw the objective is "Latch the raider. Swing him into the rock." — but the one weight rule
(`entityOverLineClass`, `src/data/lineProgression.js`, class I = 20 t) marks the raider TOO HEAVY. The lesson rock is
already exempt (`data.rescueRole === 'rock'`). Make the tutorial raider (the raid beat's raider; find its role/tag in
`src/onboarding/` / `src/systems/onboarding.js`) exempt the same way in both the tag and the overclass snap. Test it.

## 2. Repeats (each with its owner)
Top repeats: "Tender: Lane's still hot — holding where I sit until it clears." ×45; "Time slows — latch the flyby before
it clears" ×32 (a tutorial prompt looping); "Salvor: Lane's still hot — holding at Scrap Yard until it clears." ×27;
"CARGO RECOVERY NOTICE: Bounty after the spill." ×18; "Reinforcements have arrived." ×12; also "Miner: Lane's …".
- Find each string's owner. NPC lane-hold barks: say it once when the lane goes hot, not on every re-check; at most
  once per 60 s per speaker. The "Time slows — latch the flyby" prompt: at most 2 showings per flyby event, and never
  again once the player has latched one. CARGO RECOVERY / Reinforcements: once per event, folded with a count if
  it repeats.
- Add a general guard in the toast/receipt path (`src/ui/toasts.js` already merges an identical live card): an identical
  text that was shown in the last 20 s is dropped (errors excepted). Keep the one-voice rules.
## 3. A stuck "AFTERMATH / FIELD RESPONSE" card (frames 21–40) stays up for minutes — find its owner and give it a TTL
or dismiss it when its event ends.
Tests per owner; before/after test runs for touched files; `npm run check:sim` green (report if 47-A moves — barks may
be in the replay telemetry; do not edit the golden, explain). Exact-path commits.
