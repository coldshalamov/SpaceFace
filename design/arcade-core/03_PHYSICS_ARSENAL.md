<!-- LIFETIME: DURABLE -->
# 03 — PHYSICS ARSENAL: audit, finish, and tune what already exists

The owner has never played far enough to see these weapons work and suspects (usually
correctly) that what's built is lazy or untuned. This plan is therefore **audit-first**:
drive every item, record what it actually does, then fix to spec. I-9 applies.

## Inventory (verified present in code/data)

| Item | Where | Intended verb | Known-good? |
|---|---|---|---|
| Concussion Cannon M | `src/data/weapons.js` | Kinetic shove: 420 impulse, tumbles light hulls into terrain; heavies shrug | Untested by owner |
| Vector Mine M | `weapons.js` + `src/systems/mines.js` | Deployable radial impulse bomb, zero damage, moves the player too | Untested |
| RCS Disruptor M | `weapons.js` | Kills attitude control ~1.6 s — target drifts/tumbles | Untested |
| Gravity Marker S | `weapons.js` + statuses | Mark → +field coupling on that hull | Untested |
| Momentum Sink S | `weapons.js` + `src/combat/momentumSink.js` | Bind target to shooter's frame 4 s | Untested |
| Field kernel: Well "Intake" / Repulsor "Plow" / Cone "Sluice" | `src/data/fields.js`, `src/core/fields/fieldKernel.js`, `src/systems/fields.js` | Pull-clump / shove-away / lane-clear; mass coupling so heavies shrug; **browser-only flag, player-deploy-only** | Untested |
| Impulse charges (Y/R) | `src/systems/impulseCharges.js`, GDD §4.4 | Sticky blast plates, self-boost included | Untested |
| Massline verbs | `src/combat/attachments.js`, `src/systems/tetherGameplay.js`, `masslineThrow.js` | Pull, swing-self, anchor, tow | `masslineThrow.js` must be audited against I-3 (no yeet) |

## The kit as it should feel (target spec)

The arsenal's job: **make light ships into projectiles and the environment into the weapon.**

1. **Blast family (the reliable "move them" verbs).** Concussion cannon and vector mines are
   the workhorses. Tuning targets: a starter-fit swarmer (mass ~16) hit center-mass gains
   enough Δv to tumble (cross `tumbleDeltaV`) and reach a nearby asteroid within ~2–4 s of
   drift. A 150+ mass heavy gains a nudge only. These numbers live in data; the audit writes
   down current truth first.
2. **Field family (area control).** Well clumps light ships/debris/loot for combo setups;
   Repulsor is the panic-shove and the "blow them out of the way" button; Cone clears
   corridors. Verify the mass-coupling contract holds in play (heavies drift slightly, never
   fling — `FIELD_MAX_ACCEL` bound). Fields must read at a glance per the locked palette.
3. **Setup family.** Gravity Marker + RCS Disruptor + Momentum Sink exist to *prepare* a
   target for the physics: mark it so fields bite harder, kill its steering so it can't
   escape the shove, pin its frame so you can reposition it. Audit that each produces a
   visible, bounded, honest state — no hidden control grabs on the player.
4. **Tether (honest verbs only, I-3).** Pull, self-slingshot, anchor-orbit, tow disabled
   hulls. `masslineThrow.js` audit: anything that imparts a release "throw" impulse beyond
   release-state velocity is removed or rebuilt as an explicit impulse weapon effect.

## The gap that probably needs one new weapon

Nothing in the kit is a **direct-fire long-range launcher** — the "hit that one specific enemy
and send it into that specific rock at range" verb. The concussion cannon is close/mid. If the
audit confirms the gap, add one L-slot or heavy-M **Impulse Lance**: low damage, very high
`impulsePerHit` (above concussion, below siege lance), fast projectile, long range, high heat —
the skill shot of the physics kit. Data-only addition through the existing impulse kernel.

## Tuning surface (all in data, all lab-exposed)

`impulsePerHit`, `tumbleTorque`, `tumbleDeltaV` / `staggerDeltaV` thresholds, field
strength/radius/coupling constants, `npcCounterthrustDelayS`, charge impulse, cooldowns,
heat costs. Every number a reviewer needs lives in `src/data/` — if the audit finds a magic
number in a system file, hoist it.

## Bans

- No new physics parallel to the impulse kernel / field kernel. Extend the kernels.
- No velocity writes on ships outside the physics authority (I-3).
- No stun-lock chains on the player: anything that removes player control must already be
  telegraphed, bounded, and counterable (I-2). Audit NPC-facing disables for the same
  fairness in reverse.
- No weapon whose identity is "big damage." Damage weapons exist; this kit's identity is
  momentum and control.

## Acceptance

- Audit receipt: a table of *measured* behavior per item (Δv on reference masses 16/60/150,
  tumble achieved y/n, radius/coupling read) — produced by headless probes, not prose.
- Post-tune bot routes: (a) concussion a swarmer into terrain within one magazine; (b) well +
  explosive combo clumps ≥ 3 light ships; (c) repulsor drop breaks a chase; (d) marked target
  visibly couples harder than unmarked control.
- Human gate: the owner flies a physics-fit loadout and confirms each verb does what this doc
  says, at game feel, not at spreadsheet level.
