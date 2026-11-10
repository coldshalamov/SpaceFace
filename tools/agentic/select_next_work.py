#!/usr/bin/env python3
"""Thin operator entrypoint for Central Brain work selection.

This intentionally delegates to manager_cycle instead of maintaining another readiness model.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from manager_cycle import build_candidates, find_root, prompt_for


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument("--scope", default=None)
    ap.add_argument("--format", choices=("id", "json", "prompt"), default="id")
    args = ap.parse_args()

    root = find_root(Path(args.root))
    candidates = build_candidates(root, args.scope)
    if not candidates:
        if args.format == "json":
            print(json.dumps({"selected": None, "reason": "no dependency-ready unit matched"}, indent=2))
        else:
            print("NO_READY_MATCH")
        raise SystemExit(2)

    selected = candidates[0]
    if args.format == "id":
        print(selected.id)
    elif args.format == "prompt":
        print(prompt_for(selected))
    else:
        print(json.dumps({"selected": asdict(selected), "rankedCount": len(candidates)}, indent=2))


if __name__ == "__main__":
    main()
