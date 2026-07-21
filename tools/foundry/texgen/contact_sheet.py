import os
import sys
from PIL import Image, ImageDraw
from PIL.PngImagePlugin import PngInfo

# Import character paths and drawing helper from decal_atlas
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from decal_atlas import CHARACTER_PATHS, draw_text

def create_contact_sheet(tex_dir):
    print("Generating contact sheet...")
    # 1. Create dark-themed background (2048x2048)
    contact_img = Image.new("RGBA", (2048, 2048), (30, 30, 36, 255))
    draw = ImageDraw.Draw(contact_img)

    # 2. Draw grid background lines
    grid_color = (48, 48, 56, 255)
    for i in range(1, 4):
        pos = i * 512
        draw.line([(pos, 0), (pos, 2048)], fill=grid_color, width=2)
        draw.line([(0, pos), (2048, pos)], fill=grid_color, width=2)

    # Helper to load and resize
    def load_scaled(name, target_size):
        path = os.path.join(tex_dir, name)
        if not os.path.exists(path):
            print(f"Warning: file {name} not found!")
            return None
        img = Image.open(path)
        return img.resize(target_size, Image.Resampling.LANCZOS)

    # Helper to draw label box and label using stencil font
    def draw_label(draw_obj, label, x, y):
        # Draw a semi-transparent dark label box
        # Character scale 0.16 -> height ~ 15px, width ~ 10px.
        box_w = len(label) * 12 + 10
        draw_obj.rectangle([x, y, x + box_w, y + 26], fill=(0, 0, 0, 200), outline=(60, 60, 70, 255), width=1)
        draw_text(draw_obj, label, x + 6, y + 5, scale=0.16, spacing=2, stroke_width=3)

    # 3. Paste Decal Atlas (1024x1024 space)
    atlas_scaled = load_scaled("decals_atlas.png", (1024, 1024))
    if atlas_scaled:
        contact_img.paste(atlas_scaled, (0, 0), mask=atlas_scaled)
    draw_label(draw, "DECAL ATLAS", 15, 15)

    # 4. Paste Trim Maps (512x512 each)
    trim_bc = load_scaled("trim_basecolor.png", (512, 512))
    if trim_bc:
        contact_img.paste(trim_bc, (1024, 0))
    draw_label(draw, "TRIM BASECOLOR", 1024 + 15, 15)

    trim_nm = load_scaled("trim_normal.png", (512, 512))
    if trim_nm:
        contact_img.paste(trim_nm, (1536, 0))
    draw_label(draw, "TRIM NORMAL", 1536 + 15, 15)

    trim_orm = load_scaled("trim_orm.png", (512, 512))
    if trim_orm:
        contact_img.paste(trim_orm, (1024, 512))
    draw_label(draw, "TRIM ORM", 1024 + 15, 512 + 15)

    # 5. Paste Grime Masks (512x512 each)
    masks_layout = [
        ("mask_edgewear.png", "EDGE WEAR", (1536, 512)),
        ("mask_recessdust.png", "RECESS DUST", (0, 1024)),
        ("mask_streaking.png", "STREAKING", (512, 1024)),
        ("mask_heatradial.png", "HEAT RADIAL", (1024, 1024)),
        ("mask_chips.png", "CHIPS", (1536, 1024)),
        ("mask_corrosion.png", "CORROSION", (0, 1536)),
        ("mask_carbon.png", "CARBON SOOT", (512, 1536)),
        ("mask_panelfade.png", "PANEL FADE", (1024, 1536)),
    ]

    for filename, label, pos in masks_layout:
        m_img = load_scaled(filename, (512, 512))
        if m_img:
            # Since masks are L mode, pasting into RGBA displays them as grayscale, which is perfect
            contact_img.paste(m_img, pos)
        draw_label(draw, label, pos[0] + 15, pos[1] + 15)

    # 6. Fill the last cell (1536, 1536) with info block
    bx, by = 1536, 1536
    draw.rectangle([bx + 15, by + 15, bx + 497, by + 497], fill=(24, 24, 30, 255), outline=grid_color, width=2)
    # Draw title and subtitle using stencil font
    draw_text(draw, "SPACEFACE", bx + 45, by + 60, scale=0.45, spacing=4, stroke_width=8)
    draw_text(draw, "FLEET FOUNDRY", bx + 45, by + 120, scale=0.28, spacing=3, stroke_width=5)
    draw_text(draw, "LANE E: TEXGEN", bx + 45, by + 160, scale=0.28, spacing=3, stroke_width=5)

    # Metadata labels
    draw_text(draw, "SEED: 42", bx + 45, by + 240, scale=0.2, spacing=2, stroke_width=4)
    draw_text(draw, "FORMAT: PNG", bx + 45, by + 280, scale=0.2, spacing=2, stroke_width=4)
    draw_text(draw, "RESOLUTION: 2K", bx + 45, by + 320, scale=0.2, spacing=2, stroke_width=4)
    draw_text(draw, "OS: WINDOWS 11", bx + 45, by + 360, scale=0.2, spacing=2, stroke_width=4)
    draw_text(draw, "STATUS: OK", bx + 45, by + 400, scale=0.2, spacing=2, stroke_width=4)

    # Save the contact sheet deterministically without metadata timestamps
    output_path = os.path.join(tex_dir, "texgen_contact_sheet.png")
    metadata = PngInfo()
    contact_img.save(output_path, "PNG", pnginfo=metadata)
    print(f"Contact sheet saved to {output_path}")

if __name__ == "__main__":
    import sys
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "assets/ships/foundry/fleet_breadth_20260720/textures"
    create_contact_sheet(out_dir)
