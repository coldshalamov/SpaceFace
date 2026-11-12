# Forge Regent: a crown before the crowd

Parent: PR #942, `bb386fca171b1b7da40a0bbaf5630494dffde65b`.

## Connected experience and decision

Round 24's mass-gap wall asks the pilot to move around a physical obstacle. Round 25 now lets that crossing lesson meet the Forge Regent's plated front and committed furnace beam before ordinary pressure joins. Round 26–28's existing Mooring Line remains the next authored act; this change does not replace its opening recipes.

The source toolbox is already sufficient: `src/data/encounters/capital-boss/regent.js` owns the crown check, tracked-then-locked furnace, recovery, rim check and phase-triggered screen. `src/data/swarmFoundryScore.js` coordinates the existing ship/Brood owners. We reuse those systems rather than add a boss, asset or independent encounter clock.

## Implemented

One sparse Foundry score at round 25: champion still admitted on its ordinary tick, ordinary ship/Brood pressure waits 1,200 active input-clock ticks, then resumes against the same finite debt. The boss's own attacks, phase-triggered screen, hull, rewards and motion are unchanged. Its screen can enter earlier if the pilot reaches the relevant damage phase; the score does not postpone earned phase transitions.

Round 24 is an explicit null score, so its mass-gap room and delayed wall arrivals remain authoritative. Rounds 26 onward retain their existing owners. Other arenas, mutators, Circuit and non-Swarm modes remain excluded. Quiet event policy is deliberate boss focus, consistent with the boss being the event; the source event selector already skips boss rounds. No asset request is needed.

## Evidence and limitations

Matched seed 73311, staged round 25, stock energy kit, ordinary weapon-group input followed by a stationary actor. Native runtime uses real tactical/flight/Rapier and capital score owners, but a selected system list, not an earned campaign or complete production launch.

- Parent: 11 admitted ships and 122 living Brood at tick 240; actor died at 802, before the first furnace attack.
- Candidate: one admitted champion and zero Brood through sampled tick 1080; actual `crown_check` and `furnace_beam` attacks executed before the ordinary crowd starts at 1200. Hull remained 140 in this particular stationary sample.
- This establishes foreground isolation and preserved score execution, **not** a dodge, difficulty target, full boss defeat, visual readability or normal-play survival guarantee.
- Scoped tests retain action/pause/retry semantics, all 160 Brood lives including held birth reserves, finite ship debt, adjacent rooms and malformed/old score lookup. The first test draft mistakenly treated a champion as first-action-gated and omitted held reserves from conservation; corrected assertions preserve the existing laws rather than changing runtime to fit them.

## Open goals

| Marker | State / owner | Outcome and next action | Acceptance gap / user operation |
|---|---|---|---|
| SF-GAME | In progress / experience integration | Play earned 24 → Regent → Mooring with ordinary fittings and deliberate crossing attacks. | Native staged first read only; no user operation needed for further source work. |
| SF-WORLD-DIRECTION | In progress / creative direction | Keep crossing, commitment and physical mass as this act's connected vocabulary. | Human pacing and rendered composition unreviewed. |
| SF-SECTOR-COHERENCE | In progress / experience integration | Verify the crown room follows the surviving wall geometry without trapping approaches. | Full late-run terrain and Save/Continue not established. |
| SF-LIVING-WORLD | Open / Adventure owner | No Adventure state or inhabitants changed by this Swarm increment. | Not completed or archived here. |
| SF-ASSETBANK / SF-ASSET-QUALITY | Review only / local production remains owner | Reuse existing Regent hull, crown, ballast and VFX; request nothing new. | Crown render tests are not visual review. |

No merge or deployment. Publication/CI status belongs in the delivery receipt, not inferred from these tests.
