"""Dreamy grade: island render over the sky plate, sitting in its haze, with a soft glow."""
import sys
from PIL import Image, ImageChops, ImageFilter
d, sky_path = sys.argv[1], sys.argv[2]
HAZE, GLOW, LIFT = 0.09, 0.2, 0.04

def grade(isl):
    sky = Image.open(sky_path).convert("RGB").resize(isl.size, Image.LANCZOS)
    # Aerial perspective: the island takes on the sky behind it, more towards its base.
    haze_col = sky.filter(ImageFilter.GaussianBlur(40))
    grad = Image.linear_gradient("L").resize(isl.size)                   # 0 top, 255 bottom
    amount = grad.point(lambda v: int(255 * (HAZE * 0.6 + HAZE * 0.9 * v / 255)))
    rgb = isl.convert("RGB")
    hazed = Image.composite(haze_col, rgb, amount)
    out = sky.copy()
    out.paste(hazed, (0, 0), isl.getchannel("A"))
    # Soft glow from the bright parts, like the diffusion of a cinema lens.
    bright = out.point(lambda v: max(0, v - 150) * 2).filter(ImageFilter.GaussianBlur(18))
    out = ImageChops.add(out, bright.point(lambda v: int(v * GLOW)))
    # Lifted, blue-grey shadows.
    tone = Image.new("RGB", out.size, (74, 98, 116))
    return Image.blend(out, tone, LIFT)

tiles = [grade(Image.open(f"{d}/az{az}.png").convert("RGBA")) for az in ("000", "090", "180", "270")]
sheet = Image.new("RGB", (sum(t.width for t in tiles), tiles[0].height))
x = 0
for t in tiles:
    sheet.paste(t, (x, 0)); x += t.width
sheet.save(f"{d}/sheet.jpg", quality=90)
tiles[0].save(f"{d}/hero.jpg", quality=92)
