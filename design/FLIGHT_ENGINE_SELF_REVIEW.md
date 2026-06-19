# Flight Engine Self-Review

Date: 2026-06-18

## Scope Reviewed
- Deterministic flight controller API and mode behavior.
- Player and NPC integration through the shared flight controller.
- Ship-derived flight stats, old top-level stat compatibility, and legacy settings restore.
- Visual-only banking, including bank sign and physics isolation.
- Custom swept ship/static and projectile collision checks.
- Optional Rapier collision observer backend and browser import-map packaging.
- Flight diagnostics, browser probe coverage, and lab performance gates.
- Save compatibility for transient flight controller, banking, interpolation, and boost gesture state.

## Confirmed By Tests And Probes
- Right yaw produces positive/right bank; left yaw produces negative/left bank.
- Releasing yaw input brakes angular velocity promptly and settles bank.
- Bank pose integration does not mutate heading or velocity.
- Idle ships do not rotate toward hidden diagonal attractors.
- Assisted, drift, and newtonian modes have distinct lateral-slip damping.
- Reverse thrust can arrest boosted forward speed.
- Fighter, hauler, and capital derived models order by acceleration, yaw authority, and inertia.
- `resolveFlightProfile()` exposes the canonical numeric stat surface directly, including mass and inertia, and `computeFlightFrame()` carries mass, inertia, and assist strength for diagnostics/camera/VFX consumers.
- Authored `flightModel` values are not class-multiplied twice.
- Explicit authored `flightModel` zeroes are preserved, so no-thrust/no-strafe/no-bank tuning cannot be replaced by compatibility defaults.
- Explicit NPC controller zeroes are preserved for soft-angle and legacy bank helpers.
- Malformed/non-finite restored flight stats and player/NPC control inputs are clamped or defaulted before they can produce `NaN` heading, velocity, bank, profile, or diagnostics values.
- Restored settings sanitize invalid flight modes, physics backends, malformed bindings, and prototype-mutation keys while preserving valid `rapier`/`newtonian` saves.
- Q/E `moveX` strafes without yawing.
- Tap/hold boost semantics are split: quick Shift taps dash, held Shift sustains boost without consuming dash energy.
- Interrupted boost taps are canceled on docking, modal/control interruption, and save load, so stale gesture state cannot fire a delayed dash.
- When a modal or docked UI blocks controls, the player ship receives neutral flight input for passive yaw/slip damping instead of processing a release edge as a pilot dash command.
- Holding Shift through a blocked-control modal is suppressed until key release, so returning to flight cannot reinterpret the stale hold as a fresh tap dash.
- Flight runtime boost edge state is reset on system init and game start, so fresh sessions cannot inherit stale held/suppressed boost gestures.
- Player, NPC intent, and intent-less drift paths normalize missing runtime bags (`flags`, velocity, player boost resources, and partial boost objects with missing numeric fields), so older/restored/unusual ship objects do not crash or poison the flight system with `NaN`.
- Save serialization strips transient flight runtime fields, angular velocity, decorative bank pose, interpolation history, sustained-boost flags, and private boost gesture timers while keeping authoritative pose, velocity, public cooldowns, vitals, and gameplay flags.
- Dock and gate range events can update in the same physics tick.
- Swept ship/static and projectile collision paths catch fast-moving contacts.
- Swept circle contacts solve first time-of-impact instead of closest approach, so glancing boosted impacts preserve the motion lane and resolve at the true entry point.
- Swept ship/static CCD resolves the earliest obstacle by time-of-impact, so collision material response cannot depend on entity-list ordering.
- Swept ship/static collision uses the same either-side collision-mask semantics as broad-phase collision, so boosted ships cannot tunnel through statics that opted into ship contacts.
- Broad-phase collision pair de-duplication uses non-lossy pair keys, so long-running high-entity-id saves cannot silently drop unrelated contacts.
- Broad-phase collision respects immediate entity consumption, so one projectile or pickup cannot resolve against multiple targets after being marked dead in the same pair scan.
- Collision material responses are distinct: station hulls stop inward motion softly while asteroid contacts rebound harder under the same swept impact.
- Rapier proxies initialize in Node and browser without console warnings, support concurrent backend creation, observe contacts, update radius changes, update boosted/projectile CCD state on live proxies, and dispose/reinitialize cleanly when the backend setting toggles.
- Offline flight scenarios cover slalom, docking approach, combat turn, boost-stop, low-FPS spike, diagonal-attractor regression, collision sweep, and combined physics/flight performance.
- The desktop and mobile browser probe dismisses onboarding and sees a nonblank WebGL canvas, no console/page errors, correct bank sign, yaw release braking, strafe/no-yaw behavior, throttle, sustained boost, tap-dash, reverse braking, runtime flight-mode switching, diagnostics, and Rapier readiness.

## Remaining Risks
- Rapier remains optional and observational. It is not yet authoritative for production collision response.
- Collision broad-phase is still custom and simple. It is tested for boosted/projectile sweeps, but very dense combat scenes may need spatial optimization beyond the current lab load.
- Play feel still deserves human tuning passes after this implementation; the default assisted model is engineered to be controllable, but exact "fun" thresholds are subjective.
- The browser probe validates flight behavior through programmatic samples after onboarding is dismissed and captures screenshots; it is not a substitute for long manual play sessions across every mission/combat/docking route.
