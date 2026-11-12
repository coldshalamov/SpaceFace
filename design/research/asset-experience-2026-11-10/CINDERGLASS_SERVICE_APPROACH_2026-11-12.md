# Cinderglass: make the quiet approach understandable

Parent: PR #982, `8e13663b5fc136325d212636c3d1f60669397e3b`.
Owner: creative direction/integration. No model or UI-shell work.

## What the player encounters

The disputed controller is still on Dask's paid consignment. Scanning reveals the
same external latch; it does not grant custody or invisibility. Near the actual
inspection stop, negotiation and quiet service are two different physical/social
opportunities. Previously the second disappeared when range, drift, occlusion or
observation failed, while the journal still advertised it. A missing button did
not explain whether the player had found the wrong thing or needed to reposition.

The scene now keeps one **disabled** quiet-service choice with visible guidance
while the original is scanned, carried, at a live inspection, and the player is
near its carrier. The real gate still enables the action. This preserves the
five-second uninterrupted operation and ordinary witnesses. Observer identity is
not exposed. Leaving the card stays dismissed until the available choices or
physical condition changes. Departure removes the inspection guidance. Refused
negotiation no longer invites the player to offer terms in the same card.

Interrupted service also says to break sightlines rather than promising that
waiting will create a gap. There is no proven timed blind spot in this evidence.

## Fresh native observation, not an earned campaign or visual review

A private actor loaded the exact branch modules with the production world,
Rapier, scanner, flight, tactical AI/ports, law, factions, heat, cargo, economy,
combat, original convoy and feature owners. It **seeded the post-alloy eligibility,
5,000 credits and a player start 200 WU west/100 WU north of the pull-off** and
acknowledged presentation without rendering. No live hull was moved, no scan was
seeded, no watcher was disabled, and no custody gate was bypassed after setup.

Inputs pulsed the ordinary scanner every six seconds. At the actual stop, one
normal autopilot course approached the original latch. Input snapshots were
neutralized each tick, matching ordinary sampling rather than feeding autopilot
output back as manual input. An earlier invalid actor did feed it back; that run
is rejected as flight evidence and did not justify any game change.

Observed baseline and candidate both:
- reached inspection at simulation 74.9 s;
- earned CG-7/latch scanner receipt at 84.1 s;
- reached the close approach but were watched by Dask;
- kept the same original carried; no service, deposit or payout occurred;
- ended inspection at 108.9167 s and resumed outbound movement.

Candidate now displayed disabled sightline guidance at the watched approach;
baseline hid it. The additional 30-second request was not used. This demonstrates
one lawful observer rejecting one approach, **not** that every approach is
blocked, that the quiet route is achievable, or that the art makes cover readable.
Native save/restore, alternate physical cover and the full-law outbound recovery
still need a separate earned run.

## Toolbox and next creative decision

Reuse actual external latch + original Mule + gantry + escort routes, not a new
quiet-service minigame. The latch gate already distinguishes distance, drift,
cover and observation; exposing those distinctions gives the player meaningful
ways to reason about a place without a new model or marker.

Do not move escorts, stretch the stop or weaken witnesses merely to green a
fixture. Next scene acceptance: approach from a different safe side using the
existing gantry/body geometry, establish five seconds of actual unobserved
service, then tow the same original out and return it through ordinary law.
Capture the working sightline at ordinary camera before commissioning cover art.

## Durable open goals

| Marker | Intended outcome / state | Evidence | Next action / dependency |
|---|---|---|---|
| SF-WORLD-DIRECTION | Title dispute has legible social and physical alternatives; improved, not accepted | runtime prompt + unchanged gate | Earn a complete negotiated or quiet route; no new approval needed for authorized testing |
| SF-SECTOR-COHERENCE | Pull-off geography teaches a real approach; open | staged native law-active approach above | Test another existing side/cover path, then rendered camera review |
| SF-LIVING-WORLD | Dask keeps his paid route and can observe the player; preserved | actual stop/departure and watched gate | Ordinary return/Continue and downstream witnesses |
| SF-GAME | Clear current action without granting success; scoped improvement | disabled selection/dismissal tests | Human/readability acceptance and broad integration |
| SF-ASSET-QUALITY | Current gantry/latch relationship visually unverified | no fresh render | Review existing art before requesting any missing cover asset |

Source links: [runtime](../../../src/features/cinderglassJob/runtime.js),
[quiet gate](../../../src/features/cinderglassJob/interception.js),
[convoy](../../../src/features/cinderglassJob/convoy.js),
[presentation adapter](../../../src/features/cinderglassJob/presentation.js),
[focused checks](../../../test/cinderglass-service-guidance.test.mjs).
