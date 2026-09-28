# CR-CHAIN-1 — braid 1/5: volatile pod as a moving mine

**Built:** encounter 350, THE LONG TAIL (`src/data/encounters/350-the-long-tail.js`).

## The braid

A breached MTS fuel tender is already running from raiders down the lane when the player
arrives. Its hold is shedding volatile fuel-cell pods astern — a drifting trail of live
explosives strung through the pursuit corridor. Nothing about the mine is scripted: any
hull that clips a pod at closing speed (≥12 WU/s) cooks it off through the ordinary
`lootShards` volatile-slam path → radial impulse. The raiders are threading a moving
minefield to reach the courier, and every player verb braids on the same physical objects:
shoot a pod beside a pursuer, latch one and sling it, shove a raider into the line,
clothesline a chase pair across the tail, or scoop the freight while everyone else burns.

## How it composes existing systems

- **Director**: self-registered runtime (`fire`/`tick`) dispatched by `trigger.id`;
  pressure cost 38, cooldown 660 s, zones `trade_lane`/`refinery_approach`/`outlaw_zone`,
  gates `maxSecurity ≤ 0.75`, `minSectorTier ≥ 1`, `storyBeatMin ≥ 1`.
- **Cargo**: `d.spawnCargoPod` (new facade method on `encounterDirector.js`) routes the
  shed through `spawnJettisonedCargoPod` — real colliding pods: salvageable, tetherable,
  volatile-class `explosive`, owner-stamped to the tender.
- **AI**: courier stamped `forceFlee` + `moraleImmune` at flee speed with mauled hull;
  raiders committed `combat.targetId`/`ai.pursueTargetId` onto the courier under the
  thief doctrine.
- **Live shed**: while the courier moves >6 WU/s it keeps dropping pods astern
  (period 3.6 s, budget 9) via the per-shed deterministic `d.stream` labels.
- **Resolutions**: `defended` (raiders down → MTS rep + credits, courier keeps flying),
  `courier_down`, `courier_escaped` (>1500 WU from player), `raid_over` (95 s deadline).
  All resolutions release the cast to world ownership — no despawn stamps mid-fight.

## Validation

`test/cr-chain-1-long-tail.test.mjs` — 5/5 green:

- Shape registered in the shipped catalog (`minor`/`combat`, convoy × mule_trader).
- Braid materializes: fleeing courier at speed with breached hold, committed raiders,
  ≥5 explosive fuel-cell pods astern on the flee line.
- Tail keeps shedding while the courier runs.
- `defended` path: rep delta to `faction_mts`, courier survives unstamped.
- `courier_down` path: raiders released to world ownership, no despawn stamps.

Incidental repair: `test/opening-hauler-raid-and-pursuit.test.mjs` was red at HEAD —
`runTicks(60)` lands at `simTime = 0.9999…`, one float step short of the director's
1 Hz `_accum` pump. Bumped both windows to 90 ticks; file now 11/11.

## Not done in this unit

Braids 2–5 remain open on row 47: hitch on a working miner, wreck towed through a
search, clothesline on existing rocks, planet-well + field-well as one curve.
