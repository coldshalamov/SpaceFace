<!-- LIFETIME: DURABLE -->
# Orchard thermal exposure and reachable maximum tow

Baseline: public master60415197397351f988b85e51884fa8624fb71939 plus the player-route increment published in draft PR391. This successor changes only planetRuntime and the Orchard pod spawn, plus three focused tests. Canonical planet forces and the native custody data tree remain unchanged.

## Thermal behavior

Genuine native-ready released pods now enter the existing planetary band, drag, heat, cooling and combat-burn owner at their own positions. Three authored sockets have an admission budget independent of the nearest-ship budget; crowding or a distant towing ship does not shelter cargo. Stowed, forged, dead, recycled and away-sector identities are refused.

A versioned top-level per-pod exposure record persists heat, stage and pending burn deadline through the existing entity save contract. It is bound to the current site and finite lot; malformed or mismatched records are not adopted. Real Save/Continue preserves exposure without an early/double burn. Readiness/query gaps conservatively retain accrued heat without awarding unseen cooling. Ordinary ship/drone transient reset behavior is unchanged. No finite ledger or pod.data mutation is used for exposure.

Pod hullMax is explicitly100 to match its existing hull100. Previously the generic payload default max1 caused the first real combat packet to clamp health and destroy the pod immediately. Gradual damage now works; actual destruction uses the existing finite-loss receipt, exactly once, without reward or fractional cargo creation.

## Measured hot-path restriction

Before the prefilter, even untouched safe pods requested full native observation each tick. The unchanged band classifier now rejects cold untouched pods before that expensive gate only when no same-life runtime record or any persisted exposure descriptor exists and the position is outside the relevant bands. Exposed, cooling, staged and retained-history pods still require authoritative validation.

Instrumentation:30safe cold ticks changed from30full readiness observations to0. Exact boundary tests at1040 and1040.001WU skip untouched cold pods;1039.999 validates and heats. Three exposed genuine pods still perform three full observations. Forged labels are rejected by private custody before native world scanning. This is a call-count result, not a hardware timing or FPS claim; exposed validation cost still deserves target-device measurement.

## Authored field and control evidence

The previous real native maximum-line gust test omitted normal planetary field composition. New tests use the unchanged canonical well, normal simulation owners and raw controls during measured motion.

- Pre-established outward0.65-radian maximum2340WU tow spans a full gust. Minimum whole-pod radius1215.76WU and hull3382.57WU remain beyond the1040WU heating boundary.
- Hazardous1.5-radian orientation pulls the pod into danger: it heats while the distant tug stays cold. This is retained as a counterexample; it was an invented old-test trajectory, not a shipped safe-route promise.
- A separate acquisition test starts with one filled finite pod and a nearby Leviathan. Ordinary B release, Ctrl+F latch at119.976WU, yaw/throttle and payout inputs reach the catalog2340WU maximum at tick2791. Minimum whole-pod radius1246.34WU, hull1305.25WU; no heat, bounded propulsion and a current native constraint throughout. Initial filled-pod/nearby-ship fixture setup is explicit, not a claim of starting from a new game.

## Checks and remaining gates

Final70-file current604 roster:612/612pass, zero failures/cancellations/skips. Root independently reran93neighbor cases. Independent thermal/persistence/tow/acquisition review:18/18; exact-boundary controls3/3. Earlier606-case baseline, failing thermal/pose/partition probes and native-call instrumentation are preserved.

Explicit fragile-cargo shock remains under implementation; thermal damage does not close it. Live browser input, game-camera visuals, target-device performance and final player acceptance remain open. All original twenty-concept scope and larger goal markers remain open. No merge or deployment is implied.
