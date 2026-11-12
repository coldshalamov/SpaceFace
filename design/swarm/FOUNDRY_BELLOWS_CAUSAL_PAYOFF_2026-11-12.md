# Foundry: let the room remember who rang the Bellows

Research parent: `0dd5019ced076e98481c9a4672bb65902efeb44b`, PR #942,
`dot/swarm-opening-surgical-20261108`. This is a local candidate, not merged acceptance.

## Player purpose and connected act

The [Foundry score](../../src/data/swarmFoundryScore.js) moves from the Foreman's
charge, through the Raider's line threat, into a room-as-weapon beat at round 17.
The Bellows and three familiar mites spend ordinary population beside surviving
solid cover; no bank is created or replenished for the scene. Round 19 combines
that optional opportunity with the Kraken's primary read. The original twenty-concept
world program is wider than these twenty Swarm rounds and remains uncompleted.

The practical combination is [Bellows pocket placement](../../src/systems/swarmBellowsPocket.js),
its existing swelling/fuse/burst laws, the actual surviving arena stones, and the
existing physical-credit window in [Brood](../../src/systems/swarmBrood.js).
The player can finish the swollen body or let its fuse work; the blast may shove a
neighbor into terrain. That consequence should retain ordinary player-caused
credit, just like the external-explosion shove already does. Ambient arming must
not become free credit. No new model, geometry, population or reward value is needed.

## Newly observed interaction

A staged round-17 native boot at seed 73311 found an eligible **original arena bank
19**. No test bank, target relocation, damage call or synthetic reward was used in
the final native test. A staged Kestrel/standard pulse-laser kit and starting pose
were supplied; ordinary pointer fire and A/D input turned toward the live Bellows.
The native input/flight/weapons/Brood/Rapier owners produced:

- swell tell at tick 153;
- Bellows burst at 164, ordinary 5 cr / 52 score;
- shoved mite terrain death at 250.

The parent treated that last death as environmental (0 cr / 0 score). The candidate
retains its real provenance and pays the existing mite reward (1 cr / 12 score)
once. Including another directly shot mite, the purse/score are 7 cr / 76. Hull
remains 140. The sampled body traces match through tick 347; the first later trace
difference at 362 follows the now-credited death's existing reaction machinery.
Thus later behavior is not claimed bit-identical.

## Implementation boundaries

Three surgical changes in the existing owner:
1. A credited death burst refreshes the existing five-second credit window only
   on neighbors receiving a nonzero directional shove inside its radius.
2. Credited arming stores that same window on the swollen body.
3. The fuse consults that window instead of defaulting every detonation to player credit.

No direct award mutation, new clock, persistent schema, health change, extra blast,
UI change, audio asset or visual change. Existing on-hit, chain and reward owners
continue consuming the same ordinary receipts.

## Evidence and next acceptance

[Focused tests](../../test/swarm-bellows-causal-shove.test.mjs): 8/8 passed, including
player/environment arming, finished/fused detonation, edge/outside/zero-vector
recipients, five-second expiry and duplicate death. [Native test](../../test/swarm-bellows-pocket-native.test.mjs):
1/1 passed. Existing family, telegraph and post-Foreman suites are 55/56 on both
parent and candidate, with the same pre-existing quota assertion (42 versus 26).
No full-suite, current CI, rendered, audio-listening or release pass is claimed.

This is not earned arrival from round 1, a human playtest, viewport readability,
Save/Continue or extraction acceptance. The earlier failed long actor does not
become successful through this staged test. Next: recover an earned post-Foreman
run with an identity-safe actor, then visually inspect whether swelling, actual
blast reach, the bank and credited terrain impact are understandable together.
Missing visual review is not a request for replacement models.
