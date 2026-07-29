# PQ-041 — PERF-07 Electron modernization implementation receipt

```yaml
packet: PQ-041
scope: supported Electron runtime, explicit source-runtime provisioning, hardened shell boundary, and production package allowlist
implementationBranch: claude/perf00-20260727
implementationParent: c8bc4089
implementationCommit: this_receipt_commit
routeClaim: focused_shell_runtime_and_package_structure_green
acceptanceClaim: native_browser_electron_broker_and_exact_packaged_startup_pending
disposition: PARTIAL
qualityInvariant: preserved
```

## What this receipt claims

PERF-07's bounded production implementation moves SpaceFace from resolved Electron `31.7.7` to exact Electron
`43.2.0`, updates the npm/CI host contract to Node `>=22.12.0`, adapts the one removed Electron API used by the
shell, strengthens the renderer boundary, makes deferred Electron-runtime installation explicit, narrows packaged
shell files to production entry points, and converts the New Game diagnostic to the shared isolated-launch and
owned-teardown contract.

The ordinary Browser and Electron game routes remain the same canonical game. Normal player Electron retains fixed
loopback port `41788` so the localStorage save origin does not move. Packaged Electron still serves `build/web`; source
Electron still serves the repository root through the same `scripts/lib/gameServer.cjs` module used by the browser
route.

This is an **implementation and focused shell/package claim**, not terminal PQ-041 acceptance. It does not claim a
frame-time, FPS, GPU-time, compositor, memory, GC, startup-time, or resource improvement from this contended
workstation. Native Browser/Electron equivalence, generated-package startup, hardware-GPU identity, controller/audio/
display behavior, and matched performance remain broker-owned acceptance work.

## Selected runtime and dependency graph

The retained target line is exact Electron `43.2.0`. The installed Windows x64 runtime reports:

| Identity | Value |
|---|---|
| Electron | `43.2.0` |
| Chromium | `150.0.7871.129` |
| embedded Node | `24.18.0` |
| V8 | `15.0.1240245-electron.0` |
| runtime platform/architecture | `win32` / `x64` |
| source runtime executable | `node_modules/electron/dist/electron.exe` |
| npm host Node used for the focused checks | `24.15.0` |

`package.json` now declares Node `>=22.12.0`, and CI installs the dependency graph on Node 22. The package and lockfile
roots agree on exact Electron `43.2.0`. The lockfile contains one Electron resolution and no Electron-31 resolution.
The bounded graph audit found one direct dependency change only: Electron. `electron-builder` remains `24.13.3`,
Playwright remains `1.61.1`, and Three.js remains `0.184.0`.

Expected Electron download-stack changes include `@electron/get` `5.1.0`, `@electron-internal/extract-zip`, `undici`,
Node 24 typings, and removal of the Electron-31 download stack. No `npm audit fix` or unrelated dependency upgrade was
run. npm continues to report broader pre-existing advisories; PERF-07 does not churn unrelated packages to suppress
that report.

## Implemented architecture

### Explicit deferred-runtime provisioning

Electron 42+ no longer guarantees that npm package installation leaves a downloaded runtime behind. Requiring
`electron` to discover the executable is also not a pure lookup: Electron's `index.js` can synchronously invoke
`install.js` when `path.txt` or the runtime is absent.

`scripts/lib/electronRuntimeProvisioning.mjs` therefore resolves `electron/package.json` without executing Electron
package code and inspects:

- the project's exact declared Electron version;
- installed Electron package metadata;
- `path.txt`;
- the runtime `dist/version` identity;
- the platform executable; and
- Electron's installer entry point.

The source launcher explicitly invokes `install.js` through the current Node executable only when the selected package
is present but its matching runtime is absent. Installer stdout/stderr remains inherited, an integer installer exit
code is preserved, and a zero exit is followed by a complete package/runtime reinspection. An invalid
`ELECTRON_OVERRIDE_DIST_PATH` fails closed instead of silently downloading over the override.

The launcher also rejects stale package metadata before provisioning: an installed Electron 31 package cannot satisfy
a project that declares Electron 43, and the old package's installer is never allowed to provision or launch the wrong
major. The Windows batch launcher detects the same missing-or-stale metadata state and runs `npm install`; runtime
binary provisioning remains owned by the Node launcher.

### Electron 43 shell and security boundary

`electron/main.cjs` now consumes Electron 43's object-form `console-message` details argument. The shell records a
bounded runtime-identity object in its existing `starting` receipt and retains the existing one-way lifecycle preload.
No outbound IPC surface was added.

The BrowserWindow renderer boundary is explicit:

- `contextIsolation: true`;
- `nodeIntegration: false`;
- `sandbox: true`;
- `webSecurity: true`;
- `allowRunningInsecureContent: false`; and
- `experimentalFeatures: false`.

Every popup is denied. Navigation is denied unless it is the exact owned canonical root URL. Permission checks and
requests deny everything except `pointerLock` from the exact owned loopback origin and exact owned `webContents`.
Normal lifecycle/background-throttling behavior from PERF-01 is unchanged.

### Isolated diagnostic process ownership

`scripts/check-electron-new-game-launch.mjs` no longer launches against player port/profile state and no longer calls a
direct best-effort `app.close()`. It now uses:

- `createIsolatedElectronLaunch` for a generated non-player listener and temporary profile;
- `assertIsolatedElectronRootUrl` for canonical owned-root proof;
- `createElectronProcessMonitor` and `createElectronCanonicalUrlTracker`; and
- `closeOwnedElectronRuntime` before profile deletion.

The generated profile is deleted only after exact owned-runtime shutdown passes. The route remains diagnostic and
non-promoting; its hardware-WebGL assertion was deliberately not run on this contended workstation.

### Production package allowlist

The electron-builder file set is narrowed from `electron/**` to:

- `build/web/**`;
- `electron/main.cjs`;
- `electron/preload.cjs`;
- `scripts/lib/gameServer.cjs`;
- `scripts/lib/electronLaunchProtocol.cjs`; and
- `package.json`.

Development-only `electron/shipPreview.cjs` and source-launch-only
`scripts/lib/electronRuntimeProvisioning.mjs` are not packaged.

## Concrete reread repair

One direct reread of the completed packet found one production defect: the source launcher verified that installed
Electron package metadata matched its downloaded runtime, but did not verify that the installed package matched the
project's newly declared Electron version. A checkout with stale Electron-31 `node_modules` could therefore launch 31
even though `package.json` selected 43.

The provisioning inspector now binds declared package version, installed package version, runtime version, and
executable identity. A package-version mismatch exits with an actionable `npm install` instruction before any stale
installer runs. `SpaceFace-Desktop.bat` refreshes missing or mismatched package metadata and uses `if errorlevel 1` so
the npm failure decision is evaluated after `npm install` rather than through stale block expansion.

The focused provisioning/runtime checks were rerun after this repair. No broader validation loop was opened.

## Focused verification

| Gate | Result |
|---|---|
| Syntax checks for the changed/new Electron main, launcher, provisioning, policy, runtime, platform, dependency, and New Game scripts | **PASS** |
| `node --test test/electron-shell-lifecycle.test.mjs test/electron-isolated-evidence-contract.test.mjs` | **14 pass / 0 fail** |
| `node --test test/electron-security-contract.test.mjs` | **3 pass / 0 fail** |
| `node test/electron-launcher-reliability.test.mjs` | **PASS** — explicit provisioning, stale-package rejection, real exit-code preservation, and process ownership |
| `node scripts/check-electron-dependency-drift.mjs` | **PASS** — exact target graph and production package allowlist |
| `node scripts/check-electron-platform-contracts.mjs` | **PASS** — Node/runtime/package targets and shell structure |
| `node scripts/check-electron-runtime-identity.mjs` | **PASS** — Electron/Chromium/Node/V8 and executable identity above |
| `npm run check:launch-policy` | **PASS** — one canonical Browser/Electron root policy |
| `git diff --check` | **PASS** (Git reports the repository's Windows worktree LF→CRLF warning for one test file) |

After the reread repair, the focused launcher, platform, and actual runtime-identity checks passed again. The runtime
was already provisioned, so the final identity check reported `provisionedNow: false` and verified the retained binary.

## Packet baseline result

The one required packet-level `npm run check:baseline` run executed every link and exited 1 because this workstation was
under concurrent coding-agent load:

- 9 of 10 top-level links passed;
- the Massline aggregate completed 22 of 23 children green;
- `check:47a:physical-branches` emitted no failed assertion and was killed at its 150,000 ms contention timeout; and
- wall time was 151,781 ms, exceeding the gate's 90,000 ms fast-gate budget.

The runner itself classifies this timeout as an environment/contention signal rather than a product assertion. The
packet does not convert it into a green gate, does not self-issue an inherited-red token, and does not rerun until a
favorable timing result appears. Focused Electron correctness evidence is recorded above; terminal baseline and native
acceptance remain open for an uncontended owner.

## Packaging result and host limitation

`npm run build:bundle` passed for 239 files with receipt digest
`59c9eae4680468513f694afda7d03c3d7c74c155c006687d0e635fe6a7defa74` (18.84 MB raw JavaScript, 9.64 MB bundled).

The exact acceptance command:

```text
npx electron-builder --dir --publish never
```

successfully selected and downloaded Electron `43.2.0`, then failed while extracting electron-builder's
`winCodeSign-2.6.0` tool cache because this Windows account lacks symbolic-link creation privilege:

```text
ERROR: Cannot create symbolic link : A required privilege is not held by the client.
```

The named failures were macOS OpenSSL dylib symlinks in the cross-platform tool archive. No Electron-43 API,
electron-builder configuration, or package-content incompatibility was reproduced, so `electron-builder@24.13.3` was
not upgraded.

A local package-layout proof using:

```text
npx electron-builder --dir --publish never --config.win.signAndEditExecutable=false
```

succeeded and produced `dist/win-unpacked`. Within the packaged shell namespaces, asar inspection found only
`electron/main.cjs`, `electron/preload.cjs`, `scripts/lib/gameServer.cjs`, and
`scripts/lib/electronLaunchProtocol.cjs`; the development preview and source provisioning helper were absent. This
workaround is **not** treated as exact-command acceptance because Windows executable sign/edit processing was disabled.

## Preserved boundaries

- Deterministic simulation, fixed 60 Hz stepping, the four-step foreground catch-up cap, fractional remainder, and
  explicit whole-step backlog shedding are unchanged.
- Presentation scheduling, entity population, authored assets, effects, draw distance, render scale, LOD thresholds,
  lighting, shaders, and default visual quality are unchanged.
- Browser and Electron retain one game route and the same WebGL2 production renderer.
- Fixed player port `41788`, source-versus-packaged root selection, single-instance behavior, and save origin are
  preserved.
- The cinematic intro/menu, compact third-person HUD, Massline behavior, gameplay, saves, source-only asset
  checkpoints, production GLBs, release manifests, and asset manifests were not modified.
- No security relaxation, Node-integrated renderer, outbound preload IPC, browser-only gameplay fork, or ambient
  process termination was introduced.

## Residual acceptance gap

PQ-041 remains `acceptance: unproven`. Terminal acceptance still requires:

1. an uncontended green packet baseline;
2. the exact generated-package command on a Windows host able to extract electron-builder's symlink-bearing tool cache;
3. an owned packaged-startup probe proving `app.isPackaged`, exact executable/package identity, canonical `build/web`
   routing, packaged assets, save/`userData` behavior, and exact teardown;
4. paired Browser and Electron broker claims bound to one `sourceCandidateDigest` and distinct runtime identities;
5. native minimize/hide/suspend/lock, display, controller, audio, crash/context-recovery, and hardware-GPU evidence; and
6. matched deterministic/presentation semantics and performance reporting, including a neutral result if no speedup is
   measured.

The supported-runtime implementation is dependency-ready for PERF-08 selection. It is not claim-ready for terminal
PERF-07 acceptance: **dependency-ready is not claim-ready**.
