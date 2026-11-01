# Published-branch CI triage

These CI observations describe initial published commit `f9dc91a098` against base `fc50d96f1`.
The subsequent integration through `aa212937b` is covered separately by the 36 passing test files
in [post-merge-tests.txt](post-merge-tests.txt); the historical CI results are not relabeled as results
for that later source tree.

On 2026-11-01, the [mobile-readiness run for PR #776](https://github.com/coldshalamov/SpaceFace/actions/runs/41274820816)
passed all 153 worker, touch and runtime regression cases in the Chromium job, then failed while
building retail assets. Both browser jobs stopped at that build stage; browser acceptance did not run.

The observed error was:

```text
[bundle] FAILED: Error: ENOENT: no such file or directory, lstat '.../assets/characters'
    at createReleaseCopyPlans (scripts/lib/releasePackaging.mjs:201)
    at copyReleaseRuntimeTrees (scripts/lib/releasePackaging.mjs:222)
    at build (scripts/build-bundle.mjs:163)
```

## Cause and baseline evidence

The workflow's sparse checkout in `.github/workflows/mobile-readiness.yml` includes selected asset
directories but omits `assets/characters/ruckus`. The default retail mappings in
`scripts/lib/releasePackaging.mjs` require four existing files in that directory:
`ruckus-lod0.glb`, `ruckus-lod1.glb`, `ruckus-lod2.glb` and `pressure-core.glb`.
Its strict source-path check calls `lstat` on every component and therefore fails at the missing
parent before copying those files.

The following Git blob IDs are identical at original base `35b99d872`, upstream `fc50d96f1`,
and local integration commit `6eae2a104`. The latter's tree was verified byte-for-byte equal to
published PR commit `f9dc91a098` (`9f7491c1ca295d37668d4f55051090371ffae555`).

| Source | Identical blob |
|---|---|
| `.github/workflows/mobile-readiness.yml` | `3f2e833daef87c1ac40a74edee3dfeb66c46b934` |
| `scripts/check-bundle.mjs` | `f1f6a7b4e75f0de28b2c8456ce3426b0e7c5d4f4` |
| `scripts/build-bundle.mjs` | `2953288a313ee456d58a9b6fa9b5f74631e99e00` |
| `scripts/lib/releasePackaging.mjs` | `1b2c18ae4ee52e0bde9e8ed4012dc0ac1a7503db` |

All four character GLBs already exist with identical Git blobs at those three source refs. This is
an inherited CI input mismatch, not a missing asset introduced by the specialist models. No workflow
or retail packaging exceptions were added to make this result appear green.

The build remains **failed**. Including the required character directory is a separate narrow
workflow correction; doing so would permit investigation of later stages, not establish that those
stages pass. The passing regression cases do not constitute retail-build or browser acceptance.

## Broader checks and UI-baseline scope

The initial branch's [retail-smoke build and title boot](https://github.com/coldshalamov/SpaceFace/actions/runs/41274820860)
**passed**. Its separate [full check workflow](https://github.com/coldshalamov/SpaceFace/actions/runs/41274820844)
reports failures across simulation, static, feel and browser groups. This PR does not claim a green
full suite or reclassify every reported failure as inherited.

Two preload assertions were checked directly against original-base, upstream and PR index bytes:
Phoebe's expected link occurs zero times at all three refs, and SweepWindow's expected link has
index -1 at all three. This PR's index edit adds only the three specialist preloads. Those two
missing-link expectations therefore already failed before this work.

The production rendered-UI digest identifies **77 stale source files at base/upstream and 78 on
this PR**. The new path is `src/ui/screens/crucibleDraft.js`; `index.html` was already stale.
[ui-baseline-evidence.json](ui-baseline-evidence.json) records the canonical digests and path sets.
The affected preparation surfaces are draft and Swarm refit. The final [six focused captures](ui/README.md)
verify this new copy and its desktop wrapping; they do not refresh the repository-wide measured
budget baseline. No fresh digest was substituted into old measurements and no golden was changed
to conceal this failure.

The broad SG04 asset check also reports nine compressed-asset failures. The same
`inspectReleaseAssetPair` validator was run on the immutable published bytes of these three
specialists: all three source/release pairs passed without issues. The final rebuilt pairs have
their complete results in [compression.json](compression.json), and the actual validator is now
part of their asset regression test. The rest of the asset catalog is outside that passing claim.
