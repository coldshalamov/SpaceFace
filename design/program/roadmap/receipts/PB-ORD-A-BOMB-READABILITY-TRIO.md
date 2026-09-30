# PB-ORD-A — SF-035+036+037 bomb readability trio (build_map.md §1C row 93)

**Lane:** ordnance (pb-ten-lanes) · **Status:** implemented, checks green · **Date:** 2026-09-29
**Packets:** `design/planbank/SpaceFace_Planbank_300/plans/03-ordnance/SF-035…SF-037` (deepening trio, one identical write-set — built as one coherent batch per the row rule)

## The gap in player terms (preflight)

All three payloads deliver their effect as combat state that the player could not read:

- **SF-035 (denied-vs-recovering):** an EMP hit leaves `status_ionized` (regen ×0.70^stacks) and ion damage into subsystems. Nothing told you whether the target's attack was **OUT** (hardware wrecked — stays out until a tender/taut line) or **REARMING** (ionized capacitors climbing back at the flattened rate, on a real clock), so the follow-up window was unreadable.
- **SF-036 (burn commitment):** thermite's DoT grows with stacks on sustained contact, but the burn VFX always drew a fixed 2 sprites (`statusAttachedVfx.js` — goo scaled with stacks, burn did not) and the burn loop played a fixed volume — a 1-stack splash was indistinguishable from a maxed 3-stack burn, and neither the stacks nor the true remaining window were shown anywhere.
- **SF-037 (can't-fire vs can't-steer):** a scrambler hit tumbles a hull — helm out AND guns locked via `status_tumbling` — but nothing distinguished that from overheated (fire only) or a wrecked drive (steer only). The only copy was the bay's generic `A wild impulse and a scramble: drives tumble, verbs lock out.` — the only generic stun-adjacent text found in the live tree (searched `stun|scrambled|tumbling` across `src/ui`, `src/render`, `src/combat`, `src/systems`, `src/data`; the tumble status cue `ai.formation_broken` is a VFX juice lane label, not player text).

## What was built (minimum complete mechanism, existing owners)

1. **`src/ui/targetCondition.js` (new, pure reader)** — one read of the combat runtime (`state.combat.entities`, `expiresTick − state.tick`, `runtime.multipliers.capRegen`, subsystem `destroyed`/`effectiveDisabled`) classified through the powered attack verb the statuses already govern (`action_burst`: requires weapon+sensor, tags weapon/burst, 12 capacitor — `src/data/combatDefs.js`). Emits frozen facts: `steer` (TUMBLING with clock / DRIVE OUT, no clock), `fire` (GUNS OUT hardware vs REARM/OVERHEATED/JAMMED/GUNS LOCKED with clocks), `burn` (stacks 1–3 + true remaining). Deterministic in sim state; expired status keys ignored exactly like the kernel's recompute (`src/combat/subsystems.js:132`).
2. **`src/ui/views/targetFrame.js` + `src/ui/targetPanel.js`** — one condition row under the intent line, same keyed textContent-only pattern as its neighbours; hidden on clean hulls; refreshed on the panel's existing slow cadence; cleared in `forceRefresh`. This is the ORRERY surface where the follow-up decision is made.
3. **`src/render/statusAttachedVfx.js`** — burn sprite count/size/brightness now scale with the actual stacks (1→3), the same law goo already followed; sprite life stays clipped to true remaining; reduced-motion/flash invariants kept (1 stable mark, dimmed).
4. **`src/audio/bombAudio.js`** — `burnResidueGain(stacks)` (same curve as `gooResidueGain`) applied to the burning status loop, so a committed burn is audible as committed.
5. **`src/data/bombs.js`** — scrambler sentence now names both locks and their settle: `A wild impulse: the hull tumbles — helm out and guns locked until it settles.` The EMP copy already carried the pair (subsystems dark / capacitors flat) and is unchanged.

**Deliberately NOT built:** a global field-repair clock. `SUBSYSTEM_DEFS.repair.fieldRatePerTick` has no consumer — but the Ceres disabled-hauler chain (`src/systems/traffic.js:8362-8680`) disables drives via scripted ion and repairs them through `kernel.repair` tenders; a global clock would auto-heal those hulls and break the authored tow-out story. Hardware-out therefore reads honestly as the no-clock state, and recovery composes from the clocks that DO exist: status expiries and the cap-refill rate under `runtime.multipliers.capRegen` (applied live by `src/systems/combat.js:1095-1097`).

## Counterexample tests (would fail under the old behavior)

`test/pb-ord-a-bomb-readability.test.mjs` — 13 tests over the real combat kernel (`getCombatKernel` over `createGameState(47)`), routing the exact packet `src/systems/bombs.js _blastVictims` builds:

- EMP → ionized ×2, capRegen ×0.49, burst refused `insufficient_capacitor` while the readout shows `REARM ~<true refill seconds>`; clock shrinks deterministically; caps recovered lift the denial.
- Second EMP → refresh stacking law (stacks stay 2, expiry = max(old, +90)); centre blasts also wreck `subsystem_power` (probe-verified authored centre hit), composing 0.7²×0.2.
- Focused weapon wreck (the `hit.subsystemId` seam traffic.js uses) → GUNS OUT, no clock, steering untouched, movement ×1.
- Burn: stacking to cap 3, true-expiry end (`combat:statusExpired` at exactly the window edge), DoT routes with attackerId 7 while bomb entity 99 never existed; sprites scale with stacks (old: fixed 2); residue skips dead bodies and dies at the exact expiry tick; loop gain scales with stacks.
- Readout distinctions: tumbling = `TUMBLING <s> · GUNS LOCKED <s>` (one shared clock); overheated = fire only; wrecked drive = `DRIVE OUT · HELM OUT` with no clock; clean hull = empty; deterministic.
- Bay copy: scrambler names tumbles/guns locked/settles, no `scrambl`/`verbs lock out`; panel module loads node-side (reachability smoke).

## Checks (all run this session, real exit codes)

| Command | Result |
|---|---|
| `node --test test/pb-ord-a-bomb-readability.test.mjs` | exit 0 — 13/13 pass |
| `node --test test/bombs.test.mjs test/bomb-presentation.test.mjs test/bomb-rack-economy.test.mjs test/inf-096-bomb-target-index.test.mjs test/status-attached-vfx.test.mjs test/seam-combat-statuses.test.mjs test/audio-bomb-loops.test.mjs test/audio-bomb-cues.test.mjs test/bomb-audio-cues.test.mjs test/inf-027-tumble-recovery.test.mjs test/tumble-states-quiet-latch.test.mjs test/bomb-first-use-hint.test.mjs test/bombs-empty-quiet-latch.test.mjs test/bomb-presentation-quiet-empty-latch.test.mjs test/inf-092-mirror-status.test.mjs test/inf-030-npc-drift-bomb.test.mjs` | exit 0 — 71/71 |
| `node --test test/bomb-choreography.test.mjs test/bomb-flow-surface.test.mjs test/ordnance-motion-presentation.test.mjs test/chain-reaction-determinism.test.mjs test/target-interaction-semantics.test.mjs` | exit 0 — 48/48 |
| `node --test test/inference-5x-target-work-readout.test.mjs test/corridor-objective-hierarchy.test.mjs test/objective-navigation-hierarchy.test.mjs` | exit 0 — 20/20 |

The focused run caught two real mistakes during development and both were fixed: the readout's tumbling text swallowed the GUNS LOCKED fact (composition rewritten), and my stacking test assumed the wrong wrecked subsystem — a probe (`.probe-pb-ord-a.mjs`, since removed) showed the centre hit is `subsystem_power`, so the test now asserts the true composed multiplier.

## Not proven here

- Ordinary-route play at normal zoom (equip → deploy → read the row mid-fight): not exercised in this environment; the row is wired into the default-route target panel and the reader is node-proven, but the played result is **route-unproven**.
- `bombPresentation.js`, `fields.js`, `weapons.js` were read as packet seams and needed no change: the telegraph/field mesh already draws real phase timing; `fields.js` polarity cancel covers pinned/unmoored only; the player's own fire gates (weaponHeat HUD, cap bar) already surface their refusals.

## Files

- `src/ui/targetCondition.js` (new) · `src/ui/views/targetFrame.js` · `src/ui/targetPanel.js`
- `src/render/statusAttachedVfx.js` · `src/audio/bombAudio.js` · `src/data/bombs.js`
- `test/pb-ord-a-bomb-readability.test.mjs` (new)
