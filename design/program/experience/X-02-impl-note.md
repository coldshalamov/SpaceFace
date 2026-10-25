# X-02 impl note — the Claim Jumper's Wing

A `wasp_swarmer` wing stages beside the tow on every non-clinic raid beat: hold_fire until the
first latch, then weapons_free through the new `isOnboardingRaidWingAuthorized` bridge (narrow
like the 47-A bridge). Resolved pulse mount defanged in place (dmg 2/rof 2/impulse 0); squadId
`claim_jumper_wing` shared with the raider so its fire can't hit the tow. At 30% hull or beat
done it `forceFlee`s via the ordinary egress path and never returns. Wing kills → wingDone
only; stray wing kills converge in ≤2 restages. Player-death restage disarms.

Tests: `x02-raid-wing` 6/6; keep-green 59/61 — the two stranger-replay failures crash at boot
on foreign `src/features/salvageOutfits` (untracked lane work), before any gameplay; digest
re-record unevaluable until that lane heals.


## v4 (dbfe5da7c5) — live-fire integration gates

Four gates all gated on `data.onboardingRaidWing` + `state.onboarding.raid.active` + `!raid.wingDone`:

1. `scanner.js` `isHostileToPlayer` — stamp reads as player-danger during the live beat (the `spawnContext:'onboarding_raid'` context never enters `PLAYER_DANGER_CONTEXTS`).
2. `engagementAuthority.isHostileForAI` — the same stamp authorizes wing→player hostility for the FIRE gate; `isHostileToPlayer` alone left `authorizeAIEngagement` refusing `target_not_hostile`. Also `pirateDisengage.moraleDecision` skips `lawful-patrol-nearby` for a stamped wing mid-beat (sanctuary half already on master).
3. `damage.js` — `onboarding_wing_ward` reject beside `friendly_fire` for wing→non-player packets.
4. `lawSecurity._handleDamage` — no `hostile_fire` incident/dispatch for the wing's rounds on the player during the beat.

On arming (`_onRaidLatched`) the wing pins `ai.forcePlayerTarget` and hands the wing an
AUTHORITATIVE ASSIGNMENT via `setEntityDoctrine`: `ATTACK_RUN 'onboarding_raid:claim_jumper'`
with the player as `targetId`. On flee (`_stepRaidWing`) the record retires to
`DISENGAGE 'onboarding_raid:withdrawn'` with every player-target flag cleared
(forcePlayerTarget/huntPlayer/combat.targetId+lockTarget/intent.fire — the markFleeing shape).

## v5 — the acquisition fix (this commit)

Three seams closed the live-fire loop:

1. `doctrine.js` — `'onboarding_raid:'` joins `AUTHORITATIVE_ASSIGNMENT_PREFIXES`, so the arm's
   ATTACK_RUN is an authoritative singleton assignment: it outranks the squad's advisory vote
   (the passive raider's non-hostile vote had been starving the FOCUS objective) and stamps the
   squad directive `breakReason:'onboarding_raid_target'`.
2. `combatDoctrine.js` — `'onboarding_raid_target'` joins `assignedTargetBreak`: the same
   release security responders use, because swarm_pack ingress/reform is formation-locked and
   the squad anchor sits on the crippled crew leader ~370 WU short of `SWARM_INGRESS_RANGE_WU
   (340)` — without the release the wing orbits its dead captain forever and never opens
   `engine_flare`.
3. `lawSecurity.js` sanctuary withdrawal loop — the wing is exempt while the beat is live
   (`onboardingRaidWing` + `raid.active` + `!wingDone`, same identity gate as the damage ward
   and pirateDisengage's `wingBeat`). The withdrawal used to restamp every honest exit — the
   scripted DISENGAGE, or a morale scatter on the crew leader's death — as
   `station_jurisdiction:*:withdraw` + `passive`, falsifying the record and stranding the
   scripted actor.

Honest emergent beat kept: the raider is the squad's fallback leader (heaviest hull), so its
death legitimately scatters the wing — it flees the shock. Round-2 review correction: nothing
consumes `disengageUntil`, so the rout is final — `_adoptRaidWingExit` (onboarding.js) adopts
the honest exit as `wingDone`, closing the slot so a later latch cannot restamp a dead-letter
ATTACK_RUN on a routed hull. Round-3 review correction: the adoption discriminates on the
durable markers only — `pirateDisengaged`, `motiveSatisfied`, or the `pirateDisengage` record
phase (`_raidWingExited`). A bare `forceFlee`/`fsm:'flee'` is shared with wingMorale's
leader-killed scatter (`_wingMoraleUntil`, expires so the hull re-presses) and
difficultyDirector's pin-release hold (`_pacingFleeUntil`) — adopting either would close the
slot on a wing designed to come back: pre-latch the antagonist silently never arms; armed it
can never withdraw and its stale state survives the restage. Same review pass: the
player-death restage now clears `huntPlayer`/`combat.lockTarget` with the disarm and leaves an
honestly-exited wing's FLEE/DISENGAGE record untouched instead of parking it as a LOITER.

Live-fire test `test/x02-raid-wing-live-fire-4242.test.mjs` is ACTIVE: real production runtime
boot (seed 4242, node-safe lane), `_enterRaidBeat`, real `tether:latched` emit; player parked
beside the raider. Asserts wing `combat:fire` ≥1, a wing damage packet on the player ≥1, zero
wing packets on non-players, zero `npc_piracy`/`hostile_fire` incidents, player survives, and
the wing exits on designed terms (the test drops hull to the scripted ≤30% threshold once the
fire evidence is in so `_stepRaidWing` owns the exit).
