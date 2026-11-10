# H1 row 5 — PQ-020 Ceres functional route

**Overall result: PASS — Browser/Electron functional pair accepted.**

The registered fixed-seed route passed once in headed Chromium, then passed through the distinct
source-Electron wrapper on the same pushed candidate. Both runtimes produced all 21 declared frames,
reported real Intel ANGLE/D3D11, recorded zero page/request issues, and agreed on normalized gameplay
facts. Electron also closed its owned runtime and profile cleanly.

```text
candidate commit: 04514d0bfe3c1b1a7ea9b85a02905418ad675033
manifest: pq020-ceres-topology
fixed seed: 47
Browser claim: 26052-3223fa474a1b497e1638943b
candidate digest: c864caec77a6ba911efab9c2dbae1ae3f11bf2a2bbb1bc7fde993830a49f7f46
Browser receipt SHA-256: 70687669c36a30233c0c3afd27b27be376a2bd355d00da49d0fab6ee86c29ef1
Electron receipt SHA-256: ae10134fa9905117667a5e8466e12504be41fec1f510692ce71bdadb2e4feca0
```

## Accepted functional route

- Public Star Chart selection and the production jump FSM carried the player from Helios Prime into
  Ceres. The arrival was closest to the Helios return gate (`429.564 WU` versus `1573.512 WU` to the
  Tethys gate).
- Public map selection plus natural production autopilot reached Ceres Refinery, Belt Outpost,
  Throughline Weigh Beacon, and Wreck Cathedral. All four arrivals terminated successfully with the
  player alive at `140` hull.
- The Cathedral admitted its exact authored identity and all seven components. The actor reached it
  naturally, then used the shipped `+`/`-` camera controls for declared far/default/close zooms
  `112/72/64`; every framing kept the site in frame.
- F5, canonical cold reload, and the visible Continue control restored Ceres at seed `47`, exactly
  one beacon entity and fifteen Cathedral entities. Pose delta was `0.149 WU` in Browser and
  `0.198 WU` in Electron.
- Repeated post-Continue beacon and Cathedral selection succeeded.
- The route then travelled Ceres → Tethys → Ceres. The return arrival was closest to the Tethys gate
  (`430.001 WU` versus `2327.817 WU` to the Helios gate), proving the opposite endpoint direction.

## Accessibility and semantics

The actor used both keyboard and pointer map selection. The map remained a named dialog with a named
search control; its focused action exposed `Track Target` or `Set Course & Jump` as appropriate, and
the inspector carried identity and route meaning in text rather than color alone. This is functional
keyboard/pointer reachability, not a claim that a physical controller was attached.

## Review frames

- Maps and pocket arrivals: `03`–`09`.
- Cathedral far/default/close/arrival: `10`–`13`.
- Save/Continue restoration and repeated selections: `14`–`18`.
- Opposite endpoint direction: `19`–`21`.
- The `electron/` directory contains the matching 21-frame source-Electron sequence.

The older `failure-row5.png` and `latest-acceptance-failure.json` remain only as historical defect
diagnostics. They are superseded by this green candidate and do not classify current H1 evidence.

## Harness repair boundary

The accepted pair follows the proven fix for the final Electron false negative. The shared actor used
to navigate to `rootUrl` after Electron's canonical first window had already loaded that same URL,
aborting the first document's lazy imports. Browser still performs its required initial navigation;
Electron now asserts the first-window URL and continues without a duplicate navigation. A bounded
native regression pins exactly two canonical document requests: first window plus the deliberate
cold reload. No accepted route claim relies on a broad ignored-error window.

## NOT performance or H2 evidence

The route receipts intentionally set `noPerformanceEvidence: true`. Broker process duration and any
incidental timing payload are not representative measurements. Pocket visual distinctness,
Cathedral artistic presence, and matched H3 performance remain separate decisions.

## Machine-readable files

- `browser-claim.json` — consumed one-use Browser claim and candidate binding;
- `route-receipt.json` — accepted Browser facts;
- `electron/route-receipt.json` — accepted Electron facts, semantic parity, and owned teardown;
- `fast-gate.json` — candidate/route/regression digest binding;
- `launch-counts.json` — candidate-scoped one-use history;
- `latest-run-result.json` — successful owned Browser process result;
- `classification.json` — current H1 disposition and historical-artifact boundary;
- `broker-run.log` — compact terminal result for the accepted pair.
