#!/usr/bin/env python3
"""Assemble selected planbank text. No network, model call, repo mutation or dispatch."""
from __future__ import annotations
import argparse
import json
import os
import re
from urllib.parse import unquote
from pathlib import Path
import sys

PACK = Path(__file__).resolve().parents[1]
LINK_BASE = Path.cwd().resolve()
PROMPTS = {'execute': 'EXECUTOR.md', 'review': 'STRONG_BATCH_REVIEW.md', 'integrate': 'INTEGRATOR.md'}

def load_text(relative: str) -> str:
    path = (PACK / relative).resolve()
    if not path.is_relative_to(PACK):
        raise ValueError('Refusing a path outside this pack')
    text = path.read_text(encoding='utf-8')
    if path.suffix == '.md':
        def rebase(match: re.Match[str]) -> str:
            label, raw = match.group(1), match.group(2)
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',raw) or raw.startswith('#'):
                return match.group(0)
            target, sep, fragment = raw.partition('#')
            resolved = (path.parent / unquote(target)).resolve()
            if not resolved.is_relative_to(PACK):
                return match.group(0)
            destination = os.path.relpath(resolved, LINK_BASE).replace(os.sep, '/')
            if sep: destination += '#' + fragment
            return f'[{label}]({destination})'
        text = re.sub(r'\[([^\]\n]*)\]\(([^)\n]+)\)', rebase, text)
        text = f'<!-- Source in pack: {relative} -->\n' + text
    return text

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tasks', nargs='+', help='One to five packet IDs, such as SF-136')
    parser.add_argument('--mode', choices=PROMPTS, default='execute')
    parser.add_argument('--output', type=Path, help='Write a new brief file; otherwise print to stdout')
    args = parser.parse_args()
    global LINK_BASE
    LINK_BASE = args.output.expanduser().resolve().parent if args.output else Path.cwd().resolve()
    if len(args.tasks) > 5:
        parser.error('Choose at most five packets. The whole bank is not an execution brief.')
    try:
        data = json.loads(load_text('data/plans.json'))
        plans = {row['id']: row for row in data['plans']}
        domains = {row['key']: row for row in data['domains']}
        ids = list(dict.fromkeys(f'SF-{int(x):03d}' if x.isdigit() else x.upper() for x in args.tasks))
        missing = [x for x in ids if x not in plans]
        if missing:
            parser.error('Unknown packet ID: ' + ', '.join(missing))
        sections = [f'# SpaceFace prepared brief — {", ".join(ids)}\n\nMode: {args.mode}. '
                    f'Baseline: {data["base_commit"]}. Current source and owner direction win.\n\n'
                    'Local Markdown links are rebased to this output location; keep the pack available alongside this brief. '
                    'This text does not claim, dispatch or implement any work.',
                    load_text('prompts/' + PROMPTS[args.mode]), load_text('EXECUTION_CONTRACT.md')]
        included_domains: set[str] = set()
        included_deep: set[str] = set()
        for task_id in ids:
            plan = plans[task_id]
            key = plan['group']
            if key not in included_domains:
                sections.append(load_text(domains[key]['guide_path']))
                included_domains.add(key)
            sections.append(load_text(plan['path']))
            # Deep-dive links are explicit in the packet, not inferred from its title.
            original_packet = (PACK / plan['path']).read_text(encoding='utf-8')
            for target in re.findall(r'\[deep dive\]\(([^)]+)\)', original_packet):
                path = (PACK / plan['path']).parent / target
                relative = str(path.resolve().relative_to(PACK))
                if relative not in included_deep:
                    sections.append(load_text(relative))
                    included_deep.add(relative)
        brief = '\n\n---\n\n'.join(s.strip() for s in sections) + '\n'
        if args.output:
            target = args.output.expanduser().resolve()
            if target.exists():
                parser.error(f'Refusing to overwrite existing file: {target}')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('x', encoding='utf-8') as stream:
                stream.write(brief)
            print(f'Wrote {target} ({len(ids)} packet(s); no repository changes).')
        else:
            sys.stdout.write(brief)
        return 0
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f'Cannot compile brief: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
