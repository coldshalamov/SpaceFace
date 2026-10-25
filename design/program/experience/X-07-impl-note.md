# X-07 impl note — the peg stops banking

`_beamPegged`/`_pulsePeggedS` in mining.js: pegged pulse ore stops ACCRUING while extraction
stays full-rate and banked ore is never forfeited (owner ruling holds — no-lockout suite green).
`clean`/`peggedS` ride `mining:ventBonus`; CLEAN CUT speaks in the existing word slot for 1.2 s;
two one-time hints (`miningCleanCut`, `miningPegged`).

Tests: `x07-peg-stops-banking` 5/5; keep-green 32/32 (incl. all three no-lockout cases).
Digests: `inf-mine-heat-4242` and `first-hour-economy-floor` UNCHANGED (no scripted pilot was
holding a pegged beam); `rc-458` fails two flight-verb pins ('stroke' verb, drill fold count) —
foreign drift outside mining/vent domains, verified unrelated.
