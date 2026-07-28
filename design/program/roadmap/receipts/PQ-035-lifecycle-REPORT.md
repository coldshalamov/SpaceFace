# PQ-035 — PERF-01 lifecycle implementation receipt

```yaml
packet: PQ-035
scope: deterministic Browser/Electron lifecycle implementation and focused integration
protectedCandidateBranch: codex/perf-01a-background-lifecycle
protectedCandidateHead: 8610102d89a4c122e088205eb46739590c6a477e
implementationBranch: claude/perf00-20260727
implementationHead: 0a665b85
synchronizedHead: 0b324999
lifecycleClaim: integrated
acceptanceClaim: deterministic_green_native_broker_pending
disposition: PARTIAL
qualityInvariant: preserved
```

## What this receipt claims

PERF-01's deterministic implementation is integrated without merging, rebasing, cherry-picking, or
cleaning the protected `sf-perf01a` worktree. The accepted lifecycle concepts were selectively ported
and then repaired against the current Browser/Electron, input, audio, launch-policy, and fixed-step
owners.

The resulting runtime has one explicit lifecycle policy for foreground-visible,
foreground-occluded, hidden-or-minimized, system-suspended, and restoring states. Hidden wall time is
not admitted to simulation. Hidden/minimized/system-suspended states own no main-loop presentation
callback. Restore presents one coherent zero-delta snapshot, excludes synchronous restore work from
the next fixed-step delta, and then returns to the ordinary four-step catch-up cap and existing backlog
shedding semantics.

**Not claimed:** terminal PQ-035 acceptance, native Browser/Electron lifecycle parity, hidden GPU
submission cessation, or an FPS/resource improvement. Those claims require broker-managed native
cells on an uncontended evidence machine. The current machine was explicitly unsuitable for stable
FPS/GPU evidence because several coding-agent workloads were running concurrently.

## Integrated implementation commits

| Commit | Integrated behavior |
|---|---|
| `4b87d329` | Main-loop lifecycle state machine, hidden scheduling cancellation, coherent restore frame, controller teardown |
| `354eac49` | Electron lifecycle publication, context-isolated preload transport, normal background throttling with fail-closed evidence override |
| `c7f8c870` | Input and initial audio lifecycle ownership |
| `e13a9129` | Non-vacuous launch-policy verification of save-transition ownership ordering |
| `4d026653` | Restore-cost clock reset, committed Massline packet preservation, device-source-aware gamepad quarantine |
| `0a665b85` | AudioContext state ownership, resume-race hardening, music timer pause/resume/stop ownership |

The implementation branch was also kept synchronized with incoming product and asset work. No
lifecycle implementation commit reduced content, population, effects, draw distance, render quality,
or default visual quality.

## Protected candidate classification

### Accepted concepts

- One normalized lifecycle state machine shared by browser visibility and Electron shell commands.
- Monotonic shell sequence numbers with duplicate/stale command rejection.
- Main-loop rAF cancellation in non-presenting states and idempotent listener/controller teardown.
- Hidden wall-clock exclusion from the fixed-step accumulator.
- A coherent presentation snapshot before post-restore gameplay resumes.
- Normal Chromium `backgroundThrottling` for player execution.
- A narrowly gated isolated-evidence exception that requires both an isolated-evidence launch and an
  explicit environment opt-in; the environment variable alone cannot disable player throttling.
- Context-isolated, one-way preload publication rather than renderer-side Node authority.
- Focused loop and Electron lifecycle tests carried with the behavior they prove.

### Repaired before integration

1. **Restore clock ownership.** Resetting the clock at restore entry was insufficient because a slow
   synchronous restore render could be charged to the next simulation callback. The clock is reset
   after restore rendering and synchronous owner wake-up commit.
2. **Foreground fixed-step semantics.** Restore now returns immediately to the existing accumulator,
   four-step cap, fractional remainder, and explicit whole-step shedding policy.
3. **Input source ownership.** Lifecycle release clears event-owned keyboard, mouse, and touch state,
   while gamepad-backed Massline, countermeasure, and Travel Burn actions remain quarantined until a
   connected neutral sample proves physical release. Pad absence is not treated as neutral, and fresh
   keyboard transitions remain authoritative.
4. **Committed Massline packet identity.** The latest published Massline action is detached with
   `grammar.snapshot()` before reusable grammar state is reset, so the zero-step restore render cannot
   observe a partially mutated committed packet.
5. **Audio scheduling ownership.** Audio's independent rAF, AudioContext, state listener, and four
   recursive music timers now suspend and teardown explicitly. Previously running contexts recover
   from both `suspended` and Safari-style `interrupted` states.
6. **Async audio resume race.** A pending `resume()` promise owns the transfer. Public `ctx.state`
   cannot start rAF or clear retry intent before the promise fulfills; rejection leaves lifecycle
   resume intent available for a later retry.
7. **Launch-policy assertion.** The check now verifies that save-load route ownership is reserved
   before a synchronous lifecycle event can reenter and that the same token is returned. It no longer
   depends on one stale source-string shape.

### Rejected

- The reviewed four-callback post-restore `frameDt <= fixedDt` stabilization clamp. It changed
  legitimate foreground catch-up semantics and made a 50 ms foreground callback run one fixed step
  instead of the ordinary three.
- Catching up hidden wall time or continuing full simulation/presentation work while hidden.
- Treating a missing gamepad as proof of release.
- Global post-restore held-source suppression that also discards fresh keyboard input.
- Allowing an environment variable by itself to disable Electron background throttling.
- Any second game route, relaxed context isolation, renderer Node integration, permanent debug
  authority, or wholesale candidate merge/copy.
- Source-shape checks that can pass vacuously or require a less safe implementation order.

## Deterministic behavior now covered

- Visible foreground keeps the existing fixed-step and render cadence.
- Hidden document state cancels presentation scheduling and performs no hidden main-loop work.
- Browser visibility remains authoritative over a conflicting foreground shell command.
- Minimize/system-suspend commands are monotonic and idempotent.
- A hide fired during simulation aborts presentation and rescheduling.
- Restore renders exactly one `frameDt = 0` snapshot before simulation resumes.
- A 100 ms synchronous restore render is excluded from the next simulation delta.
- Ordinary post-restore foreground time still uses the existing catch-up cap and shedding semantics.
- Repeated transitions retain exactly one lifecycle listener set and one scheduled frame owner.
- Input release preserves the latest committed restore packet and blocks only stale gamepad actions.
- Audio lifecycle suspension owns rAF, context suspension, stem timers, retry intent, and teardown.
- A context that never ran remains protected by browser autoplay policy.

## Verification at the implementation head

| Gate | Result |
|---|---|
| Focused PERF-01 suite: audio, professional-audio identity, Band UI audio, loop lifecycle, input lifecycle, loop orchestration, Electron lifecycle, Travel Burn | **62 pass / 0 fail** |
| `node --check src/audio/audioSystem.js` | **exit 0** |
| `node --check test/audio-lifecycle.test.mjs` | **exit 0** |
| `npm run check:launch-policy` | **exit 0**; one player URL, shared Browser/Electron server module, stable save origin, canonical runtime backends, no production query fork |
| `npm run check:baseline` | **10/10 green** in 48103 ms; 41897 ms headroom against the 90000 ms deterministic budget |
| `git diff --check` on the final audio unit | **no whitespace error**; Windows worktree emitted only the known LF-to-CRLF checkout warning |

The deterministic baseline included `ui-screen-imports`, `pq020-ceres-topology`, `save-schema`,
`flight-v3`, `m1-tether-mass`, `sim-v3-compare`, `sim-compare`, `sim-v3`, `sim`, and `massline`.
No contested FPS, compositor, or GPU sample was used as acceptance evidence.

## Residual acceptance gap

PQ-035 remains active and `acceptance: unproven` until the broker owns the native
`performance-lifecycle` matrix. Required remaining evidence includes:

1. Browser visibility cells with actual submission/work attribution.
2. Packaged Electron minimize, hide/show, focus/occlusion, suspend/resume, and lock/unlock cells.
3. Audio restoration and first-visible-frame observation in both routes.
4. Hidden CPU/GPU/submission cessation bound to lifecycle transitions.
5. Matched foreground digest and resource evidence using one admitted source candidate on an
   uncontended machine.
6. Repeated-transition soak proving no duplicate native listeners, callbacks, or restore storm.

These native claims are deliberately deferred rather than inferred from source text or from unstable
frame-rate samples. The deterministic implementation is complete enough to unblock PERF-02; this
receipt does not promote PQ-035 to terminal acceptance.
