# BP-02 — COMBAT CEILING

> **SUPERSEDED EMPHASIS (2026-08-10):** this packet's framing predates `design/VISION.md`.
> SpaceFace is **not** building symmetrical honorable dogfights — combat is swarm-scale and
> delightfully abusive; see `design/PHYSICAL_PLAY_GRAMMAR.md` ("Combat framing: swarms, not
> dogfights"). The individual mechanics below (velocity-lead, momentum inheritance, heat) remain
> useful; the "dogfights with a ceiling" objective does not survive as stated.

> **Extends** `SPEC3-F4` (§19 combat-feel, §20 weapons-tactics). The AI brains (`src/ai/`) are already deep —
> this is about the *player's* skill ceiling and *readability*, not smarter enemies.

## Goal
Objective #4, reframed per `design/VISION.md`: a skilled pilot wins outnumbered by **physics** —
displacement, terrain, tethers, and collateral — not by stats, and not by symmetrical marksmanship.

## Scope (Wave-2 combat lane owns `combat.js`/`weapons.js` exclusively)
- [ ] **Velocity-lead aim** — NPC fire leads player velocity; add a HUD **lead pip** so the player can do the
      same. New `src/ai/gunnery.js` for the lead solve (already have `solveIntercept` in radar).
- [ ] **Projectile momentum inheritance** — projectiles inherit shooter velocity (weighty strafing runs).
      Behind a flag if it perturbs the 47-A baseline (diff against the snapshot).
- [ ] **Beam weapon pipeline** — new `src/systems/beamWeapons.js` + additive weapon data; continuous ray-trace
      damage with heat/capacitor drain (player guns already vent; give NPC beams parity). Dispatch in `combat.js`.
- [ ] **Missile LOS + fuel** — missiles track line-of-sight, fuel ~6 s, then break-and-coast.
- [ ] **Damage triangle surfaced** — Energy/Kinetic/Explosive multipliers visible on the target panel (multipliers
      exist in the kernel; render the bars).
- [ ] **Overload / active-vent player mechanics** — manual vent, shield overload → brief offline (Wave 3).
- [ ] **Scanning weak-point loop** — scan reveals weak points (engines/shield nodes/turrets); hitting them does
      bonus damage + HUD callout (turns scanning from info-dump into tactics).

## Primary files
`src/systems/combat.js`, `src/systems/weapons.js`, `src/data/weapons.js` (single owner), new `src/ai/gunnery.js`
+ `src/systems/beamWeapons.js`, target-panel HUD element, `src/systems/scanner.js` (weak-point reward).

## Acceptance
`check:combat-ceiling` (new): lead-aim solver deterministic; beam DPS conserved; damage-triangle bars render;
**diff 47-A telemetry against the captured baseline** (not red/green) — momentum-inherit stays flag-off if it drifts.

## Dependencies
Baseline snapshot; SG-06 (unchanged); BP-08 lead-pip/weak-point HUD art (optional).
