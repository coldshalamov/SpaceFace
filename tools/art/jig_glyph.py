# The hull as a drawing in light for the refit jig (src/ui/orrery/hullSchematic.js).
#
# Input: a published plan render (<hull>.top.webp, nose up, transparent film). Output: the same frame,
# the same size, so the render's plan-view marks (assets/ui/renders/hulls/manifest.json `top.marks`)
# land on it unchanged. The body is a faint warm-bone wash from the render's own luminance, its panel
# seams are drawn as fine light lines (edges of the luminance), and its silhouette is a crisp outline.
# No colour of the model survives: decals, pastel blocks and flat shading read as placeholder at jig
# size, while the ship's own structure reads as a technical drawing.
#
#   python tools/art/jig_glyph.py assets/ui/renders/hulls/ship_hornet.top.webp assets/ui/renders/hulls/ship_hornet.jig.webp
import sys
from PIL import Image, ImageChops, ImageFilter, ImageOps

src, out = sys.argv[1], sys.argv[2]
BONE = (236, 229, 214)

im = Image.open(src).convert('RGBA')
a = im.getchannel('A')
mask = a.point(lambda v: 255 if v > 96 else 0)
lum = ImageOps.autocontrast(im.convert('L'), cutoff=1)

# body: a faint wash, a little brighter where the render is lit
body = Image.eval(lum, lambda v: int(16 + (v / 255) ** 1.15 * 96))
body = ImageChops.multiply(body, mask)

# seams: luminance edges inside the hull, thinned and softened into hairlines
seams = lum.filter(ImageFilter.GaussianBlur(0.8)).filter(ImageFilter.FIND_EDGES)
seams = seams.point(lambda v: 0 if v < 16 else min(255, int((v - 16) * 4.2)))
seams = ImageChops.multiply(seams, mask.filter(ImageFilter.MinFilter(5)))
seams = seams.filter(ImageFilter.GaussianBlur(0.45)).point(lambda v: int(v * 0.9))

# the silhouette: a crisp outline two pixels wide
edge = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)), mask.filter(ImageFilter.MinFilter(3)))
edge = edge.filter(ImageFilter.GaussianBlur(0.55))

alpha = ImageChops.lighter(ImageChops.lighter(body, seams), edge)
tint = Image.new('RGB', im.size, BONE)
glyph = Image.merge('RGBA', (*tint.split(), alpha))
glyph.save(out, 'WEBP', quality=92, method=6)
prev = Image.new('RGBA', glyph.size, (6, 8, 12, 255))
prev.alpha_composite(glyph)
prev.convert('RGB').resize((512, 512), Image.LANCZOS).save(out.rsplit('.', 1)[0] + '_prev.jpg', quality=88)
print('ok', out)
