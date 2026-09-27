<!-- LIFETIME: RECEIPT -->
# PQ-049.05 report — Massline express-liner on its natural route

**Session:** devin-pq049-accept, 2026-09-27. **Candidate:** clean detached worktree at
`7a3f6af04` (accepted HEAD; only a stale-test repair differs from `9444c5d`/`6a024aeb6`
evidence runs — zero liner-path code delta between them).

## The live route, observed

A real game server + real route (`?debug=flight`, no harness staging) was driven in a
clean worktree. The simulation's natural express spawn is on the route:

- Entity **328 — "CINDER-RUN"**: `defId: ship_mule`, `trafficRole: express`,
  `itinerary.kind: express_hitch_route`, route
  `express:sector_helios_prime:station_customs>station_beltout`,
  service label **"Express Hitch Line"**, `departureSlotS: 90`, `hitchable: true`,
  transit intent `v3_boost` (~247 WU/s sector-hopper — it had to be followed, not
  teleported to once).
- Approached to presentation range and admitted **`authored`** in **`release`** mode.
- Resolved part URL on the live entity:
  `assets/ships/release/parts/wholeships/massline_express_liner_v1.glb` — release root,
  no source path, **zero Mule URLs** anywhere on the entity.
- Loader diagnostics: runtime decoders green (gltf/ktx2/draco/meshopt), the liner URL
  carries no failure record, and no presented hull sat in a failed state (7 presented,
  0 bad).
- Passenger truth: the entity rides its `express_hitch_route` itinerary with no
  invented freight manifest (`cargoManifest` absent/active-freight-free).

Artifact: `design/program/roadmap/evidence/h1/pq049-massline-express-liner/`
(`livecheck-liner-report.json` step trail + `livecheck-liner.mjs` the probe that
produced it — self-contained: real server, CDP, durable itinerary-identity follow).

## Declared checks

| Check | Result |
|---|---|
| `npm run check:traffic` | **green, 9/9 sections** — incl. save/continue persisting the named express (`CINDER-RUN`) 13→13 and determinism across runs |
| `npm run check:massline2:live` | **red at clean HEAD** — acceptance probe assert `holding F must shorten the real joint (104.2551… → 104.2551…)`, seed 47017, broker fingerprint `357c4fe4…` (cached-unchanged-failure). The reel-hold/joint physics failing here is a landed tether-surface regression outside this unit's blast radius — logged as **D76** in `DEMO_READINESS_2026-09-20.md` §6 alongside three `pq146-tether-physics` reds at HEAD |
| `node --test test/pq048-passenger-liner-service.test.mjs test/massline-express-liner-runtime.test.mjs` | **7/7 green** — passenger custody, receipt, suspension, and express→Massline resolution contracts |
| `npm run check:baseline` | **16/16 green** in 60.3 s (budget 90 s) in the clean worktree |

Supplemental Electron observation (not a declared check): `npm run check:electron:new-game`
launched the real **Electron 43.2.0** shell, reached `flight` mode at tick 7 — and the
express entity **id 328 `ship_mule` was `presentationAdmission: ready`,
`authoredAssetState: authored`, `authoredAssetMode: release`** inside Electron, the same
entity identity as the browser run. The check itself exited red because its gate samples
before progressive admission finishes on this starved host (13 sibling hulls still
`pending` at tick 7 — the same early-sample class as D36/D67, not a liner defect;
`.devshots/electron-new-game-launch.json` in the worktree).

## Coverage notes (honest scope)

Verified live in Browser: natural spawn, label, sector route, service label, dock/station
endpoints in the itinerary, boost transit intent, `hitchable` flag and
`SOCKET_Tether_Massline` on the body, authored release admission, no freight manifest,
save/continue itinerary persistence via `check:traffic` (named express survives).
Verified in Electron: the same express entity admitted authored/release on the real shell.

Not exercised this session: physically latching the player tether to the moving liner
end-to-end (`massline2:live`'s own reel assertion is currently D76-red on unrelated
tether code), the dense-pocket vs tether-close equal-quality frame comparison, and
independent exact-hash G7/G1/G2/G4 review sign-offs — those remain the parent packet's
open acceptance burden.
