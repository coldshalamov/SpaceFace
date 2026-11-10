#!/usr/bin/env python3
"""Add only the maturity-pack link to build_map.md. Dry-run unless --apply.
No commit/push, no task/status edits. Coordinate with the current board writer first.
The lock is advisory: an unrelated writer that ignores it can still race this script.
"""
from __future__ import annotations
import argparse
import difflib
import os
from pathlib import Path
import subprocess
import sys
import tempfile

PACK = "design/program/maturity-cloud-2026-10-20/README.md"
ANCHOR = "<!-- LIFETIME: STABLE -->\n# SpaceFace Build Map\n\n"
ADDITION = (
    "The owner-requested [Maturity and cloud implementation pack](" + PACK + ")\n"
    "expands the existing first-hour, physics/Swarm, living-world, economy and discovery rows into\n"
    "bounded workflows and ten cloud-sized slices. This is supporting detail, not a second queue;\n"
    "existing row identities, current claims and acceptance remain authoritative.\n\n"
)

def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True,
                          text=True, capture_output=True).stdout

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    repo = args.repo.resolve()
    if Path(git(repo, "rev-parse", "--show-toplevel").strip()).resolve() != repo:
        raise ValueError("--repo must be the Git repository root")
    target = repo / "build_map.md"
    if target.is_symlink() or not target.is_file() or not (repo / PACK).is_file():
        raise ValueError("Require a regular build_map.md and the installed pack README")
    original = target.read_bytes()
    text = original.decode("utf-8")
    if PACK in text:
        print("Already linked; no changes.")
        return 0
    if git(repo, "status", "--porcelain", "--", "build_map.md").strip():
        raise ValueError("build_map.md has local changes; reconcile with its writer first")
    if text.count(ANCHOR) != 1 or not text.startswith(ANCHOR):
        raise ValueError("Unrecognized opening; inspect the current map rather than guessing")
    updated = text.replace(ANCHOR, ANCHOR + ADDITION, 1).encode("utf-8")
    diff = "".join(difflib.unified_diff(text.splitlines(True),
                   updated.decode("utf-8").splitlines(True),
                   fromfile="a/build_map.md", tofile="b/build_map.md"))
    sys.stdout.write(diff)
    if not args.apply:
        print("Dry-run only. Re-run with --apply after coordinating with the board writer.")
        return 0
    lock = repo / ".spaceface-maturity-link.lock"
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temporary = None
    try:
        os.close(fd)
        if target.read_bytes() != original or git(repo, "status", "--porcelain", "--", "build_map.md").strip():
            raise ValueError("build_map.md changed during preparation; nothing written")
        mode = target.stat().st_mode & 0o777
        with tempfile.NamedTemporaryFile(dir=repo, prefix=".build-map-link-", delete=False) as f:
            temporary = Path(f.name)
            f.write(updated)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temporary, mode)
        if target.read_bytes() != original:
            raise ValueError("build_map.md changed before replacement; nothing written")
        os.replace(temporary, target)
        temporary = None
        print("Applied supporting link only. Inspect git diff and run the documented plan checks.")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink(missing_ok=True)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, UnicodeError, subprocess.CalledProcessError) as exc:
        print(f"Refused: {exc}", file=sys.stderr)
        raise SystemExit(2)
