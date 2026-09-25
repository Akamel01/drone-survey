"""Pack bird.py's frames into the sprite the page animates: 16 wingbeat cells, then the glide cell, 72 px each.

    python3 sprite.py <frames-dir> <out.webp>
"""
import glob, sys
from PIL import Image

d, out = sys.argv[1], sys.argv[2]
cells = [Image.open(f).convert("RGBA") for f in sorted(glob.glob(f"{d}/flap_*.png")) + [f"{d}/glide.png"]]
w, h = cells[0].size
sheet = Image.new("RGBA", (w * len(cells), h))
for i, c in enumerate(cells):
    sheet.paste(c, (i * w, 0))
sheet.resize((72 * len(cells), 72), Image.LANCZOS).save(out, "WEBP", quality=90, method=6)
print(out, 72 * len(cells), "x 72")
