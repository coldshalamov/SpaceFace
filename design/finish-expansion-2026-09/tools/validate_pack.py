#!/usr/bin/env python3
"""Validate this supporting document pack; never mutate or execute SpaceFace.

Run from any directory. Optional --repo is a read-only path existence advisory,
not a source audit, feature test, CLI execution or native queue import.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit


def validate(root: Path, repo: Path | None = None) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    try:
        data = json.loads((root / 'catalog/task_catalog.json').read_text(encoding='utf-8'))
        sources = json.loads((root / 'audit/source_manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        return {'ok': False, 'errors': [f'Cannot read catalog: {exc}'], 'warnings': []}
    sections = ['programs','build_tasks','inference_tasks','missions','model_briefs','effect_audio_briefs']
    records = [r for key in sections for r in data.get(key, [])]
    counts = {key: len(data.get(key, [])) for key in sections}
    ids = [r.get('id') for r in records]
    for item, count in Counter(ids).items():
        if not item or count != 1:
            errors.append(f'Invalid or duplicate ID: {item!r} ({count})')
    tasks = data.get('build_tasks', []) + data.get('inference_tasks', [])
    by_id = {t['id']: t for t in tasks}
    program_ids = {p['id'] for p in data.get('programs', [])}
    source_ids = {s['id'] for s in sources}
    mission_ids = {m['id'] for m in data.get('missions', [])}
    asset_ids = {a['id'] for a in data.get('model_briefs', [])}
    effect_ids = {f['id'] for f in data.get('effect_audio_briefs', [])}
    for task in tasks:
        tid = task['id']
        if task.get('candidate_state') != 'NOT_ADMITTED':
            errors.append(f'{tid}: static candidate must not claim native admission/completion')
        if task.get('program_id') not in program_ids:
            errors.append(f'{tid}: unknown program')
        if not (root / task.get('document','__missing__')).is_file():
            errors.append(f'{tid}: missing document')
        for sid in task.get('source_refs', []):
            if sid not in source_ids:
                errors.append(f'{tid}: unknown source {sid}')
        for dependency in task.get('depends_on', []):
            if dependency not in by_id:
                errors.append(f'{tid}: unknown dependency {dependency}')
        for mid in task.get('mission_refs', []):
            if mid not in mission_ids:
                errors.append(f'{tid}: unknown mission {mid}')
        required = ['title','acceptance','refusal','implementation','outcome'] if task.get('kind') == 'build' else ['title','change','acceptance','refusal']
        for key in required:
            if not isinstance(task.get(key), str) or not task[key].strip():
                errors.append(f'{tid}: missing substantive field {key}')
    # Depth-first dependency validation, including forward references.
    visiting: set[str] = set()
    visited: set[str] = set()
    order: list[str] = []
    def visit(tid: str, path: list[str]) -> None:
        if tid in visiting:
            errors.append('Dependency cycle: ' + ' -> '.join(path + [tid])); return
        if tid in visited or tid not in by_id: return
        visiting.add(tid)
        for dep in by_id[tid].get('depends_on', []): visit(dep, path + [tid])
        visiting.remove(tid); visited.add(tid); order.append(tid)
    for tid in by_id: visit(tid, [])
    for m in data.get('missions', []):
        for key in ['geometry','hook','phases','solutions','failure','reward','state','tests']:
            if not m.get(key): errors.append(f"{m['id']}: missing {key}")
        for aid in m.get('assets', []):
            if aid not in asset_ids: errors.append(f"{m['id']}: missing asset {aid}")
        for fid in m.get('fx', []):
            if fid not in effect_ids: errors.append(f"{m['id']}: missing effect {fid}")
        for pi in m.get('programs', []):
            if f'SFQ-P{pi:02d}' not in program_ids: errors.append(f"{m['id']}: missing program {pi}")
    for group,folder in [('missions','missions'),('model_briefs','assets'),('effect_audio_briefs','effects')]:
        for r in data.get(group, []):
            if not (root/folder/f"{r['id']}.md").is_file(): errors.append(f"Missing content document {r['id']}")
    # Relative Markdown destination checks; ignore fragments and code fences.
    link_count = 0
    for path in root.rglob('*.md'):
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'```.*?```', '', text, flags=re.S)
        for raw in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            raw = raw.strip().split(' "',1)[0].strip('<>')
            if not raw or raw.startswith('#'): continue
            parsed = urlsplit(raw)
            if parsed.scheme or parsed.netloc: continue
            dest = unquote(parsed.path)
            if not dest: continue
            link_count += 1
            target = (path.parent/dest).resolve()
            try: target.relative_to(root.resolve())
            except ValueError:
                errors.append(f'Link escapes pack: {path.relative_to(root)} -> {raw}'); continue
            if not target.exists(): errors.append(f'Broken relative link: {path.relative_to(root)} -> {raw}')
    if not (root/'prompts/BOOT_AGENT.txt').is_file(): errors.append('Missing boot prompt')
    if not (root/'INDEX.html').is_file(): errors.append('Missing offline navigator')
    forbidden = {'.ttf','.otf','.woff','.woff2'}
    fonts = [str(p.relative_to(root)) for p in root.rglob('*') if p.suffix.lower() in forbidden]
    if fonts: errors.append('Unexpected font files: '+', '.join(fonts))
    repo_report = None
    candidate_paths = sorted({p for t in tasks for p in t.get('candidate_paths', [])})
    if repo is not None:
        repo = repo.expanduser().resolve()
        if not repo.is_dir():
            errors.append(f'--repo is not a directory: {repo}')
        else:
            found, missing = [], []
            for rel in candidate_paths:
                target = (repo/rel).resolve()
                try: target.relative_to(repo)
                except ValueError:
                    errors.append(f'Candidate path escapes repo: {rel}'); continue
                (found if target.exists() else missing).append(rel)
            repo_report={'root':str(repo),'exists':found,'missing_or_renamed':missing,
                         'note':'Advisory existence only. Resolve exact current selected owner; do not create absent paths blindly.'}
            if missing: warnings.append(f'{len(missing)} candidate paths are absent/renamed in the supplied checkout; these are not necessarily missing features.')
    warnings.extend([
        'No SpaceFace runtime, renderer, audio, performance or gameplay tests were executed by this validator.',
        'Candidate path existence and source pins do not establish current owner selection or implemented quality.',
        'Optional and parked candidates do not automatically extend the finished-game scope.'
    ])
    result={'ok':not errors,'validation_scope':'document handoff integrity only','counts':counts,
            'relative_links_checked':link_count,'dependency_nodes':len(by_id),
            'dependency_edges':sum(len(t.get('depends_on',[])) for t in tasks),
            'topological_order':order,'candidate_owner_paths':len(candidate_paths),
            'markdown_documents':len(list(root.rglob('*.md'))),
            'errors':errors,'warnings':warnings,'repo_advisory':repo_report}
    return result


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, help='Optional read-only SpaceFace checkout path advisory')
    args=parser.parse_args()
    root=Path(__file__).resolve().parents[1]
    result=validate(root,args.repo)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['ok'] else 1

if __name__=='__main__':
    raise SystemExit(main())
