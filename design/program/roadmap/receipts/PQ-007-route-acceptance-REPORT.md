<!-- LIFETIME: EVIDENCE -->
# PQ-007 corrected control-route acceptance report

```yaml
packet: PQ-007
dispatchUnit: PQ-007.route-acceptance
lifecycleClaim: route_accepted
acceptanceClaim: route_accepted
disposition: PASS
candidateCommit: c1b190e2ba691813a95bbcfe393668780e51f9f6
fixedSeed: 47
browserClaimId: 39064-f9cc9613d2da4a85c2c32bb4
browserCandidateDigest: e963df95fef008fb87d7085aeffa480f0c4a04817b67d2705163691c9c200387
electronClaimId: 34980-d332545e4f7849956ff1d4a6
electronCandidateDigest: 4934c331fd0b7417ff8e1bc7d16cbe739ad1c04d2d51837e74c0a9e508275486
performanceEvidenceClaimed: false
physicalControllerClaimed: false
```

## Verdict

PASS in Browser and Electron on distinct one-use broker claims. Both hosts exercised the same
public actor route at the same seed without product-state mutation, owner invocation, or synthetic
DOM input.

## Player-route evidence

Each host proved:

- visible fixed-seed New Game and controllable flight;
- trusted `W`/`A` axes reached the live input owner and moved/turned the player hull;
- the visible Hunter Yard Perimeter Writ produced the authored hostile Rook Nine;
- `G` itself selected that useful hostile without Tab or a contact click;
- weapon lead stayed bound to Rook Nine while native relative pointer motion owned flight intent;
- the HUD visibly showed Rook Nine and `AUTO-TGT`;
- the dashed draw-to-fly route and endpoint were visible;
- pausing the pointer gesture ended drawing while retaining route traversal;
- an opposite native gesture extended the route and reversed granular intent;
- the second `G` released pointer lock, disabled auto-target, cleared route authority, and returned
  neutral commands;
- ordinary keyboard control resumed;
- `actions.autopursuit` remained false, flight-frame autopursuit remained null, and no pursuit DOM
  or visible pursuit copy appeared.

The Browser report recorded the first hull movement from `(0,0)` to
`(16.925,-13.711)` after the trusted keyboard cell. Electron recorded `(0,0)` to
`(28.202,-25.706)`. Both host screenshots visibly show Rook Nine, `AUTO-TGT`, and the routed
flight line.

## Broker and artifact evidence

- Candidate source commit: `c1b190e2ba691813a95bbcfe393668780e51f9f6`.
- Browser claim consumed once at candidate digest
  `e963df95fef008fb87d7085aeffa480f0c4a04817b67d2705163691c9c200387`.
- Electron claim consumed once at candidate digest
  `4934c331fd0b7417ff8e1bc7d16cbe739ad1c04d2d51837e74c0a9e508275486`.
- Browser route report:
  `.devshots/pq007-control-route/browser/route-report.json`.
- Electron route report:
  `.devshots/pq007-control-route/electron/route-report.json`.
- Browser/ Electron still:
  `.devshots/pq007-control-route/{browser,electron}/01-draw-to-fly-route.png`.
- Both broker launch quotas are exactly one for their distinct candidate digests.

## Focused checks

- `npm run check:baseline` — PASS before the two headed cells.
- `node --test test/pq007-control-route-manifest.test.mjs` — PASS, 5/5.
- Related prompt/pursuit/input suite — PASS, 43/43.
- `node scripts/probe-auto-target-steering.mjs` — PASS in fixture mode.
- `node scripts/probe-dod-flight-acceptance.mjs` — PASS, 3/3 fixture scenarios.
- `node scripts/check-auto-target-registry.mjs` — PASS.
- `node scripts/check-massline-auto-target.mjs` — PASS.

## Honest scope

This is keyboard/pointer functional route acceptance, not a performance, GPU, physical-controller,
art-quality, or broad accessibility verdict. No physical controller was present or claimed. The
independent Electron result proves native-host parity for the exact keyboard/pointer semantics
owned by this dispatch unit.
