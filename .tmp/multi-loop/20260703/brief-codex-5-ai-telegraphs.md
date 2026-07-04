# TASK: AI readability — telegraphs, flee visibility, wedge formations-lite (SpaceFace WS-D4) — WAVE 2

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §6.2 and `design/BUILD_PLAN_2_0.md`.
Study `src/systems/ai.js` (archetype FSM — your main file), `src/systems/aiPorts.js`, the NPC intent
contract in `src/systems/flight.js` header (6-field schema is FROZEN — do not extend it), and how
`check:sg06:ai` runs (scripts/check-sg06-ai.mjs).

## Build exactly this
1. **Attack telegraph**: 0.5 s before transitioning into ATTACK/STRAFE with weapons hot, hold fire and emit
   `ai:telegraph {entityId, kind:'attackRun'}` once. During telegraph the NPC still maneuvers. Heavy
   weapons (dps > 40) get `kind:'alphaStrike'` with 0.8 s. Consumers (VFX/audio) hook later — emit only.
2. **Visible flee**: on FLEE entry, emit `ai:flee {entityId}`; 30% of fleeing pirates jettison 1–2 cargo
   pickups (existing pickup spawn util; deterministic via state.rng) — flee reads as panic AND rewards the chase.
3. **Wedge formations-lite**: patrol groups of 3+ spawn with a leader; wingmen hold offset slots
   (±35° behind, 60 wu) via their existing intent steering (aimAngle/moveX/moveZ toward slot point —
   NO new pathfinding). If the leader dies: emit `ai:formationBroken {groupId}`, wingmen get
   `data.morale = 'scattered'` for 8 s (flee-style steering, no fire), then resume solo behavior.
4. **Comms barks**: on telegraph/flee/formationBroken, emit `comms:popup` with category 'ambient',
   sender = ship name, SHORT bark text (write 3 variants each, pick via state.rng). Respect a global
   bark cooldown: max one AI bark per 4 s game-wide (track `state.combat.lastAiBarkAt`).
5. Extend `scripts/check-sg06-ai.mjs` runs config OR add `scripts/check-ai-telegraphs.mjs`: assert
   (a) telegraph precedes first shot of an attack run, (b) leaderless wingmen scatter then recover,
   (c) bark cooldown holds under a 6-ship brawl.

## Constraints
- Files: `src/systems/ai.js`, `src/systems/aiPorts.js` (slot steering only), new/extended check script,
  package.json (one line). Do NOT touch: flight.js, combat kernel, render/UI/audio, input, goldens.
- The 6-field NPC intent schema is FROZEN. Telegraph state lives in `e.data.ai.*`, not new intent fields.
- Determinism: state.rng only. Same golden-drift protocol as always: hashEqual+nullDivergence → report, don't edit.

## Verify
```
npm run check:sg06:ai && node scripts/check-ai-telegraphs.mjs && npm run check:sim:compare
```
Write the files. 10-line summary max.
