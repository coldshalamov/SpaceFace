# Foundry: carry the Maw through intermission

Reviewed source increment, 2026-11-10, on draft PR #942 parent
`31195a6ed5c053e44180d5ad06dd522788657f7d`.

## Player-facing change

- The first ordinary Foundry Iron Maw death uses the existing in-flight
  announcement rather than opening Results over an unfinished round. Remaining
  ships, finite debt, damage and rewards keep their existing owners. Other bosses
  and modes retain the milestone modal.
- The earned round-five Armory acknowledges the Maw, names an available affordable
  repair when one exists, and explains that the run purse can be spent or saved.
  Extraction still begins after round ten. The round-six Armory prepares the next
  charge while keeping repair, Fortify and manual launch optional.
- Round six gives six active seconds before ordinary ship arrivals. Jackal still
  follows at eight seconds. A nearby, slow, reachable surviving original offcut can
  front three already-owed Mites. The remaining Brood follows the existing
  six-second opening window, or arrives earlier when those three are defeated.
  Guns and ordinary flight remain valid; no throw or purchase is required.

The scene retains the original entity and occupant generation recorded by the Maw
death owner. It creates no replacement mass, extra enemy budget or reward. Both
the pilot's canonical Massline approach and the offcut-to-pack corridor must be
clear. Missing, destroyed, retiring, fast, remote, blocked, nonphysical and
wrong-life originals take ordinary finite fallback. Preparation copy explicitly
qualifies survival, proximity and a clear lane.

An eligible composition waits for real pilot-action admission. The first RMB
catch can itself admit the scene. The same held original remains eligible, and an
idle eligible scene is checked again on the next tick instead of after the usual
half-second polling delay. Pause and duplicate same-tick calls do not spend the
opening clock. No attachment, movement, collision, stock or wallet owner changes.

## Exact publication verification

The six reviewed source/test files were frozen before the publication rerun. All
64 current parent source/test Git blob identities were freshly checked against
GitHub. The Brood change carries only the owned admission hunks onto that exact
parent; unrelated local presentation and contact behavior is excluded.

- **100/100** focused cases passed in 25.923 seconds: new aftermath (28), Foundry
  score, existing native original-payoff and round-seven cover, and legacy boss
  rites.
- **44/44** worker/save cases passed in 17.808 seconds: real worker first-action
  protection and reward controls, real draft stock/purchase/refusal, pause-save
  copy and campaign save protection.
- Both batches had zero failures, cancellations or skips. Independent review had
  separately reproduced the same 100 and 44 cases before this publication rerun.
- **2,678** distinct imported project source identities matched: six frozen
  candidate files, 28 exact-parent overlay files, and 2,644 raw exact-base Git
  blobs. Zero hash mismatches. The exact base is
  `f95de0eb1ba7560839209936afba48c7b96fe41a`.

The source audit covers loaded project JS/MJS/TS/JSON. Installed dependencies and
native assets remain environment-provided; direct fixture filesystem reads are
not separately frozen by the module loader. This is not a retail-package or CI
merge-tree audit.

The two reproducible test batches, from a checkout of this commit, are:

```sh
node --test --test-concurrency=2 test/swarm-foundry-aftermath.test.mjs test/swarm-foundry-score.test.mjs test/swarm-foundry-wreck-payoff.test.mjs test/swarm-foundry-wreck-cover.test.mjs test/swarm-boss-rites.test.mjs
node --test --test-concurrency=2 test/swarm-worker-score-control.test.mjs test/worker-draft-shelf.test.mjs test/pause-save-line.test.mjs test/pro-06-exit-to-menu-autosave.test.mjs
```

## Native input and attribution evidence

The new round-six scenario uses a declared historical Maw-death fixture and a
selected pilot pose, followed by four seconds of real native settling and actual
round-six plan/start. It uses synthetic public DOM input through the production
input owner, Rapier and flight-v3, not a directly assigned action latch.

First RMB catches the original 35 t, 7 WU offcut at tick 241 and admits exactly
three existing Mites. W carries it; second RMB releases at tick 323. The same
original travels 301.159 WU, retains its generation and causes no hull loss.
Two kills pay two credits and 24 score. Removing only the original's Brood mover
role after admission produces the same wallet result: these are **pilot contacts,
not offcut-attributed payoff**.

The unchanged earlier native payoff test independently passes on this candidate.
Ordinary catch/carry/cut leads to original contact at tick 384; matched wallets
20/19 isolate one offcut-attributed credit and twelve score. Round-seven native
shelter and no-dodge controls also pass. This does not show a reliable offcut hit
against the new staged trio.

## Actual round-five owner lifecycle

A separate checkpoint probe was independently reproduced and rerun for
publication. It includes runSession, survivalRun, survivalWave, spawnBudget,
combat, survivalRewards, survivalDraft and the production capital-boss owner.
Checkpoint setup, action admission and damage calls are declared fixtures; it
does not earn rounds one to four or simulate a complete native battle.

At tick 211, the round owes 23 ships and has admitted three. Maw death resolves
one, keeps two live ships and three pending packages, and opens neither Results
nor Armory. After another 900 ticks, the round is still active, with ten live
ships and only one resolved. Killing the remaining actual admitted lives produces
one 23/23 clear at tick 1116. Normal 45-tick cleanup opens 34 real Armory offers at
1161, with 280 credits and 2,800 score. Duplicate boss death adds no award, chunk
or resolution. Another 180 draft ticks preserve the same original id/generation
and stock. Extraction at round five is refused.

## Review fixes and limits

Review corrected three issues before freezing this candidate: unconditional
preview promises despite fallback states, missing canonical latch-path clearance,
and half-second admission polling that could miss the first real catch. Focused
regressions and the native first-input case cover the resulting fixes. No remaining
blocking implementation defect was found within this frozen scope.

Full earned rounds one to seven, naturally discovering and positioning the
surviving offcut, staged-pack offcut-hit reliability and feel, rendered readability,
hardware/controller input, full UI Continue, full-run economy, GPU performance,
CI and release acceptance remain unverified. Fake-DOM Armory mounting is not
rendered acceptance. The native scenario is not a browser playthrough. Draft only;
no merge or deployment.
