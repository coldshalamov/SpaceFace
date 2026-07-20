import os
import json
import math
import random
from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo

# 1. Stroke definitions for A-Z and 0-9
CHARACTER_PATHS = {
    'A': [
        ('line', (15, 75), (30, 15)),
        ('line', (30, 15), (45, 75)),
        ('line', (20, 50), (27, 50)),
        ('line', (33, 50), (40, 50)),
    ],
    'B': [
        ('line', (15, 15), (15, 75)),
        ('polyline', [(20, 15), (40, 15), (45, 22), (45, 38), (40, 42), (20, 42)]),
        ('polyline', [(20, 48), (40, 48), (45, 52), (45, 68), (40, 75), (20, 75)]),
    ],
    'C': [
        ('polyline', [(45, 22), (40, 15), (20, 15), (15, 22), (15, 68), (20, 75), (40, 75), (45, 68)]),
    ],
    'D': [
        ('line', (15, 15), (15, 75)),
        ('polyline', [(20, 15), (40, 15), (45, 22), (45, 68), (40, 75), (20, 75)]),
    ],
    'E': [
        ('line', (15, 15), (15, 75)),
        ('line', (15, 15), (45, 15)),
        ('line', (15, 45), (38, 45)),
        ('line', (15, 75), (45, 75)),
    ],
    'F': [
        ('line', (15, 15), (15, 75)),
        ('line', (15, 15), (45, 15)),
        ('line', (15, 45), (38, 45)),
    ],
    'G': [
        ('polyline', [(45, 25), (40, 15), (20, 15), (15, 22), (15, 68), (20, 75), (40, 75), (45, 68), (45, 45), (32, 45)]),
    ],
    'H': [
        ('line', (15, 15), (15, 75)),
        ('line', (45, 15), (45, 75)),
        ('line', (15, 45), (25, 45)),
        ('line', (35, 45), (45, 45)),
    ],
    'I': [
        ('line', (30, 15), (30, 75)),
        ('line', (20, 15), (40, 15)),
        ('line', (20, 75), (40, 75)),
    ],
    'J': [
        ('polyline', [(40, 15), (40, 65), (35, 75), (20, 75), (15, 68)]),
    ],
    'K': [
        ('line', (15, 15), (15, 75)),
        ('line', (15, 45), (45, 15)),
        ('line', (23, 37), (45, 75)),
    ],
    'L': [
        ('line', (15, 15), (15, 75)),
        ('line', (15, 75), (45, 75)),
    ],
    'M': [
        ('line', (15, 15), (15, 75)),
        ('line', (45, 15), (45, 75)),
        ('polyline', [(15, 15), (30, 45), (45, 15)]),
    ],
    'N': [
        ('line', (15, 15), (15, 75)),
        ('line', (45, 15), (45, 75)),
        ('line', (15, 15), (45, 75)),
    ],
    'O': [
        ('polyline', [(15, 25), (15, 65), (25, 75), (28, 75)]),
        ('polyline', [(32, 75), (35, 75), (45, 65), (45, 25), (35, 15), (32, 15)]),
        ('polyline', [(28, 15), (25, 15), (15, 25)]),
    ],
    'P': [
        ('line', (15, 15), (15, 75)),
        ('polyline', [(20, 15), (40, 15), (45, 22), (45, 38), (40, 45), (20, 45)]),
    ],
    'Q': [
        ('polyline', [(15, 25), (15, 65), (25, 75), (28, 75)]),
        ('polyline', [(32, 75), (35, 75), (45, 65), (45, 25), (35, 15), (32, 15)]),
        ('polyline', [(28, 15), (25, 15), (15, 25)]),
        ('line', (35, 65), (48, 78)),
    ],
    'R': [
        ('line', (15, 15), (15, 75)),
        ('polyline', [(20, 15), (40, 15), (45, 22), (45, 38), (40, 45), (20, 45)]),
        ('line', (25, 45), (45, 75)),
    ],
    'S': [
        ('polyline', [(45, 22), (40, 15), (20, 15), (15, 22), (15, 38), (45, 42), (45, 68), (40, 75), (20, 75), (15, 68)]),
    ],
    'T': [
        ('line', (15, 15), (45, 15)),
        ('line', (30, 15), (30, 75)),
    ],
    'U': [
        ('polyline', [(15, 15), (15, 65), (20, 75), (40, 75), (45, 65), (45, 15)]),
    ],
    'V': [
        ('line', (15, 15), (30, 75)),
        ('line', (45, 15), (30, 75)),
    ],
    'W': [
        ('polyline', [(15, 15), (20, 75), (30, 45), (40, 75), (45, 15)]),
    ],
    'X': [
        ('line', (15, 15), (45, 75)),
        ('line', (15, 75), (27, 57)),
        ('line', (33, 43), (45, 15)),
    ],
    'Y': [
        ('line', (15, 15), (30, 45)),
        ('line', (45, 15), (30, 45)),
        ('line', (30, 45), (30, 75)),
    ],
    'Z': [
        ('line', (15, 15), (45, 15)),
        ('line', (45, 15), (15, 75)),
        ('line', (15, 75), (45, 75)),
    ],
    '0': [
        ('polyline', [(15, 25), (15, 65), (25, 75), (28, 75)]),
        ('polyline', [(32, 75), (35, 75), (45, 65), (45, 25), (35, 15), (32, 15)]),
        ('polyline', [(28, 15), (25, 15), (15, 25)]),
        ('line', (22, 28), (27, 38)),
        ('line', (33, 52), (38, 62)),
    ],
    '1': [
        ('line', (30, 15), (30, 75)),
        ('line', (20, 25), (30, 15)),
        ('line', (20, 75), (40, 75)),
    ],
    '2': [
        ('polyline', [(15, 25), (20, 15), (40, 15), (45, 25), (45, 45), (15, 75), (45, 75)]),
    ],
    '3': [
        ('polyline', [(15, 22), (20, 15), (40, 15), (45, 22), (45, 42), (30, 42)]),
        ('polyline', [(30, 48), (45, 48), (45, 68), (40, 75), (20, 75), (15, 68)]),
    ],
    '4': [
        ('polyline', [(15, 15), (15, 45), (45, 45)]),
        ('line', (35, 15), (35, 75)),
    ],
    '5': [
        ('line', (15, 15), (45, 15)),
        ('line', (15, 15), (15, 40)),
        ('polyline', [(15, 40), (40, 40), (45, 48), (45, 68), (40, 75), (15, 75)]),
    ],
    '6': [
        ('polyline', [(45, 25), (40, 15), (20, 15), (15, 25), (15, 65), (20, 75), (40, 75), (45, 65), (45, 48), (20, 48)]),
    ],
    '7': [
        ('line', (15, 15), (45, 15)),
        ('line', (45, 15), (25, 75)),
    ],
    '8': [
        ('polyline', [(20, 15), (40, 15), (45, 22), (45, 38), (40, 42), (20, 42)]),
        ('polyline', [(20, 48), (40, 48), (45, 52), (45, 68), (40, 75), (20, 75)]),
        ('line', (15, 20), (15, 40)),
        ('line', (15, 50), (15, 70)),
    ],
    '9': [
        ('polyline', [(20, 42), (40, 42), (45, 38), (45, 22), (40, 15), (25, 15)]),
        ('polyline', [(15, 25), (15, 38), (20, 42)]),
        ('polyline', [(45, 20), (45, 65), (40, 75), (20, 75), (15, 68)]),
    ]
}

def draw_stencil_glyph(draw, path, offset, stroke_width=8, scale=1.0):
    x_off, y_off = offset
    for stroke in path:
        stype = stroke[0]
        if stype == 'line':
            p1, p2 = stroke[1], stroke[2]
            draw.line(
                [(p1[0]*scale + x_off, p1[1]*scale + y_off),
                 (p2[0]*scale + x_off, p2[1]*scale + y_off)],
                fill=(255, 255, 255, 255),
                width=int(stroke_width*scale)
            )
        elif stype == 'polyline':
            points = stroke[1]
            scaled_points = [(p[0]*scale + x_off, p[1]*scale + y_off) for p in points]
            draw.line(
                scaled_points,
                fill=(255, 255, 255, 255),
                width=int(stroke_width*scale)
            )

def draw_text(draw, text, x_start, y_start, scale=0.4, spacing=4, stroke_width=8):
    current_x = x_start
    for char in text:
        if char == ' ':
            current_x += int(60 * scale) + spacing
            continue
        if char in CHARACTER_PATHS:
            draw_stencil_glyph(draw, CHARACTER_PATHS[char], (current_x, y_start), stroke_width, scale)
        current_x += int(60 * scale) + spacing

# 2. Packing logic
def pack_rects(rects, bin_width, gutter=8):
    # Sort rects by height descending, then by width descending, then by name for determinism
    sorted_rects = sorted(rects, key=lambda r: (-r[2], -r[1], r[0]))
    
    packed = {}
    current_x = gutter
    current_y = gutter
    row_height = 0
    
    for name, w, h in sorted_rects:
        if current_x + w + gutter > bin_width:
            current_x = gutter
            current_y += row_height + gutter
            row_height = 0
        
        packed[name] = (current_x, current_y, w, h)
        current_x += w + gutter
        row_height = max(row_height, h)
        
    return packed

def generate_decal_atlas(output_dir, seed=42):
    rng = random.Random(seed)
    
    # Define sizes of all decals
    decals_to_pack = []
    
    # 36 alphanumeric characters
    for char in CHARACTER_PATHS.keys():
        decals_to_pack.append((f"char_{char}", 64, 96))
        
    # Warnings group
    decals_to_pack.append(("warn_chevron_strip", 512, 64))
    decals_to_pack.append(("warn_stripe_block", 256, 256))
    decals_to_pack.append(("warn_no_step_frame", 256, 128))
    decals_to_pack.append(("warn_intake_triangle", 128, 128))
    decals_to_pack.append(("warn_radiation_trefoil", 128, 128))
    decals_to_pack.append(("warn_high_voltage_bolt", 64, 128))
    
    # Service group
    decals_to_pack.append(("serv_fuel_port_ring", 256, 256))
    decals_to_pack.append(("serv_umbilical_socket", 128, 128))
    decals_to_pack.append(("serv_tow_brackets", 128, 128))
    decals_to_pack.append(("serv_lift_here_up", 64, 64))
    decals_to_pack.append(("serv_lift_here_down", 64, 64))
    decals_to_pack.append(("serv_lift_here_left", 64, 64))
    decals_to_pack.append(("serv_lift_here_right", 64, 64))
    decals_to_pack.append(("serv_inspection_tag", 256, 128))
    decals_to_pack.append(("serv_panel_labelframe", 256, 128))
    
    # Factions (8)
    factions = ["scn", "mts", "dmc", "reach", "quiet", "vael", "free", "choir"]
    for f in factions:
        decals_to_pack.append((f"fac_{f}", 128, 128))
        
    # Wear group
    decals_to_pack.append(("wear_kill_tally", 128, 64))
    decals_to_pack.append(("wear_patch_outline", 128, 128))
    decals_to_pack.append(("wear_weld_ring", 256, 256))
    decals_to_pack.append(("wear_scorch_ring", 256, 256))
    decals_to_pack.append(("wear_chips_stamp1", 128, 128))
    decals_to_pack.append(("wear_chips_stamp2", 128, 128))
    decals_to_pack.append(("wear_chips_stamp3", 128, 128))
    
    # Perform packing
    packed = pack_rects(decals_to_pack, 2048, gutter=8)
    
    # Create output image
    atlas_img = Image.new("RGBA", (2048, 2048), (255, 255, 255, 0))
    draw = ImageDraw.Draw(atlas_img)
    
    # Render each item
    for name, (x, y, w, h) in packed.items():
        # Alphanumeric characters
        if name.startswith("char_"):
            char = name.split("_")[1]
            # Center the character (width 60, height 90) in 64x96 cell
            offset = (x + (64 - 60) // 2, y + (96 - 90) // 2)
            draw_stencil_glyph(draw, CHARACTER_PATHS[char], offset, stroke_width=8, scale=1.0)
            
        elif name == "warn_chevron_strip":
            # Strip size 512x64. Chevrons pointing right.
            for cx in range(x + 32, x + 512, 64):
                draw.polygon([
                    (cx - 20, y), (cx + 10, y), (cx + 42, y + 32),
                    (cx + 10, y + 64), (cx - 20, y + 64), (cx + 12, y + 32)
                ], fill=(255, 255, 255, 255))
                
        elif name == "warn_stripe_block":
            # 45 degree stripes in a 256x256 block.
            # Mask to local bounding box to ensure neat edges
            mask_img = Image.new("L", (2048, 2048), 0)
            mask_draw = ImageDraw.Draw(mask_img)
            mask_draw.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
            
            stripe_img = Image.new("RGBA", (2048, 2048), (255, 255, 255, 0))
            stripe_draw = ImageDraw.Draw(stripe_img)
            for i in range(-5, 10):
                xs = x + i * 64
                stripe_draw.polygon([
                    (xs, y), (xs + 32, y), (xs + 32 + 256, y + 256), (xs + 256, y + 256)
                ], fill=(255, 255, 255, 255))
            
            atlas_img.paste(stripe_img, mask=mask_img)
            
        elif name == "warn_no_step_frame":
            # NO-STEP frame: 256x128. Corner brackets and text inside
            draw.line([(x + 15, y + 30), (x + 15, y + 15), (x + 30, y + 15)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 241, y + 30), (x + 241, y + 15), (x + 226, y + 15)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 15, y + 98), (x + 15, y + 113), (x + 30, y + 113)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 241, y + 98), (x + 241, y + 113), (x + 226, y + 113)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "NO STEP", x + 32, y + 46, scale=0.4, spacing=4, stroke_width=8)
            
        elif name == "warn_intake_triangle":
            # Triangle pointing down in 128x128
            draw.polygon([(x + 10, y + 15), (x + 118, y + 15), (x + 64, y + 113)], outline=(255, 255, 255, 255), width=8)
            # Exclamation mark inside
            draw.line([(x + 64, y + 35), (x + 64, y + 75)], fill=(255, 255, 255, 255), width=8)
            draw.ellipse([(x + 64 - 4, y + 88 - 4), (x + 64 + 4, y + 88 + 4)], fill=(255, 255, 255, 255))
            
        elif name == "warn_radiation_trefoil":
            # Radiation symbol in 128x128
            cx, cy = x + 64, y + 64
            draw.ellipse([(cx - 10, cy - 10), (cx + 10, cy + 10)], fill=(255, 255, 255, 255))
            
            def draw_radiation_blade(draw_obj, center, r_inner, r_outer, start_angle, end_angle):
                bx, by = center
                pts = []
                for deg in range(start_angle, end_angle + 1, 5):
                    rad = math.radians(deg)
                    pts.append((bx + r_outer * math.cos(rad), by + r_outer * math.sin(rad)))
                for deg in range(end_angle, start_angle - 1, -5):
                    rad = math.radians(deg)
                    pts.append((bx + r_inner * math.cos(rad), by + r_inner * math.sin(rad)))
                draw_obj.polygon(pts, fill=(255, 255, 255, 255))
                
            draw_radiation_blade(draw, (cx, cy), 18, 48, 60, 120)
            draw_radiation_blade(draw, (cx, cy), 18, 48, 180, 240)
            draw_radiation_blade(draw, (cx, cy), 18, 48, 300, 360)
            
        elif name == "warn_high_voltage_bolt":
            # Lightning bolt in 64x128
            draw.polygon([
                (x + 36, y + 16), (x + 16, y + 68), (x + 32, y + 68),
                (x + 24, y + 112), (x + 48, y + 56), (x + 32, y + 56)
            ], fill=(255, 255, 255, 255))
            
        elif name == "serv_fuel_port_ring":
            # Fuel port ring label: 256x256
            cx, cy = x + 128, y + 128
            draw.ellipse([(cx - 80, cy - 80), (cx + 80, cy + 80)], outline=(255, 255, 255, 255), width=6)
            # Radial lines
            draw.line([(cx + 80, cy), (cx + 95, cy)], fill=(255, 255, 255, 255), width=4)
            draw.line([(cx - 80, cy), (cx - 95, cy)], fill=(255, 255, 255, 255), width=4)
            draw.line([(cx, cy + 80), (cx, cy + 95)], fill=(255, 255, 255, 255), width=4)
            draw.line([(cx, cy - 80), (cx, cy - 95)], fill=(255, 255, 255, 255), width=4)
            # Text FUEL
            draw_text(draw, "FUEL", cx - 66, cy - 22, scale=0.5, spacing=4, stroke_width=8)
            
        elif name == "serv_umbilical_socket":
            # 128x128. Chamfered outline and sockets inside
            draw.polygon([
                (x + 20, y + 10), (x + 108, y + 10), (x + 118, y + 20),
                (x + 118, y + 108), (x + 108, y + 118), (x + 20, y + 118),
                (x + 10, y + 108), (x + 10, y + 20)
            ], outline=(255, 255, 255, 255), width=4)
            cx, cy = x + 64, y + 64
            draw.ellipse([(cx - 24, cy - 24), (cx + 24, cy + 24)], outline=(255, 255, 255, 255), width=4)
            # 3 pins
            draw.ellipse([(cx - 4, cy - 16 - 4), (cx + 4, cy - 16 + 4)], fill=(255, 255, 255, 255))
            draw.ellipse([(cx - 12 - 4, cy + 8 - 4), (cx - 12 + 4, cy + 8 + 4)], fill=(255, 255, 255, 255))
            draw.ellipse([(cx + 12 - 4, cy + 8 - 4), (cx + 12 + 4, cy + 8 + 4)], fill=(255, 255, 255, 255))
            # Text UMB
            draw_text(draw, "UMB", x + 40, y + 98, scale=0.25, spacing=2, stroke_width=4)
            
        elif name == "serv_tow_brackets":
            # Tow brackets: 128x128
            draw.line([(x + 16, y + 32), (x + 16, y + 16), (x + 32, y + 16)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 112, y + 32), (x + 112, y + 16), (x + 96, y + 16)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 16, y + 96), (x + 16, y + 112), (x + 32, y + 112)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 112, y + 96), (x + 112, y + 112), (x + 96, y + 112)], fill=(255, 255, 255, 255), width=4)
            # Ring in center
            cx, cy = x + 64, y + 64
            draw.ellipse([(cx - 16, cy - 16), (cx + 16, cy + 16)], outline=(255, 255, 255, 255), width=4)
            draw_text(draw, "TOW", x + 40, y + 24, scale=0.25, spacing=2, stroke_width=4)
            
        elif name == "serv_lift_here_up":
            # 64x64. Up arrow and LIFT
            draw.line([(x + 32, y + 48), (x + 32, y + 24)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 20, y + 36), (x + 32, y + 20), (x + 44, y + 36)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "LIFT", x + 8, y + 50, scale=0.2, spacing=2, stroke_width=4)
            
        elif name == "serv_lift_here_down":
            # 64x64. Down arrow and LIFT
            draw.line([(x + 32, y + 16), (x + 32, y + 40)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 20, y + 28), (x + 32, y + 44), (x + 44, y + 28)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "LIFT", x + 8, y + 4, scale=0.2, spacing=2, stroke_width=4)
            
        elif name == "serv_lift_here_left":
            # 64x64. Left arrow and LIFT
            draw.line([(x + 48, y + 32), (x + 24, y + 32)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 36, y + 20), (x + 20, y + 32), (x + 36, y + 44)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "LIFT", x + 8, y + 48, scale=0.2, spacing=2, stroke_width=4)
            
        elif name == "serv_lift_here_right":
            # 64x64. Right arrow and LIFT
            draw.line([(x + 16, y + 32), (x + 40, y + 32)], fill=(255, 255, 255, 255), width=4)
            draw.line([(x + 28, y + 20), (x + 44, y + 32), (x + 28, y + 44)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "LIFT", x + 8, y + 48, scale=0.2, spacing=2, stroke_width=4)
            
        elif name == "serv_inspection_tag":
            # Tag: 256x128
            draw.rectangle([x + 10, y + 10, x + 246, y + 118], outline=(255, 255, 255, 255), width=4)
            draw.ellipse([(x + 20, y + 54), (x + 36, y + 70)], outline=(255, 255, 255, 255), width=3)
            draw.line([(x + 48, y + 10), (x + 48, y + 118)], fill=(255, 255, 255, 255), width=3)
            draw_text(draw, "INSP", x + 64, y + 20, scale=0.35, spacing=3, stroke_width=6)
            draw.line([(x + 64, y + 75), (x + 230, y + 75)], fill=(255, 255, 255, 255), width=2)
            draw.line([(x + 64, y + 100), (x + 230, y + 100)], fill=(255, 255, 255, 255), width=2)
            draw_text(draw, "DATE", x + 64, y + 60, scale=0.15, spacing=1, stroke_width=3)
            draw_text(draw, "SIGN", x + 64, y + 85, scale=0.15, spacing=1, stroke_width=3)
            
        elif name == "serv_panel_labelframe":
            # Empty box with header band: 256x128
            draw.rectangle([x + 16, y + 16, x + 240, y + 112], outline=(255, 255, 255, 255), width=4)
            draw.line([(x + 16, y + 44), (x + 240, y + 44)], fill=(255, 255, 255, 255), width=4)
            draw_text(draw, "SEC ID", x + 24, y + 22, scale=0.2, spacing=2, stroke_width=4)
            
        # Factions
        elif name == "fac_scn":
            # shield chevron over bar: 128x128
            draw.line([(x + 24, y + 32), (x + 64, y + 72), (x + 104, y + 32)], fill=(255, 255, 255, 255), width=8)
            draw.line([(x + 24, y + 48), (x + 64, y + 88), (x + 104, y + 48)], fill=(255, 255, 255, 255), width=8)
            draw.line([(x + 24, y + 104), (x + 104, y + 104)], fill=(255, 255, 255, 255), width=8)
            
        elif name == "fac_mts":
            # three nested arcs (coin)
            cx, cy = x + 64, y + 64
            draw.arc([(cx-48, cy-48), (cx+48, cy+48)], 30, 330, fill=(255, 255, 255, 255), width=8)
            draw.arc([(cx-32, cy-32), (cx+32, cy+32)], 30, 330, fill=(255, 255, 255, 255), width=8)
            draw.arc([(cx-16, cy-16), (cx+16, cy+16)], 30, 330, fill=(255, 255, 255, 255), width=8)
            
        elif name == "fac_dmc":
            # pick-and-gear hexagon
            draw.polygon([
                (x + 112, y + 64), (x + 88, y + 105), (x + 40, y + 105),
                (x + 16, y + 64), (x + 40, y + 23), (x + 88, y + 23)
            ], outline=(255, 255, 255, 255), width=6)
            draw.line([(x + 32, y + 44), (x + 64, y + 32), (x + 96, y + 44)], fill=(255, 255, 255, 255), width=8)
            draw.line([(x + 64, y + 32), (x + 64, y + 96)], fill=(255, 255, 255, 255), width=8)
            
        elif name == "fac_reach":
            # jagged claw slash
            draw.line([(x + 24, y + 96), (x + 48, y + 64), (x + 40, y + 56), (x + 80, y + 24)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 40, y + 104), (x + 64, y + 72), (x + 56, y + 64), (x + 96, y + 32)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 56, y + 112), (x + 80, y + 80), (x + 72, y + 72), (x + 112, y + 40)], fill=(255, 255, 255, 255), width=6)
            
        elif name == "fac_quiet":
            # broken circle (gap at top)
            cx, cy = x + 64, y + 64
            draw.arc([(cx-40, cy-40), (cx+40, cy+40)], 295, 245, fill=(255, 255, 255, 255), width=8)
            draw.ellipse([(cx - 8, cy - 8), (cx + 8, cy + 8)], fill=(255, 255, 255, 255))
            
        elif name == "fac_vael":
            # three radiating curved spines
            for i in range(3):
                a_deg = i * 120
                pts = []
                for step in range(4):
                    rad = math.radians(a_deg + step * 20)
                    dist = 15 + step * 12
                    pts.append((x + 64 + dist * math.cos(rad), y + 64 + dist * math.sin(rad)))
                draw.line(pts, fill=(255, 255, 255, 255), width=8)
                
        elif name == "fac_free":
            # open triangle with tail
            draw.line([(x + 24, y + 96), (x + 64, y + 24), (x + 104, y + 96)], fill=(255, 255, 255, 255), width=8)
            draw.line([(x + 64, y + 24), (x + 64, y + 112)], fill=(255, 255, 255, 255), width=8)
            
        elif name == "fac_choir":
            # tall lancet arch with halo dot
            draw.line([
                (x + 36, y + 104), (x + 36, y + 56), (x + 40, y + 40),
                (x + 64, y + 24), (x + 88, y + 40), (x + 92, y + 56), (x + 92, y + 104)
            ], fill=(255, 255, 255, 255), width=8)
            draw.ellipse([(x + 64 - 6, y + 12 - 6), (x + 64 + 6, y + 12 + 6)], fill=(255, 255, 255, 255))
            
        # Wear group
        elif name == "wear_kill_tally":
            # Tally marks: 4 vertical + 1 diagonal slash
            draw.line([(x + 24, y + 12), (x + 24, y + 52)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 44, y + 12), (x + 44, y + 52)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 64, y + 12), (x + 64, y + 52)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 84, y + 12), (x + 84, y + 52)], fill=(255, 255, 255, 255), width=6)
            draw.line([(x + 16, y + 44), (x + 92, y + 20)], fill=(255, 255, 255, 255), width=6)
            
        elif name == "wear_patch_outline":
            # Irregular pentagon outline with rivets
            pts = [(x + 24, y + 24), (x + 104, y + 16), (x + 112, y + 88), (x + 64, y + 112), (x + 16, y + 80)]
            draw.line(pts + [pts[0]], fill=(255, 255, 255, 255), width=4)
            # Rivets at vertices
            for px, py in pts:
                draw.ellipse([(px - 3, py - 3), (px + 3, py + 3)], fill=(255, 255, 255, 255))
            # Rivets at midpoints
            midpoints = [
                (x + 64, y + 20), (x + 108, y + 52), (x + 88, y + 100), (x + 40, y + 96), (x + 20, y + 52)
            ]
            for px, py in midpoints:
                draw.ellipse([(px - 3, py - 3), (px + 3, py + 3)], fill=(255, 255, 255, 255))
                
        elif name == "wear_weld_ring":
            # Bumpy hand-welded ring (radius ~80)
            cx, cy = x + 128, y + 128
            pts = []
            for deg in range(0, 360, 5):
                rad = math.radians(deg)
                r = 80 + 6 * math.sin(rad * 8) + 3 * math.sin(rad * 23) + rng.uniform(-2, 2)
                pts.append((cx + r * math.cos(rad), cy + r * math.sin(rad)))
            draw.line(pts + [pts[0]], fill=(255, 255, 255, 255), width=10)
            
        elif name == "wear_scorch_ring":
            # Scorch ring with soft alpha radial gradient
            scorch_img = Image.new("RGBA", (256, 256), (255, 255, 255, 0))
            pixels = scorch_img.load()
            for sy in range(256):
                dy = sy - 128
                dy2 = dy * dy
                for sx in range(256):
                    dx = sx - 128
                    d = math.sqrt(dx*dx + dy2)
                    val = math.exp(-((d - 64) / 28) ** 2)
                    noise = 0.85 + 0.15 * math.sin(d * 0.5) * math.cos(math.atan2(dy, dx) * 16)
                    alpha = int(255 * val * noise)
                    alpha = max(0, min(255, alpha))
                    pixels[sx, sy] = (255, 255, 255, alpha)
            atlas_img.paste(scorch_img, (x, y), mask=scorch_img)
            
        elif name.startswith("wear_chips_stamp"):
            # Paint chips: irregular polygons near the center
            # Stamp 1: 3 large chips
            # Stamp 2: 12 small chips
            # Stamp 3: linear scrape of chips
            num_chips = 3 if "1" in name else (12 if "2" in name else 8)
            cx, cy = x + 64, y + 64
            
            for _ in range(num_chips):
                if "3" in name:
                    # Aligned along a diagonal scrape line
                    t = rng.uniform(-40, 40)
                    chx = cx + t + rng.uniform(-8, 8)
                    chy = cy + t + rng.uniform(-8, 8)
                    r = rng.uniform(4, 10)
                else:
                    # Random scatter in circle
                    angle = rng.uniform(0, 2*math.pi)
                    dist = rng.uniform(0, 40)
                    chx = cx + dist * math.cos(angle)
                    chy = cy + dist * math.sin(angle)
                    r = rng.uniform(8, 16) if "1" in name else rng.uniform(3, 7)
                
                num_verts = rng.randint(5, 8)
                verts = []
                for vi in range(num_verts):
                    va = vi * (2 * math.pi / num_verts) + rng.uniform(-0.2, 0.2)
                    vr = r + rng.uniform(-r/3, r/3)
                    verts.append((chx + vr * math.cos(va), chy + vr * math.sin(va)))
                draw.polygon(verts, fill=(255, 255, 255, 255))

    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Save PNG without timestamps/metadata deterministically
    png_path = os.path.join(output_dir, "decals_atlas.png")
    metadata = PngInfo()
    atlas_img.save(png_path, "PNG", pnginfo=metadata)
    
    # Export JSON matching EXACTLY the format {name, x, y, w, h}
    # Wait, the prompt asks for decals_atlas.json documenting each decal
    json_path = os.path.join(output_dir, "decals_atlas.json")
    # For determinism, sort keys when writing JSON
    json_data = {}
    for name in sorted(packed.keys()):
        px, py, pw, ph = packed[name]
        json_data[name] = {"name": name, "x": px, "y": py, "w": pw, "h": ph}
        
    with open(json_path, "w") as f:
        json.dump(json_data, f, indent=2, sort_keys=True)

if __name__ == "__main__":
    import sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "assets/ships/foundry/fleet_breadth_20260720/textures"
    generate_decal_atlas(out_dir)
