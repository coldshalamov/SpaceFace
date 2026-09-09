<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-022
leafId: PQ-022.corridor-assets-human-disposition
acceptance: focused_green
disposition: PASS
candidateCommit: ae2fb2bf7ddf585b6cccd9c791d599ae88cb3995
-->

# PQ-022 corridor-assets H2 visual disposition

```yaml
packet: PQ-022
dispatchUnit: PQ-022.corridor-assets-human-disposition
reviewMode: solo-integrator-self-review
candidateCommit: ae2fb2bf7ddf585b6cccd9c791d599ae88cb3995
reviewDisposition: PASS
assetDecisions:
  keep: 7
  revise: 3
  revert: 0
routeAcceptanceClaimed: false
performanceEvidenceClaimed: false
```

## Exact decisions

| Evidence subject | Exact asset | Decision | Review finding |
|---|---|---|---|
| station trade hub | `place_station_trade_hub` | **KEEP** | Broad, low industrial hub with a strong multi-axis docking/transfer silhouette. Its surface is dark, but the ordinary framing still reads as a large civilian logistics destination rather than another station archetype. |
| station military | `place_station_military` | **KEEP** | Tall armored bastion, recessed aperture, command crown, repeated military markings, and guarded service frame give it an immediate fortified role. |
| station refinery | `place_station_refinery` | **REVISE** | Four nearly identical drums sit on a long flat spine behind a featureless ochre wall. The image communicates primitive placement, not a connected refining process or serviceable industrial destination. |
| station mining | `place_station_mining` | **KEEP** | Asteroid-integrated asymmetric machinery, rock-gripping construction, booms, and bright extraction elements communicate a mining installation at the ordinary camera. |
| jump ring | `place_gate_jump_ring` | **KEEP** | The segmented navigable ring, service blocks, and luminous inner aperture are unmistakable and remain legible against the route background. |
| station billboard | `place_station_billboard` | **REVISE** | A grey horizontal beam with a tiny cyan cap has no dominant display or signal face. It does not read as a billboard even at this intentionally close framing. |
| navigation buoy | `place_nav_buoy` | **REVISE** | A plain post and base with a small purple cap provide insufficient navigation, power, service, or lane-authority identity. |
| Helios Lark courier | `helios_lark` | **KEEP** | Long, narrow, light-bodied silhouette with a small drive section reads as the fastest and lightest of the three traffic roles. |
| Helios Span hauler | `helios_span` | **KEEP** | Extended cargo spine and large cylindrical freight mass separate the hauler from the courier and miner. |
| Helios Cradle miner | `helios_cradle` | **KEEP** | Compact heavy body, deeper vertical mass, underslung working form, and asymmetric industrial silhouette distinguish the mining role. |

The Kestrel occupies the foreground of the three traffic stills but does not occlude the centered
traffic subjects; their role silhouettes remain sufficient to judge. No identity is accepted merely
because it loaded: Row 7's exact release admission and authored-root facts are retained as technical
evidence, while this receipt supplies the missing visual-quality decision.

## Repair routing

The three `REVISE` decisions create two bounded production lanes:

- `PQ-022.refinery-reauthor`: preserve the exact asset ID, routing, scale, anchors, collision and LOD
  contract while constructing a connected process story—feed/storage tanks, transfer spine,
  processing or thermal zone, service access, and an industrial silhouette that survives ordinary
  framing.
- `PQ-022.billboard-buoy-reauthor`: preserve both exact identities and their route envelopes while
  giving the billboard a dominant framed display/signal face and the buoy a legible lane-navigation
  head, power/service construction, and durable beacon signal.

Each production lane owns only its named artifacts, then gets a targeted H1 recapture and causal
review. The seven `KEEP` decisions are not recaptured. Matched performance remains a separate H3
claim after all revised candidates pass review.

## Evidence reviewed

- `evidence/h1/row7-pq022-asset-leaves/04-station-trade-hub.png` through
  `13-helios-cradle-miner.png`
- `evidence/h1/row7-pq022-asset-leaves/report.json`
- `evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md`
- `receipts/PQ-022-gold-corridor-required-assets-SCOPING.md`

No headed route was rerun and no asset was mutated by this review.
