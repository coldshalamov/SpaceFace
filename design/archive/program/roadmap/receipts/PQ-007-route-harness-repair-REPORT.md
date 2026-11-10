<!-- LIFETIME: EVIDENCE -->
# PQ-007 Browser/Electron route-harness repair report

```yaml
packet: PQ-007
dispatchUnit: PQ-007.route-harness-repair
lifecycleClaim: focused_green
acceptanceClaim: unproven
disposition: PASS
headedBrowserLaunched: false
headedElectronLaunched: false
browserManifest: pq007-control-browser
electronManifest: pq007-control-electron
```

## Missing authority characterized

The two scripts named by the original acceptance unit were seconds-scale fixtures only. They did
not boot the public game, consume a broker claim, drive native input, launch Electron, or emit
runtime evidence. Replacing them wholesale with a historical probe would have reintroduced direct
state mutation, synthesized input events, and manual owner ticks.

## Harness delivered

Both fixture modes remain the default direct invocation. Explicit acceptance mode now belongs to
separate fixed-seed, one-use broker manifests for Browser and Electron. They share one public actor
route:

1. canonical root and visible seeded New Game;
2. trusted `W`/`A` movement and hull-response proof;
3. visible Hunter Yard Perimeter Writ acceptance;
4. visible Rook Nine map tracking and contact observation;
5. `G` itself acquiring the useful hostile, with no Tab or contact click;
6. native Playwright relative mouse motion drawing the flight path;
7. sim-time clutch/release, retained traversal, and an opposite gesture extending/reversing intent;
8. visible `AUTO-TGT`, target name, toast, route, and endpoint;
9. second `G` clearing path authority and ordinary keyboard input resuming;
10. explicit absence of pursuit action, flight-frame pursuit, pursuit DOM, or visible pursuit copy.

The actor route reads state to assert outcomes but never assigns product state, dispatches a
synthetic DOM event, inserts entities, or calls a product owner.

## Focused evidence

- `node --test test/pq007-control-route-manifest.test.mjs` — PASS, 5/5.
- `node scripts/probe-auto-target-steering.mjs` — PASS in retained fixture mode.
- `node scripts/probe-dod-flight-acceptance.mjs` — PASS, retained 3/3 kernel fixture.
- `node scripts/check-auto-target-registry.mjs` — PASS.
- `node scripts/check-massline-auto-target.mjs` — PASS.
- `node --check` on both probes, manifests, and broker CLI — PASS.
- Every declared manifest source path exists.
- Path-scoped `git diff --check` — PASS.

## Honest residual

This unit did not consume either runtime claim. It proves no public-route outcome, pixels, native
pointer-lock behavior, Electron parity, GPU facts, performance, physical controller semantics, or
acceptance artifact. Those are owned by the now-unblocked exact `PQ-007.route-acceptance` unit.
