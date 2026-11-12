# The refit jig's drawing of a hull (src/ui/orrery/hullSchematic.js), from tools/art/render_jig.py.
#
# Input: the Freestyle line render (plan view, nose along +X, white lines over a flat near-black fill,
# transparent film). Output: the published drawing, nose up, in the plan view's own frame and size, so
# the plan marks (assets/ui/renders/hulls/manifest.json `top.marks`) land on it unchanged. The lines
# are warm bone; the fill stays near-black and nearly opaque, so whatever the jig draws behind the
# ship (its leaders) is hidden where the ship is.
#
#   blender -b -P tools/art/render_jig.py -- <glb> <raw.png> 1024
#   python tools/art/jig_glyph.py <raw.png> assets/ui/renders/hulls/ship_<hull>.jig.webp
import sys
from PIL import Image, ImageChops, ImageFilter

src, out = sys.argv[1], sys.argv[2]
BONE = (238, 231, 216)
FILL = (8, 8, 9)

im = Image.open(src).convert('RGBA').rotate(90, expand=False, resample=Image.BICUBIC)
body = im.getchannel('A')
line = im.convert('L')  # the fill is near-black, so the lines are the light
k = line.point(lambda v: min(255, int(v * 1.08)))
# the silhouette traced from the fill itself, so the outline is whole even where Freestyle drops an
# edge (a single-sided wing, a trailing edge between two meshes)
mask = body.point(lambda v: 255 if v > 110 else 0)
rim = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(3)), mask.filter(ImageFilter.MinFilter(3)))
rim = rim.filter(ImageFilter.GaussianBlur(0.5)).point(lambda v: min(235, int(v * 1.1)))
k = ImageChops.lighter(k, rim)
bone = Image.new('RGB', im.size, BONE)
dark = Image.new('RGB', im.size, FILL)
rgb = Image.composite(bone, dark, k)
alpha = ImageChops.lighter(body.point(lambda v: int(v * 0.97)), k)
glyph = Image.merge('RGBA', (*rgb.split(), alpha))
glyph.save(out, 'WEBP', quality=94, method=6)
print('ok', out)
