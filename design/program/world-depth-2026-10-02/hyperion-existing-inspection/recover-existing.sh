#!/usr/bin/env bash
# Read verified existing objects only. No fetch, checkout or production edits.
set -euo pipefail
: "${REPO:?Set REPO to an existing SpaceFace checkout with these objects}"
: "${INSPECTION_DIR:=./inspection-input}"
export GIT_NO_LAZY_FETCH=1 GIT_OPTIONAL_LOCKS=0
mkdir -p "$INSPECTION_DIR"
while read -r name sha; do
 git -C "$REPO" cat-file -s "$sha"
 git -C "$REPO" cat-file blob "$sha" > "$INSPECTION_DIR/$name.glb"
done <<'BLOBS'
dead-hulk 9bc9479fa6d37c63aebcbf364359f872823ef673
drill-platform 66d1040fb6425d735612c9aa8e5f2998419dc6cc
drill-platform-cold f242cefb416dfab24ad759436f4c54b3b3f9b7fe
seamed-asteroid 1ef183a3f5d4c4cba087fead01bed0fcfd320cbe
BLOBS
