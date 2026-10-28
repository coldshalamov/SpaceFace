# Coherent flight: validation evidence

This directory keeps compact, reviewable evidence for the movement/AI/contact change described in
[Flight and motion tuning](../../FLIGHT_AND_MOTION_TUNING.md). The binding interpretation remains
[Validation workflow](../../VALIDATION_WORKFLOW.md). A successful focused fixture, rendered route,
and complete public gameplay gate are different claims.

## Preliminary Adventure capture — INCOMPLETE

The preserved [verdict](preliminary-adventure-verdict.md) and
[contact sheet](preliminary-adventure-contact-sheet.jpg) are the original outputs from
2026-10-28. Their filenames identify them as preliminary; the verdict's contents are unchanged.
The original trace and individual frames remain in the ignored
`.devshots/coherent-flight/adventure/` directory and are not part of this compact bundle.

```sh
npm run player-truth -- --mode=adventure --gate --duration=120 --wall=8 \
  --out=.devshots/coherent-flight/adventure
```

The run used Chromium 141.0.7390.37, SwiftShader software WebGL, the default 960×540 headless
viewport, seed 4242, shipped settings, and the normal public menu/launch/keyboard route. `CHROME_PATH`
selected the installed Chromium executable. All 8,654 asset blobs checked by the harness matched
the tested Git tree. The player store was disposable.

| Evidence | Observed result |
|---|---|
| Overall | **INCOMPLETE**, exit 2; no FAIL categories |
| Runtime | 483 seconds wall time; 27.8 seconds of simulated play; wall-clock cap reached |
| Public route | PASS: menu → first-run prompt → Adventure selection → launch → flight |
| Player control | PASS: both public thrust/yaw probes moved the real ship |
| Player presentation | PASS: no bad player-ship frames among 800 measured gameplay frames |
| Readability | UNKNOWN: insufficient qualified samples for required object classes |
| Frame time | UNKNOWN: software-renderer evidence with no matching baseline; no hardware-performance claim |
| Offscreen marker | UNKNOWN: the required case was not read |
| Runtime errors | No captured page or console errors |

The thrust probe produced a 21.05-WU/s velocity change and 73.0 WU of movement over 1.23 simulated
seconds. The yaw probe turned 2.398 radians over 0.817 seconds. The first-run dialog, flight frames,
and contact sheet were opened and inspected.

### Source and interpretation limits

This run began on `33723c289cbcc4114b71b7c36ae5d2393b0966bc` with working-tree changes. Additional
AI avoidance, contact-consequence, and fresh-press docking changes landed while the browser was
running. The verdict records different source-path lists at the start and end. Consequently this
capture demonstrates that the developing integration reached real gameplay; it does **not** certify
the final candidate or every code path subsequently changed.

Two non-player kill events occurred during the initial six-second idle window, before the final
contact changes: a wreck at 3.533 seconds and a ship at 5.783 seconds. Other destruction records
include virtualization and optical culling, which are not combat deaths. Preserve that distinction
when assessing the reported offscreen chaos. The final collision regressions and final candidate
route must establish the behavior of the completed patch.

## Final candidate public gates

The tested local source is `49a9e420b0b8eb2164f0666c11cabfd0fa789e58`, based on
`4b468fdf71a38f83f7017a061808317d9aede1ca`. All six cells below completed on that frozen source;
only this documentation and its evidence copies changed during capture. Each cell keeps its
original verdict and contact sheet. The preliminary capture above does not substitute for these
final-source results.

| Mode | Pass | Status | Evidence |
|---|---|---|---|
| Racing | Active | **INCOMPLETE** · 8.2 sim s / 377 wall s | [Verdict](final-racing-active/verdict.md) · [contact sheet](final-racing-active/contact-sheet.jpg) |
| Swarm | Idle | **FAIL** · 0 sim s / 369 wall s; no active samples before cap | [Verdict](final-swarm-idle/verdict.md) · [contact sheet](final-swarm-idle/contact-sheet.jpg) |
| Swarm | Active | **FAIL** · 0.1 sim s / 326 wall s; round 1 only | [Verdict](final-swarm-active/verdict.md) · [contact sheet](final-swarm-active/contact-sheet.jpg) |
| Gauntlet | Idle | **FAIL** · 0 sim s / 382 wall s; too few play frames | [Verdict](final-gauntlet-idle/verdict.md) · [contact sheet](final-gauntlet-idle/contact-sheet.jpg) |
| Gauntlet | Active | **FAIL** · 0 sim s / 384 wall s; round 1 only | [Verdict](final-gauntlet-active/verdict.md) · [contact sheet](final-gauntlet-active/contact-sheet.jpg) |
| Adventure | Active | **INCOMPLETE** · 8.2 sim s / 359 wall s | [Verdict](final-adventure-active/verdict.md) · [contact sheet](final-adventure-active/contact-sheet.jpg) |

**The public gameplay gate is not green.** Racing and Adventure reached actual player thrust/yaw
probes, which passed, but readability samples, a comparable frame-time baseline, and the offscreen
marker case remain unmeasured. Swarm and Gauntlet reached their public round-one launch, then hit
the wall cap before meaningful active play. Their strict checks correctly report missing evidence
as FAIL; neither active pass reached the required third round. Those failures have not been
reclassified as environment success or waived. Keep the PR in draft pending longer GPU-backed
public acceptance runs.

The [final public validation record](final-public-validation.json) retains per-cell source identity,
original failure reasons, artifact hashes, and source verification. All six captures recorded the
same start/end source commit with no dirty source paths, and no page or console errors. All 21
runtime hashes in the integration record still matched after the final cell. Each contact sheet
was opened and inspected. Original full traces remain in `.devshots/coherent-flight-final/`.

### Remaining world observation

The final Adventure trace still contains an asteroid destruction at 1.833 simulated seconds and a
non-player ship death at 5.85 seconds, before the first player input at 6.1 seconds. Two further
non-player deaths appear around 8.1 seconds. The short trace does not establish whether these are
intended world activity or a remaining causal defect. The focused contact regressions prove their
specific correction; these captures do not prove that all ambient destruction has been eliminated.
The final validation record preserves the relevant event details for follow-up.

### Commands used

```sh
npm run player-truth -- --mode=racing --gate --wall=4 \
  --out=.devshots/coherent-flight-final/racing
npm run player-truth -- --mode=swarm --gate --wall=4 \
  --out=.devshots/coherent-flight-final/swarm
npm run player-truth -- --mode=gauntlet --gate --wall=4 \
  --out=.devshots/coherent-flight-final/gauntlet
npm run player-truth -- --mode=adventure --gate --wall=4 \
  --out=.devshots/coherent-flight-final/adventure
```

Swarm and Gauntlet each produce an idle pass and an active pass: four mode commands are six browser
runs. Their active gate requires reaching at least round three and allocates a simulated-time
budget of at least 300 seconds; completing three rounds can end the pass earlier. The idle pass
holds input for 40 simulated seconds. Passing a smaller `--duration` cannot reduce that active
round-mode budget or its round requirement. Adventure and Racing use their non-round active pass.

The completed bounded matrix kept the default 960×540 headless viewport and used `--wall=4` without
changing duration or round requirements. Browser cells ran sequentially on the software-renderer
host, with no retries. A chosen `--wall=<minutes>` is a
per-pass limit, measured from that pass's start and checked in its play loop; preparation, initial
idle, and control probes have separate waits. It is not a strict process timeout. Record any
chosen cap in the evidence and retain an INCOMPLETE or FAIL when the required play was not observed.
Do not shorten the acceptance contract or infer hardware performance from SwiftShader timing.

The preliminary run spent roughly 329 seconds reaching flight and subsequently advanced around
0.1–0.22 simulated seconds per wall second. This is a budgeting observation, not a predicted
duration for another mode. A short capped run can expose a route defect but cannot promise to
observe three rounds. A comparable GPU-backed run is still needed for final frame-time confidence.

## Focused coverage alongside the rendered gates

Start with `npm run check:motion` for the changed precision, motor, contact, traffic, formation,
dormant-flight, and docking-input behaviors. The
[tuning guide](../../FLIGHT_AND_MOTION_TUNING.md#evidence-and-regression-strategy) maps those
mechanisms to their behavior checks. The [integration record](integration-validation.json)
records the frozen runtime hashes, 60 focused behavior cases plus seven docking-key groups,
existing baseline gates, and native save/reload equivalence. The [AI record](ai-validation.json)
captures pilot feedback, formations, and civilian arrival evidence. The
[contact validation record](contact-validation.json)
retains measured overlap/chain/surface-impact fixtures, native-joint and active anchor-recoil
compatibility, regression commands, and a digest of the collision patch.
Useful existing mode-specific native fixtures include:

- `test/racing-opponents.test.mjs`: V3/Rapier rivals traverse authored courses and recover after a
  physical displacement; this is native motion evidence, without rendered player input.
- `test/racing-refinement.test.mjs`: the real flight owner respects the starting-grid hold.
- `test/swarm-native-draft-admission.test.mjs`: the production worker launch and later-round
  admission settle native passive bodies before publishing their first active state.
- `test/crucible-arcade-tools.test.mjs`: native tether webs and radial blasts retain real physical
  effects and bounded attribution.

The `crucible.physics-swarm` lab scenario is a focused V3/Rapier combat fixture whose listed systems
omit tactical AI. Its success must not be presented as proof of the default tactical pilots or a
complete played Swarm round.
