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
