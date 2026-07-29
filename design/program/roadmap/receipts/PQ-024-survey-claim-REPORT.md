<!-- PROGRAM_EVIDENCE_RECEIPT
packetId: PQ-024
leafId: PQ-024.survey-claim
acceptance: focused_green
disposition: PASS
candidateCommit: 46c2aae3da190566de1db159ec2942dba47c7840
-->

# PQ-024 leaf — corridor-minimal Asteroid Ops survey and claim consequence

```yaml
parent: PQ-024
leafId: PQ-024.survey-claim
assetIds: [place_claim_outpost_relay]
playerRoute: canonical player route -> massline tether -> Asteroid Ops ('drill' screen) -> pulse survey -> install Massline Core -> produce -> flight-world relay
sourceOwner:
  - src/systems/siteSurvey.js            (new — pure formation selector/reveal/validate/normalize)
  - src/systems/asteroidSites.js         (claim survey session, Core adoption, receipt seam, beacon gating)
  - src/ui/asteroid/inspector.js         (survey sentences, tile membership, stale-placement copy)
  - src/ui/asteroid/asteroidScreen.js    (assay chip, claim chip, one-voice cues, inspector pass-through)
runtimeOwner:
  - src/systems/asteroidSites.js         (state.sites.byId durable record; transient _surveyByAsteroid)
tests:
  - test/pq024-survey-claim.test.mjs     (new — 21 focused tests; standing gate check:pq024:survey-claim)
  - test/asteroid-sites.test.mjs         (one assertion moved: relay at anchor -> relay at producing)
baseCommit: c13ac17d
candidateCommit: 46c2aae3da190566de1db159ec2942dba47c7840
lifecycleClaim: implemented
acceptanceClaim: focused_green
disposition: PASS
assetMutations: none
saveSchemaMutations: none
```

`candidateCommit` (`46c2aae3`) is the parent of the commit carrying this receipt: it is the commit
that contains every artifact the claims below rest on. The receipt commit adds only the packet
checkoffs, the queue `partialIntegration` entry, and this file. A receipt cannot name the sha of
the commit that contains it, so the two are deliberately distinct (same convention as PQ-022).

## Dependency waiver (recorded verbatim)

> PQ-024's evidence dependency on PQ-022.exterior-relay-collar at route_accepted is
> integrator-waived for IMPLEMENTATION START: the relay is structurally accepted at focused_green
> (receipt design/program/roadmap/receipts/PQ-022-exterior-relay-collar-REPORT.md — identity,
> manifest binding, admission, envelope, LOD, cleanup all proven; only the human visual verdict +
> headed rows are pending). Your projection binds the ASSET IDENTITY, which the repo's remaster
> rules preserve even if the relay is later re-authored, so a re-author verdict cannot invalidate
> your work. Final packet acceptance still waits for the formal binding.

This leaf binds only the asset identity (`placeId: 'place_claim_outpost_relay'`, pinned by test);
it re-authors nothing and mutates no asset. Final visual acceptance remains open under PQ-034.

## 1. Symbol rebind (packet roles → live symbols)

The packet predates PQ-017 integration; live code won. Deltas from the packet's role names:

| Packet role | Live symbol bound | Delta note |
|---|---|---|
| Drill/Survey session (transient field seed, target candidate, target cells, revealed cells) | `asteroidSites._surveyByAsteroid` (transient map, never serialized), driven by `drill:scanPulse` / `drill:end` from `drill.pulseScan()` (`src/systems/drill.js`: SCAN_RADIUS 5, 6 s cooldown; sessions intentionally transient, `serialize() -> null`) | The packet's "session" is the live drill session boundary; the transient record is owned by the site system, not written into `state.drill`. `tile.surveyed` marks stay vanilla |
| World Site owner (atomic Core commitment, durable survey, lifecycle, accepted production receipt, save/Continue) | `asteroidSites` site records: `state.sites.byId[siteId].survey` (PQ-017's integrated persistence owner — "asteroidSites persistence ownership", PQ-017 receipt) | The PQ-017 kernel (`worldSiteKernel.js` + authored `WORLD_SITE_MANIFESTS`) is manifest-driven; a player claim cannot become an authored manifest, and `_ensureWorldSiteRecords` rebuilds `worldById` strictly from manifests. Binding to the anchored-site record is the live-owner reading: same system, same save path, no parallel truth. `worldSiteKernel.js:243` operation-reachability untouched and green |
| Production owner (actual inventory/output mutation + unique positive-output receipt) | `asteroidSites._tickSite` mutation arms — extractor whole-unit grant, refinery `stepContinuousRecipe().produced`, fabricator `res.completed` — reporting through `_emitProductionReceipt` → `_acceptProductionReceipt` | Production owner and site owner are the same live system; the role seam is kept as two explicit methods with validation between them |
| Exterior projection | `asteroidSites._ensureBeacon` (`placeId 'place_claim_outpost_relay'`, PQ-022 accepted identity) | **Trigger moved**: was Core-install (`_anchorSite` + every `_repairAnchors` sweep); now the producing transition + producing-gated sweep (packet's cold 0 / committed 0 / producing 1). `_ensureBeacon` itself is byte-identical — PQ-022's 9/9 admission suite untouched and green |
| Asteroid Ops UI | `src/ui/asteroid/inspector.js` (`surveySentences`, `formationLabel`, `showSite`, `showTile`, `placementReason`) + `asteroidScreen.js` (assay chip, claim chip, ledger/announcer, controller/pointer verbs) | No new HUD system; existing scan verb (`controlMap.scan`), palette install verb, and announce/tape surfaces reused. No renderer3d or CSS changes |
| Pure interior-formation helper | `src/systems/siteSurvey.js` (new; same shape as `siteProduction.js`/`siteLogistics.js`) | Packet-sanctioned: "current drill/session or a pure interior-formation helper" |

## 2. What landed, per outcome row

Commits: `280707a9` (system core), `ca604cbe` (UI + focused suite + standing gate),
`7e7d0b41` (user-directed pq017 stale-string repair), `46c2aae3` (NOW lease).

1. **Symbol rebind** — §1; recorded deltas. (entry checkbox 1-2)
2. **One deterministic same-material connected interior formation** — `selectSurveyTarget` over the
   live field: valid cells = solid interior (rows ≥ 3), 4-connected same-material components
   (`matrix` / `basalt` / `gas` / `vein:<oreId>`), declared band [3..48] cells, score =
   (class rank vein>gas>basalt>matrix, size desc, stable cell key). Total by a declared fallback
   ladder (smallest ≥ minArea, else largest). Probed across 8 real seeds (42/47/1/7/99/1234/
   55555/80808): every field yields 62-76 in-band components; the pick is always a discrete
   3-4-cell vein cluster. No RNG, wall time, camera, or iteration order anywhere in selection.
3. **Progressive reveal through the existing Survey mechanism; pre-Core state explicitly
   VOLATILE** — only effective `drill:scanPulse` events advance (the verb's cooldown gate already
   suppresses ineffective pulses; no event, no advance). First pulse freezes
   `{ targetId, seed, cells, revealed }` from the session's exact field; each later pulse reveals
   a bounded frontier subset (`revealBudget: 2`, ascending adjacency from the revealed set). The
   transient dies on `drill:end`, `save:restoring`, `newGame`/`deserialize`, site loss, and
   adoption — and is never serialized (`!serialize().includes('frm_')` asserted).
4. **Atomic adoption at Core installation** — `_anchorSite` calls `_commitClaimSurvey` inside the
   same transaction: exact adoption of the frozen target/reveal when a valid assay exists
   (byte-exact `cells`/`revealedCells`), or byte-identical deterministic reconstruction from the
   field the Core just froze when no assay exists. `canInstall` preflights adoption and refuses
   visibly with `survey-stale` when the assayed formation was drilled into — no reroll, no
   partial commit, no materials consumed. Re-commit is idempotent; second Core stays `unique`.
5. **Durable survey record through the EXISTING save path** — the record rides
   `state.sites.byId[siteId].survey` (anchored-only serialization, `_normalize` hardening via
   `normalizeSurveyRecord`/`normalizeProductionReceipt`). NO new top-level save key, NO schema
   bump: `check:save-schema` is byte-stable at **v12 / 274 paths** (the schema fixture's
   `sites.byId` is `{}`, so record-internal fields do not move the path count — verified by gate,
   not assumption). The blocked-slice condition did not trigger.
6. **cold → committed** — commitment lands `lifecycle: 'committed'` with `receipt: null`;
   `surveyStatusFor` serves `volatile: false` from then on.
7. **committed → producing ONLY on real positive output + authoritative receipt** — the three
   `_tickSite` mutation arms report landed whole units (extractor store grant, refinery
   `produced`, fabricator completion incl. pods). `_emitProductionReceipt` refuses the Core,
   non-positive amounts, unanchored sites, and post-producing replays. `_acceptProductionReceipt`
   validates site binding, positivity, tick sanity, and authentic non-Core producer before
   monotonically recording `producing` with one stable receipt
   (`receiptId: prod_<site>_<tick>_<machine>`, `sourceMutationId: tick:<tick>:<machine>:<good>`).
   Replays of the accepted receipt are idempotent no-ops; forgery classes (null, wrong site,
   zero quantity, future tick, unknown/Core/mismatched producer) are rejected with reasons.
   No self-minted capability claims exist anywhere in the path.
8. **Exactly one exterior relay from producing** — `_acceptProductionReceipt` is the ONLY
   projector (with `_repairAnchors` re-ensuring for producing sites on sector re-entry);
   `placeId 'place_claim_outpost_relay'` pinned by test (PQ-022 identity binding).
   cold = 0, committed = 0 (even after Continue), producing = 1, re-entry idempotent, despawn
   re-ensures once. Pre-PQ-024 anchored saves (no survey record) reconstruct the record
   byte-identically from the frozen bore seed at their first real output and converge to
   producing — no migration, no schema touch.
9. **States in the EXISTING Asteroid Ops UI** — assay chip beside the Pulse survey verb
   (`Assay n/m` volatile in the same risk voice as UNANCHORED; `Assay N cells` once durable),
   claim chip gains `Producing`, inspector `showSite` speaks identity/progress, the explicit
   volatility warning, the committed record, and the producing receipt; hovered formation cells
   speak membership; detection/completion/commitment/producing announce through the screen's
   single aria-live announcer + ledger tape (one voice; no new HUD system, no floor pill, no
   CSS/renderer change). Keyboard (`controlMap.scan` + palette Enter) and pointer (scan button +
   build click) paths unchanged; no gamepad route exists in this controller (none added).
10. **Proof coverage** (`test/pq024-survey-claim.test.mjs`, 21 tests) — duplicate-claim,
    reload-mid-survey, invalid-adoption (survey-stale), missing-asset (spawn failure + recovery),
    partial-claim (unanchored loss leaves zero residue), save/cold-Continue/reentry identity
    (byte-identical record, boreSeed, exactly-one relay), forgery rejection, legacy convergence,
    UI copy, screen wiring, and run-twice determinism. `test/asteroid-sites.test.mjs` carries the
    one intended behavior-change assertion (no relay at anchor; committed survey recorded).
11. **Focused tests + one script** — `check:pq024:survey-claim` (one `package.json` line) =
    `node --test test/pq024-survey-claim.test.mjs`.

## 3. Gate results (candidate `46c2aae3`, LF-normalized worktree)

| Gate | Result |
|---|---|
| `npm run check:pq024:survey-claim` (new standing gate) | **21/21 pass** |
| `node --test test/asteroid-sites.test.mjs` | **15/15 pass** |
| `npm run check:sim:compare` | `ok: true`, `hashEqual: true`, `firstDivergentTick: null` (systems inert in the golden 47a scenario; also green at base before implementation) |
| `npm run check:save-schema` | **OK — version 12, 274 paths** (byte-stable vs base) |
| `npm run check:asset-reachability` | OK — 53/53 |
| `npm run check:npc-jobs` | pass (exit 0) |
| `npm run check:baseline` | **10/10 green in 70.154 s wall (budget 90 s, headroom 19.8 s)** — no wall-budget exceedance |
| `npm run check:pq017:world-site:fast` | **109/109 pass**, `PASS: no-unresolved-primary-failure` (after the repair in §4) |
| `npm run check:pq022:relay-collar` | pass (exit 0) — the accepted relay substrate is untouched |
| `npm run check:player-facing-labels` | OK |
| `npm run check:src-reachability` | PASS (siteSurvey.js reachable; no new orphans) |

Not run, deliberately: `check:economy:anti-exploit`, `check:mission-cargo-loading`,
`check:mission-log-map:runtime`, `check:art` (declared inherited reds — out of scope by
instruction); any validation-broker, Electron, Browser-GPU, or performance capture (PQ-034 lease).
No performance claim is made anywhere in this leaf.

## 4. Out-of-packet repair (user-directed)

`test/world-site-public-route-contract.test.mjs` asserted `check:pq017:world-site:{browser,electron}`
invoke `scripts/probe-pq017-world-site(-electron).mjs --acceptance` directly. The PQ-019C wiring
change (`1f6f649e`) deliberately routes both through `scripts/pq017-authorize-probe.mjs` (the
claim-issuing probe-iteration guard from PQ-017's own prevention story); the test strings were
stale. A/B-proven red at base `c13ac17d` and at master `0f36f386` with an identical assertion —
an inherited red, precisely the script rename. Directed repair: update the two expected strings to
the authorized wiring (`7e7d0b41`). The pq017 suite was otherwise green (108/109); the
`worldSiteKernel.js:243` operation-reachability invariant stayed green throughout and was never
relaxed. One environment finding, recorded not chased: this repo's Windows worktrees materialize
CRLF while blobs are LF; one assertion in the same contract test extracts a function via an
`\n}\n\n` delimiter and fails only on CRLF checkouts. The PQ-024 worktree was LF-normalized
(worktree-scoped `core.autocrlf=false`); PRIMARY (LF) never saw the failure.

## 5. Stop-condition review

None triggered. The PQ-017 owner bound exact survey/lifecycle state through the existing
anchored-site save path (no parallel truth); the production seam exists and was used; the exterior
identity is PQ-022-accepted and loads with no fallback; Core adoption is atomic with a visible
stale refusal; target/reveal reconstruction is deterministic (test-pinned); traversal is bounded
(field-fixed 28×45, reveal budget 2/pulse, one capped record); no perf gate was passed by hiding
anything (none run).

## 6. Open rows

Blocked on the **PQ-034 lease** (performance-evidence / validation-broker / browser-gpu), same as
every corridor receipt:

- [ ] headed Browser/Electron route acceptance of the survey → commit → produce → relay chain,
      keyboard + pointer + applicable controller paths live at the game camera;
- [ ] independent human visual verdict for the relay's industrial-consequence read (PQ-022 §3's
      reservation is the input, not a substitute);
- [ ] matched before/after performance on identical route/settings/viewport/seed (baseline
      capture was an entry condition this leaf deliberately did not self-authorize);
- [ ] final packet acceptance: the PQ-022.exterior-relay-collar receipt blob binding into
      `PQ-024.evidenceDependencies` at `route_accepted` (see the verbatim waiver — implementation
      start was waived, final acceptance is not).

Handed to the integrator, not fixed here:

- [ ] The packet's own Browser/Electron + accessibility + visual review + matched-performance
      checkoff row remains unchecked by design (PQ-034), as does independent discovery/re-review.
- [ ] Inherited reds not chased (declared): `check:economy:anti-exploit`,
      `check:mission-cargo-loading`, `check:mission-log-map:runtime`, `check:art`.
- [ ] CRLF-fragile regex at `world-site-public-route-contract.test.mjs:240` (environment, §4).
