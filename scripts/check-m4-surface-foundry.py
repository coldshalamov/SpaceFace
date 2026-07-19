#!/usr/bin/env python3
"""Focused deterministic/semantic checks for the Helios golden-surface generator."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from assets.ships.m4_helios_hub.scripts.surface_remaster_v2 import PROFILES, generate_maps  # noqa: E402
from tools.art.build_m4_surface_maps import repository_path  # noqa: E402


def digest(maps: dict[str, np.ndarray]) -> str:
    value = hashlib.sha256()
    for channel in sorted(maps):
        value.update(channel.encode("ascii"))
        value.update(maps[channel].astype("<f4", copy=False).tobytes())
    return value.hexdigest().upper()


def file_digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def verify_live_receipt() -> dict:
    receipt_path = ROOT / "assets/ships/m4_helios_hub/textures/surface-map-build.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert receipt["schema"] == "spaceface.m4SurfaceMapBuild.v1"
    assert receipt["roles"] == list(PROFILES), "live surface receipt must cover every authored role"
    for artifact in receipt["artifacts"]:
        portable = artifact["path"]
        assert not Path(portable).is_absolute() and "\\" not in portable and ":" not in portable
        target = receipt_path.parent / portable
        assert target.is_file(), f"missing live surface artifact: {target}"
        assert file_digest(target) == artifact["sha256"], f"stale live surface artifact: {target}"
    for source in receipt["sourceProvenance"]:
        portable = source["path"]
        assert portable.startswith("assets/") and "\\" not in portable and ":" not in portable
        target = ROOT / portable
        assert target.is_file(), f"missing surface provenance input: {target}"
        assert file_digest(target) == source["sha256"], f"surface provenance changed: {target}"
    return {
        "path": receipt_path.relative_to(ROOT).as_posix(),
        "artifacts": len(receipt["artifacts"]),
        "sources": len(receipt["sourceProvenance"]),
    }


def main() -> None:
    portable_reference = repository_path(
        ROOT / "assets/third_party/helios_v8/ambientcg/Rock023/Rock023_1K-JPG_Color.jpg"
    )
    assert portable_reference.startswith("assets/third_party/"), portable_reference
    assert "\\" not in portable_reference and ":" not in portable_reference
    report = {
        "schema": "spaceface.m4SurfaceFoundryCheck.v1",
        "liveReceipt": verify_live_receipt(),
        "roles": {},
    }
    assert "structure_light" in PROFILES, "Helios donor trim still lacks a dedicated coated structural role"
    for role in PROFILES:
        first = generate_maps(role, 256, 256)
        second = generate_maps(role, 256, 256)
        assert digest(first) == digest(second), f"{role}: nondeterministic output"
        assert set(first) == {"basecolor", "normal", "orm"}
        for channel, pixels in first.items():
            assert pixels.shape == (256, 256, 4), f"{role}/{channel}: wrong shape"
            assert np.isfinite(pixels).all(), f"{role}/{channel}: non-finite values"
            assert float(np.min(pixels)) >= 0.0 and float(np.max(pixels)) <= 1.0
        roughness_std = float(np.std(first["orm"][:, :, 1]))
        normal_std = float(np.std(first["normal"][:, :, :2]))
        albedo_std = float(np.std(first["basecolor"][:, :, :3]))
        assert roughness_std > 0.018, f"{role}: effectively constant roughness"
        assert normal_std > 0.0015, f"{role}: effectively flat normal"
        assert albedo_std > 0.004, f"{role}: effectively flat base color"
        report["roles"][role] = {
            "sha256": digest(first),
            "albedoStd": albedo_std,
            "roughnessStd": roughness_std,
            "normalXyStd": normal_std,
            "aoMin": float(np.min(first["orm"][:, :, 0])),
            "roughnessMean": float(np.mean(first["orm"][:, :, 1])),
            "metallicMean": float(np.mean(first["orm"][:, :, 2])),
        }

    assert report["roles"]["rock"]["roughnessMean"] > report["roles"]["mechanical"]["roughnessMean"] + 0.25
    assert report["roles"]["mechanical"]["metallicMean"] > report["roles"]["hull"]["metallicMean"] + 0.35
    assert report["roles"]["structure_light"]["metallicMean"] < 0.12, "light station skin must remain coated, not raw metal"
    assert 0.48 < report["roles"]["structure_light"]["roughnessMean"] < 0.76
    assert report["roles"]["structure_light"]["albedoStd"] > 0.006, "light structural coating still reads as flat white plastic"
    assert report["roles"]["warm"]["metallicMean"] > report["roles"]["rock"]["metallicMean"] + 0.20
    assert report["roles"]["rock"]["aoMin"] < 0.80, "rock fractures are not represented in AO"
    print(json.dumps({"ok": True, **report}, indent=2))


if __name__ == "__main__":
    main()
