# Host acceptance and playtest protocol

The package tests are focused component evidence. The following checks remain the local
integrator's production gate; passing the fixture is not permission to skip them.

## Wiring and regression

Verify exactly one `tensionDirector` in the resolved production initialization and update orders,
placed immediately before `encounterDirector`; verify calendar membership and Node-safe lookup
materialization. Preserve browser/Node manifest parity. Run the existing registry lifecycle,
encounter, spawn-budget, survival, difficulty and save tests without lowering their thresholds.

Exercise new game, ordinary campaign flight, pause, docking, non-flight UI, onboarding, survival,
quit/continue, legacy save migration, corrupt snapshot, and repeated create/destroy. A legacy save
must report a protected reset, never an invented exact continuation. New saves must preserve
both the owner's snapshot and the world's clock/RNG/events at the same boundary.

The optional trade/mission ports should be called only after actual successful transactions.
Confirm unknown-ownership pickups and NPC-versus-NPC activity are not counted as player progress.
Check that current incoming/outgoing damage multipliers, law pressure and authored mission gates
are unchanged by this module.

## Reproduce the real baseline

Run the project's existing ten-hour hunter, prospector and improviser policies with seeds 4242
and 8008. Use the same runtime profile, difficulty, script version, input policy, content catalog,
and manifest identity in A/B arms. The supplied fixture uses these labels/seeds for convenience
but does NOT execute those production pilot implementations.

Record the following separately for each simulated hour: pending supply, telegraphs, actual
materialization, engagement, resolution, decisions with options/tradeoffs, closed causal chains,
player deaths, unresolved fights, damage adaptation, rewards, phase occupancy, requested/observed
pressure and starvation reasons. Keep missing measurements null with a gap explanation.

Do not label `tension:decision` emissions as player decisions. They are controller updates.
Do not label spawns or verb entropy as meaningful-choice counts. Do not label a convoy telegraph
as an experienced opportunity until the player could actually perceive and act on it.

## Session-shape acceptance questions

Does intense contact buy a usable period to collect, orient, repair or choose a destination?
Does a struggling player get fewer *new* combat commitments without a theatrical disappearance
of lawful or existing enemies? Does a confident hunter still find worthwhile conflict rather
than being sentenced to a waiting room? Does a repetitive miner receive credible alternatives
without being forced into combat as punishment for mining?

Compare the first and eighth hours for distinct decisions and consequences, not merely different
phase names. If both remain identical while the policy line oscillates, content/affordance delivery
still fails and the controller must not receive credit for fixing it. If the supply roster empties,
fix that owner rather than increasing pressure multipliers.

Use the original program-compass session-shape bars. This package intentionally does not assert
that its fixture meets the six-meaningful-decisions/hour bar or closes the kill→salvage→sale→law
loop. Those require real content and player-accessible affordances.

## Safety and fairness adversaries

Test low hull that stays unrepaired, shieldless ships, damage bursts with `applied: 0`, collision
loss, repeated defeats, high wanted heat, scripted bosses, far-away combat squads, nearby but
passive ships, filled spawn capacity, exhausted schedules, gate-deferrals, sector-border flapping,
repeated tethers, ambiguous pickup ownership and two simultaneous worlds.

Recovery should protect new admissions without lifting existing quotas, producing free rewards,
scaling damage itself or changing faction hostility. A missing policy should degrade to the
original encounter behavior; diagnostics should make its absence visible. A saturated observation
scan should never be interpreted as “the player is safe; add enemies.”

## Performance and rollout

Profile the new sensor/reducer/policy path on the target integrated-GPU machine with the existing
production profiler. Separate simulation CPU cost, bus-subscriber overhead, save size and total
frame time. The fixed-capacity design is not a hardware benchmark. Check allocator activity in
long sessions, especially external telemetry subscribers retaining every policy event.

Use the feature flag for an A/B comparison. Keep a recorded manifest identity and the install
backup. After acceptance, commit the code and the real production evidence together. If the
intervention improves the plot but worsens navigation, combat agency, readability or recovery,
roll it back and revise the responsible phase/rate family rather than defending the metric.
