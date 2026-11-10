# HOLD — sg02 Rapier call diet (#166 pass; not a package)

**What it does.** Hot `addForce`, `addTorque`, `setLinvel` and `setAngvel` now go through one retained RawVector (public `RAPIER.VectorOps.intoRaw`) plus `world.bodies.raw.rbXxx(handle, raw, true)`. `wakeUp()` and `isSleeping()` are skipped on bodies built cannot-sleep; in Rapier `wake_up` on such a body is a no-op.

**Correctness.** `test/sg02-rapier-call-diet.test.mjs` runs a 2400-tick mixed deterministic run (contacts, player give, clamps, impulses, tether, S2 rock sleep, resync) and poses are **bit-identical**. A mutation check confirmed the test is sensitive.

**Speed.**

| Measurement | Result |
|---|---|
| Node owner bench | 56 → 47 µs/tick (~1.19×) |
| In-page replica | 1.09× / 1.13× (floor 0.78–0.99) |
| Live interleaved | 190.5 vs 190.4 µs/tick and 218 vs 226 µs/tick, i.e. ~0–8 µs/tick, within noise |

**Why it holds.** Below the bar. Setters drop from ~236 ns to ~25 ns, but the getters (~260 ns each, allocating) can only be removed by the excluded "prestep kinematic carry". Diet + carry is estimated at 1.35–1.45×.

**Where it lives.** Scratch branch `vm-work/hold-sg02-call-diet-20260926`. Patch is in `patches/`.
