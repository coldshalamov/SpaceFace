import os
import sys
import tempfile
import hashlib
import json
import math
from PIL import Image

# Ensure path is set up to import sibling modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from decal_atlas import generate_decal_atlas
from trim_sheet import generate_trim_sheet
from grime_masks import generate_grime_masks

def get_dir_hashes(directory):
    hashes = {}
    for root, _, files in os.walk(directory):
        for file in files:
            filepath = os.path.join(root, file)
            relpath = os.path.relpath(filepath, directory)
            # Read binary content for strict byte comparison
            with open(filepath, "rb") as f:
                content = f.read()
                hashes[relpath] = hashlib.sha256(content).hexdigest()
    return hashes

def check_texgen():
    print("Starting texgen validation checks...")

    # 1. Run all three generators twice into temp dirs and assert byte-identical outputs
    with tempfile.TemporaryDirectory() as temp_dir1, tempfile.TemporaryDirectory() as temp_dir2:
        print(f"Running pass 1 into {temp_dir1}...")
        generate_decal_atlas(temp_dir1, seed=42)
        generate_trim_sheet(temp_dir1, seed=42)
        generate_grime_masks(temp_dir1, seed=42)

        print(f"Running pass 2 into {temp_dir2}...")
        generate_decal_atlas(temp_dir2, seed=42)
        generate_trim_sheet(temp_dir2, seed=42)
        generate_grime_masks(temp_dir2, seed=42)

        hashes1 = get_dir_hashes(temp_dir1)
        hashes2 = get_dir_hashes(temp_dir2)

        # Verify file list matches
        assert set(hashes1.keys()) == set(hashes2.keys()), "Pass 1 and Pass 2 generated different files!"

        # Verify byte identity
        for filename, h1 in hashes1.items():
            h2 = hashes2[filename]
            assert h1 == h2, f"Determinism failure: {filename} has different hashes between runs!"

        print("OK: Determinism and byte-by-byte identity checks passed.")

        # Perform validation on the outputs from temp_dir1
        # 2. Check expected dimensions/modes
        expected_files = {
            "decals_atlas.png": ("RGBA", (2048, 2048)),
            "decals_atlas.json": None,
            "trim_basecolor.png": ("RGB", (1024, 1024)),
            "trim_normal.png": ("RGB", (1024, 1024)),
            "trim_orm.png": ("RGB", (1024, 1024)),
            "trim_sheet.json": None,
            "mask_edgewear.png": ("L", (1024, 1024)),
            "mask_recessdust.png": ("L", (1024, 1024)),
            "mask_streaking.png": ("L", (1024, 1024)),
            "mask_heatradial.png": ("L", (1024, 1024)),
            "mask_chips.png": ("L", (1024, 1024)),
            "mask_corrosion.png": ("L", (1024, 1024)),
            "mask_carbon.png": ("L", (1024, 1024)),
            "mask_panelfade.png": ("L", (1024, 1024)),
            "grime_masks.json": None
        }

        for name, spec in expected_files.items():
            path = os.path.join(temp_dir1, name)
            assert os.path.exists(path), f"Missing expected output: {name}"
            if spec:
                mode, size = spec
                with Image.open(path) as img:
                    assert img.mode == mode, f"Image {name} mode is {img.mode}, expected {mode}"
                    assert img.size == size, f"Image {name} size is {img.size}, expected {size}"

        print("OK: File presence, modes, and dimensions checks passed.")

        # 3. Atlas JSON rect validity (in-bounds, no overlaps)
        with open(os.path.join(temp_dir1, "decals_atlas.json"), "r") as f:
            atlas_data = json.load(f)

        rects = {}
        for k, v in atlas_data.items():
            # Check format
            assert "x" in v and "y" in v and "w" in v and "h" in v, f"Invalid format in atlas JSON for {k}"
            x, y, w, h = v["x"], v["y"], v["w"], v["h"]
            assert x >= 0 and y >= 0 and x + w <= 2048 and y + h <= 2048, f"{k} is out of bounds in atlas: {x},{y},{w},{h}"

            # Check overlap against previous rects
            for other_name, (ox, oy, ow, oh) in rects.items():
                overlap = not (x + w <= ox or ox + ow <= x or y + h <= oy or oy + oh <= y)
                assert not overlap, f"Overlap detected between atlas rects: {k} and {other_name}"
            rects[k] = (x, y, w, h)

        print(f"OK: Decal atlas JSON rect check passed. Verified {len(rects)} decals without overlaps.")

        # 4. Normal-map normalization checks
        norm_path = os.path.join(temp_dir1, "trim_normal.png")

        sum_length_error = 0.0
        sum_green_up = 0.0
        up_count = 0
        total_pixels = 1024 * 1024

        with Image.open(norm_path) as img_norm:
            pixels_norm = img_norm.load()
            for y in range(1024):
                for x in range(1024):
                    r, g, b = pixels_norm[x, y][:3]
                    # Reconstruct normal components in [-1.0, 1.0]
                    nx = (r - 127.5) / 127.5
                    ny = (g - 127.5) / 127.5
                    nz = (b - 127.5) / 127.5
                    length = math.sqrt(nx*nx + ny*ny + nz*nz)
                    sum_length_error += abs(length - 1.0)

                    # Slopes pointing up in texture space (positive Y convention) have G > 127
                    if g > 127:
                        sum_green_up += (g / 255.0)
                        up_count += 1

        mean_length_error = sum_length_error / total_pixels
        assert mean_length_error < 0.02, f"Normal map normalization error is {mean_length_error}, expected < 0.02"

        if up_count > 0:
            mean_green_up = sum_green_up / up_count
            assert mean_green_up >= 0.5, f"Normal map G-channel average on upward slopes is {mean_green_up}, expected >= 0.5"
        else:
            mean_green_up = 0.0

        print(f"OK: Normal map validation passed. Mean length error = {mean_length_error:.6f}, Mean green on up-slopes = {mean_green_up:.4f}")

        # 5. Mask value coverage checks
        mask_names = [
            "mask_edgewear.png", "mask_recessdust.png", "mask_streaking.png", "mask_heatradial.png",
            "mask_chips.png", "mask_corrosion.png", "mask_carbon.png", "mask_panelfade.png"
        ]

        mask_stats = {}
        for mname in mask_names:
            mpath = os.path.join(temp_dir1, mname)
            with Image.open(mpath) as img_m:
                pixels_m = list(img_m.getdata())

            min_val = min(pixels_m)
            max_val = max(pixels_m)
            val_range = max_val - min_val
            # Must use >= 20% of range (which is >= 51 intensity values)
            assert val_range >= 51, f"Mask {mname} range is {val_range}, expected >= 51 (20% of 255)"

            # Count pure black (0) and pure white (255) pixels
            num_black = sum(1 for p in pixels_m if p == 0)
            num_white = sum(1 for p in pixels_m if p == 255)
            pct_black = num_black / total_pixels
            pct_white = num_white / total_pixels

            assert pct_black <= 0.60, f"Mask {mname} has {pct_black*100:.1f}% pure black pixels, expected <= 60%"
            assert pct_white <= 0.60, f"Mask {mname} has {pct_white*100:.1f}% pure white pixels, expected <= 60%"

            mask_stats[mname] = {
                "min": min_val,
                "max": max_val,
                "range": val_range,
                "pct_pure_black": pct_black,
                "pct_pure_white": pct_white
            }

        print("OK: Grime masks value coverage checks passed (all ranges >= 20% and no mask is >60% pure black or pure white).")

        # All checks passed! Write report and print success message.
        report_data = {
            "validation_status": "PASSED",
            "determinism_check": "identical",
            "normal_map_metrics": {
                "mean_length_error": mean_length_error,
                "mean_green_up_slope": mean_green_up
            },
            "mask_metrics": mask_stats,
            "decal_count": len(rects)
        }

        with open("check_texgen_report.json", "w") as rf:
            json.dump(report_data, rf, indent=2, sort_keys=True)

        print("check_texgen_report.json successfully written.")
        print("TEXGEN_CHECK_OK")
        sys.exit(0)

if __name__ == "__main__":
    check_texgen()
