# Vercel deployment — policy, pipeline, and the failure modes that keep recurring

> Scope: the `spaceface-play-demo` project (team `robin-gattis-projects`) that serves the web
> build of the game. Read this before touching `vercel.json`, `scripts/build-bundle.mjs`,
> `src/render/renderPackageManifest.js`, `assets/ships/render-packages/pilots.json`, or anything
> under `assets/ships/release/`.

## Deploy policy (changed 2026-10-19)

**Git pushes do not trigger Vercel builds.** Two independent gates enforce it:

1. `vercel.json` sets `git.deploymentEnabled: false` — survives in the repo even if the
   project is re-linked.
2. The project's Git connection was disconnected server-side (`vercel git disconnect`).

`scripts/vercel-ignore-build.mjs` (`ignoreCommand` in vercel.json) stays wired as a **third** gate:
if a human reconnects the repo or re-enables deployments, only its branch allowlist can build —
every other push is skipped before it spends build minutes. If you intentionally restore
auto-deploys, update its allowlist to match.

**Deploys are manual.** From a linked checkout (`vercel link --project spaceface-play-demo`):

```bash
vercel build --prod          # builds .vercel/output locally (same commands Vercel runs)
vercel deploy --prebuilt --prod
```

or let Vercel's own builders do it (`vercel deploy --prod` — uploads source, builds remotely).
Deploy when a change is worth publishing — not per push. The ~900 MB payload makes every
production build a multi-minute operation; that is normal, not a hang.

**Deploy from a clean tree.** `vercel deploy` ships the working directory *as it is on disk* —
including other lanes' uncommitted files. On this repo (a shared, often-dirty checkout) a manual
deploy of a dirty tree can ship half-landed work or fail the manifest gate itself. Deploy only
when `git status` for `assets/` + `src/` is clean — or use a dedicated clean checkout for releases.

## The build pipeline

`vercel.json` → install `npm ci` (Electron/Playwright binaries skipped) →
`npm run build:bundle` → `build/web` → deployed static site.

`scripts/build-bundle.mjs`: esbuild bundle (code-split, minified) + copy of the release runtime
trees + **a fail-closed manifest gate** + byte-exact build receipt + atomic publish into
`build/web`. The gate (`renderPackageSourceOmissions` in `scripts/lib/releasePackaging.mjs`)
verifies, for every one of ~350 pilot render packages:

- `render-package.json` `contentHash` equals its computed hash (the package is not stale),
- the package hash equals `expectedContentHash` in `src/render/renderPackageManifest.js`
  (the generated "shipping manifest"),
- `pilot.sourceSha256` and `metadata.provenance.sourceGlb` bind the actual release GLB bytes,
- `render.glb` bytes match the package's render claims,
- the sealed `metadata.runtime` table deep-equals a fresh build from `render.glb`.

## The failure mode that kept breaking production (fixed 2026-10-19)

**A commit re-authored release inputs without regenerating the release outputs.** Twice:

- `2a42b67` (INFERENCE SFQ-I070) re-authored `massline-express-liner-v1{,-lod1,-lod2}` —
  new GLBs, recompiled packages, updated `pilots.json`/`release_manifest.json` — but never
  regenerated `src/render/renderPackageManifest.js`.
- `57f5eb9` (D225) shipped new towline GLBs + `pilots.json` rows but never recompiled the
  `towline-{kit,mara}` render packages or the manifest.

Every master push then died ~3 minutes into the Vercel build with
`render-package.json content hash does not match the shipping manifest` — the gate failing
closed, exactly as designed. Fixed by `9af9d23` (manifest re-pinned; towline packages recompiled).

**The rule: release inputs and generated release outputs land in the same commit.** After
touching `assets/ships/release/parts/**` GLBs, `render-packages/**`, `release_manifest.json`,
or `pilots.json`, the commit must also contain every generated surface that binds them —
the compiled `render-package.json`/`render.glb`, `src/render/renderPackageManifest.js`, and
census/model-truth rows where applicable. The authoring flow is `assets/ships/AGENTS.md` step 4:

```bash
node scripts/refresh-render-package-pilots.mjs --only=<key>
node scripts/build-render-package-pilots.mjs --only=<key>   # recompiles package + manifest
```

**Before pushing anything under `assets/ships/release/` run the fast gate:**

```bash
npm run check:release-manifest-pins          # seconds; checks every pilot pin vs disk
npm run check:release-manifest-pins -- --only=<key>   # one package family
```

`check:render-package-pilots` (full recompile-verify, minutes) and `npm run build:bundle`
(the exact Vercel gate) are the heavyweight proofs. The pin check catches the drift class that
actually broke production.

**Dirty-tree trap (this repo specifically):** the working tree often holds other lanes'
uncommitted package recompiles. `renderPackageManifest.js` must pin what is **committed**, not
what is on disk — a manifest regenerated against uncommitted packages breaks the build for every
pilot it pins early. If you regenerate the manifest, land the matching packages in the same
commit, or pin only the committed package hashes.

## Diagnosing a failed deployment

```bash
vercel ls spaceface-play-demo                              # recent deployments + status
vercel inspect <deployment-url> --logs                     # full build log
vercel inspect spaceface-play-demo-robin-gattis-projects.vercel.app   # current production
```

Read the last `[bundle] FAILED:` line — the gate names the stale pilot and which binding
(contentHash, provenance, runtime table) drifted. `npm run check:release-manifest-pins`
reproduces the cheap half locally in seconds.

## Operational notes / future breakage vectors

- **Payload:** `build/web` is ~760 MB–1 GB (`assets/ships/release` is ~660 MB of it, by
  contract — authoring sources are excluded). Builds legitimately take several minutes.
- **Node version:** `engines.node` is `>=22.12.0 <25`, pinning Vercel to Node 24.x. The previous
  open range (`>=22.12.0`) would have auto-upgraded to future majors — a silent breakage vector.
  Widen deliberately, never by removing the cap.
- **The `/_releases/:deployment(...)` rewrite** produces a Node `DEP0170` warning in build logs
  (`URL https://:deployment/:path* is invalid`). It is Vercel-side substitution for the release
  asset pinning in `scripts/lib/vercelReleaseBase.mjs` — it works today; if a future Vercel CLI
  rejects it, that mechanism needs rework, not deletion.
- **Caching:** hashed bundle chunks (`*-<8charhash>.js`) are `immutable`; `/assets/**` and
  `/styles/**` are `max-age=3600, stale-while-revalidate=86400`; `index.html`, `main.js`,
  `spaceface-release-build.json`, and `/workers/**` are `must-revalidate`. Do not mark stable-name
  files immutable — only content-hashed names.
- **Install:** `installCommand` sets `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`. Do not drop them — the build container has no use for
  either binary and they dominate install time/egress.
- **Lockfile generation platform:** a Windows `npm install --package-lock-only` can emit a lock
  the Linux build container rejects (`npm ci ... Missing: <pkg> from lock file`, e.g. the
  `@electron/windows-sign` subtree under `electron-winstaller`). Local `npm ci` passes on Windows
  while Vercel's npm fails, so a green local install is not proof. Regenerate the lock where the
  build runs before landing dependency bumps:
  `docker run --rm -v "$PWD:/w" -w /w node:24-bookworm-slim npm install --package-lock-only`.
- **Postinstall** runs `scripts/patch-playwright-electron.mjs` — required; do not bypass with
  `--ignore-scripts`.
- **Preview branches:** with git disconnected there are no preview deployments. If previews are
  needed, reconnect (`vercel git connect`), keep `deploymentEnabled` for production-only, and let
  the ignoreCommand allowlist control which branches get previews.
