# Bar dialogue readability: bounded presentation increment

## Scope

This increment is based on PR #945 parent `911298c1bec7d35cc4f7aae21495cfd8b9af2322`.
The complete parent tree is preserved except for two presentation files, two new regression tests,
and this report. The branch remains draft. This is not acceptance of the full Ceres commission.

- Responses are complete immediately rather than temporarily rewritten by a typewriter.
- Keyboard and gamepad choice focus asks the existing scroll owner to reveal the selection.
- Bar-only compact styling retains role, name and opener, wraps text, uses a 56px portrait,
  and specifies 44px choice targets.
- Reply construction, audio dispatch, scroll owners, canonical gameplay writers and saves are unchanged.

The reviewed source/test bytes were frozen before publication. No unrelated dirty checkout content
or excluded upload paths were added. An independent review found no material implementation blocker.

## Verification on 10 November 2026

The final publication rerun used immutable parent modules, file reads and directory enumeration,
with only the reviewed four-file overlay. Its source audit checked **7,588 observations across
2,019 unique repository files** (2,004 imported and 27 directly read), with no mismatch. Existing
`node_modules` supplied external dependencies. An existing invalid UTF-8 parent byte was preserved;
module validation accounted for Node's normal replacement decoding.

**Focused mounted suite: 5/5 pass.** It exercises full response text, real role/choice decrypt
frames and accessible names, normal and reduced motion, reopen/dispose, keyboard preview/commit,
and production gamepad polling/router focus/commit. This uses synthetic DOM geometry, not a browser.

**Unchanged-parent negative control: 4/5 fail as expected.** Reduced-motion compatibility already
works on the parent. The original immediate-response, focus-scroll and compact-style defects are
caught by the final tests.

**Broader aggregate: 87/89 pass, not a fully green result.** The two failures are in
`test/starter-workday.test.mjs`: “real payload index + identity stamp + physical role owner preserve
one Continue carrier” and “actual durable capture/normalize/restore preserves moved damaged buoy
and rejects corrupt markers”. Both source-regex helpers fail with the same null-match error on the
unchanged parent (**11/13** there). Their expected helper declarations are no longer directly in
`src/systems/missions.js`. Neither the tests nor that owner were changed or hidden by this increment.

JavaScript syntax and exact-delta whitespace checks pass. The earlier independent exact-parent
verification also passed player-facing labels, UI accessibility, panel-composited contrast,
UI identity, 55 screen imports, scoped type floor and expanded CSS parsing. The earlier UI budget
check failed `baseline:stale`; existing flight-node and legacy-map debts remain. No performance pass
is claimed.

Run on this integrated revision:

```sh
node --test test/bar-dialogue-readability.test.mjs
node --test test/bar-authored-role-labels.test.mjs test/bar-dialogue-readability.test.mjs test/bar-faction-greetings.test.mjs test/bar-probe-lifecycle.test.mjs test/borrowed-sun-bar-context.test.mjs test/ceres-shipbreak-consequence.test.mjs test/eris-choir-bar-outcomes.test.mjs test/inf-bar-regular.test.mjs test/inf-bar-war-front.test.mjs test/kurtz-bar-desk.test.mjs test/starter-workday.test.mjs test/world-48-ace-bar-talk.test.mjs
```

## Remaining acceptance limits

No browser was launched or retried under the existing socket restriction. The eight-context
`test/bar-dialogue-compact-layout.test.mjs` is syntax-checked but **not run**. It requires this
integrated checkout or an explicitly pinned HTTP source overlay with the matching bench fixture.
A Node import loader does not pin files served to a browser.

Actual phone/desktop wrapping, choice and last-glyph reachability, occlusion, trusted browser input,
audiovisual/performance results, and the uninterrupted earned story journey remain unverified.
Predecessor captures do not establish acceptance of these bytes. Remote CI must be checked for the
published commit; local checks are not a CI pass. No merge or deployment is part of this increment.

## Frozen source/test SHA-256

- `src/ui/orrery/stationStandard.js`: `8ba43fd04921f342c843fd8b72a14fc9aafd91d4cefde21c920e2ac3737fcfa4`
- `src/ui/station/screens/bar.js`: `d485d16bb1f7677edb2098d4bfdef050e1b3f6386a9c83c11f16d8d8127d2010`
- `test/bar-dialogue-readability.test.mjs`: `051e2373be1ea7b5caec3c503bb508ae909954dbf4f2d80a3a62f6c1066286e6`
- `test/bar-dialogue-compact-layout.test.mjs`: `32db6cd70b9de5dd8d76dbb3575ac327cb9e0add5ac72ed19006d1fcb6598799`
