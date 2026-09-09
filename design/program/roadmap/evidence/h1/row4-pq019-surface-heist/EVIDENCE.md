# H1 row 4 — PQ-019C surface-heist Browser broker cell

**Overall result: PASS — retained DOM/lawful evidence plus accepted four-context continuation.**

The original H1 attempt failed in its third context and is preserved below without revision. Exact
dispatch unit `PQ-019.surface-heist-h1-capture` later consumed a fresh materially changed candidate
through the same registered broker manifest:

```text
node scripts/validation-broker-cli.mjs --manifest pq019-surface-heist
```

The accepted continuation intentionally skipped the already-valid `dom-abandon` and `lawful-observe`
contexts. Browser claim `16760-d2392f32208ac30dca5602a5`, candidate commit `f30a35d0`, and
candidate digest `df8e06183f7ab95c7731b195709423864091583e57e01521b83a780ac962bb6f`
ran the four missing isolated contexts in one headed Browser process at fixed seed `19019`.

## Accepted continuation

- **Heist + fence:** the live tether route produced one law-signed incident, one patrol lease,
  WANTED heat, the composed `Theft witnessed — WANTED, and Concord patrol units are inbound` floor,
  and exactly one `1800`-credit settlement.
- **Confiscation:** production facility contact committed `lawful_confiscation`; one terminal
  receipt, one mission settlement, one faction outcome, one heat/law effect, and zero payout.
- **Destruction:** the production combat kernel destroyed the live capsule and committed
  `payload_destroyed`; owner effects remained exactly once and payout remained zero.
- **Reduced-stake recovery:** destroyed attempt `m_2` produced one authored retry offer; the ordinary
  station DOM accepted attempt `m_3`; its real patrol lease remained live; fence settlement paid
  exactly `900`, half the first-pass stake. Reduced motion was active and the result remained
  complete in text.
- **Presentation:** theft priority `80` preempted onboarding; terminal priority `100` preempted
  repeatable combat; life-critical danger retained priority `110`. No heist line duplicated as a
  toast, and no page errors were recorded.
- **Runtime:** real Intel/ANGLE D3D11 WebGL. This is functional evidence only; no frame time,
  percentile, hitch, or speed claim is present.

Accepted screenshots:

- [composed witness/WANTED/patrol floor](surface-heist-continuation/fenced-composed-wanted.png)
- [fenced settlement](surface-heist-continuation/fenced-success.png)
- [lawful confiscation](surface-heist-continuation/confiscation.png)
- [production-combat destruction](surface-heist-continuation/destruction.png)
- [reduced-motion half-stake offer](surface-heist-continuation/recovery-offer-reduced-motion.png)
- [reduced-motion retry success](surface-heist-continuation/recovery-success-reduced-motion.png)

Machine-readable continuation artifacts are under
[`surface-heist-continuation/`](surface-heist-continuation/): broker claim and consumption record,
fast-gate digests, launch counts, terminal run result, and the complete route receipt.

## Retained original failure and classification

The saved stack localises the failure exactly:

```text
[pq019-surface-heist] FAIL in heist-plus-fence
  - page.waitForFunction: Timeout 20000ms exceeded.

at waitForCapsule (scripts/probe-pq019-surface-heist.mjs:633:15)
at scripts/probe-pq019-surface-heist.mjs:225:11
```

`waitForCapsule()` waits for a live entity through the transient global
`state.heistFacilities.capsuleEntityId`. It has a fixed 20,000 ms **wall-clock** timeout, but it does
not simultaneously:

- prove that four seconds of simulation time elapsed;
- persist `simTime`, tick, `timeScale`, schedule status, launch receipt, or the accepted mission's
  heist subrecord when it fails;
- race a live capsule against an already-decided terminal route; or
- distinguish “schedule not yet advanced”, “capsule launched then ceased to be live”, and “wrong
  transient identity”.

The failure screenshot still shows the authored pre-launch objective, “Hold station off Tethys
Surface Launcher for the launch”, rather than a crash or a product error. H1 explicitly permits a
warm/contended machine, so a functional cell cannot use an uninstrumented wall-time deadline as proof
that a simulation-time event failed. The missing state snapshot also means the saved attempt cannot
support a narrower product diagnosis after the fact.

This is therefore classified **HARNESS**, not PRODUCT or ENVIRONMENT:

- not PRODUCT: the same acceptance attempt's immediately preceding `lawful-observe` context created a
  real capsule and committed `lawful_arrival_observed` through the production facility-contact route;
- not ENVIRONMENT: WebGL was available on a real Intel/ANGLE D3D11 renderer, two earlier contexts
  completed, the Browser process exited normally with its owned cleanup, and those contexts recorded
  no page errors;
- HARNESS: the third context's acceptance script timed out on a transient, wall-clock-only predicate
  without recording the simulation facts required to interpret that timeout.

This classification does **not** claim that the remaining product routes pass. It says the one H1
attempt cannot tell us whether they pass, because the route actor stopped before exercising them.

## Functional evidence that survived

### Real station/Mission Log DOM and dangerous confirmation — PASS

The first context completed the ordinary visible route:

1. Station OS → Missions.
2. Select `Capsule Run — Tethys Surface Launcher`.
3. Focus and click `Accept + Bind Route`.
4. Press shipped binding `KeyJ` for Mission Log.
5. Focus and invoke Abandon.
6. Confirm through the real danger dialog.

Observed facts:

- active mission `m_2` joined to source offer `heist_tethys_capsule_run`;
- dialog `role="dialog"`, `aria-modal="true"`, labelled and described;
- initial focus was the safe **Cancel** action;
- confirming produced one committed `abandoned` receipt and one mission settlement;
- no payout, heat application, or law incident;
- page issues: zero.

Screenshots:

- [station Missions board](dom-abandon-board.png)
- [Mission Log](dom-abandon-log.png)
- [danger confirmation](dom-abandon-confirm.png)

### Lawful-observe terminal route and one-voice outcome — PASS

The second context accepted through the same station DOM, observed a live cargo capsule, routed a
production `physics:impact` at the lawful catcher, and committed:

- outcome `lawful_arrival_observed`;
- exactly one terminal receipt and one mission settlement;
- no payout and no heat;
- one visible floor item with text
  `Capsule caught by Concord — the run is over, nothing was taken`;
- stable voice id `pq019c:capsule-run`, objective priority `60`;
- queue size `1`, pending count `0`, matching toast count `0`;
- cue moments `accepted`, `launched`, `lawful_arrival`;
- page issues: zero.

Screenshots:

- [lawful route station board](lawful-observe-board.png)
- [lawful-arrival one-voice floor](lawful-arrival.png)

### Heist-plus-fence and later routes — NOT PROVEN

The third context accepted and undocked, then stopped at `waitForCapsule()`. The following intended
claims were never reached and remain open:

- witnessed tether possession and composed witness/WANTED/pursuit line;
- `fenced_success`;
- `lawful_confiscation`;
- `payload_destroyed` through production combat damage;
- opt-in reduced-stake recovery and its reduced-motion route;
- a full five-route normal-camera/H2 verdict.

Failure frame: [heist-plus-fence timeout](failure-heist-plus-fence.png).

## Deterministic preflight and broker boundary

Before issuing the one-use claim, the manifest's exact fast gates passed:

- `check:pq019c:mission` — 65/65;
- `check:pq019b:seams` — 91/91;
- `check:pq019a:facility-embodiment` — 19/19;
- `check:sim:compare` — deterministic, `hashEqual: true`, no divergent tick.

`launch-counts.json` binds candidate digest
`21afdc13a66d0cb6fa3b729921203e814b98e5115139e949572a7dc7e3896474` to exactly one acceptance
launch. No retry was attempted.

## NOT performance evidence

This row makes no speed, frame-time, percentile, hitch, or representative-performance claim.
`latest-run-result.json` contains broker process duration metadata only and is explicitly stamped
`"informational_contended": true`. Matched PQ-019C performance remains Phase H3.

## Machine-readable files

- `classification.json` — H1 classification and claim boundary;
- `route-receipt.json` — raw probe receipt, including the saved stack and two completed contexts;
- `fast-gate.json` — broker fast-gate digest receipt;
- `launch-counts.json` — structural proof that the candidate consumed one acceptance launch;
- `latest-acceptance-failure.json` — broker failure fingerprint;
- `latest-run-result.json` — process record, with duration marked informational/contended;
- `broker-run.log` — exact terminal result from the one attempt.
