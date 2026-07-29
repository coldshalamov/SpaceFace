# H1 row 7 — PQ-022 corridor asset leaves

**Result: PASS.** The registered one-use Browser cell admitted eleven exact production identities from
release artifacts and committed thirteen game-renderer stills. It consumed exactly one Browser launch,
zero Electron launches, and no retry.

## Route and evidence boundary

Command:

```text
node scripts/validation-broker-cli.mjs --manifest pq022-corridor-asset-leaves
```

Broker facts:

- manifest: `pq022-corridor-asset-leaves`;
- fixed and recorded New Game seed: `47`;
- candidate digest: `22100055717522d0a493ffd048d25f326636f25fce4a7855a3e2edcae639b689`;
- one headed system-Browser launch; zero Electron launches;
- real WebGL path: `ANGLE (Intel, Intel(R) Graphics (0x00007D45) Direct3D11 vs_5_0 ps_5_0, D3D11)`;
- page issues: none;
- eleven unique exact identities and thirteen stills;
- every capture reports `presentationAdmission: "ready"`, `authoredAssetState: "authored"`,
  `authoredAssetMode: "release"`, `authoredReadableFallbackRetained: false`, at least one visible
  mesh, and a centered subject.

The route starts through the visible canonical New Game UI. It then compresses travel through the
registered `world.enterSector` owner for the station and lane-furniture groups. That is deliberate
**presentation evidence**, not proof that a player completed the inter-sector route. The relay is
placed by shipped `asteroidSites._ensureBeacon` on a live Helios asteroid.

For traffic, the harness deterministically selects courier, hauler, and miner roles, then leaves
`makeShipEntitySpec`, the traffic system's durable-identity and cargo-manifest owners,
`wholeShipVisualForEntity`, the production renderer, and authored admission in control. This proves
those exact role-to-whole-ship presentation paths. It does **not** claim that ambient traffic randomly
drew those roles or prove the ambient role distribution.

## Human-review stills

Relay collar — feeds H2 Decision 1:

- [close](01-relay-close.png)
- [default](02-relay-default.png)
- [far](03-relay-far.png)

The authored cylinders, rings, box body, and gear-like collar are visible at close/default framing and
remain identifiable at far framing. The earlier receipt's visual reservation still applies: the relay
reads as a generic grey primitive assembly with a cyan accent. H1 does not convert that observation
into an acceptance verdict; H2 must answer **accept versus re-author**.

Corridor stations:

- [trade hub](04-station-trade-hub.png)
- [military station](05-station-military.png)
- [refinery](06-station-refinery.png)
- [mining station](07-station-mining.png)

Lane furniture:

- [jump ring](08-gate-jump-ring.png)
- [station billboard](09-station-billboard.png)
- [nav buoy](10-nav-buoy.png)

Traffic whole-ships:

- [Helios Lark — courier](11-helios-lark-courier.png)
- [Helios Span — hauler](12-helios-span-hauler.png)
- [Helios Cradle — miner](13-helios-cradle-miner.png)

The three traffic targets are admitted, visible, and centered by the semantic checks, but these are not
isolated turntable portraits: the player's Kestrel remains prominent in the foreground. That framing
limitation is disclosed rather than hidden and was not retried.

## Exact manifest binding

`report.json` records the complete source/release paths, byte counts, capture hashes, runtime identity,
authored slots, material names, texture roles, composition ids, and admission state. The identity hashes
used by this attempt are:

| Identity | Source sha256 | Release sha256 |
|---|---|---|
| `place_claim_outpost_relay` | `a93c7b4d8fd23fa925fb99c025a544dacf13716e374261b8c487399c2196fda8` | `dc07ebef0ea61a45e778ecbb8a9ac4dfda4e71e4970433337e0ead084fffdcc2` |
| `place_station_trade_hub` | `94cb9dc727d606df2f7c32f2c0ffb274ee6a572a8fa7bd40836d721563d1a578` | `9540c8fa263359ff3b78302a9d48080af17cb903f47d43361814ba3666f0754a` |
| `place_station_refinery` | `93fce6a0401a3375cad4269cc59dbf1ad5ba3eafb822a4a6f6d464410d9093a9` | `52653b6b9fd0859c076bbd5912feb827a099c1f3220bfea99c4881281a5d5f57` |
| `place_station_military` | `fe2676f628c8a7382e6827883128d63c53407c9a828493cac8ccb65a9ed2491e` | `a92f5c2b53262defcbfea27b22ec07ce8d7798f856dbd8e3fc9b12475ea67806` |
| `place_station_mining` | `82be5e687143b333adb2ea11659bebf2eb2112edcdd575c06c225d3318a95bfe` | `b14c82ec6add74c525def05ca57e081805f3f4a09f8773ab662847ad41314b3a` |
| `place_gate_jump_ring` | `fcf7b6b6693a081a7ddb2d0b36479263cc7f2f01b77df4ee1569f037944668ec` | `01ccf2695678cb42c5b086308b7bea6dc366b029b4efc9e12393a10e8b209ead` |
| `place_station_billboard` | `557d5065d0435e3dc8128b4623135addf0b372d282ecb9f331e6a289b0d9ff7a` | `598b130176e2e1b4b0bf89ec57cec7993e411ca548b28ac858dd04473f2c3098` |
| `place_nav_buoy` | `f1599e2f5ff47aca1bff2ff311f111bee9ce3ae076123b36eb71e32343ab7b4d` | `c227ec86343f3105d312c4127daf4e2516ca45ac4a26e7fb27368ae308a02c20` |
| `wholeship_helios_lark` | `9090e7c21980d0d87d1da422bdb940a7731ceb3b39f4648adc0968df931b708f` | `5dfb6c2a2baaa4c8e92758f4e969d262ee668cbf22e5de73020df659e782a473` |
| `wholeship_helios_span` | `c4ceaa020861cdd1bc9f7e20172bbc6f00531290aa3753e4757dc6b89b47f2ab` | `5fb2a62c79d3bc07777c5bf5ff9d2e26554e2bf3bfca051ba470d28adb6ed1b5` |
| `wholeship_helios_cradle` | `1f10de2d7f2ae083fdac768c735f1e444616ccc59bb19088cc8418f63e88dd72` | `6f400dfd7caf7e18df1b0cb951e77ec2c8773a4cd8321243e4c259c840c778de` |

For `place_nav_buoy` and `place_station_billboard`, the standing PQ-022 gate still reports the known,
allowlisted stale source-byte metadata in `parts_manifest.json`. The source hashes above come from the
release-manifest rows and match the live source bytes. This PASS therefore does not claim that every
duplicated parts-manifest byte field is synchronized. No second runtime asset registry was introduced.

## Deterministic pre-claim gates

All gates passed before the broker issued the one-use claim:

- `npm run check:pq022:corridor-assets` — PASS; nine named allowlisted corpus gaps, none stale;
- `npm run check:pq022:relay-collar` — 9/9 pass;
- corridor asset-set plus H1 manifest tests — 25/25 pass;
- `npm run check:sim:compare` — `ok: true`, `deterministic: true`, `hashEqual: true`, no divergence.

The nine allowlisted gaps are the two Wasp release-row gaps, four Kestrel/Wasp source-row gaps, and
three place source-byte mismatches (`place_lane_beacon`, `place_nav_buoy`,
`place_station_billboard`). They remain corpus bookkeeping, not hidden by this presentation PASS.

## NOT performance evidence

`report.json`, `fast-gate.json`, `launch-counts.json`, and `latest-run-result.json` are stamped
`"informational_contended": true` and `"noPerformanceEvidence": true`. Their timestamps and process
duration are broker controls/diagnostics only. H1 did not collect a renderer/per-frame timing sample,
p95/p99, hitch numbers, or matched before/after data. Matched performance remains Phase H3.

## Machine-readable files

- `report.json` — exact identities, source/release hashes, admission facts, and per-still records;
- `classification.json` — PASS boundary, launch count, digest binding, and claim limits;
- `fast-gate.json` — pre-claim digests; time metadata marked informational;
- `launch-counts.json` — one-use candidate count; timestamp marked informational;
- `latest-run-result.json` — broker process record; timing marked informational;
- `broker-run.log` — the recorded broker result; no rerun was performed for publication.
