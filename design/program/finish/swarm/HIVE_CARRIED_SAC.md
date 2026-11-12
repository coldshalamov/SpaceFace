# Hive: the thrown source lands where its consequence does

Exact reviewed parent: `99e0e58bc30c858a35649814e251ee35a9c30e2d` (#942). This is physical interaction completion, not another scheduled read window.

## What already exists

`src/systems/swarmArena.js::_hiveInstall` builds living walls and light, tetherable sacs. The sacs spend the wave's finite Brood reserve, drip acid, and can be moved by ordinary physics. `_hiveTick` follows each living body's coordinates. On death it calls `swarmBrood.hivePool` and `hiveSacFell`: the latter arms the authored grief reaction around the corpse. Killing a source strands its unspent share rather than granting new quota or rewards. These mechanics already make a sac something to shoot, carry away from a route, or sling toward the pack.

## The broken connection

Before this increment, the death branch ran before reading the body's last position. A sac killed after physics moved it left its terminal acid/grief at the previous arena sample, not its landing point. If removed before the next arena tick, the ID-only ledger could also read a new occupant as the original. That contradicts the physical opportunity: the body visibly lands in one place while its consequence can happen elsewhere.

## Player-facing result

The sac ledger now retains its original runtime body reference. The final observed physics pose supplies the one terminal burst, even when the map no longer contains the body. A recycled ID cannot inherit its birth cadence or be retired by its old room. Consumption precedes callbacks, and a room-ending callback stops the old tick. This changes no movement, damage magnitude, reward, quota, asset, or special ability. The player's reason to move the sac is fulfilled by the existing effect owner at the actual destination.

## Evidence and limits

- New seam tests: 6/6. Retained dead body, removal receipts, recycled ID, synchronous reentry, room-ending callback and late cleanup are covered. Direct pose fixtures are not flight evidence.
- Combined new suite, Hive tide and module-library contracts: 19/19.
- Independent existing dressing+tide suite: 9/14 both candidate and exact parent, same five prior boss-dressing failures.
- Production-manifest native probe moved an original sac 66.6525WU through Rapier. Its final physics step advanced from (109.1062,175.8419) to (110.4145,175.3300); production fracture and room tick placed the terminal pool at the latter point. The probe uses an impulse and direct production fracture invocation, not a human-controlled tether throw, ordinary earned Hive unlock, or rendered playthrough.
- No full Save/Continue, rendered acceptance, or complete Hive combat acceptance is claimed. Runtime reference ownership is intentionally not a new persistence schema.

An initially considered capacity-retry change was removed: a blocked return can be mocked, but ordinary finite-plan capacity exhaustion was not demonstrated. It is not part of this patch.
