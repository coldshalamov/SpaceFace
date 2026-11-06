"""Shared selection policy for the agent-code-packet workflow.

Used by:
  - .github/workflows/agent-code-packet.yml (after hydrating this one blob)
  - scripts/check-agent-code-packet-selection.mjs (local / CI size gate)

Ceiling is fixed at 256 MiB of selected tracked source. Tighten the deny lists
below when selected source grows; do not raise MAX_SOURCE_BYTES.
"""
from __future__ import annotations

import json
import pathlib
import sys
from typing import Iterable

# 8 MiB per tracked file; 256 MiB raw selected-source ceiling.
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_SOURCE_BYTES = 256 * 1024 * 1024

# Deliberately omit heavyweight/renderable media. Textual asset manifests and
# metadata remain eligible, including files under assets/, so code can still be
# reasoned about.
DENIED_EXT = {
    # 3D / DCC / geometry
    '.glb', '.gltf', '.fbx', '.obj', '.blend', '.blend1', '.dae', '.3ds',
    '.ply', '.stl', '.usd', '.usda', '.usdc', '.usdz',
    # textures / raster images / GPU texture containers
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tga', '.tif',
    '.tiff', '.dds', '.ktx', '.ktx2', '.hdr', '.exr', '.ico', '.icns',
    # audio / video
    '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.mp4', '.mov',
    '.webm', '.mkv', '.avi',
    # archives, binary payloads, native/runtime binaries and fonts
    '.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz', '.zst',
    '.bin', '.exe', '.dll', '.so', '.dylib', '.node', '.wasm',
    '.ttf', '.otf', '.woff', '.woff2', '.pdf',
    # generated run artifacts (CPU profiles, build/run logs)
    '.cpuprofile', '.log',
}

# Generated artifact/evidence lanes inside otherwise-eligible trees.
# Coordination files beside them stay when the segment is narrower than the tree.
DENIED_SEGMENTS = (
    ('design/program/vm-drop/', '/artifacts/'),
    ('design/genie-returns/', '/evidence/'),
)

# Whole subtrees that are archives, probe dumps, review preimages, or other
# generated bulk — not the engineering surface an agent reasons over.
DENIED_PREFIXES = (
    'artifacts/',
    'design/archive/',
    'design/program/vm-drop/',
    'review/',
    'wave121-reports/',
    '.devshots/',
)

SELECTION_POLICY = (
    'all tracked blobs <= 8 MiB except heavyweight/binary media extensions, '
    'generated run-artifact/evidence lanes, archive/probe/review bulk prefixes, '
    'and generated localization catalogs'
)


def is_generated_localization_catalog(path: str) -> bool:
    return path.startswith('src/localization/catalogs/') and '.generated.' in path


def classify(path: str, size: int) -> str | None:
    """Return an omission reason, or None when the blob stays selected."""
    suffix = pathlib.PurePosixPath(path).suffix.lower()
    if suffix in DENIED_EXT:
        return 'heavy-or-binary-extension'
    if size > MAX_FILE_BYTES:
        return 'file-over-8MiB'
    if any(path.startswith(prefix) for prefix in DENIED_PREFIXES):
        return 'archive-or-generated-bulk'
    if any(path.startswith(prefix) and segment in path
           for prefix, segment in DENIED_SEGMENTS):
        return 'generated-run-artifact'
    if is_generated_localization_catalog(path):
        return 'generated-localization-catalog'
    return None


def select_from_tree_items(items: Iterable[dict]) -> dict:
    selected: list[str] = []
    omitted: list[tuple[str, int, str]] = []
    selected_bytes = 0
    omitted_bytes = 0
    for item in items:
        if item.get('type') != 'blob':
            continue
        path = item['path']
        size = int(item.get('size') or 0)
        reason = classify(path, size)
        if reason:
            omitted.append((path, size, reason))
            omitted_bytes += size
        else:
            selected.append(path)
            selected_bytes += size
    return {
        'selected': selected,
        'omitted': omitted,
        'selected_bytes': selected_bytes,
        'omitted_bytes': omitted_bytes,
        'max_file_bytes': MAX_FILE_BYTES,
        'max_source_bytes': MAX_SOURCE_BYTES,
        'selection_policy': SELECTION_POLICY,
    }


def select_from_github_tree(tree: dict) -> dict:
    if tree.get('truncated'):
        raise SystemExit(
            'GitHub recursive tree response was truncated; fail closed rather than '
            'publish an incomplete packet that an agent could mistake for the repository.'
        )
    return select_from_tree_items(tree.get('tree', []))


def select_from_git_ls_tree(lines: Iterable[str]) -> dict:
    """Parse `git ls-tree -r -l <ref>` output."""
    items = []
    for line in lines:
        line = line.rstrip('\n')
        if not line:
            continue
        # <mode> <type> <object> <size>\t<path>
        meta, path = line.split('\t', 1)
        parts = meta.split()
        if len(parts) < 4 or parts[1] != 'blob':
            continue
        items.append({'type': 'blob', 'path': path, 'size': int(parts[3])})
    return select_from_tree_items(items)


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == '--tree-json':
        tree = json.loads(pathlib.Path(argv[2]).read_text(encoding='utf-8'))
        result = select_from_github_tree(tree)
    elif len(argv) >= 2 and argv[1] == '--git-ls-tree':
        # Read ls-tree lines from stdin.
        result = select_from_git_ls_tree(sys.stdin)
    else:
        print(
            'usage: agent_code_packet_selection.py --tree-json FILE | '
            '--git-ls-tree < ls-tree.txt',
            file=sys.stderr,
        )
        return 2

    selected_bytes = result['selected_bytes']
    ceiling = result['max_source_bytes']
    print(
        f"selected_files={len(result['selected'])} "
        f"selected_bytes={selected_bytes} "
        f"selected_mib={selected_bytes / 1024 / 1024:.1f} "
        f"ceiling_bytes={ceiling} "
        f"margin_bytes={ceiling - selected_bytes} "
        f"omitted_files={len(result['omitted'])} "
        f"omitted_bytes={result['omitted_bytes']}"
    )
    if selected_bytes > ceiling:
        print(
            f"FAIL: selected source is {selected_bytes} bytes, above the "
            f"{ceiling}-byte agent-packet ceiling; tighten the policy rather "
            f"than publishing a huge artifact",
            file=sys.stderr,
        )
        return 1
    print('PASS: selected source fits under the agent-packet ceiling')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
