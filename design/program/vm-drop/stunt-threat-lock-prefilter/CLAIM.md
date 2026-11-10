# CLAIM — stunt-threat-lock-prefilter

Registry.step residual after #39+#43+#40: `StuntFlightObserver.update` still paid
`isHostileForAI` before the combat/activity `targetId === player` gate on every
ship/drone in range. Quiet traffic failed that gate after the hostility walk.

Also: quiet cadence (period 2) when `tracks.size === 0` and the projectile lane
is empty — stunt open-window is 0.2–1.2 s so one skipped tick cannot drop an episode.
