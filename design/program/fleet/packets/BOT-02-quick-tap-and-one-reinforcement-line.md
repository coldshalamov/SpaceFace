# BOT-02 — The Swarm bot throws like a person; one line per reinforcement event

Evidence: `.devshots/fleet/runs/ACCEPT-04-first-hour.hydrogen.*/RECEIPT.md`, `.devshots/fleet/accept04/`.

## 1. Swarm demo bot: tap within ~1 s of the latch (harness only, `scripts/fleet/looks/demo-route.mjs`)
Across ACCEPT-02/03/04 the Swarm bot latched Wasps but threw 0 times: it waits for the lit `RMB · THROW` cue, which rarely
lights in Swarm, and the held Wasp dies (`target_lost`) after a few seconds of the fight. A person taps soon after
latching. Change the Swarm cycle: after the latch is confirmed on a throw-capable body, swing toward the nearest pack for
0.4–0.8 s and tap (tap earlier if the cue lights). Keep the per-cycle logging. Run once headed through the lock (never
kill a holder you did not start) and report throws, kills attributed to the thrown body, and first flight → first throw.

## 2. Reinforcements: one event, one line
In Adventure one reinforcement arrival produced three different strings: "Reinforcements have arrived." (×7),
"HOSTILE REINFORCEMENTS INBOUND" (×5), "REINFORCEMENTS ON FIELD" (×5). Find the three owners. Keep ONE player-facing line
per arrival (the most informative; the one-voice/callout owner if one exists), and make the others log-only. Test it.
Exact-path commits; tests before/after for touched files; `npm run check:sim` green (explain any 47-A move; do not edit
the golden).
