"""Relink byte-identical packed textures to a repository texture directory.

Usage:
  blender --background --python tools/blender/externalize_packed_textures.py -- \
    INPUT.blend TEXTURE_DIR OUTPUT.blend

The command refuses to externalize an image unless ``TEXTURE_DIR/<image-name>.png`` is byte-for-byte
identical to the packed payload. The source file is never overwritten, and the destination is
atomically promoted only after a successful compressed save.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import bpy


def script_args() -> list[str]:
    try:
        separator = sys.argv.index("--")
    except ValueError as exc:
        raise SystemExit("expected -- INPUT.blend TEXTURE_DIR OUTPUT.blend") from exc
    return sys.argv[separator + 1 :]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest().upper()


def main() -> None:
    args = script_args()
    if len(args) != 3:
        raise SystemExit("expected exactly INPUT.blend, TEXTURE_DIR, and OUTPUT.blend")

    source = Path(args[0]).resolve()
    texture_dir = Path(args[1]).resolve()
    destination = Path(args[2]).resolve()
    if not source.is_file():
        raise SystemExit(f"input Blend does not exist: {source}")
    if not texture_dir.is_dir():
        raise SystemExit(f"texture directory does not exist: {texture_dir}")
    if source == destination:
        raise SystemExit("input and output must be different paths")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp.blend")
    temporary.unlink(missing_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False)
    relinked: list[dict[str, object]] = []
    for image in sorted(bpy.data.images, key=lambda item: item.name):
        packed = image.packed_file
        if packed is None:
            continue
        candidate = texture_dir / f"{image.name}.png"
        if not candidate.is_file():
            raise RuntimeError(f"packed image has no external source candidate: {image.name}")

        packed_bytes = bytes(packed.data)
        external_bytes = candidate.read_bytes()
        packed_hash = sha256(packed_bytes)
        external_hash = sha256(external_bytes)
        if packed_hash != external_hash:
            raise RuntimeError(
                f"packed image differs from external candidate: {image.name} "
                f"({packed_hash} != {external_hash})"
            )

        # Reload from the verified absolute source. unpack(REMOVE) may rewrite filepath based on
        # the input Blend, so assign the verified path again after removing the packed payload.
        image.filepath = str(candidate)
        image.unpack(method="REMOVE")
        image.filepath = str(candidate)
        image.reload()
        relinked.append({
            "image": image.name,
            "source": str(candidate),
            "bytes": len(external_bytes),
            "sha256": external_hash,
        })

    if not relinked:
        raise RuntimeError("input Blend contained no packed textures to externalize")

    result = bpy.ops.wm.save_as_mainfile(
        filepath=str(temporary),
        check_existing=False,
        compress=True,
    )
    if "FINISHED" not in result or not temporary.is_file():
        raise RuntimeError(f"Blender did not produce the externalized copy: {result}")

    # save_as_mainfile changes Blender's current file to the temporary output. Only now write
    # portable // paths, so Blender resolves and stores them relative to the file being promoted.
    for entry in relinked:
        image = bpy.data.images[entry["image"]]
        candidate = Path(entry["source"])
        relative = os.path.relpath(candidate, temporary.parent).replace(os.sep, "/")
        image.filepath = f"//{relative}"
        image.reload()
        entry["path"] = image.filepath
        del entry["source"]
    result = bpy.ops.wm.save_as_mainfile(
        filepath=str(temporary),
        check_existing=False,
        compress=True,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"Blender did not persist portable texture paths: {result}")

    os.replace(temporary, destination)
    print(json.dumps({
        "schema": "spaceface.externalizedBlend.v1",
        "source": str(source),
        "destination": str(destination),
        "destinationBytes": destination.stat().st_size,
        "relinked": relinked,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
