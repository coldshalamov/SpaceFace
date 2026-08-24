#!/usr/bin/env bash
set -euo pipefail

FINAL_BRANCH="integration/all-branches-20260824"
SUPPORT_DIR="$(mktemp -d)"
BUILD_REPORT="$(mktemp)"
trap 'rm -rf "$SUPPORT_DIR" "$BUILD_REPORT"' EXIT

# Preserve the consolidation control surface before replacing the branch history with a clean
# current-master assembly. Generated ledgers are deliberately not copied: the audit workflow will
# regenerate them against the newly assembled branch and the then-current master.
mkdir -p "$SUPPORT_DIR/scripts" "$SUPPORT_DIR/.github/workflows"
for path in \
  scripts/branch-consolidation-audit.mjs \
  scripts/branch-family-topology.mjs \
  scripts/branch-patch-outcomes.mjs \
  scripts/consolidation-portability-probe.mjs \
  scripts/build-consolidation-wave1.sh \
  .github/workflows/branch-consolidation-audit.yml \
  .github/workflows/consolidation-portability.yml \
  .github/workflows/consolidation-wave1-build.yml
do
  if [[ -f "$path" ]]; then
    mkdir -p "$SUPPORT_DIR/$(dirname "$path")"
    cp "$path" "$SUPPORT_DIR/$path"
  fi
done

git config user.name "spaceface-integration-bot"
git config user.email "spaceface-integration-bot@users.noreply.github.com"
git fetch --filter=blob:none origin '+refs/heads/*:refs/remotes/origin/*' --prune --force

# Expand from the tiny control-surface checkout to every code, test, design, and root file while
# deliberately leaving the very large binary asset payloads outside this integration transaction.
git sparse-checkout set --no-cone '/*' '!/assets/' '!/scratch/' '!/.hullgen/'

MASTER_SHA="$(git rev-parse refs/remotes/origin/master)"
git switch -C consolidation-wave1 refs/remotes/origin/master

pick() {
  local sha="$1"
  echo "::group::cherry-pick $sha"
  git cherry-pick -x "$sha"
  echo "::endgroup::"
}

# Progression and physical-control foundations first.
pick 8090de11862aed1d62f1bb985ec0f62e4aa7d0c7  # AC-03 kill research rewards

# AC-04's runtime implementation merges cleanly. Its old all-in-one weapon test has independently
# evolved on master, so preserve current authority there and retain the donor's dedicated new test.
echo "::group::cherry-pick AC-04 with current-test preservation"
if ! git cherry-pick -x a72ae911672e02d27c8210dd1d5cd205bd64f55a; then
  conflicts="$(git diff --name-only --diff-filter=U)"
  unexpected="$(printf '%s\n' "$conflicts" | grep -v '^test/weapon-impulse-consequence\.test\.mjs$' || true)"
  if [[ -n "$unexpected" ]]; then
    echo "Unexpected AC-04 conflicts:" >&2
    printf '%s\n' "$unexpected" >&2
    exit 1
  fi
  git checkout --ours -- test/weapon-impulse-consequence.test.mjs
  git add test/weapon-impulse-consequence.test.mjs
  git cherry-pick --continue
fi
echo "::endgroup::"

pick 1deee482f3318692918d1ff2f8de41b50dc514d0  # AC-05 motion/juice discipline
pick 6cf62360d0a3f3acb4659f994c7c02117713c243  # AC-13 physical planetary plunge credit
pick 123c8543a7b92a5031edeca53f1c9d9c7241b233  # AC-17 hostile snare legibility
pick cad43061b997f5cc724deee9ae5f6a6482ce83d7  # AC-18 shared hull damage dressing
pick 72b298c3a23b5cae89373c5368ab1702974648d5  # named Ace physical escape

# Player-facing surfaces are applied after their shared runtime owners.
pick da3288c35fa48bf84c80a20e4db90786377c415b  # tactical map PR #98
pick e3d52826ad6db3a03b75b3dd169a903e4ed2d490  # boot presentation PR #97

# Preserve the final Arcade Core design quarry without importing its 63-commit obsolete topology.
git checkout refs/remotes/origin/arcade-core-plans -- design/arcade-core
README="design/arcade-core/README.md"
if [[ -f "$README" ]] && ! grep -q 'CONSOLIDATION STATUS' "$README"; then
  tmp="$(mktemp)"
  cat > "$tmp" <<'EOF'
> **CONSOLIDATION STATUS — EXPERIMENT BANK, NOT AN ACTIVE EXECUTION QUEUE.**
>
> This directory preserves the final Arcade Core design quarry from the historical branch family.
> Current authority remains `VISION.md`, `GDD_2_0.md`, `CANONICAL_BUILD_MAP.md`, and the admitted
> packets under `design/program/`. Ideas here become work only when explicitly admitted through that
> control plane. Historical branch ancestry, rejected AC-07/AC-10 implementations, and duplicated
> validation scaffolding are intentionally not imported with these documents.

EOF
  cat "$README" >> "$tmp"
  mv "$tmp" "$README"
fi

# Restore the branch-audit tools on the assembled history. The one-shot request marker is not
# restored, so the publication push cannot recurse into another assembly.
cp -a "$SUPPORT_DIR"/. .
chmod +x scripts/build-consolidation-wave1.sh scripts/branch-consolidation-audit.mjs \
  scripts/branch-family-topology.mjs scripts/branch-patch-outcomes.mjs \
  scripts/consolidation-portability-probe.mjs

mkdir -p design/program/branch-consolidation
cat > design/program/branch-consolidation/WAVE1.md <<EOF
# Consolidation wave 1

Built from current master \`$MASTER_SHA\`.

This wave ports the branch outcomes that independently apply to current master and survive an
adversarial ownership review:

- AC-03: receipt-deduplicated hostile-kill research rewards through one positive RP writer;
- AC-04: one physical tumble identity across collision, Massline, and authored impulse, while
  preserving master's evolved weapon-consequence test;
- AC-05: bounded hit-stop, truthful screen-shake preference, reduced-motion zeroing, and no combat
  zoom pulse;
- AC-13 reroute: physically escapable planetary pull and player credit for authored plunge kills;
- AC-17: hostile anchor fields cannot masquerade as the player's Intake field;
- AC-18: fixed-allocation, reversible, shared hull damage dressing;
- PR95 Ace leaf: catchable physical retreat instead of timer disappearance;
- PR98: native semantic tactical radar and paused operational atlas;
- PR97: full-bleed honest loading presentation;
- Arcade Core final documents as a preserved experiment bank, not an imported execution queue.

Explicitly excluded from this wave: superseded performance branches, transport/bootstrap branches,
rejected AC-07/AC-10 implementations, Ceres files protected by the owner's dirty local tree, and VFX
branches that target obsolete presentation owners. Those remain represented in the branch ledger for
adaptation or rejection.
EOF

git add -A
git commit -m "chore(integration): preserve branch audit and Arcade Core authority [consolidated]"

npm ci

# Syntax-check every changed JavaScript module before importing it in tests.
mapfile -t changed_js < <(git diff --name-only refs/remotes/origin/master...HEAD | grep -E '\.(mjs|cjs|js)$' || true)
if ((${#changed_js[@]})); then
  printf '%s\0' "${changed_js[@]}" | xargs -0 -n1 node --check
fi

node --test \
  test/arcade-core-kill-rp.test.mjs \
  test/arcade-core-readable-tumble.test.mjs \
  test/weapon-impulse-consequence.test.mjs \
  test/arcade-core-juice-discipline.test.mjs \
  test/time-effects.test.mjs \
  test/planet-vertical.test.mjs \
  test/field-anchor-controller.test.mjs \
  test/arcade-core-damage-dressing.test.mjs \
  test/named-ace-physical-escape.test.mjs \
  test/tactical-map-second-generation.test.mjs \
  test/j07-hud-contract.test.mjs \
  test/unified-map-professional.test.mjs \
  test/startup-loading-presentation.test.mjs \
  test/loading-boot-resilience.test.mjs \
  test/loading-terminal-art.test.mjs

node scripts/check-radar-perf.mjs
node scripts/check-type-floor.mjs

git status --short
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Validation mutated the tree; refusing to publish:" >&2
  git status --short >&2
  exit 1
fi

git push --force-with-lease="refs/heads/$FINAL_BRANCH:$(git rev-parse refs/remotes/origin/$FINAL_BRANCH)" \
  origin "HEAD:refs/heads/$FINAL_BRANCH"

echo "Published consolidation wave 1 at $(git rev-parse HEAD), based on $MASTER_SHA."
