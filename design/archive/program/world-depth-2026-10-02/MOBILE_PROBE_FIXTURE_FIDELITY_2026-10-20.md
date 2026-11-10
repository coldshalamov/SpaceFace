# Mobile probe fixture fidelity — 2026-10-20

Scope: SF-PUBLISH test harness repair only. D188 physical-device/mobile acceptance and all larger game goals remain open.

## Evidence and diagnosis

Public master: `a8a9500ab87e1bcff91c407e96f744a52202a134`.
The original test and production probe have no canonical-versus-a8 delta. Original focused run: 12/18, six failures. No production code is changed.

- All-menu and historical-error fixtures still wait 300000 ms, but Continue now supplies a specific non-advancing-simulation verdict. Assertions retain the five-minute duration and 150 samples, rather than reverting the stronger verdict.
- Playable-flight success lacked the required advancing clock. Its fixture now supplies observed tick 10 → 11. New adversarial cases reject frozen, missing, non-numeric and decreasing clocks; tick, simTime and legacy time advancement each exercise the actual OR contract.
- Capability helper extraction searched an obsolete comment. indexOf returned -1, so slice swallowed most of the executable script and VM Script rejected its top-level await. Extraction now guards ordered boundaries and ends at the next named declaration. The actual helper is compiled and executed synchronously, not wrapped in an async block that would run unrelated startup code.
- Continue's success receipt omitted isTrusted, although production correctly rejects missing/false trust. Success now explicitly supplies true; missing/false trust remain rejection cases.
- Renderer fixture used an obsolete noteRendererError signature and omitted activeRoute/actorStage/finalizeRendererHealth. It now executes the real renderer recording/finalization helpers and verifies failed health, process exit, count, route, stage, source and INVALID_OPERATION text without console emission.

No deadline, public input, CSP, CDP, renderer/runtime, mobile profile, draw detector or startup/playability production gate changed. No browser run or phone acceptance is claimed.

## Checks

Canonical focused: 20/20. Immutable public a8 plus test-only tree `76c5966b2dc0b7e85a03db79b83df4d2cedfb4c5`: 20/20.
Full runtime-maturity, same strict immutable loader/environment: a8 843/876 passed (33 failed); test-only proposal 851/878 passed (27 failed). Exactly the six named mobile startup failures disappeared, no failure names were added; two new cases account for the test-count increase. These are comparison results, NOT 33/27 diagnosed production or CI defects. The shared residual set includes loader-sensitive failures: esbuild cannot resolve virtual presentationRunner.js and promises-based reads bypass the sync-only source wrapper for release-soak scripts. Existing source-contract assertions also remain. No unrelated fixes were made.

A final fixture refinement gives trusted=true to the invalid-action/disabled/aria-disabled negative cases so they independently exercise each rejection branch. Canonical focus remains 20/20. The final public-tree focused run is recorded with the publication receipt; the full-suite comparison above used the preceding test-only tree, not the final documentation tree.

Root independently reviewed the production contracts and passed focused 20/20. Publication and exact remote SHA verification remain separate delivery steps. No merge or deployment is authorized here.

## Original focused failure output

Recorded before any fixture mutation. Repository-relative paths and trimmed printer whitespace are the only public excerpt normalization. The complete original stdout is retained in the recovery package with SHA-256 `cadd159b4421cde7592155916312e4693678e98f9efde6b02dfcc84dc50fb900`. Timing is diagnostic, not performance evidence.

```text
✖ a pending all-menu restore keeps the original five-minute bound (25.25993ms)
✔ a visible title beneath loading is pending; a witnessed return to menu fails (7.345074ms)
✖ playable flight and explicit startup failures retain their existing verdicts (4.836121ms)
✔ a new post-click save rejection fails promptly with the existing hidden feedback (2.156813ms)
✖ requested iPhone touch profile is reported against effective runtime capabilities (2.870815ms)
✔ bus-free public recovery text is retained in startup failure diagnostics (2.181483ms)
✖ historical save errors and unaccepted clicks cannot become a new Continue rejection (7.534456ms)
✔ public click receipt survives heartbeat eviction and is removed with observer cleanup (2.49934ms)
✔ Continue route makes a public empty-slot save and waits for its completion before reload (0.345084ms)
✔ save receipt uses the read-only stored envelope when the retail bus observer is unavailable (3.550693ms)
✔ Continue enabled wait reports a disabled-control timeout instead of renderer nonresponse (2.551976ms)
✔ reload menu wait records cinematic/hidden-screen observations through its unchanged deadline (5.183422ms)
✔ reload menu wait retains explicit unresponsive-read errors instead of reporting hidden UI (5.619492ms)
✔ menu diagnostic reader captures document, visibility, and witness-frame state (1.947167ms)
✔ a visible reload menu remains playable when the optional witness throws (2.121645ms)
✔ failure snapshot and screenshot errors remain in the report (1.461778ms)
✖ Continue requires a delivered enabled public click before waiting for flight (4.811514ms)
✖ observed invalid draws fail renderer health independently of console emission (2.15506ms)
ℹ tests 18
ℹ suites 0
ℹ pass 12
ℹ fail 6
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 888.555784

✖ failing tests:

test at test/mobile-probe-startup.test.mjs:24:1
✖ a pending all-menu restore keeps the original five-minute bound (25.25993ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /within five minutes/. Input:

  'Continue did not observe an advancing simulation tick or simTime after reload'

      at TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:29:10)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Continue did not observe an advancing simulation tick or simTime after reload',
    expected: /within five minutes/,
    operator: 'match',
    diff: 'simple'
  }

test at test/mobile-probe-startup.test.mjs:43:1
✖ playable flight and explicit startup failures retain their existing verdicts (4.836121ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected

  + undefined
  - 4000

      at TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:47:10)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: 4000,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test/mobile-probe-startup.test.mjs:70:1
✖ requested iPhone touch profile is reported against effective runtime capabilities (2.870815ms)
  evalmachine.<anonymous>:237
    const context = await browser.newContext({ ...mobileDeviceProfile, serviceWorkers: 'block',
                    ^^^^^

  SyntaxError: await is only valid in async functions and the top level bodies of modules
      at new Script (node:vm:117:7)
      at createScript (node:vm:269:10)
      at runInNewContext (node:vm:310:10)
      at TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:83:3)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)

test at test/mobile-probe-startup.test.mjs:108:1
✖ historical save errors and unaccepted clicks cannot become a new Continue rejection (7.534456ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /within five minutes/. Input:

  'Continue did not observe an advancing simulation tick or simTime after reload'

      at TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:116:10)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'Continue did not observe an advancing simulation tick or simTime after reload',
    expected: /within five minutes/,
    operator: 'match',
    diff: 'simple'
  }

test at test/mobile-probe-startup.test.mjs:346:1
✖ Continue requires a delivered enabled public click before waiting for flight (4.811514ms)
  Error: Continue public tap was not delivered to an enabled Continue control
      at evalmachine.<anonymous>:6:13
      at async TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:362:3)
      at async Test.run (node:internal/test_runner/test:1389:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:960:7)

test at test/mobile-probe-startup.test.mjs:366:1
✖ observed invalid draws fail renderer health independently of console emission (2.15506ms)
  evalmachine.<anonymous>:16
      activeRoute, actorStage, 'draw-observer');
      ^

  ReferenceError: activeRoute is not defined
      at evalmachine.<anonymous>:16:5
      at Script.runInContext (node:vm:149:12)
      at Script.runInNewContext (node:vm:154:17)
      at runInNewContext (node:vm:310:38)
      at TestContext.<anonymous> (test/mobile-probe-startup.test.mjs:374:5)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1382:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:960:18)
      at Test.postRun (node:internal/test_runner/test:1522:19)
      at Test.run (node:internal/test_runner/test:1447:12)
```
