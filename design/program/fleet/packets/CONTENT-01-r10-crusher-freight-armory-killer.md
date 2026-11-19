# CONTENT-01 — Round 10's crusher wakes; the freight lane is seen; armory keys work; the killer is named

Evidence: `.devshots/fleet/runs/ACCEPT-06-later-content.hydrogen.*/RECEIPT.md` (top-10 items 1, 8, 10), frames in `.devshots/fleet/accept06/`.
Design: `design/game/12_SWARM_THE_PIT.md` (round 10 Corsair Wing: "**The room changes** — the crusher wakes"),
`design/game/15_ARENA_FLOORS.md` (the Foundry; freight lane "container strings every forty seconds, amber lights, a klaxon").

1. **The crusher.** Round 10 on `helios_core` installs the same plate/gate/furnace toys as round 5 and no crusher, though
   `swarmCourse.js` promises "the room changes — the crusher wakes" and `'crusher'` exists in `src/systems/survivalArenas.js`
   (~275). Find why it isn't installed on round 10 (a wave gate, a missing toy entry, a disabled flag) and make it wake on
   round 10 as authored (it should be a visible, readable hazard the player can use — throw things into it). Test: round 10's
   plan/install includes the crusher; rounds 1–9 do not.
2. **Freight lane warning.** Round 4's lane announces only with `sfx_hauler_foghorn`; a muted or off-lane player gets nothing.
   Add the design's visual: amber lane lights pulsing before departure plus ONE short world/HUD cue at the lane (through the
   existing one-voice / callout owner; no new toast lane). Test: a departure warning emits a visual cue event.
3. **Armory `1–3 BUY & FIT`** in the footer does not buy on Digit1–3. Wire the keys to the dealt cards (respect rebinding /
   the input owner), or remove the claim from the footer if the design doesn't want it — prefer wiring. Test it.
4. **"Unknown contact killed you"** when the round-5 / round-10 boss or its escort kills the player. The death attribution
   should name the boss / escort (as the HUD does). Find where the killer name resolves to "Unknown contact" for champion /
   boss-package bodies and fix it. Test it.
Exact-path commits; tests before/after for touched files; `npm run check:sim` green (explain any 47-A move; never edit the golden).
