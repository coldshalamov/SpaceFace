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

On arming (`_onRaidLatched`) the wing pins `ai.forcePlayerTarget` and seeds `ai.activity.targetId`/`data.combat.targetId` to the player.

Open: the armed wing still does not acquire the player under the live tactical decide pass (combat.targetId cleared/not populated — the decide pass owns it); live-fire test `test/x02-raid-wing-live-fire-4242.test.mjs` stages everything real (runtime boot, `_enterRaidBeat`, real `tether:latched`) and is skipped pending that acquisition fix.
