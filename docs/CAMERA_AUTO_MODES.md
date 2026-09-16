# Camera auto-behaviors — complete manifest and risk audit

<!-- LIFETIME: LIVING REFERENCE. Update whenever a camera behavior is added, changed, or scrapped. -->

2026-09-16. Written after the owner reported towing a wreck piece made the camera "zoom in and out
over and over" with no control (fixed in `19cc3dd82`). The owner asked for a complete manifest of
every auto-camera detection, where each can go wrong, what fixes look like, and what is worth
scrapping. This file is that manifest. It is the checklist any future camera behavior must be
reviewed against.

Sources of truth: `src/render/camera.js` (chase camera + composition), `src/render/cameraDirector.js`
(mode takeovers), `src/render/feel.js` (impact/moment pulses), and their callers.

## 1. The four ways an auto-camera goes weird

Every bad camera incident in this repo's history is one of these:

| Pattern | Meaning | Known incidents |
|---|---|---|
| **P1 Continuous trigger on a discrete switch** | A mode takeover keyed to an analog signal (spring stretch, load, distance) flips on/off rapidly. Each flip restarts an ease. | Taut-line TWO_BODY tow flapping (fixed 2026-09-16); hostile Flyby Focus pair takeover before its demotion (removed earlier; see cameraDirector.js header note). |
| **P2 No hysteresis** | Enter and exit at the same threshold → chattering at the boundary even with a slow signal. | Same two incidents. Both gone; remaining discrete modes all have hysteresis or sticky holds. |
| **P3 Look-at theft** | The camera's center of attention moves off the player while the player is flying. Feels like "I can't fly." Magnitude × frequency = severity. | The tow bug (pair midpoint + big zoom, every spring breath). Deliberate combat framing is bounded and damped; mode takeovers are the residual risk. |
| **P4 Zoom coupling collapse** | Two zoom writers multiply: e.g. slowing to work a tether lets speed-zoom shrink the frame around the work area. | Known and guarded — the tether zoom floor at camera.js:1529 preserves the player's tactical distance. |

**Design rule that follows (and now holds everywhere): a mode switch must be gated on a discrete
game state (hostility, attachment active, autopilot lease, data flag) — never on a continuous
analog signal. Continuous signals get continuous, damped responses only.**

## 2. Manifest — discrete takeovers (camera director)

These replace the chase camera entirely for their duration. Highest-stakes family; each one
should justify itself against "the damped chase composition already covers this."

| # | Mode | Trigger (discrete state) | What it does | Safeguards present | Residual risk | Verdict |
|---|---|---|---|---|---|---|
| 1 | **TETHER_PAIR** (combat massline) | `player.tether` active to a hostile ship/drone (live hostility oracle, cameraDirector.js:745) | Look-at moves to pair midpoint; zoom fits both hulls up to 330 (528 with threat context); RECOVER ease on exit | Discrete trigger; single 0.35 s ease in/out; threat-context zoom is bounded | **MED** — same family the owner rejected for towing: look-at theft + big zoom while flying. Exit transitions (line snap, hostility flip) are one ease each, but an active fight can re-trigger. | **Keep, top of scrap watchlist.** Combat composition (#10/#11) already guarantees attacker visibility without the mode. If it ever reads badly, delete it and nothing is lost. |
| 2 | **FOCUS_PAIR** (onboarding trainer) | Two explicit data flags (`onboardingTraining` + `trainingFocusEligible`) | Authored once-per-game training shot vs a friendly drone | Flag-gated; scripted; cannot occur in ordinary play | LOW | Keep |
| 3 | **TWO_BODY** (twin bridle) | Live bridle attachment (`state === 'active'`, or bridle mirror) | Frames the two bridled bodies with the line as frame diagonal; threat widening to 528 | **Bridle-only since 2026-09-16** — the plain taut-line trigger (P1 flapping) was removed; bridle active state is discrete and cannot flicker with spring stretch | LOW–MED: justified only while the player is not an endpoint (world-to-world bridle — the pair shot is then the only way to read it) | Keep under watch |
| 4 | **GATE_APPROACH** | Autopilot actively flying to a gate/wormhole, 280–520 wu acquire band, release ×1.18 hysteresis | Look-at drifts 45 % toward the gate; zoom opens to reveal aperture; near-plane squeeze | **Consented** (player set the route; manual input cancels autopilot → flightV3.js:681); acquire/release hysteresis band; eased | LOW–MED: near-plane change is the least obvious channel; only fires while the flight computer owns the stick | Keep |
| 5 | **RECOVER** | Exit of any mode above | 0.35 s ease back to the chase shot | — | none | Keep |

Already removed (do not resurrect without a discrete + hysteretic trigger):
hostile Flyby-Focus pair takeover; plain taut-line TWO_BODY (the tow flapping bug).

## 3. Manifest — continuous auto-framing (chase camera, FOLLOW mode)

These never switch modes; they bias the ordinary camera. All are damped and slew-limited.

| # | Behavior | Trigger (continuous) | Magnitude / damping | Residual risk | Verdict |
|---|---|---|---|---|---|
| 10 | **Threat composition** | Nearest/actively-attacking hostile within 600 wu | Focus bias ≤70 wu (active attacker: up to exact midpoint, d×0.5); zoom bias ≤ +0.42; minZoom guarantees the attacker stays framed; slew 90 wu/s; anchor sticky-hold 0.28 s (challenger must be <85 % closer to break) | Active↔passive flips change the desired bias step — slew bounds it; deliberate that combat leaves the player off-center | Keep |
| 11 | **Group fit** (B3b) | ≥1 hostile attacking within 528 wu | Centroid focus, binary-search minZoom to fit all, per-member sticky holds, drops farthest member past the cap | MED in dense furballs: minZoom can pump as attackers cross the range boundary; sticky holds + cap are the mitigation | Keep, watch in fleet fights |
| 12 | **Tether composition** | Any active tether | Bias ≤64 wu toward the anchored object, zoom ≤ +9 %; plus the zoom floor that stops speed-zoom collapsing on the work area (camera.js:1529) | LOW — this is now the sole owner of towing after the takeover fix | Keep |
| 13 | **Speed zoom** | Smoothed speed vs governed combat speed | 0.88–1.35×; physics-earned exceptional speed up to 3.5× via the owner-bound velocity record; EMA-smoothed | The 3.5× exceptional pull-back is large — authored velocity contract, owner feel call | Keep; exceptional band on the feel watchlist |
| 14 | **Boost zoom** | `flags.boosting` | Damped in/out, reduced-motion suppressed | LOW | Keep |
| 15 | **Look-ahead + velocity lead + aim lead** | Velocity vector (0.5 s of velocity, ≤400 wu); velocity-language band lead; aim point (≤18 wu) | Damped; combat scales look-ahead to 0.6 | LOW | Keep |
| 16 | **Safe-rect clamp** | Always | Keeps focus within ~half a frame of the player | none — this is the safety net for everything above | Keep |
| 17 | **FR-5 ease-recenter** | Boost release, tether slingshot, physics-earned massline release | Eases accumulated bias back to center over ~0.4 s (×0.25 under reduced motion) | LOW | Keep |

## 4. Manifest — one-shot pulses

All ease in and out; most are suppressed while a director mode owns the frame; decorative ones are
reduced-motion gated.

| # | Pulse | Triggers | Envelope | Verdict |
|---|---|---|---|---|
| 18 | **Push-zoom** (scripted widen/tighten) | Dock fly-in +25 %/0.9 s, undock +18 %/0.7 s, asteroid exit +18 %/0.7 s, bullet-time kiss −5 %/0.3 s, stunt grammar −4 %/0.55 s, physics-earned massline release +6–14 %/0.65 s (+recenter), kill-cam kiss −4 %/0.25 s, death cam +22 %/1.2 s | Rise ~3× decay; damp() cannot overshoot | Keep |
| 19 | **Trauma shake** | Combat hits 0.2–0.9, drill 0.5, vfx impacts, survival announce 0.55, intervention 0.3, tether latch 0.06, flyby 0.08 (bus `camera:shake`) | Clamped ≤1.0, decays 1.8/s, ×0.25 under reduced motion, fixed 32 Hz resample | Keep |
| 20 | **Impact kick** (PQ-159.00) | Collision beat in feel.js — directed ≤4 wu frame slide | Rise-limited, cooldown via beat arming, reduced-motion skips | Keep |
| 21 | **FOV punch / hit-stop / vignette** | Heavy hit, kill, death, recoil, massline events | Projection-only — explicitly never reframes composition geometry; bounded 28°/s rise | Keep |
| 22 | **Moment beat** | Stunt-moment detector | 150 ms hit-stop + camera hold + stinger + trauma; reduced-motion gated | Keep |
| 23 | **Death cam** | Player death | 1.2 s hold + widen, reduced-motion skipped | Keep |

## 5. Not auto (player-owned, listed to bound the audit)

Photo mode free camera; manual zoom wheel/gamepad (clamped 45–330 — note director combat modes may
legally exceed the manual ceiling to 528); `chaseClose` accessibility profile; dock/station screen
swaps (fade, not camera).

## 6. Hardening proposals (not yet implemented — owner decides)

1. **Mode-flap governor** (~15 lines in `createCameraDirector`): if the same pair/gate mode is
   re-entered within ~1.5 s of exiting, lock the director to FOLLOW for ~4 s. A universal safety
   net that would have contained the tow bug even before its trigger was fixed, and contains any
   future P1 regression regardless of cause.
2. **Observable flapping:** extend `npm run probe:runtime-witness` to log director mode-transition
   rate (transitions/min). A live session crossing a small threshold flags any member of this
   manifest misbehaving in real play, instead of waiting for the owner to feel it.
3. **Invariant check:** a unit assertion that director mode transitions are only reachable from
   discrete state flips (hostility, attachment active, autopilot lease, data flags) — encodes the
   §1 design rule so a future continuous trigger fails a check instead of shipping.

## 7. Scrap watchlist (owner feel calls, cheapest first)

1. **TETHER_PAIR** — delete if it ever reads badly during a combat tow. Combat composition already
   keeps the attacker framed; the mode adds cinematic midpoint framing on top. Highest
   annoyance-per-Hz of the surviving takeovers because combat is when the player most needs the
   geometry to hold still.
2. **Exceptional-speed 3.5× pull-back** (speed zoom) — authored contract, but it is the largest
   single zoom excursion the camera ever makes; worth a feel verdict.
3. **Flyby Focus bullet-time** — not a camera behavior (the camera part was already demoted), but
   it is the same "the game did something I didn't ask for" family: 50 % slow-time opens
   involuntarily on a fast hostile pass, up to once per 4 s globally / 14 s per target. If
   involuntary moments bother the owner in principle, this is the biggest remaining one.
