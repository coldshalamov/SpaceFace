# Opening experience: Foundry throwing courts

Source base: `6388cd3b25d39ee8178a5fac21be27affccadc4e`.

## Player-facing change

The first three baseline T0 Foundry rounds now arrange existing physical rocks into a growing throwing court instead of choosing every terrain position from a random annulus. Round one has eight shoulder/bank positions around the existing launch pocket. Round two extends to eleven with flanking banks. Round three extends to fourteen with longer-throw outer banks. A straight world-X lane is reserved by the authored placement rules rather than enclosing the player in a ring.

The intended experience is immediate physical opportunity: turn a nearby throwable into a crosswise impact, escape along the open axis, then use broader banks when the fight spreads. This reuses existing rock assets, surface effects, dynamic-body spawning and clearance rules. It adds no models, UI panels, enemy powers, rewards or new simulation authority.

The existing three pocket stones and first-run lesson stone remain separately owned. Counts include those bodies when topping up; the existing local limit of twenty and global transient limit of forty remain. No surviving body is moved or deleted to force a layout. Native clearance can defer a slot. Moving bodies may cross the reserved lane: the claim is about authored spawn positions, not perpetual collision-free space.

## Scope boundaries

- Applies only to `helios_core` (Foundry), line tier zero, waves one through three, without arena mutators.
- Other arenas, reef/ballast/mutator variants, upgraded tiers and later rounds retain the existing director.
- Enemy roster/timing, first-run lesson release, grazing-control guards, progression and rewards are unchanged.
- This is one concrete opening increment, not completion of Swarm's entire first-session experience or Adventure's opening.

## Verification

Seven focused tests pass, including the actual registered wave callback and production spawn-spec path with external owners injected, first-run lesson hold/release preservation, blocked-placement refusal, pocket-inclusive counts, and a disconnected-call-site negative control. Root reran all seven after review. Independent bounded probes confirmed repeated top-ups preserve survivors, moving anchors remain capped, and five variant outputs match the supplied baseline.

The exact public base `swarmArena.js` blob is `a3e05bfaac4a38a7e921d3d8e694d97dfb5fb886`. The initial transport copy had one extra terminal newline, corrected before publication; it contained no differing code hunk.

These tests use injected native-clearance, physics, ladder and material ports. They establish source/event wiring and spawn specifications, not a full menu-to-play native run, rendered readability, device performance or subjective enjoyment. Those experience claims remain open. The illustrative placement preview is a diagram of actual planner output, not a game-camera capture.

An independent static check runs the focused tests. The index change is a targeted additive preload for the new leaf module, preserving all existing hints and order. The complete canonical dependency-closure check has not been executed in this sparse source environment; hosted CI must report its result separately. No existing gate is weakened or bypassed.

## Continuing direction

SF-WORLD-DIRECTION, SF-LIVING-WORLD, SF-SECTOR-COHERENCE and SF-GAME remain open. Continue creating the opening player experience, then expand outward through actual mission routes and ordinary activity. The user's model-producing agents own new model production; this lane assembles existing pieces and judges the resulting game.
