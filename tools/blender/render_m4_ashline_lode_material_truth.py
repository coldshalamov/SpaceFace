#!/usr/bin/env python3
"""Render exact-source Ashline Lode material-truth evidence.

The Dart renderer remains immutable because its hash is part of already accepted offline evidence.
This ship-specific producer imports that renderer's neutral-light utilities, then binds a distinct
Lode receipt to the exact finalized source GLB. It never touches live Ashline assets or manifests.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
from typing import Any

import bpy


ROOT = Path(__file__).resolve().parents[2]
FAMILY = ROOT / "assets" / "ships" / "m4_ashline_v2"
BASE_RENDERER = ROOT / "tools" / "blender" / "render_m4_ashline_material_truth.py"
TOOL_RELATIVE = "tools/blender/render_m4_ashline_lode_material_truth.py"
SCHEMA = "spaceface.ashlineMaterialTruthArtifacts.v1"
SHIP_KEY = "lode"
SHIP_ID = "ashline_v2_lode"
LAST_RESULT: dict[str, Any] = {}
ARTIFACT_NAMES = (
    "neutral_front34.png",
    "neutral_rear34.png",
    "casemate_close.png",
    "breech_recoil_close.png",
    "torch_close.png",
    "hard_grazing.png",
    "top_ortho.png",
    "emission_off.png",
    "game_120px.png",
    "game_45px.png",
)


def load_base_renderer():
    spec = importlib.util.spec_from_file_location("spaceface_ashline_dart_renderer", BASE_RENDERER)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {BASE_RENDERER}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load_base_renderer()


def sha256(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            value.update(chunk)
    return value.hexdigest().upper()


def relative(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def set_material_emission(enabled: bool) -> None:
    for material in bpy.data.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            strength = node.inputs.get("Emission Strength")
            if strength is not None:
                if "_sf_evidence_emission" not in node:
                    node["_sf_evidence_emission"] = float(strength.default_value)
                strength.default_value = (
                    float(node["_sf_evidence_emission"]) if enabled else 0.0
                )


def render_lode(source: Path, output_dir: Path) -> list[Path]:
    base.clear_scene()
    base.import_exact_lod0(source)
    camera = base.configure_scene()
    # A dedicated neutral service light exposes the dark steel machinery bay without changing the
    # accepted Dart renderer. It is disabled for beauty/game-scale frames and never substitutes for
    # the hard-grazing pass.
    base.add_area(
        "LODE_SERVICE_BAY",
        (7.5, 12.0, 2.8),
        (4.1, 3.55, -0.1),
        0,
        4.0,
        (0.82, 0.90, 1.0),
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    views = [
        ("neutral_front34.png", (31, -25, 17), (0, 0, 0), 66, (1280, 720), None, False),
        ("neutral_rear34.png", (-29, -23, 14), (-1, 0, 0), 66, (1280, 720), None, False),
        ("casemate_close.png", (11.5, 13.5, 3.4), (4.3, 3.55, -0.12), 76, (1280, 720), None, True),
        ("breech_recoil_close.png", (11.0, 9.0, 1.55), (4.6, 3.55, -0.16), 80, (1280, 720), None, True),
        ("torch_close.png", (-18, -12, 7), (-10.3, 0, 0), 78, (1280, 720), None, True),
        ("hard_grazing.png", (11.5, 7.0, 0.65), (4.8, 3.55, -0.16), 84, (1280, 720), None, True),
        ("top_ortho.png", (0, 0, 34), (0, 0, 0), 50, (1280, 720), 29.0, False),
        ("emission_off.png", (-18, -10, 5.5), (-10.4, 0, 0), 82, (1280, 720), None, True),
        ("game_120px.png", (31, -25, 17), (0, 0, 0), 66, (120, 120), None, False),
        ("game_45px.png", (31, -25, 17), (0, 0, 0), 66, (45, 45), None, False),
    ]
    written = []
    for name, location, target, lens, size, ortho_scale, neutral_detail_light in views:
        detail = bpy.data.objects.get("ASHLINE_DETAIL")
        service = bpy.data.objects.get("LODE_SERVICE_BAY")
        if detail is not None and neutral_detail_light:
            detail.location = (
                (target[0] + location[0]) * 0.5,
                (target[1] + location[1]) * 0.5,
                max(target[2], location[2]) + 1.5,
            )
            base.point_at(detail, target)
        if service is not None:
            service.data.energy = 1750 if neutral_detail_light else 0
            service.location = (
                (target[0] + location[0]) * 0.45,
                (target[1] + location[1]) * 0.62,
                max(target[2], location[2]) + 1.1,
            )
            base.point_at(service, target)
        set_material_emission(name != "emission_off.png")
        output = output_dir / name
        base.render_view(
            camera,
            output,
            location=location,
            target=target,
            lens=lens,
            size=size,
            ortho_scale=ortho_scale,
            neutral_detail_light=neutral_detail_light,
        )
        written.append(output)
    set_material_emission(True)
    return written


def main() -> int:
    global LAST_RESULT
    source = FAMILY / "source" / "wholeships" / f"{SHIP_ID}.glb"
    output_dir = FAMILY / "evidence" / "material_truth_v2" / SHIP_KEY
    if not source.exists():
        raise FileNotFoundError(source)
    written = render_lode(source, output_dir)

    source_hash = sha256(source)
    producer = {"path": TOOL_RELATIVE, "sha256": sha256(ROOT / TOOL_RELATIVE)}
    artifacts = [
        {
            "path": relative(path),
            "inputBindings": [{"shipKey": SHIP_KEY, "sourceSha256": source_hash}],
            "producer": producer,
        }
        for path in written
    ]
    receipt = {
        "schema": SCHEMA,
        "shipKey": SHIP_KEY,
        "source": relative(source),
        "sourceSha256": source_hash,
        "producer": producer,
        "artifacts": artifacts,
    }
    receipt_path = (
        FAMILY / "evidence" / "material_truth_v2" / "eligible_artifacts_lode.json"
    )
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    LAST_RESULT = {
        "status": "complete",
        "shipKey": SHIP_KEY,
        "sourceSha256": source_hash,
        "producerSha256": producer["sha256"],
        "artifacts": [relative(path) for path in written],
        "receipt": relative(receipt_path),
    }
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
