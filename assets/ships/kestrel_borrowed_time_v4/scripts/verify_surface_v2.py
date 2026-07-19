"""Fast deterministic/semantic verification for the Kestrel surface generator."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from surface_maps_v2 import PROFILES, REMASTER_ID, generate_maps


def digest(maps: dict) -> str:
    value = hashlib.sha256()
    for channel in ("basecolor", "orm", "normal"):
        value.update(maps[channel].tobytes(order="C"))
    return value.hexdigest()


def main() -> int:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    rows = []
    for role, profile in PROFILES.items():
        first = generate_maps(role, 192, 192)
        second = generate_maps(role, 192, 192)
        first_hash = digest(first)
        second_hash = digest(second)
        if first_hash != second_hash:
            raise RuntimeError(f"nondeterministic surface maps for {role}")
        orm = first["orm"][:, :, :3]
        normal = first["normal"][:, :, :3]
        roughness = float(orm[:, :, 1].mean())
        metallic = float(orm[:, :, 2].mean())
        normal_z = float(normal[:, :, 2].mean())
        if abs(roughness - profile.roughness) > 0.012:
            raise RuntimeError(f"{role} roughness drift: {roughness}")
        if abs(metallic - profile.metallic) > 0.012:
            raise RuntimeError(f"{role} metallic drift: {metallic}")
        if normal_z < 0.97:
            raise RuntimeError(f"{role} normal field is too strong: z={normal_z}")
        rows.append({
            "role": role,
            "sha256": first_hash,
            "roughnessMean": roughness,
            "metallicMean": metallic,
            "normalZMean": normal_z,
        })
    payload = {"schema": "spaceface.kestrelSurfaceVerify.v2", "remasterId": REMASTER_ID, "roles": rows}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("KESTREL_SURFACE_VERIFY=" + json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
