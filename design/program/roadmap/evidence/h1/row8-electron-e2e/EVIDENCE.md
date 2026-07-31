# H1 row 8 — Electron end-to-end sanity smoke

**Result: PASS — accepted continuation candidate
`c8b4fa2ca8be5239194879ec09380f43bf764af8`.** One fresh candidate-bound source-Electron launch
completed the full public route from Main Menu through physical station docking to Ledger. The
original Main Menu harness failure and all three continuation failures remain retained below; none
was overwritten or reclassified.

## Accepted continuation

Command:

```text
node scripts/check-h1-electron-e2e.mjs
```

Attempt controls and runtime facts:

- candidate commit: `c8b4fa2ca8be5239194879ec09380f43bf764af8`;
- attempts consumed: `1`;
- launches: `browser=0`, `electron=1`;
- fixed seed: `47`;
- retry performed: `false`;
- GPU: Google/Intel ANGLE Direct3D11, software fallback `false`;
- hard page/request errors: none;
- cleanup: app, page, process, listener, and isolated profile PASS; process exit `0`.

The accepted route proved:

1. canonical isolated root, Main Menu, New Game, and authored flight;
2. public Helios Station waypoint/autopilot;
3. physical `[ E ] DOCK AT STATION` prompt at `38.043 WU` from the authored berth;
4. one public held-`E` input setting `ui.docked=true` at `station_helios`;
5. visible Station command dock through locator authority
   `locator:[data-screen=station] .sx-dock`;
6. Ledger tab selected with title `The Ship's Ledger`, accessible label
   `st-ledger-station-title`, and a real content surface.

All six original-resolution accepted frames were reviewed for functional route continuity. That
review does not issue a human legibility, art-quality, or visual-polish verdict.

The accepted files live under `continuation-pass-c8b4fa2c/`; their SHA-256 digests and the bounded
claim are in `continuation-summary.json`.

## Retained failure trail

- `continuation-failure-5c5421ac/` — **PRODUCT**, legacy 90-WU station-center arrival stopped
  outside truthful berth capture;
- `continuation-failure-93143293/` — **PRODUCT**, direct-to-berth course met the compound station
  silhouette outside its corridor gap;
- `continuation-failure-147df4dd/` — **HARNESS**, an immediate opacity resample contradicted the
  passed Station locator, `visibleScreens=["station"]`, and the visible Station frame.

Each fingerprint has a separate focused repair receipt and seconds-scale regression. The root files
described below remain the original candidate `01a398f0` Main Menu harness failure.

## Attempt

Command:

```text
node scripts/check-h1-electron-e2e.mjs
```

Attempt controls:

- candidate commit: `01a398f07fd297328e9965c46404a970ee653299`;
- attempts consumed: `1`;
- launches: `browser=0`, `electron=1`;
- fixed seed reserved for New Game: `47`;
- retry performed: `false`;
- intended route: menu → New Game → authored flight → public Helios Station waypoint/autopilot →
  visible dock prompt → held `E` dock input → station command dock → Ledger.

The harness records its attempt before `electron.launch()` and refuses any later invocation after one
attempt has been consumed.

## Exact failure and classification

The attempt established the isolated canonical root, dismissed the intro with `Space`, and successfully
completed its locator-based wait for `[data-screen="mainMenu"]`. It then made a separate
`document.querySelector` visibility reading and rejected:

```text
Main Menu must be visible
false !== true
```

This is **HARNESS**, not PRODUCT:

- [the failure screenshot](failure-row8.png) visibly shows the complete SpaceFace Main Menu;
- `failure-state.json` records `mode: "menu"`;
- the same failure snapshot records `visibleScreens: ["mainMenu"]`;
- focus is on `<button ...>New Game</button>`;
- the first locator-based visible wait had already passed.

The rejected predicate therefore contradicted both the visual frame and the independently gathered
failure snapshot. Its second selector/stability sample produced a false negative; the product did not
fail to render the menu.

This is not an environment failure either. Electron reached a clean isolated loopback root, the URL
remained canonical, the app exited with code `0`, the listener was released, the page and child process
closed, cleanup passed, no force-close was required, and the isolated profile was eligible for owned
cleanup. Recorded console items are warnings (Electron development CSP and shader compiler warnings),
not page/request errors.

## What survives

The original root attempt proved only:

- the shipped headed Electron shell launches in an isolated profile;
- its canonical clean loopback root is established;
- the intro dismisses through ordinary keyboard input;
- the Main Menu visibly renders and focuses New Game;
- owned Electron cleanup succeeds.

It does **not** prove:

- entry into the New Game screen;
- Launch into authored flight;
- public station approach;
- physical docking through `E`;
- the station command dock or Ledger;
- the complete Electron sanity chain requested by H2 Decision 6.

That original attempt did not fill Row 8. The accepted `c8b4fa2c` continuation now proves the exact
menu → physical dock → Ledger source-Electron chain and closes H2 Decision 6's functional go/no-go
question. It does not close any separate human visual, physical-controller, packaged-runtime, or
matched-performance gate.

## NOT performance evidence

The original and continuation reports are stamped
`"informational_contended": true` and `"noPerformanceEvidence": true`. Timestamps, timeout controls,
and cleanup lifecycle metadata are diagnostics only. No renderer/per-frame sampler, p95/p99, hitch
measure, or matched before/after result was collected. Matched performance remains Phase H3.

## Files

- `failure-row8.png` — visible Main Menu at the rejected assertion;
- `failure-state.json` — phase, assertion, semantic state, visible screen, and focused control;
- `classification.json` — HARNESS classification and bounded surviving/unproven claims;
- `report.json` — complete one-attempt Electron lifecycle and cleanup record;
- `launch-counts.json` — one Electron launch, zero Browser launches, no retry;
- `run.log` — canonical-root, intro, and failure lines.
- `continuation-summary.json` — accepted candidate, bounded functional claim, retained failures, and
  pass-artifact digests;
- `continuation-pass-c8b4fa2c/` — six original-resolution frames, report, launch controls, and log;
- `continuation-failure-*/` — the three preserved product/harness continuation failures.
