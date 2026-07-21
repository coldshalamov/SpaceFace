"""Fleet Breadth Foundry — HERO evidence renderer.

Produces the decisive evidence into renders/hero/:
  * wasp_lineup_clone.png  — the donor Wasp x3 at game_cam (the "same ship" baseline)
  * wasp_lineup_varied.png — the 3 variants at game_cam (top row) + a faction-tinted
                             preview row (approx primaries multiplied — EVIDENCE ONLY,
                             never baked into the GLBs)
  * hub_before_after_<faction>.png — matched-camera before|after pairs (neutral_close,
                             game_cam, zoom_out) of the trade hub vs hub+overlay

Dual-mode (reuses tools/foundry/render_contact_sheet.py for camera/light/render):
  * SYSTEM python (PIL): orchestrates render_contact_sheet for the wasp frames and a
    Blender subprocess for the hub composite, then stitches the labeled boards.
  * BLENDER python (--hub-render): imports the decompressed hub ONCE + each overlay,
    renders the 3 views with a DONOR-framed (matched) camera and a neutral-gray hub.

The hub donor is meshopt-compressed (Blender can't import it); the render uses a
decompressed, TEXTURELESS working copy (tools/art/decompress_part.mjs) — so the hub
renders as neutral gray in both before and after. That is an honest limitation of
the evidence render, not of the overlays.
"""
from __future__ import annotations

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_FOUNDRY = os.path.abspath(os.path.join(_HERE, ".."))
if _FOUNDRY not in sys.path:
    sys.path.insert(0, _FOUNDRY)

ROOT = os.path.abspath(os.path.join(_HERE, "..", "..", ".."))
VARIANTS = os.path.join(ROOT, "assets", "ships", "foundry", "fleet_breadth_20260720", "variants")
HERO_RENDERS = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence",
                            "fleet_breadth_foundry", "renders", "hero")
DONOR_WASP = os.path.join(ROOT, "assets", "ships", "parts", "wholeships", "wasp_production_v1.glb")
DONOR_HUB = os.path.join(ROOT, "assets", "ships", "parts", "places", "place_station_trade_hub.glb")

# faction -> (wasp variant stem, hub overlay stem, approx primary hex for the tint row)
FACTIONS = [
    ("SCN patrol",   "var_wasp_scn_patrol_v01",  "var_station_trade_hub_scn_overlay_v01",  "#3A78FF"),
    ("MTS escort",   "var_wasp_mts_escort_v01",  "var_station_trade_hub_mts_overlay_v01",  "#F2B233"),
    ("Free militia", "var_wasp_free_militia_v01", "var_station_trade_hub_free_overlay_v01", "#4ECBE0"),
]
HUB_VIEWS = ["neutral_close", "game_cam", "zoom_out"]


# ===========================================================================
# BLENDER MODE — render hub-alone + each hub+overlay, matched camera (donor-framed)
# ===========================================================================
try:
    import bpy  # noqa: F401
    IN_BLENDER = True
except Exception:
    IN_BLENDER = False

if IN_BLENDER:
    import render_contact_sheet as rcs

    def _args():
        a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
        out = {}
        i = 0
        while i < len(a):
            if a[i].startswith("--"):
                key = a[i][2:]
                if i + 1 < len(a) and not a[i + 1].startswith("--"):
                    out[key] = a[i + 1]
                    i += 2
                else:
                    out[key] = True  # valueless flag (e.g. --hub-render)
                    i += 1
            else:
                i += 1
        return out

    def _gray_hub(meshes):
        clay = bpy.data.materials.get("HUB_NEUTRAL") or bpy.data.materials.new("HUB_NEUTRAL")
        clay.use_nodes = True
        b = clay.node_tree.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (0.13, 0.135, 0.15, 1.0)
        b.inputs["Roughness"].default_value = 0.72
        for o in meshes:
            o.data.materials.clear()
            o.data.materials.append(clay)

    def _render_view(view, framing_objs, center, out_path, filmic):
        view_dir, fov, fill = rcs._view_geometry(view)
        dist = rcs.fit_distance(framing_objs, center, view_dir, fov, fill)
        rcs._clear_cameras()
        rcs.setup_camera(f"HERO_{view}", center, view_dir, dist, fov)
        rcs.setup_neutral_rig()
        rcs.set_world((0.05, 0.055, 0.07), 1.1)
        rcs.set_view_transform(filmic, exposure=1.0)
        bpy.context.scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)

    def run_hub_render():
        args = _args()
        plain = args["plain"]
        out_dir = args["out"]
        os.makedirs(out_dir, exist_ok=True)
        overlays = []
        for pair in args.get("overlays", "").split(";"):
            if ":" in pair:
                tag, path = pair.split(":", 1)
                overlays.append((tag, path))

        rcs._reset_scene()
        bpy.ops.import_scene.gltf(filepath=plain)
        hub_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        _gray_hub(hub_meshes)
        rcs.configure_render(True)  # --fast: donor is huge
        filmic = rcs._pick_filmic()
        center, _ext = rcs.world_bounds(hub_meshes)  # DONOR framing for ALL renders (matched)

        # BEFORE (hub alone)
        for v in HUB_VIEWS:
            _render_view(v, hub_meshes, center, os.path.join(out_dir, f"before_{v}.png"), filmic)
        print("HUB_BEFORE_DONE")

        # AFTER per overlay (import overlay, render, remove it)
        for tag, path in overlays:
            bpy.ops.object.select_all(action="DESELECT")
            before_names = {o.name for o in bpy.data.objects}
            bpy.ops.import_scene.gltf(filepath=path)
            new_objs = [o for o in bpy.data.objects if o.name not in before_names]
            for v in HUB_VIEWS:
                _render_view(v, hub_meshes, center, os.path.join(out_dir, f"after_{tag}_{v}.png"), filmic)
            for o in list(new_objs):
                bpy.data.objects.remove(o, do_unlink=True)
            print(f"HUB_AFTER_DONE {tag}")

    if __name__ == "__main__" and "--hub-render" in (sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []):
        run_hub_render()


# ===========================================================================
# SYSTEM MODE — orchestrate + composite the labeled boards
# ===========================================================================
if not IN_BLENDER:
    import subprocess

    from PIL import Image, ImageDraw, ImageFont

    def _blender():
        env = os.environ.get("SF_BLENDER")
        if env and os.path.isfile(env):
            return env
        c = r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
        if os.path.isfile(c):
            return c
        raise SystemExit("Blender not found; set SF_BLENDER")

    def _font(sz):
        for n in ("consola.ttf", "arialbd.ttf", "arial.ttf"):
            try:
                return ImageFont.truetype(n, sz)
            except Exception:
                continue
        return ImageFont.load_default()

    def _hex_rgb(h):
        h = h.lstrip("#")
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

    def _multiply_tint(im, hexcol):
        r, g, b = _hex_rgb(hexcol)
        src = im.convert("RGB")
        rr, gg, bb = src.split()
        rr = rr.point(lambda v: v * r // 255)
        gg = gg.point(lambda v: v * g // 255)
        bb = bb.point(lambda v: v * b // 255)
        return Image.merge("RGB", (rr, gg, bb))

    def _render_contact(glbs, out, views):
        cmd = [sys.executable, os.path.join(_FOUNDRY, "render_contact_sheet.py")]
        for g in glbs:
            cmd += ["--glb", g]
        cmd += ["--out", out, "--fast", "--views", ",".join(views)]
        subprocess.run(cmd, check=True, capture_output=True, text=True)

    def _load(path, size):
        im = Image.open(path).convert("RGB")
        return im.resize((size, size), Image.LANCZOS)

    def _norm(item):
        """cells may be (img, caption) or (img, caption, color)."""
        return (item[0], item[1], item[2] if len(item) > 2 else None)

    def _board(cells, cols, cell, title, subtitle, sub_rows=None):
        """cells chunked into rows of `cols`; sub_rows are extra explicit rows."""
        pad, header, cap = 12, 54, 24
        main_rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
        total_rows = len(main_rows) + len(sub_rows or [])
        W = cols * cell + (cols + 1) * pad
        H = header + total_rows * (cell + cap + pad) + pad
        board = Image.new("RGB", (W, H), (16, 18, 22))
        d = ImageDraw.Draw(board)
        d.text((pad, 10), title, fill=(235, 238, 244), font=_font(26))
        d.text((pad, 38), subtitle, fill=(150, 158, 172), font=_font(14))

        def place(row, items):
            for c, item in enumerate(items):
                img, capt, col = _norm(item)
                x = pad + c * (cell + pad)
                y = header + row * (cell + cap + pad)
                im = img if isinstance(img, Image.Image) else Image.open(img).convert("RGB")
                im = im.resize((cell, cell), Image.LANCZOS)
                board.paste(im, (x, y))
                d.rectangle([x, y, x + cell - 1, y + cell - 1], outline=(64, 70, 84))
                d.text((x + 3, y + cell + 3), capt, fill=col or (206, 212, 224), font=_font(15))

        for ri, rowcells in enumerate(main_rows):
            place(ri, rowcells)
        for rj, row in enumerate(sub_rows or []):
            place(len(main_rows) + rj, row)
        return board

    def render_wasp_lineups(work):
        os.makedirs(work, exist_ok=True)
        os.makedirs(HERO_RENDERS, exist_ok=True)
        # donor + 3 variants at game_cam
        glbs = [DONOR_WASP] + [os.path.join(VARIANTS, f[1] + ".glb") for f in FACTIONS]
        _render_contact(glbs, work, ["game_cam"])
        donor_gc = os.path.join(work, "wasp_production_v1", "game_cam.png")
        var_gc = [os.path.join(work, f[1], "game_cam.png") for f in FACTIONS]

        cell = 300
        # CLONE board: donor x3
        clone = _board([(donor_gc, "PATROL (donor)", None)] * 3, 3, cell,
                       "WASP LINEUP — CLONE (today)",
                       "Every lawful faction flies the same production Wasp, tinted by owner palette.")
        clone.save(os.path.join(HERO_RENDERS, "wasp_lineup_clone.png"), optimize=True)

        # VARIED board: 3 variants (geometry, neutral) + tinted preview row
        top = [(var_gc[i], FACTIONS[i][0] + " (geometry, neutral)", None) for i in range(3)]
        tint_row = [(_multiply_tint(Image.open(var_gc[i]).convert("RGB"), FACTIONS[i][3]),
                     FACTIONS[i][0] + f" (approx tint {FACTIONS[i][3]})", _hex_rgb(FACTIONS[i][3]))
                    for i in range(3)]
        varied = _board(top, 3, cell,
                        "WASP LINEUP — VARIED (after)",
                        "Construction differs per faction (neutral KitMat). Bottom row: approx runtime tint (EVIDENCE ONLY, not baked).",
                        sub_rows=[tint_row])
        varied.save(os.path.join(HERO_RENDERS, "wasp_lineup_varied.png"), optimize=True)
        print("WASP LINEUPS ->", HERO_RENDERS)

    def ensure_plain_hub(work):
        plain = os.path.join(work, "place_station_trade_hub_plain.glb")
        if not os.path.isfile(plain):
            subprocess.run([
                "node", os.path.join(ROOT, "tools", "art", "decompress_part.mjs"),
                DONOR_HUB, plain], check=True, capture_output=True, text=True)
        return plain

    def render_hub_beforeafter(work):
        os.makedirs(work, exist_ok=True)
        os.makedirs(HERO_RENDERS, exist_ok=True)
        plain = ensure_plain_hub(work)
        frames = os.path.join(work, "hub_frames")
        overlays = ";".join(f"{f[0].split()[0]}:{os.path.join(VARIANTS, f[2] + '.glb')}" for f in FACTIONS)
        cmd = [_blender(), "-b", "--factory-startup", "-P", os.path.abspath(__file__), "--",
               "--hub-render", "--plain", plain, "--out", frames, "--overlays", overlays]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        print("[blender hub]", "\n".join(proc.stdout.strip().splitlines()[-5:]))
        if proc.returncode != 0:
            print(proc.stderr[-1500:])
            raise SystemExit("hub render failed")

        cell = 300
        for tag_full, _ws, _os_, hexc in FACTIONS:
            tag = tag_full.split()[0]
            cells = []
            for v in HUB_VIEWS:
                cells.append((os.path.join(frames, f"before_{v}.png"), f"BEFORE {v}", None))
                cells.append((os.path.join(frames, f"after_{tag}_{v}.png"), f"AFTER {v}", _hex_rgb(hexc)))
            board = _board(cells, 2, cell,
                           f"TRADE HUB — {tag_full}: before / after",
                           "Overlay adds faction construction (neutral gray). Hub renders textureless (decompressed working copy).")
            board.save(os.path.join(HERO_RENDERS, f"hub_before_after_{tag.lower()}.png"), optimize=True)
        print("HUB BEFORE/AFTER ->", HERO_RENDERS)

    def main():
        work = os.environ.get("SF_HERO_WORK") or os.path.join(
            os.environ.get("TEMP", "/tmp"), "sf_hero_evidence")
        render_wasp_lineups(work)
        render_hub_beforeafter(work)
        print("HERO_EVIDENCE_DONE ->", HERO_RENDERS)

    if __name__ == "__main__":
        main()
