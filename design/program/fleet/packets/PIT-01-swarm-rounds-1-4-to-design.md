# PIT-01 — Swarm rounds 1–4 (and the round-10 boss) play the way doc 12 says

The design authority is `design/game/12_SWARM_THE_PIT.md` (the round table at ~86–100, and "Kiln" ~133) and
`design/game/15_ARENA_FLOORS.md` (the Foundry). The INV-04 audit
(`.devshots/fleet/runs/INV-04-design-vs-config.hydrogen.2026-11-15T19-19-23/RECEIPT.md`, rows 6–10 and 17) found the
code drifted. **First verify each item is still true at HEAD (another agent may have fixed it); if it is
already right, skip it and say so.** One commit per item, exact paths, per the protocol.

## Items
1. **Kill-target ramp (lead decision).** Today round 1 uses its authored cast (10) and round 2 jumps to the
   formula `26 + w*4` (34, then 38, 42…) — a 3.4× cliff. New rule in `src/data/swarmMode.js` `swarmQuota`:
   `min(26 + 4w, 4 + 6w)` before the existing floor/bound clamps (round 1 = 10, 2 = 16, 3 = 22, 4 = 28,
   5 = 34 … they meet at round 11 and the old formula takes over). Keep `rewardReferenceKills` as it is.
   Round 1 must still be exactly ten Wasps (a recent commit pinned this; keep that test green).
2. **The freight lane debuts on round 4** ("Mind the Gap": "the lane runs for the first time"). Today it arms
   on every install and departs at 20 s of round 1 (`src/systems/survivalArena.js` ~1594,
   `src/systems/freightLane.js` 42–43). Hold it until round 4 begins on the Foundry; from round 4 on it runs as
   today.
3. **Round 1 is one gate and no wall guns; the first wall gun lights on round 2** ("Doors Open: ten Wasps,
   one gate"; "Second Helpings: Wasps from two gates. The first wall gun is lit"). Check which gates and
   wall guns are live on rounds 1 and 2 and make them match.
4. **No minor events or wagers in rounds 1–4** (row 10 of the audit: `SWARM_MINOR_EVENT_*`, the
   auto-accepted "Sling Tide" wager). The first four rounds are exactly what the table says.
5. **Round 10 Corsair Wing is five ships** ("five ships that fly as one") — today three. Make it five,
   keeping the existing formation behaviour; update its one-line description to match.

## Tests
Some tests pin the old off-design behaviour (round-2 quota, lane on round 1, three-ship wing). Update **only**
those assertions to the design's numbers, and list every test you changed with the old and new value in your
receipt. Run each touched file's tests (`grep -l`) before and after, plus `npm run check:sim`. No game boot.
