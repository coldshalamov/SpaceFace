# Finite beam repair resources

## Result and deliberate policy

The existing generic repair beam accepted any scrap as permission to weld but never consumed it. It also requested a credit charge that could clamp to zero, then applied the entire heal anyway. A native exact-before probe reproduces Neri 266→380 hull with only one credit actually spent, all 190 credits requested, and the one scrap still aboard (`/tmp/beam-repair-before-native.log`). This is not a claimed new Neri scene.

The user-authorized balance choice is explicit: **one unsealed scrap buys up to 20 combined repair HP**, matching the Working Bench's feature-specific quantity as a chosen policy, not an assertion it was already the generic rule. Dock prices and the tender's separate 30-point hull patch are unchanged.

The beam uses already-paid material first, otherwise credits, otherwise buys one unsealed scrap's repair reserve when credits are exhausted. Credit rate remains 1.5 per HP rounded up per beam tick; credit-funded work is capped to affordability and actual missing health. Hull and armor now share one heal budget, hull first. This deliberately removes the old double restoration where a single charged heal could replenish both channels by that amount. Subsystem work uses the real combat kernel and its actual missing health rather than the old absent `combat.repair` method. No charge is committed when the selected subsystem/owner is unavailable.

Unused material lives in optional `player.beamRepairMaterialHp`, bounded to [0,20], and survives beam release, changing target and normal player save/restore. Malformed/out-of-range values do not buy work. There is no repeated per-frame scrap charge, and no need to finish a target to retain paid remainder. One material-use notice explains the rate and retained work; the insufficient-resource message also names unsealed scrap and the rate. No new model or service UI.

## Transaction boundary

No economy, cargo, combat-kernel or save owner was edited. In particular Lane 2's economy.js claim remains untouched.

An exploratory real-economy probe (`/tmp/repair-exact-fence-review.mjs`) established that putting cargo callbacks inside an exact **mixed** credit commit is unsafe: an ordinary charge from the callback can spend the balance, while the outer exact request reports success with zero final debit. This candidate does not compose that transaction.

- Credit-only ticks use the existing exact `requireFull` request and a callback-free health commit. Receipt/VFX notices occur after payment. No payment listener or stale balance means no heal.
- Material purchase separately installs a 20-point reserve before calling canonical `removeCargo`. That owner mutates inventory before its `cargo:changed` notification, so callback observers see both the consumed scrap and prepaid remainder. No credit debit occurs in this branch.
- Only canonical sellable/unsealed quantity authorizes purchase; preloaded contract reservations remain aboard.
- Per-state reentrancy guard spans the transaction. Player/target object and lifetime are captured before purchase and rechecked after cargo callbacks and within credit commit. Interrupted purchase retains its entire paid reserve without healing a replaced body.
- Reserve debit and actual health application have no notification between them. Subsequent observer callbacks see a settled state.

Root review also caught a post-payment receipt-lifetime gap: credit/material notice callbacks could replace the target after payment but before `beam:repaired`. The mining wrapper now checks original player/target lives, sector and flight/restore/dock context before the receipt, and again before completion speech. Both notification paths have replacement regressions. Paid work is not refunded or applied a second time.

Independent review caught an initial generation-boundary defect: the pre-purchase target plan was discarded and a later plan could bind a changed generation. It is fixed with pre-callback lifetime capture plus owner regressions. The subsystem test initially used incorrect key `drive`; corrected canonical `subsystem_drive` tests the real kernel. The native low-fund assertion initially expected 2/3 HP for one credit, but actual 60-Hz Mk1 work is 0.6 HP per tick; the retained per-tick ceil pricing correctly charges one credit for that 0.6. The final native expected total is 20.6, not a relaxed unlimited-heal assertion.

## Tests and native scope

Twelve focused tests cover exact credit affordability/overheal, combined armor/hull budget, finite scrap over 40 frames, mixed holdings in separate ticks, persistent and preloaded sealed freight exclusion, callback reentry/interruption/generation, missing economy owner, actual subsystem repair, malformed reserves and real save normalization.

Actual `_serializePlayer` → JSON → `_prepareEnvelope` → `_restorePlayer` preserves 13.25 unused HP. Restoring an older record without the field removes later reserve. This is the ordinary save normalization/player seam, not full browser UI Continue or every sliced autosave checkpoint.

Native ordinary beam acquisition/held fire with real mining, cargo, economy, civilian AI, flight and Rapier uses a fixture damaged Hawser 120 WU from a Pelican. One credit plus one scrap restores **266→286.6 HP**, leaves zero credits/reserve and no scrap, and cannot heal further under continued firing. Released input pauses work and spending before resumption. Test time is 14.15 simulated seconds; no full approach/populated-world or collision-safety claim. Existing funded Neri native still restores 266→380 for190 credits and zero impacts in its prior bounded fixture.

Independent reviewer `review_rescue_choice` reran **12/12** including the final receipt-lifetime guard, found no remaining material helper defect, and independently validated the kernel and save seams. Expanded owner/neighbor suite passes **47/47** in `/tmp/beam-repair-final47.log`:

```
node --test test/beam-repair-resources.test.mjs test/kessler-resident-repair.test.mjs test/industrial-beam-lifecycle.test.mjs test/industrial-beam-sector-transition.test.mjs test/beam-armor-flat.test.mjs test/infer-beam-refusal.test.mjs test/field-repair-4242.test.mjs test/inf-repair-points-4242.test.mjs test/inf-repair-price-4242.test.mjs
```

`node scripts/check-beam-verbs.mjs` passes. Scoped whitespace passes. UI rendering, full Continue, all combat modes and whole-game CI are not accepted by these checks.

## Exact ownership and baseline

Owned files: `src/systems/mining.js`, `src/combat/industrialBeam.js`, new `src/systems/beamRepairResources.js`, new `test/beam-repair-resources.test.mjs`, and this note. Both existing source files were clean before work; no current NOW claim on them was found. Before copies: `/tmp/mining.before-repair-resources.js`, `/tmp/industrialBeam.before-repair-resources.js`. Local HEAD7dc248acec452df4afcd0a5b71ad0507cd6c17ec; inspected origin/master f95de0eb1ba7560839209936afba48c7b96fe41a. This is shared-checkout integration, not a tested immutable remote publication closure. No GitHub writes, second checkout, model production, or change to any denied upload path.
