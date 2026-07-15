#!/usr/bin/env python3
"""
M4-HELIOS-V11 Stage A0 — orthographic silhouette candidates (no Blender).

Three 1024px transparent top/game-view masks, 128/40 nearest+lanczos reductions,
zone overlays, alpha-based machine measurements, contact sheet, manifest.json.

Bold continuous asymmetric tuning-fork / Y shipyard landmark.
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1] / "evidence" / "silhouette"
KESTREL_120 = (
    ROOT
    / "assets/ships/kestrel_borrowed_time_v4/evidence/three/kestrel_v4_three_120px.png"
)

SIZE = 1024
ALPHA_THRESH = 16
MARGIN = 0.11  # target ~11% (within 8–15%)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def fg_mask(a: np.ndarray) -> np.ndarray:
    return a >= ALPHA_THRESH


def content_bbox(fg: np.ndarray):
    ys, xs = np.where(fg)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def margin_fracs(bbox, size):
    x0, y0, x1, y1 = bbox
    left, right = x0 / size, (size - 1 - x1) / size
    top, bottom = y0 / size, (size - 1 - y1) / size
    return {
        "left": left,
        "right": right,
        "top": top,
        "bottom": bottom,
        "min": min(left, right, top, bottom),
        "max": max(left, right, top, bottom),
    }


def label_components(binary: np.ndarray):
    labels, n = ndimage.label(
        binary, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    )
    return labels, int(n)


def count_enclosed_holes(fg: np.ndarray):
    labels, n = label_components(~fg)
    areas, bboxes = [], []
    for i in range(1, n + 1):
        region = labels == i
        if region[0].any() or region[-1].any() or region[:, 0].any() or region[:, -1].any():
            continue
        area = int(region.sum())
        areas.append(area)
        ys, xs = np.where(region)
        bboxes.append(
            {
                "x0": int(xs.min()),
                "y0": int(ys.min()),
                "x1": int(xs.max()),
                "y1": int(ys.max()),
                "area_px": area,
            }
        )
    order = sorted(range(len(areas)), key=lambda i: -areas[i])
    return (
        len(areas),
        [areas[i] for i in order],
        [bboxes[i] for i in order],
    )


def wing_asymmetry(fg, bbox):
    x0, y0, x1, y1 = bbox
    mid = (x0 + x1) * 0.5
    xs = np.where(fg)[1]
    left = int(np.sum(xs < mid))
    right = int(np.sum(xs >= mid))
    if min(left, right) == 0:
        return None
    return {
        "left_px": left,
        "right_px": right,
        "ratio_larger_over_smaller": max(left, right) / min(left, right),
        "hab_side": "left" if left >= right else "right",
    }


def center_of_mass(fg):
    ys, xs = np.where(fg)
    return float(xs.mean()), float(ys.mean())


def compactness(fg):
    a = int(fg.sum())
    if a == 0:
        return 0.0
    eroded = ndimage.binary_erosion(fg)
    perim = max(1, int(fg.sum() - eroded.sum()))
    return float(4.0 * math.pi * a / (perim * perim))


def downsample_mask(alpha, target, method):
    img = Image.fromarray(alpha, mode="L")
    rs = Image.Resampling.NEAREST if method == "nearest" else Image.Resampling.LANCZOS
    return np.array(img.resize((target, target), rs))


def iou_binary(a, b, thresh=ALPHA_THRESH):
    A, B = a >= thresh, b >= thresh
    inter = np.logical_and(A, B).sum()
    union = np.logical_or(A, B).sum()
    return 1.0 if union == 0 else float(inter / union)


def measure(alpha, size=SIZE):
    fg = fg_mask(alpha)
    bbox = content_bbox(fg)
    if bbox is None:
        return {"error": "empty_mask"}
    margins = margin_fracs(bbox, size)
    _, n_fg = label_components(fg)
    n_holes, hole_areas, hole_bboxes = count_enclosed_holes(fg)
    wing = wing_asymmetry(fg, bbox)
    com = center_of_mass(fg)
    fg_area = int(fg.sum())
    x0, y0, x1, y1 = bbox
    bite_area = hole_areas[0] if hole_areas else 0
    bite_depth_px = (
        hole_bboxes[0]["y1"] - hole_bboxes[0]["y0"] + 1 if hole_bboxes else 0
    )
    content_h = y1 - y0 + 1
    bite_depth_frac = bite_depth_px / content_h if content_h else 0.0
    projected = fg_area + sum(hole_areas)
    bite_vs_projected = bite_area / projected if projected else 0.0
    a128n = downsample_mask(alpha, 128, "nearest")
    a128l = np.where(downsample_mask(alpha, 128, "lanczos") >= 128, 255, 0).astype(np.uint8)
    a40n = downsample_mask(alpha, 40, "nearest")
    a40l = np.where(downsample_mask(alpha, 40, "lanczos") >= 128, 255, 0).astype(np.uint8)
    com_x, com_y = com
    bcx, bcy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    half_diag = 0.5 * math.hypot(x1 - x0, y1 - y0)
    com_offset = math.hypot(com_x - bcx, com_y - bcy) / half_diag if half_diag else 0.0
    return {
        "content_bbox_px": {"x0": x0, "y0": y0, "x1": x1, "y1": y1},
        "content_size_px": {"w": x1 - x0 + 1, "h": y1 - y0 + 1},
        "margins_frac": margins,
        "foreground_connected_components": n_fg,
        "negative_space_enclosed_holes": n_holes,
        "hole_areas_px": hole_areas,
        "hole_bboxes_px": hole_bboxes,
        "foreground_area_px": fg_area,
        "docking_bite_depth_px": bite_depth_px,
        "docking_bite_depth_frac_of_content_h": bite_depth_frac,
        "docking_bite_area_px": bite_area,
        "docking_bite_area_frac_of_fg": bite_area / fg_area if fg_area else 0.0,
        "docking_bite_area_frac_of_projected": bite_vs_projected,
        "wing_asymmetry": wing,
        "center_of_mass_px": {"x": com_x, "y": com_y},
        "com_offset_frac_of_half_diag": com_offset,
        "compactness_isoperimetric": compactness(fg),
        "iou_128_nearest_vs_lanczos_of_1024": iou_binary(a128n, a128l),
        "iou_40_nearest_vs_lanczos_of_1024": iou_binary(a40n, a40l),
        "gates": {
            "fg_components_eq_1": n_fg == 1,
            "holes_eq_2": n_holes == 2,
            "bite_depth_ge_45pct": bite_depth_frac >= 0.45,
            "bite_area_ge_25pct_projected": bite_vs_projected >= 0.25,
            "asymmetry_1_25_to_1_55": wing is not None
            and 1.25 <= wing["ratio_larger_over_smaller"] <= 1.55,
            "margins_ok": 0.08 <= margins["min"] and margins["max"] <= 0.15,
            "com_balanced": com_offset <= 0.12,
        },
    }


# ---------------------------------------------------------------------------
# One-shot pixel geometry: continuous Y shipyard with designed metrics
# ---------------------------------------------------------------------------

def fit_square_canvas(draw_fn, design_w, design_h, margin=MARGIN):
    """
    Call draw_fn(draw, scale, ox, oy) where design coords map as:
      px = ox + x * scale
      py = oy - y * scale   (+Y design north → up on screen after invert)
    Content is scaled to fill a square with `margin` on each side.
    """
    usable = SIZE * (1.0 - 2.0 * margin)
    side = max(design_w, design_h)
    scale = usable / side
    # design box centered at origin assumed for x; y from y_min to y_max passed as design_h
    # Caller should place geometry with x in [-design_w/2, design_w/2], y in [-design_h/2, design_h/2]
    # or we accept y_min/y_max via design extents in draw_fn's own coordinate system.
    # Here: origin at canvas center in design units spanning design_w x design_h.
    ox = SIZE * 0.5
    oy = SIZE * 0.5
    img = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(img)
    draw_fn(draw, scale, ox, oy)
    return np.where(np.array(img) >= 128, 255, 0).astype(np.uint8)


def px(scale, ox, oy, x, y):
    return (ox + x * scale, oy - y * scale)


def poly(scale, ox, oy, pts):
    return [px(scale, ox, oy, x, y) for x, y in pts]


def build_fork(cfg):
    """
    Design coordinate system centered on content:
      x=0 centerline, +x industrial, -x habitation
      y=0 near junction, +y toward fork tips (north), -y toward stem base (south)

    Proportions (units):
      stem_len 16-20, arm_len 28-36, tip_sep 22-28, arm thick 5-8
    """
    stem_len = cfg["stem_len"]
    stem_w = cfg["stem_w"]
    arm_len = cfg["arm_len"]
    tip_sep = cfg["tip_sep"]
    hab_t = cfg["hab_thick"]
    ind_t = cfg["ind_thick"]

    # Asymmetric tip X positions: industrial farther for CoM lever arm
    # Area: hab thicker + stepped flares; industrial lean but longer reach
    hab_tip_x = -tip_sep * cfg["hab_tip_frac"]  # e.g. 0.40
    ind_tip_x = tip_sep * cfg["ind_tip_frac"]  # e.g. 0.60
    hab_outer = hab_tip_x - hab_t * 0.5 - cfg["hab_flare"]
    ind_outer = ind_tip_x + ind_t * 0.5 + cfg["ind_reach"]

    y_base = -stem_len
    y_tip = arm_len
    y_junc = 0.0
    gate_h = 1.7
    y_gate_inner = y_tip - gate_h

    # design extents for square fit
    x_min, x_max = hab_outer, ind_outer
    y_min, y_max = y_base, y_tip
    # shift so content center is origin
    cx = (x_min + x_max) * 0.5
    cy = (y_min + y_max) * 0.5
    design_w = x_max - x_min
    design_h = y_max - y_min

    def shift(pts):
        return [(x - cx, y - cy) for x, y in pts]

    def draw_fn(draw, scale, ox, oy):
        def P(pts):
            return poly(scale, ox, oy, shift(pts))

        sw = stem_w * 0.5

        # --- continuous outer hull ---
        steps = cfg["hab_steps"]  # list of (t, out_extra)
        notches = cfg["ind_notches"]  # list of t for notch indents

        # build left outer path bottom→tip
        left_path = [(-sw, y_base), (-sw - 1.2, y_base * 0.4), (-sw - 2.8, y_junc + 1)]
        for t, extra in steps:
            y = y_junc + (y_tip - y_junc) * t
            left_path.append((hab_outer - extra * 0.3, y))
        left_path.append((hab_outer, y_tip))

        # gate across top
        top = [(hab_outer, y_tip), (ind_outer, y_tip)]

        # right outer tip→bottom with notches
        right_path = [(ind_outer, y_tip)]
        for t in notches:
            y = y_junc + (y_tip - y_junc) * t
            # notch: indent then out
            right_path.append((ind_outer + 0.4, y + 1.2))
            right_path.append((ind_outer - cfg["notch_depth"], y))
            right_path.append((ind_outer + 0.3, y - 1.2))
        right_path += [
            (ind_outer - 0.5, y_junc + arm_len * 0.15),
            (sw + 2.5, y_junc + 1),
            (sw + 1.0, y_base * 0.4),
            (sw, y_base),
        ]

        outer = left_path + top[1:] + right_path
        draw.polygon(P(outer), fill=255)

        # stem body
        draw.polygon(
            P([(-sw, y_base), (sw, y_base), (sw, y_junc + 2), (-sw, y_junc + 2)]),
            fill=255,
        )
        # armored ops collar
        ow = cfg["ops_w"] * 0.5
        draw.polygon(
            P(
                [
                    (-ow, y_base * 0.2),
                    (ow * 0.9, y_base * 0.2),
                    (ow * 1.05, y_junc + 3.5),
                    (-ow * 1.1, y_junc + 3.5),
                ]
            ),
            fill=255,
        )

        # hab arm solid (guaranteed fill)
        hab_inner = hab_tip_x + hab_t * 0.2
        draw.polygon(
            P(
                [
                    (-sw - 2, y_junc),
                    (hab_outer - 0.5, y_junc + arm_len * 0.35),
                    (hab_outer, y_tip),
                    (hab_inner, y_tip),
                    (-sw * 0.25, y_junc + 2),
                ]
            ),
            fill=255,
        )
        # stepped hab plates (overlap arm)
        for t, extra in steps:
            y = y_junc + (y_tip - y_junc) * t
            draw.polygon(
                P(
                    [
                        (hab_outer - 0.2, y - 3.5),
                        (hab_outer + hab_t * 0.85 + extra, y - 2.8),
                        (hab_outer + hab_t * 0.8 + extra, y + 3.2),
                        (hab_outer - 0.1, y + 3.6),
                    ]
                ),
                fill=255,
            )

        # industrial arm solid
        ind_inner = ind_tip_x - ind_t * 0.2
        draw.polygon(
            P(
                [
                    (sw + 1.5, y_junc),
                    (ind_outer - 0.4, y_junc + arm_len * 0.35),
                    (ind_outer, y_tip),
                    (ind_inner, y_tip),
                    (sw * 0.25, y_junc + 2),
                ]
            ),
            fill=255,
        )
        # refinery notch mass blocks
        for t in notches:
            y = y_junc + (y_tip - y_junc) * t
            draw.polygon(
                P(
                    [
                        (ind_inner - 0.3, y - 2.2),
                        (ind_outer + 0.5, y - 1.5),
                        (ind_outer - cfg["notch_depth"] * 0.4, y + 0.5),
                        (ind_outer + 0.4, y + 2.4),
                        (ind_inner - 0.2, y + 2.5),
                    ]
                ),
                fill=255,
            )

        # root junction
        draw.polygon(
            P(
                [
                    (-sw - 5.0, y_junc - 0.5),
                    (sw + 4.0, y_junc - 0.5),
                    (sw + 5.5, y_junc + 4.5),
                    (-sw - 6.5, y_junc + 4.5),
                ]
            ),
            fill=255,
        )

        # dock gate bridge
        draw.polygon(
            P(
                [
                    (hab_inner - 0.3, y_gate_inner),
                    (ind_inner + 0.3, y_gate_inner),
                    (ind_outer, y_tip + 0.15),
                    (hab_outer, y_tip + 0.15),
                ]
            ),
            fill=255,
        )

        # HOLE 1: large docking bite (>=25% projected area target)
        # Wide triangular/trapezoid void between arms
        bite_bottom_half_w = stem_w * 0.18
        draw.polygon(
            P(
                [
                    (-bite_bottom_half_w, y_junc + 3.2),
                    (hab_inner + cfg["bite_wall"], y_junc + arm_len * 0.45),
                    (hab_inner + cfg["bite_wall"] * 0.6, y_gate_inner - 0.25),
                    (ind_inner - cfg["bite_wall"] * 0.6, y_gate_inner - 0.25),
                    (ind_inner - cfg["bite_wall"], y_junc + arm_len * 0.45),
                    (bite_bottom_half_w, y_junc + 3.2),
                ]
            ),
            fill=0,
        )

        # HOLE 2: service aperture fully inside hab wing solid
        sx = (hab_outer + hab_inner) * 0.5 + cfg["service_dx"]
        sy = y_junc + arm_len * cfg["service_t"]
        hw, hh = cfg["service_hw"], cfg["service_hh"]
        ang = math.radians(cfg["service_ang"])
        c, s = math.cos(ang), math.sin(ang)
        local = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        spts = [(sx + lx * c - ly * s, sy + lx * s + ly * c) for lx, ly in local]
        draw.polygon(P(spts), fill=0)

    mask = fit_square_canvas(draw_fn, design_w, design_h, margin=MARGIN)
    design_meta = {
        "stem_len": stem_len,
        "stem_w": stem_w,
        "arm_len": arm_len,
        "tip_sep": tip_sep,
        "hab_thick": hab_t,
        "ind_thick": ind_t,
        "hab_outer": hab_outer,
        "ind_outer": ind_outer,
        "design_w": design_w,
        "design_h": design_h,
    }
    return mask, design_meta


def candidate_configs():
    # Shared recipe variants — three distinct operational mass balances
    return [
        {
            "id": "cand_a_stepped_hab",
            "label": "A — Stepped Hab Dominant",
            "design_notes": (
                "Broad stepped left habitation wing, lean notched industrial jaw, "
                "armored keel stem; service aperture through hab root."
            ),
            "stem_len": 18.0,
            "stem_w": 7.2,
            "arm_len": 32.0,
            "tip_sep": 25.0,
            "hab_thick": 7.6,
            "ind_thick": 5.5,
            "hab_flare": 5.2,
            "ind_reach": 3.5,
            "hab_tip_frac": 0.38,
            "ind_tip_frac": 0.62,
            "ops_w": 11.5,
            "hab_steps": [(0.42, 4.0), (0.60, 5.0), (0.78, 4.2), (0.92, 3.0)],
            "ind_notches": [0.45, 0.62, 0.80],
            "notch_depth": 2.2,
            "bite_wall": 0.9,
            "service_t": 0.32,
            "service_dx": -0.3,
            "service_hw": 1.35,
            "service_hh": 2.15,
            "service_ang": -16,
        },
        {
            "id": "cand_b_industrial_jaw",
            "label": "B — Industrial Jaw Long",
            "design_notes": (
                "Longer arms and industrial jaw with deep refinery notches; "
                "service aperture on hab root; slightly tighter tip separation."
            ),
            "stem_len": 17.0,
            "stem_w": 6.6,
            "arm_len": 34.5,
            "tip_sep": 23.5,
            "hab_thick": 7.2,
            "ind_thick": 6.0,
            "hab_flare": 4.6,
            "ind_reach": 4.0,
            "hab_tip_frac": 0.37,
            "ind_tip_frac": 0.63,
            "ops_w": 10.5,
            "hab_steps": [(0.40, 3.6), (0.58, 4.5), (0.76, 3.8), (0.90, 2.8)],
            "ind_notches": [0.40, 0.55, 0.70, 0.86],
            "notch_depth": 2.8,
            "bite_wall": 0.85,
            "service_t": 0.30,
            "service_dx": -0.2,
            "service_hw": 1.3,
            "service_hh": 2.0,
            "service_ang": -14,
        },
        {
            "id": "cand_c_armored_keel",
            "label": "C — Armored Keel Heavy",
            "design_notes": (
                "Heavy central armored operations stem; wider tip separation; "
                "service aperture at hab-root junction."
            ),
            "stem_len": 19.5,
            "stem_w": 8.0,
            "arm_len": 30.0,
            "tip_sep": 27.0,
            "hab_thick": 7.8,
            "ind_thick": 5.4,
            "hab_flare": 5.5,
            "ind_reach": 3.2,
            "hab_tip_frac": 0.39,
            "ind_tip_frac": 0.61,
            "ops_w": 13.5,
            "hab_steps": [(0.44, 4.2), (0.62, 5.2), (0.80, 4.4), (0.93, 3.2)],
            "ind_notches": [0.48, 0.68, 0.85],
            "notch_depth": 2.0,
            "bite_wall": 0.95,
            "service_t": 0.34,
            "service_dx": -0.4,
            "service_hw": 1.4,
            "service_hh": 2.1,
            "service_ang": -18,
        },
    ]


def rgba_from_alpha(alpha, rgb=(240, 244, 250)):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., 0] = rgb[0]
    out[..., 1] = rgb[1]
    out[..., 2] = rgb[2]
    out[..., 3] = alpha
    return Image.fromarray(out, mode="RGBA")


def save_reductions(alpha, stem: Path):
    paths = {}
    for size in (128, 40):
        for method in ("nearest", "lanczos"):
            arr = downsample_mask(alpha, size, method)
            arr = (
                np.where(arr >= 128, 255, 0).astype(np.uint8)
                if method == "lanczos"
                else np.where(arr >= ALPHA_THRESH, 255, 0).astype(np.uint8)
            )
            p = stem.parent / f"{stem.name}_{size}px_{method}.png"
            rgba_from_alpha(arr).save(p)
            paths[f"{size}_{method}"] = p
    return paths


def draw_overlay(alpha, metrics, label):
    base = rgba_from_alpha(alpha, rgb=(200, 210, 225))
    plate = Image.new("RGBA", base.size, (12, 16, 24, 255))
    plate.alpha_composite(base)
    draw = ImageDraw.Draw(plate)
    try:
        font = ImageFont.truetype("arial.ttf", 22)
        font_sm = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
        font_sm = font
    holes = metrics.get("hole_bboxes_px") or []
    colors = [(255, 80, 60, 100), (80, 220, 120, 100)]
    labels = ["DOCKING BITE", "SERVICE APERTURE"]
    for i, hb in enumerate(holes[:2]):
        c = colors[i % 2]
        overlay = Image.new("RGBA", plate.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.rectangle(
            [hb["x0"], hb["y0"], hb["x1"], hb["y1"]],
            fill=c,
            outline=c[:3] + (255,),
            width=3,
        )
        plate = Image.alpha_composite(plate, overlay)
        draw = ImageDraw.Draw(plate)
        draw.text(
            (hb["x0"] + 4, max(4, hb["y0"] - 22)),
            labels[i],
            fill=(255, 220, 180, 255),
            font=font_sm,
        )
    bbox = metrics["content_bbox_px"]
    x0, y0, x1, y1 = bbox["x0"], bbox["y0"], bbox["x1"], bbox["y1"]
    mid_x = (x0 + x1) // 2
    draw.text((x0 + 8, y0 + 10), "HABITATION (broad)", fill=(120, 200, 255, 255), font=font)
    draw.text((mid_x + 16, y0 + 10), "INDUSTRIAL JAW", fill=(255, 160, 80, 255), font=font)
    draw.text((mid_x - 80, y1 - 36), "OPS / KEEL STEM", fill=(220, 220, 120, 255), font=font)
    draw.text((16, SIZE - 36), label, fill=(230, 230, 240, 255), font=font)
    return plate


def build_contact_sheet(cand_imgs, kestrel_path, out_path):
    thumb = 256
    col_w = [thumb, 128, 40, 120]
    pad = 16
    label_h = 28
    row_h = max(col_w) + label_h + pad
    width = sum(col_w) + pad * (len(col_w) + 1) + 40
    height = row_h * 3 + pad * 2 + 48
    sheet = Image.new("RGBA", (width, height), (18, 22, 30, 255))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
        font_sm = ImageFont.truetype("arial.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
        font_sm = font
    draw.text(
        (pad, 10),
        "M4-HELIOS-V11 A0  |  Kestrel V4 120px = readability context (not shape imitation)",
        fill=(220, 220, 230, 255),
        font=font_sm,
    )
    kestrel = None
    if Path(kestrel_path).is_file():
        kestrel = Image.open(kestrel_path).convert("RGBA")
        kestrel.thumbnail((120, 120), Image.Resampling.LANCZOS)
    headers = ["1024 crop→256", "128px", "40px", "Kestrel V4 120"]
    x = pad
    for i, h in enumerate(headers):
        draw.text((x, 32), h, fill=(160, 170, 190, 255), font=font_sm)
        x += col_w[i] + pad
    for row, item in enumerate(cand_imgs):
        y0 = 48 + pad + row * row_h
        alpha = item["alpha"]
        meta = item["meta"]
        bbox = content_bbox(fg_mask(alpha))
        full = rgba_from_alpha(alpha)
        crop = full.crop((bbox[0], bbox[1], bbox[2] + 1, bbox[3] + 1)) if bbox else full
        t1024 = crop.copy()
        t1024.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
        a128 = np.where(downsample_mask(alpha, 128, "nearest") >= ALPHA_THRESH, 255, 0).astype(np.uint8)
        a40 = np.where(downsample_mask(alpha, 40, "nearest") >= ALPHA_THRESH, 255, 0).astype(np.uint8)
        cells = [t1024, rgba_from_alpha(a128), rgba_from_alpha(a40), kestrel]
        x = pad
        draw.text((pad, y0), meta["label"], fill=(240, 240, 250, 255), font=font)
        y_img = y0 + label_h
        for i, cell in enumerate(cells):
            draw.rectangle(
                [x - 2, y_img - 2, x + col_w[i] + 2, y_img + col_w[i] + 2],
                outline=(50, 60, 80, 255),
                width=1,
            )
            if cell is not None:
                cw, ch = cell.size
                sheet.alpha_composite(
                    cell, (x + (col_w[i] - cw) // 2, y_img + (col_w[i] - ch) // 2)
                )
            x += col_w[i] + pad
    sheet.save(out_path)


def judge(results):
    ranked = []
    for r in results:
        g = r["metrics"]["gates"]
        m = r["metrics"]
        score, reasons, fail = 0, [], []
        checks = [
            (g["fg_components_eq_1"], 2, "single continuous mass", f"fg={m['foreground_connected_components']}"),
            (g["holes_eq_2"], 3, "exactly 2 enclosed voids", f"holes={m['negative_space_enclosed_holes']}"),
            (g["bite_depth_ge_45pct"], 2, f"bite depth {m['docking_bite_depth_frac_of_content_h']:.1%}", f"bite depth {m['docking_bite_depth_frac_of_content_h']:.1%}<45%"),
            (g["bite_area_ge_25pct_projected"], 2, f"bite area {m['docking_bite_area_frac_of_projected']:.1%} projected", f"bite area {m['docking_bite_area_frac_of_projected']:.1%}<25%"),
            (g["asymmetry_1_25_to_1_55"], 1, f"asym {m['wing_asymmetry']['ratio_larger_over_smaller']:.2f}" if m.get("wing_asymmetry") else "asym?", "asym out of range"),
            (g["com_balanced"], 1, "balanced CoM", f"CoM offset {m['com_offset_frac_of_half_diag']:.3f}"),
            (g["margins_ok"], 1, "margins 8–15%", f"margins {m['margins_frac']}"),
            (m["iou_128_nearest_vs_lanczos_of_1024"] >= 0.70, 1, "128px stable", "128px IoU low"),
            (m["iou_40_nearest_vs_lanczos_of_1024"] >= 0.55, 1, "40px stable", "40px IoU low"),
        ]
        for ok, pts, good, bad in checks:
            if ok:
                score += pts
                reasons.append(good)
            else:
                fail.append(bad)
        passes = (
            g["fg_components_eq_1"]
            and g["holes_eq_2"]
            and g["bite_depth_ge_45pct"]
            and g["bite_area_ge_25pct_projected"]
            and g["asymmetry_1_25_to_1_55"]
            and g["com_balanced"]
        )
        ranked.append(
            {
                "id": r["meta"]["id"],
                "label": r["meta"]["label"],
                "score": score,
                "passes_machine": passes,
                "reasons": reasons,
                "fail": fail,
            }
        )
    ranked.sort(key=lambda x: (-x["passes_machine"], -x["score"]))
    winner = ranked[0]["id"] if ranked and ranked[0]["passes_machine"] else None
    return ranked, winner


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for cfg in candidate_configs():
        print(f"Rendering {cfg['id']}...")
        mask, design_meta = build_fork(cfg)
        metrics = measure(mask)
        pure = OUT / f"{cfg['id']}_1024.png"
        rgba_from_alpha(mask).save(pure)
        reds = save_reductions(mask, OUT / cfg["id"])
        overlay = draw_overlay(mask, metrics, cfg["label"])
        ov_path = OUT / f"{cfg['id']}_1024_overlay.png"
        overlay.save(ov_path)
        files = {
            "mask_1024": pure,
            "overlay_1024": ov_path,
            **{f"mask_{k}": v for k, v in reds.items()},
        }
        hashes = {k: sha256_file(p) for k, p in files.items()}
        g = metrics["gates"]
        print(
            f"  holes={metrics['negative_space_enclosed_holes']} fg={metrics['foreground_connected_components']} "
            f"bite_d={metrics['docking_bite_depth_frac_of_content_h']:.2%} "
            f"bite_a={metrics['docking_bite_area_frac_of_projected']:.2%} "
            f"asym={metrics.get('wing_asymmetry')} com={metrics['com_offset_frac_of_half_diag']:.3f} "
            f"margins_min={metrics['margins_frac']['min']:.3f} max={metrics['margins_frac']['max']:.3f}"
        )
        print(f"  gates={g}")
        results.append(
            {
                "meta": cfg,
                "alpha": mask,
                "metrics": metrics,
                "design_meta": design_meta,
                "files_rel": {
                    k: str(p.relative_to(ROOT)).replace("\\", "/") for k, p in files.items()
                },
                "sha256": hashes,
            }
        )

    contact = OUT / "contact_sheet_a0.png"
    build_contact_sheet(
        [{"alpha": r["alpha"], "meta": r["meta"]} for r in results],
        KESTREL_120,
        contact,
    )
    ranked, winner = judge(results)
    verdict = "PASS" if winner else "SILHOUETTE REJECT"

    manifest = {
        "stage": "A0",
        "asset": "m4_helios_hub_v11",
        "generated_by": "assets/ships/m4_helios_hub_v11/scripts/generate_a0_silhouettes.py",
        "no_blender": True,
        "reference": {
            "kit": "Kenney Space Station Kit 1.0",
            "author": "Kenney (www.kenney.nl)",
            "license": "CC0 1.0 Universal",
            "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "canonical_url": "https://kenney.nl/assets/space-station-kit",
            "download_url": "https://kenney.nl/media/pages/assets/space-station-kit/6475288f2e-1712749919/kenney_space-station-kit.zip",
            "path": "assets/third_party/helios_v11/kenney_space_station_kit/",
            "usage": "design_reference",
            "usage_note": "Informs modular junction logic, dock/service language, hard-surface proportions. Does NOT dictate ring/cylinder stack. Not used as shipped geometry.",
        },
        "kestrel_v4_context": {
            "path": "assets/ships/kestrel_borrowed_time_v4/evidence/three/kestrel_v4_three_120px.png",
            "role": "detail/readability quality context on contact sheet — not shape imitation",
        },
        "candidates": [
            {
                "id": r["meta"]["id"],
                "label": r["meta"]["label"],
                "design_notes": r["meta"]["design_notes"],
                "design_units": {
                    "stem_len": r["design_meta"]["stem_len"],
                    "stem_w": r["design_meta"]["stem_w"],
                    "arm_len": r["design_meta"]["arm_len"],
                    "tip_sep": r["design_meta"]["tip_sep"],
                    "hab_thick": r["design_meta"]["hab_thick"],
                    "ind_thick": r["design_meta"]["ind_thick"],
                },
                "files": r["files_rel"],
                "sha256": r["sha256"],
                "metrics": r["metrics"],
            }
            for r in results
        ],
        "contact_sheet": {
            "path": str(contact.relative_to(ROOT)).replace("\\", "/"),
            "sha256": sha256_file(contact),
        },
        "judgment": {
            "ranked": ranked,
            "provisional_winner": winner,
            "verdict": verdict,
            "criteria": [
                "bold continuous asymmetric tuning-fork/Y shipyard landmark",
                "stem 16-20, arms 28-36, tip sep 22-28, arm thick 5-8 (design units)",
                "docking bite depth >=45% length and area >=25% projected",
                "exactly 2 enclosed negative spaces (bite + service aperture)",
                "wing area asymmetry 1.25-1.55 with balanced CoM",
                "unmistakable at 128; tuning-fork legible at 40",
                "no ellipse/saucer, no generic Y icon, no thin line-art, no floating parts",
            ],
        },
    }
    man_path = OUT / "manifest.json"
    with open(man_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nWrote {man_path}")
    print(f"VERDICT: {verdict}")
    print(f"Winner: {winner}")
    for row in ranked:
        print(f"  {row['id']}: score={row['score']} pass={row['passes_machine']}")
        if row["fail"]:
            print(f"    fail: {row['fail']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
