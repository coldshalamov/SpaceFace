#!/usr/bin/env bash
# Commit only YOUR changes to files that other agents also have uncommitted edits in.
# A busy file is never a reason to stop: snapshot it, edit it, commit your part.
#
#   bash scripts/fleet/own-commit.sh begin  <path> [<path> ...]      # BEFORE you edit: remember the file as it is now
#   bash scripts/fleet/own-commit.sh commit "<message>" <path> [...] # AFTER: commit what changed since `begin`
#
# For each path the commit contains HEAD's version plus exactly the changes you made since
# `begin` (three-way: HEAD + (now − snapshot)). The other agent's uncommitted edits stay in the
# working tree, uncommitted, exactly as they were. If your change overlaps theirs so the two cannot
# be separated, the whole current file is committed instead (their part rides along — that is
# allowed; unfinished work is worse than a shared commit). A path with no snapshot, or a new
# file, is committed whole. The index and the working tree are never reset, stashed or checked out;
# HEAD moves by compare-and-swap, so other agents' commits landing meanwhile are kept.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
SNAP=".devshots/fleet/own-commit"
key() { echo "$1" | sed 's#[/\\]#__#g'; }

if [ "${1:-}" = "begin" ]; then
  shift; mkdir -p "$SNAP"
  for p in "$@"; do
    if [ -e "$p" ]; then cp -- "$p" "$SNAP/$(key "$p")"; echo "snapshot $p"; else rm -f "$SNAP/$(key "$p")"; echo "snapshot $p (new file)"; fi
  done
  exit 0
fi
[ "${1:-}" = "commit" ] || { echo "usage: own-commit.sh begin <paths> | commit \"<message>\" <paths>"; exit 2; }
MSG=$2; shift 2
[ $# -gt 0 ] || { echo "no paths"; exit 2; }
TMPD=$(mktemp -d); trap 'rm -rf "$TMPD"' EXIT

for try in 1 2 3 4 5 6 7 8; do
  OLD=$(git rev-parse HEAD)
  export GIT_INDEX_FILE="$TMPD/idx-$try"
  git read-tree "$OLD" || { unset GIT_INDEX_FILE; sleep 5; continue; }
  : > "$TMPD/entries"; note=""
  for p in "$@"; do
    k=$(key "$p")
    if [ ! -e "$p" ]; then
      git update-index --force-remove -- "$p" 2>/dev/null; echo "D $p" >> "$TMPD/entries"; continue
    fi
    mode=$(git ls-tree "$OLD" -- "$p" | awk '{print $1}'); [ -n "$mode" ] || mode=100644
    out="$TMPD/out-$k"
    if git cat-file -e "$OLD:$p" 2>/dev/null && [ -f "$SNAP/$k" ]; then
      git show "$OLD:$p" > "$TMPD/head-$k"
      # HEAD + (worktree − snapshot)
      if git merge-file -p "$TMPD/head-$k" "$SNAP/$k" "$p" > "$out" 2>/dev/null; then :; else
        cp -- "$p" "$out"; note="$note [$p: overlapped another agent's edit — committed whole]"
      fi
    else
      cp -- "$p" "$out"
    fi
    blob=$(git hash-object -w --path="$p" "$out")
    git update-index --add --cacheinfo "$mode,$blob,$p"
    echo "M $mode $blob $p" >> "$TMPD/entries"
  done
  TREE=$(git write-tree)
  unset GIT_INDEX_FILE
  if [ "$TREE" = "$(git rev-parse "$OLD^{tree}")" ]; then echo "own-commit: nothing of yours to commit in: $*"; exit 0; fi
  NEW=$(git commit-tree "$TREE" -p "$OLD" -m "$MSG")
  if git update-ref -m "own-commit" HEAD "$NEW" "$OLD" 2>/dev/null; then
    # bring the real index to the new HEAD for these paths only; the working tree is untouched
    for i in 1 2 3 4 5 6 7 8 9 10; do
      ok=1
      while read -r kind a b c; do
        if [ "$kind" = "D" ]; then git update-index --force-remove -- "$a" 2>/dev/null || ok=0
        else git update-index --add --cacheinfo "$a,$b,$c" 2>/dev/null || ok=0; fi
      done < "$TMPD/entries"
      [ $ok -eq 1 ] && break; sleep 4
    done
    for p in "$@"; do [ -e "$p" ] && cp -- "$p" "$SNAP/$(key "$p")"; done
    echo "own-commit: $(git rev-parse --short=10 "$NEW") $MSG$note"
    exit 0
  fi
  sleep 3
done
echo "own-commit: could not move HEAD after 8 tries"; exit 4
