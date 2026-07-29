# H1 row 8 — Electron end-to-end sanity smoke

**Result: FAIL — HARNESS.** The single permitted Electron attempt stopped at the Main Menu because a
second harness visibility sample returned `false` even though the product surface was visibly present.
No retry was performed.

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

H1 Row 8 proves only:

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

Row 2 separately proves Electron parity for the two Ledger hosts after its own route preparation. It
does not fill this Row 8 gap because it did not prove this exact menu → physical dock → Ledger chain.
H2 must therefore perform the short manual Electron smoke or defer Decision 6; it must not infer a PASS
from the visible Main Menu alone.

## NOT performance evidence

`report.json`, `failure-state.json`, and `launch-counts.json` are stamped
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
