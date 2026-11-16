# CHIP-CHECK-01 — Do credit chips still render after PERF-HOT-03's instancing? (verify, fix if broken)

You instanced the credit chips in PERF-HOT-03 (`b360307bde`, `d37a3bf26a`). A headed playthrough of Swarm round 1
on HEAD (`.devshots/fleet/accept01/swarm/08..10-*.png`) saw **no** minted hex chip stacks after 26 kills; the only
candidates are small flat beige diamonds (e.g. `10-release.png` around x 735 y 150 and x 880 y 225) — those may
be floor pads, or the chip drawn wrong.

## Do this
1. Write a probe under `.devshots/fleet/chipcheck/` that boots `/?swarmRound=1` (copy the boot loop from
   `scripts/fleet/looks/scene-census.mjs`), waits for the fight, kills one hostile through the page
   (`SF.state` damage, or let the round play), then: lists entities with `data.kind === 'credit_chip'` (count,
   positions), reads the chip InstancedMesh parts (name, `count`, visible, material, geometry vertex count), and
   takes a screenshot cropped tight around one chip's projected screen position (camera zoomed in if the game
   allows). Run ONLY through the lock; never kill a lock holder you did not start.
2. If chips exist as entities but the instanced parts have `count` 0, wrong matrices, or the wrong geometry —
   fix it in your PERF-HOT-03 code so a chip looks exactly as before (hex stack, rim, stamp, bar; spin/bob).
   Add a test that a live chip entity produces one instance in each part with a non-zero, finite matrix.
3. If chips render correctly, say so with the crop path, and say what the beige diamonds are (their owner).

## Receipt
Chip entity count, instanced part counts, the crop path, and fix commit(s) if any.
