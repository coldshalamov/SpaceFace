# Package 0 — felt-numbers scoreboard

Status: **candidate under repair; Package 0 exit is not accepted**. No commit has been made for this follow-up. The owner playtest remains the Package 0 exit / Package 2 gate.

## Owner decision

On 2026-09-15 the owner selected **gradually come to rest**, preserving the newer proportional settle law. This supersedes the gap report's former requirement to retain at least 90 WU/s ten seconds after releasing at 95. Deliberate braking remains separate.

## Evidence boundaries

- Pre-P0 source is `9411ff8c8^`. The committed 2026-09-15 fun-bench receipt already contains post-P0 flight behavior; it is not a pre-P0 flight measurement.
- Historical numbers below come from the gap report, not a fresh matched baseline. Current flight numbers use the shipped starter spec, V3 adapter and real Rapier physics in a focused system slice, not a complete game or display-latency test.
- B3b now steps a private shipping chase controller and uses its perspective matrix, including lead, focus easing and director modes. Old percentages used a different frame model and denominator; their change is not solely a gameplay improvement.
- The v4 bench retains raw locked/camera-active counts and range/phase/weapon exclusions. A false doctrine event excludes only its matching sampled tick and target; stale, future, or missing timestamps count conservatively. Issued fire overrides exclusions; live choreography permission can override current false doctrine evidence. The choreography counter can overlap issued-fire counts.
- Physical hull diameter is a legibility proxy, not authored-mesh or raster bounds. A 90-second framing run may remain in wave 1 or cleanup and does not prove three-wave completion.

## Measured observations

| Measure | Historical basis | Current observation | Scope / status |
|---|---|---|---|
| Hands-off coast from 95 | Gap report: 11.0 WU/s at 10 s | 86.53 at 1 s; 71.78 at 3 s; 37.33 at 10 s | Owner chose gradual settling; real-physics focused fixture |
| Yaw spin-up to 90% | Gap report: 0.267 s | 0.1333 s | Thrusting and coasting fixtures; meets original response target |
| Yaw stop to 10% | Gap report: 0.167 s | 0.0667 s | Thrusting and coasting fixtures; not a matched pre-P0 rerun |
| Dash response | Source behavior: release inside a 320 ms tap window | One dash event during the first boost-enabled step; speed 0 to 150 WU/s; no extra simulation step waited | Adapter/physics response, not wall-clock or photon latency |
| B3b full v3 matrix | Earlier claimed 27-cell pass is not valid for this model | 19/27 cells met; 8 failed; minimum 41.4603%; source changed during run | **NOT ACCEPTED**; predates the TWO_BODY repair |
| B3b rope diagnostic | Same Cinder/massline/4242 run | FOLLOW 515/530 in frame; TWO_BODY 3,278/6,629 | Confirms rope view omitted attacker context |
| B3b v4 focused Cinder/physics/4242 | Same conservative denominator before geometry repair: 6,537/9,262 (70.5787%) | 7,015/9,262 (75.7396%); issued fire 841/1,094 in frame; max zoom 443.039803 | **NOT MET**; source stable within each run; full v4 matrix not yet run |
| B3b v4 denominator accounting | Raw locked 13,626; camera-capable 9,935 | Excluded: weapon 3,691; range 559; current phase 114; counted 9,262 | Partition retained; no denominator reduction from the geometry repair |
| B3b v4 physical-diameter proxy | Focused Cinder/physics/4242 | Minimum 4.0802%; zero below-floor frames | Proxy only; one wave cleared in 90 seconds, not three-wave completion |
| Player physical-diameter proxy | No matched baseline | All 27 v3 cells recorded zero frames below 4% | Proxy only; does not rescue failed framing cells |
| Shipping-camera capture | No matched baseline | Intel capture: 160 retained frames; hull submitted in all 160; three originals independently reviewed | Focused physics-kit visual evidence; not all-frame/all-arena acceptance |
| 60-second runtime hitch ledger | Earlier 20-second capture is not comparable | 52 hitches / 3,563 observed frames; 40 named, 12 unknown; host CPU 46% busy | Diagnostic; not a smoothness pass or verified wave-3 window |
| GPU timed work per render frame | Unmeasured | 42 retained complete-frame samples; p50 10.448 ms, p95 14.049 ms | Query tail only; excludes compositor and untimed work |
| Input-to-present CPU proxy | Unmeasured | One observation: 19 ms | Too few observations for a useful percentile distribution |
| Physical input-to-photon | Unmeasured | Unmeasured | Software presentation stamps are not photon measurements |
| Owner playtest | Not recorded | No session result supplied | OPEN |

Flight data: [focused V3/Rapier receipt](runs/2026-09-15-p0-flight-numbers.json).
Runtime data: [scoped diagnostic snapshot](runs/2026-09-15-p0-runtime-diagnostic.json).
Rejected matrix: [v3 receipt](runs/2026-09-15-b3b-camera-v3.json); v2 was interrupted for a denominator repair and is obsolete.
Visual data: [capture manifest](manifests/crucible/p0-b3b-readable-cap-v3/swarm_piloted-physics_toolkit-s13502/strip-manifest.json) and [contact sheet](manifests/crucible/p0-b3b-readable-cap-v3/swarm_piloted-physics_toolkit-s13502/contact-sheet.png).

## Candidate behavior

- Yaw acceleration/braking authority is doubled without raising the authored rate ceiling. Dash fires on the press edge.
- The rejected 580 combat ceiling is now 528, shared by chase and director code. Extra pullback uses a physical-radius legibility bound, retaining the legacy 330 framing envelope. This is not a 4% raster guarantee for every hull/FOV/aspect, nor a 1.6 multiplier over every selected zoom setting.
- TWO_BODY includes active attackers while preserving rope endpoints and midpoint, with arrival/release zoom continuity covered by focused regressions.
- FOLLOW now tries another feasible focus inside the existing safe rectangle before dropping a hostile when the preferred group center cannot fit. The captured group regression passes in both local and translated world coordinates; remaining moving-scene misses are still under investigation.
- Engagement ranges remain narrower than the report's first tuning table. Role readability, kiting and owner taste still need playtest evidence.

## Verification and review

- Latest completed camera/rope verification: camera 42/42, dense-scene 9/9, TWO_BODY 9/9. The new group-center regression failed before the repair (attacker 22 projected outside the frame) and passed afterward. Fresh independent code reviews are pending.
- Latest v4 B3b observer checks: 5/5. The stale-phase regression failed before its fix (eight valid ticks incorrectly excluded) and passed afterward. Earlier observer/capture checks do not replace current-source full-matrix or visual validation.
- Runtime-matrix reporting tests: 7/7. GPU timers are now enabled for an owned window, drained before readback, and restored; additional review hardening is in progress.
- The full baseline command exited 1: 13/15 links green and 150,537 ms exceeded the 90,000 ms budget. Save-schema drift was regenerated from current source and checked successfully; the timed-out physical-branches child passed in isolation. The combined wall-time budget is not claimed green and was not raised.
- Earlier verb duplicate-run failures and full fun-bench receipt-write failure remain unclosed. Historical `determinismVerified: false` does not establish causation. Measured red clauses for well convergence/chains, collision helm-loss and tumble-trail recovery remain tracked.
- Independent production-code, measurement-code and focused visual reviews approved the earlier repaired candidate, with scope notes. New TWO_BODY changes still require fresh review; no prior approval is promoted to whole-packet acceptance.
- The GPU/input instrumentation received an independent APPROVE WITH NOTES. Strict invalid-GPU capture gating is retained; lifecycle/route/ID-floor notes are being addressed rather than claiming partial data as a clean performance pass.

The next framing receipt must bind a stable candidate, retain all companion counters and wave coverage, and close the remaining failed cells. Package 2 remains gated on the owner's session.
