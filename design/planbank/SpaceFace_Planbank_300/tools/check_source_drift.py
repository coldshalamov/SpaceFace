#!/usr/bin/env python3
"""Read-only comparison of source hashes. Drift is information, not a reset instruction."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import sys

PACK = Path(__file__).resolve().parents[1]

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True, help='Current SpaceFace checkout')
    parser.add_argument('--task', help='Limit to one packet and core authority paths')
    parser.add_argument('--json', action='store_true', dest='as_json')
    args = parser.parse_args()
    try:
        root = args.repo.expanduser().resolve()
        if not root.is_dir():
            parser.error('Repository directory does not exist')
        manifest = json.loads((PACK / 'data/source-manifest.json').read_text(encoding='utf-8'))
        wanted = None
        if args.task:
            plans = json.loads((PACK / 'data/plans.json').read_text(encoding='utf-8'))['plans']
            task = next((t for t in plans if t['id'] == args.task.upper()), None)
            if task is None:
                parser.error('Unknown packet ID')
            wanted = set(task['source_paths'] + task['tests'] + manifest['core_authority_paths'])
        rows = []
        for record in manifest['files']:
            path = record['path']
            if wanted is not None and path not in wanted:
                continue
            candidate = (root / path).resolve()
            if not candidate.is_relative_to(root):
                status = 'outside-checkout'
            elif not candidate.exists():
                status = 'missing-or-moved'
            elif record['kind'] == 'directory':
                status = 'directory-present' if candidate.is_dir() else 'type-changed'
            elif not candidate.is_file():
                status = 'type-changed'
            else:
                digest = hashlib.sha256(candidate.read_bytes()).hexdigest()
                status = 'unchanged' if digest == record['sha256'] else 'changed'
            rows.append({'path': path, 'status': status})
        output = {'base_commit': manifest['base_commit'], 'scope': args.task or 'all indexed paths',
                  'note': 'Changed/missing paths require reading current owners; never reset to the plan baseline.',
                  'results': rows}
        if args.as_json:
            print(json.dumps(output, indent=2))
        else:
            print('Baseline:', output['base_commit'])
            for row in rows:
                print(f'{row["status"]:20s} {row["path"]}')
            print(output['note'])
        return 0  # Drift is expected in an active repo; the tool is not an execution gate.
    except (OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f'Cannot compare source: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
