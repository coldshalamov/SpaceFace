# 47-A covert courier: why two checks are red, and what the answer is not

**Checks:** `check:47a:tactics`, `check:47a:live-branch`
**Status:** diagnosed, not fixed. The fix is a design decision, not a threshold edit.
**Date:** 2026-08-23

## What the checks assert

Both drive the `covert_courier` tactic: reel the evidence spindle at frame 720, sling it at frame
900, and expect the `deliver_to_contact` branch to resolve. Both fail identically — the branch
resolves to `null`.

The branch's live predicate (`src/data/scenarios/47a.scenario.json`, `predicate.47a.deliver_to_contact.live_state`)
requires all of:

- the `resolution_branch` beat entered
- `action_sling` started on `evidence_spindle_47a`
- an active attachment from the player to the spindle
- **`actorDistance` spindle → `kessler_handoff_beacon` at `maxDistance: 160`**
- no `action_cut`, no `tether:broken`

## The thing I nearly got wrong

I had this recorded as "~235 WU — is that correct geometry or a regression?", with a pending
decision to widen the threshold from 160 to 280. **Both framings were wrong, and widening would
have hidden the real finding.**

The scenario file has not changed since before this check last passed (2026-08-01, archived green in
`scratch/check-ci-report/2026-08-01T03-38-19-900Z/`). The authored geometry never moved. So the
threshold was never the problem.

## What the measurements actually show

Sampling the spindle through the throw window:

```
tick  700  spindle (286.2, -52.5)  vel(21.8, -6.4)   dist 145.6   <- already INSIDE 160
tick  900  spindle (356.1, -74.3)  vel(18.2, -6.9)   dist 144.2   <- still inside, at the sling
tick 1080  spindle (400.7, -94.1)  vel(11.9, -6.0)   dist 157.8
tick 1400  spindle (445.1, -117.6) vel( 5.6, -3.0)   dist 181.8
tick 2000  spindle (476.9, -130.9) vel( 1.7, -0.3)   dist 206.1
tick 4000+ spindle (497.8, -117.8) vel( 0.3,  0.4)   dist 230.2 -> settles at 234.6
```

Two facts fall out of that table:

1. **The spindle begins inside the delivery radius and drifts out of it.** Its velocity points +x
   while the beacon lies at −x. It is coasting away the whole time and decelerating to rest.
2. **The sling has no measurable effect on where it ends up.** Releasing at tick 900, 1100, 1400,
   1800, 2400 or 3200 all settle at 234.6–234.8. The throw is not aiming wrong; it is not moving
   the outcome at all.

## The cause of (1)

Commit `6996ef65` — *"fix(massline): keep release assist off momentum"* — deliberately removed
`_correctPayloadExit` from `src/systems/masslineThrow.js`. That function used to apply an impulse on
release that rotated the payload's exit vector onto the intercept angle, preserving speed. In other
words the game used to aim a thrown payload for you inside a timing window.

The commit's own comment states the new ruling plainly: *"A late press cuts immediately and preserves
the payload's earned exit vector; release assistance never steers either endpoint."*

That is an intentional design decision, and it is consistent with this game's momentum identity. The
47-A tactic tape encodes a delivery that only ever succeeded because of the assist. **Restoring the
assist to make the check green would undo a deliberate ruling.**

## What is still open, and it is not the threshold

Fact (2) is a separate question and the more interesting one: a scripted reel-then-sling changes
nothing about the spindle's resting place, across a 2,300-tick spread of release timings. Either the
attachment never forms in this tape, or the sling is a no-op against this payload. That deserves
someone's attention on its own merits, independently of 47-A.

## The decision the fix needs

The tape must earn the delivery rather than receive it: fly a swing whose tangential velocity points
at the beacon at release. That is a re-authored tactic tape, and it should be authored against a
sling that demonstrably imparts velocity — which fact (2) says is not currently true.

Until then these two checks are red because they assert behaviour the game deliberately removed. That
is worth more as a stated fact than as a widened constant.

**Do not "fix" this by raising `maxDistance`.** The spindle starts inside 160 and leaves; a wider
radius would make the check pass while the courier delivery is still not happening.
