"""Replay the Kestrel V6 material-truth pass from the exact promoted V5 production blend.

The original Revamp ZIP remains the deep-source route owned by build_v4.py. This incremental builder
exists because the exact promoted production blend is already a tracked editable authoring source.
It verifies that immutable baseline before applying V6, then writes isolated production/source
candidates. It never overwrites the accepted source, live, release, or manifest family.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_v4 import (  # noqa: E402
    REQUIRED_SOCKETS,
    RIG_NAMES,
    create_lod,
    ensure_decal_pbr_roles,
    enforce_socket_contract,
    export_lod,
    remove_collection,
    sha256,
    visible_bounds,
)
from material_truth_v6 import PASS_ID, apply_material_truth_v6  # noqa: E402
from surface_maps_v2 import (  # noqa: E402
    PROFILES,
    REMASTER_ID,
    apply_to_blender_images,
)


FAMILY = Path(__file__).resolve().parents[1]
DEFAULT_BASELINE = FAMILY / "blender" / "kestrel_borrowed_time_v4_production.blend"
EXPECTED_BASELINE_SHA256 = "CE830C5D6FA50902DC9A9C629C95378698168F24844C5938218E58793E1B1CD4"
PACKET = "SF-K0-BORROWED-TIME-V6-MATERIAL-TRUTH-001"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    return parser.parse_args(argv)


def production_collection_visibility(source: bpy.types.Collection) -> dict[str, bool]:
    visible = {"RIG_AND_SOCKETS"}
    pending = [source]
    while pending:
        collection = pending.pop()
        if collection.name in visible:
            continue
        visible.add(collection.name)
        pending.extend(collection.children)
    for collection in bpy.data.collections:
        collection.hide_render = collection.name not in visible
    visibility = {
        collection.name: not collection.hide_render
        for collection in sorted(bpy.data.collections, key=lambda item: item.name)
    }
    hidden_descendants = [
        collection.name
        for collection in source.children_recursive
        if not visibility.get(collection.name, False)
    ]
    if hidden_descendants:
        raise RuntimeError(f"production blend hides source descendants: {hidden_descendants}")
    return visibility


def save_candidate_blend(source: bpy.types.Collection, target: Path) -> tuple[Path, dict[str, bool]]:
    visibility = production_collection_visibility(source)
    for image in bpy.data.images:
        if image.source == "FILE" and image.size[0] > 0 and not image.packed_file:
            image.pack()
    target.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True)
    if target.stat().st_size >= 100 * 1024 * 1024:
        raise RuntimeError("V6 packed candidate blend exceeds 100 MiB")
    return target, visibility


def generation_contract(baseline_hash: str) -> dict:
    scripts = [
        Path(__file__).resolve(),
        Path(__file__).with_name("build_v4.py"),
        Path(__file__).with_name("material_truth_v6.py"),
        Path(__file__).with_name("surface_maps_v2.py"),
    ]
    script_hashes = {
        str(path.relative_to(FAMILY)).replace("\\", "/"): sha256(path)
        for path in scripts
    }
    core = {
        "baselineSha256": baseline_hash,
        "materialTruthPassId": PASS_ID,
        "surfaceRemasterId": REMASTER_ID,
        "scriptSha256": script_hashes,
    }
    payload = json.dumps(core, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        **core,
        "generationFingerprint": hashlib.sha256(payload).hexdigest().upper(),
    }


def surface_image_hashes() -> dict[str, str]:
    rows = {}
    for role in sorted(PROFILES):
        for channel in ("basecolor", "normal", "orm"):
            name = f"{role}_{channel}.png"
            image = bpy.data.images.get(name)
            if image is None or image.size[0] == 0:
                raise RuntimeError(f"missing generated surface image {name}")
            pixels = np.empty(len(image.pixels), dtype=np.float32)
            image.pixels.foreach_get(pixels)
            rows[name] = hashlib.sha256(pixels.tobytes()).hexdigest().upper()
    return rows


def main() -> int:
    args = parse_args()
    baseline = args.baseline.resolve()
    if not baseline.exists():
        raise RuntimeError(f"missing V5 production baseline: {baseline}")
    baseline_hash = sha256(baseline)
    if baseline_hash != EXPECTED_BASELINE_SHA256:
        raise RuntimeError(
            f"V5 production baseline hash mismatch: {baseline_hash} != {EXPECTED_BASELINE_SHA256}"
        )
    generation = generation_contract(baseline_hash)
    evidence = FAMILY / "evidence"
    evidence.mkdir(parents=True, exist_ok=True)
    report_path = evidence / "material_truth_v6_build_report.json"
    report_path.write_text(json.dumps({
        "schema": "spaceface.kestrelMaterialTruthV6.build.v1",
        "status": "building",
        "generationFingerprint": generation["generationFingerprint"],
        "candidateOnly": True,
        "livePromotion": False,
    }, indent=2) + "\n", encoding="utf-8")

    bpy.ops.wm.open_mainfile(filepath=str(baseline))
    source = bpy.data.collections.get("KESTREL_V4_PRODUCTION_SOURCE")
    if source is None:
        raise RuntimeError("KESTREL_V4_PRODUCTION_SOURCE missing")
    canonical_collision_bounds = visible_bounds(source)
    surface_remaster = apply_to_blender_images(bpy)
    decal_pbr_roles = ensure_decal_pbr_roles()
    surface_hashes = surface_image_hashes()
    material_truth = apply_material_truth_v6()
    socket_contract = enforce_socket_contract()
    visible_bounds_v6 = visible_bounds(source)
    root = bpy.data.objects.get("SF_K0_BORROWED_TIME_ROOT")
    if root is None:
        raise RuntimeError("source root missing")
    asset = dict(root.get("spacefaceAsset") or {})
    asset.update({
        "packet": PACKET,
        "materialTruthPassId": PASS_ID,
        "surfaceRemasterId": REMASTER_ID,
        "wiringStatus": "isolated_candidate_no_promote",
        "generationFingerprint": generation["generationFingerprint"],
    })
    root["spacefaceAsset"] = asset
    final_blend = FAMILY / "blender" / "kestrel_material_truth_v6_production.blend"
    final_output_dir = FAMILY / "source_candidates" / "material_truth_v6" / "wholeships"
    with tempfile.TemporaryDirectory(prefix="spaceface-kestrel-v6-") as staging_raw:
        staging = Path(staging_raw)
        staged_blend, production_visibility = save_candidate_blend(
            source,
            staging / final_blend.name,
        )

        # Free canonical names so isolated export copies retain exact stable socket/rig names.
        for obj in list(bpy.data.objects):
            if obj.name in REQUIRED_SOCKETS or obj.name in RIG_NAMES:
                obj.name = f"_SOURCE_{obj.name}"

        staged_output_dir = staging / "wholeships"
        reports = []
        staged_outputs = []
        final_outputs = []
        for lod in (0, 1, 2):
            collection, report = create_lod(
                source,
                lod,
                canonical_collision_bounds,
                generation["generationFingerprint"],
            )
            staged_output = export_lod(collection, lod, staged_output_dir)
            final_output = final_output_dir / staged_output.name
            report.update({
                "path": str(final_output.relative_to(FAMILY)).replace("\\", "/"),
                "bytes": staged_output.stat().st_size,
                "sha256": sha256(staged_output),
                "generationFingerprint": generation["generationFingerprint"],
            })
            reports.append(report)
            staged_outputs.append(staged_output)
            final_outputs.append(final_output)
            remove_collection(collection)

        result = {
            "schema": "spaceface.kestrelMaterialTruthV6.build.v1",
            "status": "complete",
            "packet": PACKET,
            "baseline": str(baseline.relative_to(FAMILY)).replace("\\", "/"),
            "baselineSha256": baseline_hash,
            "generation": generation,
            "generationFingerprint": generation["generationFingerprint"],
            "materialTruthPassId": PASS_ID,
            "surfaceRemasterId": REMASTER_ID,
            "surfaceRemaster": surface_remaster,
            "surfaceImagePixelSha256": surface_hashes,
            "decalPbrRoles": decal_pbr_roles,
            "materialTruth": material_truth,
            "socketContract": socket_contract,
            "canonicalCollisionBoundsBlenderXYZ": canonical_collision_bounds,
            "visibleBoundsBlenderXYZ": visible_bounds_v6,
            "productionBlend": str(final_blend.relative_to(FAMILY)).replace("\\", "/"),
            "productionBlendBytes": staged_blend.stat().st_size,
            "productionBlendSha256": sha256(staged_blend),
            "productionBlendCollectionVisibility": production_visibility,
            "lods": reports,
            "outputs": [str(path.relative_to(FAMILY)).replace("\\", "/") for path in final_outputs],
            "candidateOnly": True,
            "livePromotion": False,
        }
        staged_report = staging / report_path.name
        staged_report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")

        final_blend.parent.mkdir(parents=True, exist_ok=True)
        final_output_dir.mkdir(parents=True, exist_ok=True)
        os.replace(staged_blend, final_blend)
        for staged_output, final_output in zip(staged_outputs, final_outputs, strict=True):
            os.replace(staged_output, final_output)
        # The receipt publishes last. A killed or failed build can therefore
        # never leave an old PASS receipt describing a mixed generation.
        os.replace(staged_report, report_path)
    print("V6_MATERIAL_TRUTH_BUILD_REPORT=" + json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
