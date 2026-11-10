# Row 448 GOLD-COLOSSI — settled design (devin-lanea, 2026-10-25)

Done-when (build_map.md:6496): the 8 authored capital bosses get rope-detachable plates; weak points open only when a plate
is gone; a detached plate is a throwable body; each boss has a physical phase change a stranger can read. Anti: HP-sponge
phases, invulnerable timers, a new boss engine. Audit: agent 6d206188 (bosses in `src/data/encounters/capital-boss/*.js`,
single `capital_hull` actor, no plates today; only precedent is the dreadnought prow tear `tacticalAI.js:859-878`).

## Mechanic — tear by latching the boss
No per-tick pose writes, no new joint type. A plate is DATA on the fight record until it tears.
1. **Data** (each `capital-boss/*.js`, validated in `validate.js`): `plates: [{ id, anchor:{x,z} (local, ×radius, same space
   as SUBSYSTEM_DEFS volumes), radius, mass, holdTension, covers:'subsystem_*', shedOnAct }]`, 2 plates per boss, authored
   from each boss's `lesson`/`physicalStory`. **Validator law:** a subsystem named in any act's `enter.anyDisabled` may only be
   covered by a plate whose `shedOnAct` ≤ that act's index − 1 (so act progression never depends on the rope — the rope is the
   faster, louder route; the act shed guarantees the ladder). Every boss: at least one plate with `shedOnAct` set.
2. **Fight record** (`capitalBossEncounters.js`, the fight owner — the only writer): `r.plates = [{id, attached:true,
   strainTicks:0}]` initialised at fight start; serialized with the record (bump the record version, restore old records with
   all plates attached); `rewindAct` does NOT re-attach torn plates.
3. **Tear:** when the player's tether is latched to the boss entity and the latch contact point (the attachment's local anchor
   on the target — find it in `src/combat/attachments.js` / `tetherGameplay.js`) lies within `plate.radius` of an attached
   plate's anchor, read the live line tension (existing telemetry/attachment tension read — `masslineTelemetry.js` or the
   attachment record); if tension ≥ `holdTension` for 30 consecutive ticks → tear: mark `attached:false`, spawn the plate as a
   throwable body through `helpers.spawnEntity` (pattern: swarm ballast / `hullFracture.spawnFracturePieces` — `type:'wreck'`,
   `data.masslineTetherable:true`, `data.capitalPlate:{fightId,bossId,plateId}`, collision mask like mission wrecks, the
   aftermath armor-slab render package `place_aftermath_aft_armor_slab` via the existing fracture/victim visual path), at the
   anchor's world position (`capitalSubsystemWorldPos`-style transform), with its separation impulse via `queuePhysicsImpulse`
   (mass·dv, evidence) along the line; then move the player's line to the plate through the sanctioned tether API (retarget if
   one exists; else cut + programmatic latch through the same function a player latch uses). Emit `capitalBoss:plateTorn`.
   If the boss entity is not latchable today (`isAttachable`/`acquisitionDenialReason`, `tetherGameplay.js:3391-3402`), allow
   latching `capital_hull` actors of a live fight (they're far too massive to tow — the line just loads), nothing else.
4. **Weak point:** in the narrowest damage seam (`selectHitSubsystem` in `src/combat/geometry.js` or the subsystem branch at
   `damage.js:~249`): while the target's live fight has an attached plate covering subsystem S, a hit that would select S
   applies to hull at ×1 instead (no subsystem damage). Hull is ALWAYS damageable (shared.js:42 law) — no invulnerability.
   When the plate is gone, S takes hits normally (thrown-mass packets already target subsystems, `capitalBossEncounters.js:50-110`).
   The capital entity needs a cheap lookup: stamp `entity.data.capitalPlateCover = { [subsystemId]: true }` from the fight
   owner when plates change (presentation-safe? it is sim data — that's fine, it's written by the fight owner only).
5. **Phase change:** on `actChanged`, the act's `shedOnAct` plates tear automatically (same spawn path, impulse away from the
   boss centre) — the flying slab is the physical read — plus a receipt via the existing boss toast lane
   (`<BOSS NAME> sheds its <plate label>.`).
6. **Read before the tear:** the existing capital boss overlay (`src/presentation/capitalBossPresentation.js` /
   `src/ui/capitalBossOverlayMount.js`) draws each ATTACHED plate's anchor as a short arc at the boss in the existing warning
   style (no new token root), and while the player is latched within a plate's radius shows `PLATE  N t / HOLD M t` with the live
   tension (no per-frame allocation).
7. **Scope:** adventure/mission fights. Swarm champion fights (`swarm:` ids) and Last Argument keep their own lifecycles —
   plates data may exist on their bosses but are not spawned there (say so in a code comment and the row note).

## Tests (new `test/gold-colossi-448-4242.test.mjs`)
validator law over all 8 bosses; tear at ≥holdTension for 30 ticks spawns one throwable plate at the anchor and moves the line
to it, below threshold or off-anchor never tears; a torn plate whips into the boss and lands subsystem damage on the uncovered
subsystem; covered subsystem takes no subsystem damage while hull still drops; act change sheds its plate exactly once
(and not again after rewindAct); save/load mid-fight keeps torn/attached state and does not double-spawn; swarm fight spawns
no plates; determinism (two runs same seed → same plate tear tick). Keep green: rc-02-iron-maw, rc-463-*, pq-152-02,
capital-boss-score-contract, capital-boss-save-roundtrip, fb-024, inf50-seed-hf-06, seed-hf-07, fb-dreadnought-phases.
Report every sim digest that moves (do not edit *.expected.json).
