import os
import json
import math
import random
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def generate_trim_sheet(output_dir, seed=42):
    rng = random.Random(seed)
    
    # 1. Band definitions
    bands_info = [
        {"name": "panel_gap", "y_start": 0, "y_end": 102, "desc": "panel gap with shadow line"},
        {"name": "double_panel_gap", "y_start": 102, "y_end": 204, "desc": "double panel gap with fastener row"},
        {"name": "louvered_vent", "y_start": 204, "y_end": 306, "desc": "louvered vent run"},
        {"name": "raised_rail", "y_start": 306, "y_end": 408, "desc": "raised rail with center bevel"},
        {"name": "recessed_channel", "y_start": 408, "y_end": 510, "desc": "recessed channel with drainage holes"},
        {"name": "hatch_frame", "y_start": 510, "y_end": 612, "desc": "hatch frame edge"},
        {"name": "weld_bead", "y_start": 612, "y_end": 714, "desc": "weld bead lap"},
        {"name": "radiator_fins", "y_start": 714, "y_end": 816, "desc": "ribbed radiator fins"},
        {"name": "grip_plate", "y_start": 816, "y_end": 918, "desc": "tread/grip plate"},
        {"name": "brushed_band", "y_start": 918, "y_end": 1024, "desc": "blank brushed band"}
    ]
    
    # Pre-generate 1D streak noise for the brushed band and other metal bands
    streak_noise = [rng.uniform(-0.015, 0.015) for _ in range(1024)]
    
    # We will compute height, roughness, metalness, and basecolor maps
    # Height map values range from 0.0 to 1.0
    height_map = [[0.8 for _ in range(1024)] for _ in range(1024)]
    roughness_map = [[0.5 for _ in range(1024)] for _ in range(1024)]
    metalness_map = [[0.0 for _ in range(1024)] for _ in range(1024)]
    basecolor_map = [[0.25 for _ in range(1024)] for _ in range(1024)]
    
    for band in bands_info:
        name = band["name"]
        y_start = band["y_start"]
        y_end = band["y_end"]
        
        for y in range(y_start, y_end):
            dy = y - y_start
            h_band = y_end - y_start
            
            for x in range(1024):
                # Default values for the band
                h = 0.8
                r = 0.55
                m = 0.0
                c = 0.25
                
                if name == "panel_gap":
                    # Horizontal groove at dy = 51
                    dist_g = abs(dy - 51)
                    if dist_g < 3:
                        h = 0.0
                    elif dist_g < 10:
                        h = 0.8 * ((dist_g - 3) / 7.0)
                    else:
                        h = 0.8
                    # Vertical groove repeating every 256 px
                    dist_v = abs((x % 256) - 128)
                    if dist_v < 3:
                        h_v = 0.0
                    elif dist_v < 10:
                        h_v = 0.8 * ((dist_v - 3) / 7.0)
                    else:
                        h_v = 0.8
                    h = min(h, h_v)
                    r = 0.55
                    m = 0.0
                    c = 0.25
                    
                elif name == "double_panel_gap":
                    # Two horizontal gaps at dy = 24 and dy = 78
                    dist_g1 = abs(dy - 24)
                    dist_g2 = abs(dy - 78)
                    h_gap = 0.8
                    for dg in (dist_g1, dist_g2):
                        if dg < 3:
                            h_gap = min(h_gap, 0.0)
                        elif dg < 9:
                            h_gap = min(h_gap, 0.8 * ((dg - 3) / 6.0))
                    
                    # Fastener row at dy = 51, repeating every 64 px
                    cx = (x // 64) * 64 + 32
                    cy = y_start + 51
                    dist_f = math.sqrt((x - cx)**2 + (y - cy)**2)
                    
                    if dist_f < 8:
                        # Screws are metal and rough=0.35, color=0.44
                        is_slot = (abs(y - cy) < 1.5 and abs(x - cx) < 6)
                        if is_slot:
                            h = 0.4
                        else:
                            h = 0.95
                        r = 0.35
                        m = 1.0
                        c = 0.44
                    else:
                        h = h_gap
                        r = 0.55
                        m = 0.0
                        c = 0.25
                        
                elif name == "louvered_vent":
                    # Louver slat repeating every 32 px
                    lx = x % 32
                    # Vent frame at top/bottom of band
                    if dy < 12 or dy > h_band - 12:
                        h = 0.8
                        r = 0.4
                        m = 1.0
                        c = 0.42
                    else:
                        if 3 <= lx < 29:
                            # Angled slat
                            h = 0.15 + 0.65 * ((lx - 3) / 26.0)
                        else:
                            h = 0.1
                        r = 0.4
                        m = 1.0
                        c = 0.42 + streak_noise[x]
                        
                elif name == "raised_rail":
                    # Raised rail between dy=20 and dy=82. Center bevel.
                    r = 0.35
                    m = 1.0
                    c = 0.45 + streak_noise[x]
                    if 20 <= dy < 82:
                        dist_c = abs(dy - 51)
                        if dist_c < 12:
                            h = 0.95
                        else:
                            h = 0.95 - 0.45 * ((dist_c - 12) / 19.0)
                    else:
                        h = 0.3
                        
                elif name == "recessed_channel":
                    # Recessed channel from dy=24 to dy=78.
                    # Holes in center (dy=51) every 128 px.
                    r_base = 0.6
                    m_base = 0.0
                    c_base = 0.25
                    
                    h_chan = 0.2
                    if dy < 24:
                        if dy < 14:
                            h_chan = 0.8
                        else:
                            h_chan = 0.2 + 0.6 * ((24 - dy) / 10.0)
                    elif dy > 78:
                        if dy > 88:
                            h_chan = 0.8
                        else:
                            h_chan = 0.2 + 0.6 * ((dy - 78) / 10.0)
                            
                    cx = (x // 128) * 128 + 64
                    cy = y_start + 51
                    dist_h = math.sqrt((x - cx)**2 + (y - cy)**2)
                    if dist_h < 12:
                        # Deep hole
                        h = 0.0
                        r = 0.6
                        m = 0.0
                        c = 0.2
                    else:
                        h = h_chan
                        r = r_base
                        m = m_base
                        c = c_base
                        
                elif name == "hatch_frame":
                    # Frame on top (dy < 51), hatch door on bottom (dy >= 51)
                    # Gap at dy = 51
                    dist_gap = abs(dy - 51)
                    r = 0.5
                    m = 0.0
                    c = 0.25
                    if dist_gap < 3:
                        h = 0.0
                    elif dy < 51:
                        # Frame side
                        h = 0.8
                        # Raised reinforce band between 24 and 38
                        if 24 <= dy < 38:
                            h = 0.9
                    else:
                        # Door side
                        h = 0.7
                        # Rivets at dy = 72, repeating every 64 px
                        cx = (x // 64) * 64 + 32
                        cy = y_start + 72
                        dist_r = math.sqrt((x - cx)**2 + (y - cy)**2)
                        if dist_r < 5:
                            h = 0.85
                            r = 0.45
                            m = 1.0 # metal rivet
                            c = 0.4
                            
                elif name == "weld_bead":
                    # Lap joint at dy=51. Top is 0.75, bottom is 0.55
                    base_h = 0.75 if dy < 51 else 0.55
                    r = 0.55
                    m = 0.0
                    c = 0.25
                    
                    # Bumpy weld bead horizontally at dy = 51
                    weld_y = y_start + 51 + 4.0 * math.sin(x * 0.15) + 2.0 * math.cos(x * 0.4)
                    dist_w = abs(y - weld_y)
                    if dist_w < 7:
                        # Weld bead bumps
                        h = 0.85 + 0.08 * math.sin(x * 0.3) - 0.25 * (dist_w / 7.0)**2
                        r = 0.45
                        m = 1.0 # weld bead is bare metal!
                        c = 0.42
                    else:
                        h = base_h
                        
                elif name == "radiator_fins":
                    # Vertical fins: repeat every 16 px
                    lx = x % 16
                    r = 0.3
                    m = 1.0
                    c = 0.44 + streak_noise[x]
                    if dy < 10 or dy > h_band - 10:
                        h = 0.8
                    else:
                        if lx < 6:
                            h = 0.95
                        else:
                            h = 0.2
                            
                elif name == "grip_plate":
                    # Tread plate
                    cx1 = (x // 32) * 32 + 16
                    cy1 = (y // 32) * 32 + 16
                    cx2 = (x // 32) * 32
                    cy2 = (y // 32) * 32
                    
                    rx1 = x - cx1
                    ry1 = y - cy1
                    u1 = rx1 + ry1
                    v1 = rx1 - ry1
                    is_tread1 = (abs(u1) < 10 and abs(v1) < 3.5)
                    
                    rx2 = x - cx2
                    ry2 = y - cy2
                    u2 = rx2 + ry2
                    v2 = rx2 - ry2
                    is_tread2 = (abs(u2) < 3.5 and abs(v2) < 10)
                    
                    if is_tread1 or is_tread2:
                        h = 0.9
                    else:
                        h = 0.4
                    r = 0.85 # rubber/grip roughness
                    m = 0.0
                    c = 0.24
                    
                elif name == "brushed_band":
                    # Flat brushed metal band
                    h = 0.7
                    r = 0.4
                    m = 1.0
                    c = 0.45 + streak_noise[x]
                    
                height_map[y][x] = h
                roughness_map[y][x] = r
                metalness_map[y][x] = m
                basecolor_map[y][x] = c

    # 2. Derive Normals (OpenGL tangent space normal, Y-up)
    # bump_strength determines the slope steepness
    bump_strength = 12.0
    normal_img = Image.new("RGB", (1024, 1024))
    normal_pixels = normal_img.load()
    
    # Cache band bounds for boundary clamped gradients
    band_bounds = {}
    for band in bands_info:
        for y in range(band["y_start"], band["y_end"]):
            band_bounds[y] = (band["y_start"], band["y_end"])
            
    for y in range(1024):
        y_min, y_max = band_bounds[y]
        for x in range(1024):
            # Compute Sobel with vertical clamping inside the band and horizontal wrapping
            h_lu = height_map[max(y_min, y-1)][(x-1)%1024]
            h_u  = height_map[max(y_min, y-1)][x]
            h_ru = height_map[max(y_min, y-1)][(x+1)%1024]
            
            h_l  = height_map[y][(x-1)%1024]
            h_r  = height_map[y][(x+1)%1024]
            
            h_ld = height_map[min(y_max-1, y+1)][(x-1)%1024]
            h_d  = height_map[min(y_max-1, y+1)][x]
            h_rd = height_map[min(y_max-1, y+1)][(x+1)%1024]
            
            dx = (h_ru + 2*h_r + h_rd) - (h_lu + 2*h_l + h_ld)
            # y-1 is +Y direction, y+1 is -Y direction
            dy = (h_lu + 2*h_u + h_ru) - (h_ld + 2*h_d + h_rd)
            
            nx = -dx * bump_strength
            ny = -dy * bump_strength
            nz = 1.0
            
            length = math.sqrt(nx*nx + ny*ny + nz*nz)
            nx /= length
            ny /= length
            nz /= length
            
            r_val = int((nx + 1.0) * 127.5)
            g_val = int((ny + 1.0) * 127.5)
            b_val = int((nz + 1.0) * 127.5)
            
            normal_pixels[x, y] = (r_val, g_val, b_val)
            
    # 3. Derive Cavity AO from height map
    ao_map = [[1.0 for _ in range(1024)] for _ in range(1024)]
    for y in range(1024):
        y_min, y_max = band_bounds[y]
        for x in range(1024):
            # Simple curvature/laplacian cavity
            h_center = height_map[y][x]
            h_l = height_map[y][(x-1)%1024]
            h_r = height_map[y][(x+1)%1024]
            h_u = height_map[max(y_min, y-1)][x]
            h_d = height_map[min(y_max-1, y+1)][x]
            
            mean_n = 0.25 * (h_l + h_r + h_u + h_d)
            diff = h_center - mean_n
            # Deep recesses get lower AO
            ao = 1.0 + 4.0 * min(0.0, diff)
            # Additionally, deep valleys (height near 0) get lower AO overall
            if h_center < 0.3:
                ao = min(ao, 0.3 + 0.7 * (h_center / 0.3))
            ao_map[y][x] = max(0.0, min(1.0, ao))
            
    # Blur AO map using a 5x5 box blur
    blurred_ao = [[1.0 for _ in range(1024)] for _ in range(1024)]
    for y in range(1024):
        y_min, y_max = band_bounds[y]
        for x in range(1024):
            sum_ao = 0.0
            count = 0
            for ky in range(-2, 3):
                by = max(y_min, min(y_max-1, y + ky))
                for kx in range(-2, 3):
                    bx = (x + kx) % 1024
                    sum_ao += ao_map[by][bx]
                    count += 1
            blurred_ao[y][x] = sum_ao / count

    # 4. Save maps
    basecolor_img = Image.new("RGB", (1024, 1024))
    orm_img = Image.new("RGB", (1024, 1024))
    
    base_pixels = basecolor_img.load()
    orm_pixels = orm_img.load()
    
    for y in range(1024):
        for x in range(1024):
            # Basecolor: grays
            c_val = int(max(0.0, min(1.0, basecolor_map[y][x])) * 255)
            base_pixels[x, y] = (c_val, c_val, c_val)
            
            # ORM: R=AO, G=Roughness, B=Metalness
            ao_val = int(max(0.0, min(1.0, blurred_ao[y][x])) * 255)
            r_val = int(max(0.0, min(1.0, roughness_map[y][x])) * 255)
            m_val = int(max(0.0, min(1.0, metalness_map[y][x])) * 255)
            orm_pixels[x, y] = (ao_val, r_val, m_val)
            
    # Save outputs without timestamps deterministically
    os.makedirs(output_dir, exist_ok=True)
    metadata = PngInfo()
    
    basecolor_img.save(os.path.join(output_dir, "trim_basecolor.png"), "PNG", pnginfo=metadata)
    normal_img.save(os.path.join(output_dir, "trim_normal.png"), "PNG", pnginfo=metadata)
    orm_img.save(os.path.join(output_dir, "trim_orm.png"), "PNG", pnginfo=metadata)
    
    # Save layout descriptor JSON
    json_path = os.path.join(output_dir, "trim_sheet.json")
    json_data = {}
    for band in bands_info:
        json_data[band["name"]] = {
            "name": band["name"],
            "y_start": band["y_start"],
            "y_end": band["y_end"],
            "description": band["desc"]
        }
    with open(json_path, "w") as f:
        json.dump(json_data, f, indent=2, sort_keys=True)

if __name__ == "__main__":
    import sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "assets/ships/foundry/fleet_breadth_20260720/textures"
    generate_trim_sheet(out_dir)
