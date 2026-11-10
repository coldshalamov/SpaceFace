# Turn a top-down hull render into an instrument-light glyph: the render's own panel detail tinted
# phosphor, alpha from its luminance inside the hull mask, plus a crisp outline. Nose up.
import sys
from PIL import Image, ImageFilter, ImageChops, ImageOps
src, out, rot = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 90
im = Image.open(src).convert('RGBA').rotate(rot, expand=True, resample=Image.BICUBIC)
bbox = im.getchannel('A').getbbox()
pad = 24
im = im.crop((max(0, bbox[0]-pad), max(0, bbox[1]-pad), min(im.width, bbox[2]+pad), min(im.height, bbox[3]+pad)))
side = max(im.size)
sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.alpha_composite(im, ((side-im.width)//2, (side-im.height)//2))
im = sq.resize((512, 512), Image.LANCZOS)
a = im.getchannel('A')
mask = a.point(lambda v: 255 if v > 90 else 0)
lum = ImageOps.autocontrast(im.convert('L'), cutoff=2)
# alpha inside: 0.16 .. 0.72 by luminance
inner = Image.eval(lum, lambda v: int(26 + (v / 255) ** 0.9 * 118))
inner = ImageChops.multiply(inner, mask)
edge = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(5)), mask.filter(ImageFilter.MinFilter(3)))
edge = edge.filter(ImageFilter.GaussianBlur(0.6))
alpha = ImageChops.lighter(inner, edge)
tint = Image.new('RGB', im.size, (223, 238, 255))
outim = Image.merge('RGBA', (*tint.split(), alpha))
outim.save(out, 'WEBP', quality=90, method=6)
prev = Image.new('RGBA', outim.size, (8, 10, 14, 255)); prev.alpha_composite(outim); prev.convert('RGB').save(out.rsplit('.', 1)[0] + '_prev.jpg', quality=88)
print('ok', out)
