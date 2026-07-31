<!-- LIFETIME: EVIDENCE -->
# PQ-024 survey-to-relay route-harness report

```yaml
packet: PQ-024
dispatchUnit: PQ-024.survey-route-harness
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
performanceEvidenceClaimed: false
brokerManifest: pq024-asteroid-claim
```

## Missing authority characterized

PQ-024's deterministic implementation and receipt were integrated, but no dedicated default-route
cell existed. Therefore the outstanding Browser/Electron, accessibility, visual, save/reentry, and
performance claims could not be spent through the validation broker.

## Harness delivered

The fixed-seed, one-use Browser manifest `pq024-asteroid-claim` is registered and binds a public
actor route:

1. visible New Game with seed `24024`;
2. Star Map waypoint, ordinary Helios docking, Market search/quantity/buy, and public undock;
3. Local Map asteroid selection and owner autopilot arrival;
4. Massline and `B` into Asteroid Ops;
5. visible Survey pulse/reveal;
6. palette and cursor placement of Massline Core and extractor through Enter;
7. owner-emitted positive `site:producing` receipt;
8. exactly one live `place_claim_outpost_relay`;
9. `F5`, cold reload, visible Continue, restored receipt/relay, and public Asteroid Ops reentry.

Page evaluation is limited to selecting rendered map/placement targets and observing live owner
state or receipts. It does not enter a sector, install machines, pulse survey, mint receipts, assign
cargo, set producing/survey/inventory/relay state, or call private owner mutation seams.

## Focused evidence

- `node --test test/pq024-asteroid-claim-manifest.test.mjs` — PASS, 3/3.
- `npm run check:pq024:survey-claim` — PASS, 21/21.
- `node --test test/asteroid-sites.test.mjs` — PASS, 15/15.
- `npm run check:sim:compare` — PASS, deterministic and `hashEqual`.
- `node --check` on the probe, manifest, and broker CLI — PASS.
- `node scripts/validation-broker-cli.mjs --help` lists `pq024-asteroid-claim`.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This unit built and registered the route but did not consume its Browser claim. It adds no Electron
cell and proves no pixels, pointer/controller behavior, accessibility, visual quality, GPU facts,
performance, save result, or live relay count. Those remain exact downstream capture/review/
performance units; the relay's existing human quality reservation also remains open.
