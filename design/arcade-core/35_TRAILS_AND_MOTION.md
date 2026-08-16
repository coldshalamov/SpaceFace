<!-- LIFETIME: DURABLE -->
# 35 — TRAILS & MOTION READABILITY: seeing velocity

Top-down space has no motion parallax for free — we *make* speed visible. Every moving body
communicates velocity vector through presentation, never UI arrows (I-4).

## The toolkit

- **Engine trails** scale with *thrust* (not speed): a braking burn reads as a nose-ward
  flare; coasting is quiet. Direction of thrust ≠ direction of motion is the Newtonian tell —
  trails make it learnable.
- **Boost streaks**: long particle-stretched lines + a brief local speedline pass (pooled,
  cheap). Cruise gets the big tunnel-line treatment (cruise.js exists) — speed tiers must
  *feel* like different gears.
- **Drift tell**: a ship moving sideways relative to its nose gets a subtle skid-glow at the
  trailing edge — the "you are drifting" read without a gauge.
- **Tumble read** (02): tumbling ships trail a *spiraling* smoke ribbon — rotation and
  translation both visible. This is load-bearing for style-kill setup.
- **Mass read**: heavy engines burn slower-brighter-wider; light engines flicker. You should
  feel a freighter's mass in its plume before it moves.
- **Speed-reference dust**: a sparse near-field dust layer gives absolute velocity a reference
  (cheap particles, one layer, no parallax stack — perf contract).

## Bans

- No camera-based speed effects (no zoom/fisheye pulses — I-2).
- No persistent trails on the off-glass world (perf: trails follow the table).

## Acceptance

- Human gate: muted capture of a drift-turn, a boost, and a tumble; owner correctly calls each
  ship's motion state from visuals alone.
