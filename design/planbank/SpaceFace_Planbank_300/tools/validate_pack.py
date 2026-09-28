#!/usr/bin/env python3
"""Validate packet structure, local links, dependency references and optional source hashes."""
from __future__ import annotations
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

PACK = Path(__file__).resolve().parents[1]
REQUIRED = ['Chosen player-facing outcome', 'Why this direction, not the alternatives',
            'Verified source seams', 'Implementation sequence', 'Ownership and non-goals',
            'Scenario and acceptance cases', 'Capability dependencies and overlap', 'Finish and review']

def validate(repo: Path | None = None) -> dict:
    errors: list[str] = []
    data = json.loads((PACK / 'data/plans.json').read_text(encoding='utf-8'))
    plans = data['plans']
    manifest = json.loads((PACK / 'data/source-manifest.json').read_text(encoding='utf-8'))
    ids = [p['id'] for p in plans]
    expected = [f'SF-{n:03d}' for n in range(1,301)]
    if ids != expected:
        errors.append('IDs must be exactly SF-001 through SF-300 in order')
    if len({p['title'] for p in plans}) != len(plans):
        errors.append('Duplicate titles')
    if len({p['implementation'] for p in plans}) != len(plans):
        errors.append('Duplicate chosen implementation text')
    groups = Counter(p['group'] for p in plans)
    if len(groups) != 20 or set(groups.values()) != {15}:
        errors.append('Expected 20 groups with 15 packets each')
    indexed = {r['path']: r for r in manifest['files']}
    graph = {p['id']: [d['id'] for d in p['prerequisites']] for p in plans}
    for p in plans:
        target = PACK / p['path']
        if not target.is_file():
            errors.append('Missing packet: '+p['path']); continue
        text = target.read_text(encoding='utf-8')
        for heading in REQUIRED:
            if heading not in text:
                errors.append(p['id']+': missing '+heading)
        for field in ['decision','implementation','proof','alternatives']:
            if len(p[field].split()) < 8:
                errors.append(p['id']+': unexpectedly thin '+field)
        if 'PROPOSED' not in p['status']:
            errors.append(p['id']+': misleading status')
        for path in p['source_paths']+p['tests']:
            if path not in indexed:
                errors.append(p['id']+': source not indexed '+path)
        for dep in graph[p['id']]:
            if dep not in graph:
                errors.append(p['id']+': unknown dependency '+dep)
    visiting: set[str] = set(); done: set[str] = set()
    def visit(node: str) -> None:
        if node in visiting:
            errors.append('Dependency cycle at '+node); return
        if node in done or node not in graph: return
        visiting.add(node)
        for dep in graph[node]: visit(dep)
        visiting.remove(node); done.add(node)
    for node in graph: visit(node)
    local_links = 0
    markdown = sorted(PACK.rglob('*.md'))
    for path in markdown:
        text = path.read_text(encoding='utf-8')
        # Local file existence; fragments/external URLs intentionally not fetched.
        for raw in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', text):
            raw = raw.strip()
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:',raw) or raw.startswith('#'):
                continue
            relative = unquote(raw.split('#',1)[0])
            if not relative: continue
            candidate = (path.parent / relative).resolve()
            local_links += 1
            if not candidate.is_relative_to(PACK) or not candidate.exists():
                errors.append(f'Broken local link: {path.relative_to(PACK)} -> {raw}')
    checked_sources = 0
    if repo:
        root = repo.expanduser().resolve()
        for record in manifest['files']:
            p = root / record['path']
            checked_sources += 1
            if not p.exists():
                errors.append('Source missing: '+record['path'])
            elif record['kind']=='file' and hashlib.sha256(p.read_bytes()).hexdigest()!=record['sha256']:
                errors.append('Source differs from snapshot: '+record['path'])
    return {'ok':not errors,'plans':len(plans),'domains':len(groups),'markdown_files':len(markdown),
            'local_links_checked':local_links,'indexed_source_paths':len(indexed),
            'source_paths_checked_against_repo':checked_sources,'dependency_edges':sum(map(len,graph.values())),
            'errors':errors}

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',type=Path,help='Optional exact planning snapshot for source-hash validation; use drift tool for a changed checkout')
    args=parser.parse_args()
    try:
        result=validate(args.repo)
        print(json.dumps(result,indent=2))
        return 0 if result['ok'] else 1
    except (OSError,ValueError,KeyError,json.JSONDecodeError) as exc:
        print(f'Validation could not run: {exc}',file=sys.stderr);return 2
if __name__=='__main__':
    raise SystemExit(main())
