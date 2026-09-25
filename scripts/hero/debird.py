"""Remove the birds the video model drew into the tall clip's sky, leaving clean sky.

The birds only cross one horizontal band (y 740-980 of the 1440x2560 clip), so only
that band is patched:

    ffmpeg -i tall-raw.mp4 -vf "crop=1440:240:0:740" <dir>/band/%04d.png
    python3 debird.py <dir>
    ffmpeg -i tall-raw.mp4 -framerate 24 -i <dir>/bandp/%04d.png \
      -filter_complex "[0:v][1:v]overlay=0:740:shortest=1" -an \
      -c:v libx264 -crf 10 -preset slow -pix_fmt yuv420p tall-nobirds.mp4

A bird is anything darker than the brightest value that pixel reaches in any frame.
The clean plate is each pixel averaged over only the frames where no bird covers it,
then shifted to each frame's own brightness so the patch does not flicker.
"""
import glob, os, sys
from PIL import Image, ImageChops, ImageFilter, ImageStat, ImageMath
D = sys.argv[1]
fs = sorted(glob.glob(f'{D}/band/*.png'))
frames = [Image.open(f).convert('RGB') for f in fs]
lum_max = frames[0].convert('L')
for im in frames[1:]:
    lum_max = ImageChops.lighter(lum_max, im.convert('L'))
def bird_mask(im, ref_l, grow):
    d = ImageChops.subtract(ref_l, im.convert('L'))
    return d.point(lambda v: 255 if v > 7 else 0).filter(ImageFilter.MaxFilter(grow))
# Average each pixel only over the frames where no bird covers it.
sums = [Image.new('F', frames[0].size, 0.0) for _ in range(3)]
count = Image.new('F', frames[0].size, 0.0)
ref_l = lum_max.filter(ImageFilter.GaussianBlur(2))
for im in frames:
    keep = ImageMath.unsafe_eval('k/255.0', k=ImageChops.invert(bird_mask(im, ref_l, 17)).convert('F'))
    for c, ch in enumerate(im.split()):
        sums[c] = ImageMath.unsafe_eval('s + a*k', s=sums[c], a=ch.convert('F'), k=keep)
    count = ImageMath.unsafe_eval('n + k', n=count, k=keep)
chans = [ImageMath.unsafe_eval('s/(n+0.0001)', s=s, n=count).convert('L') for s in sums]
clean = Image.merge('RGB', chans).filter(ImageFilter.GaussianBlur(1.0))
c_stat = ImageStat.Stat(clean).mean
os.makedirs(f'{D}/bandp', exist_ok=True)
for f, im in zip(fs, frames):
    s = ImageStat.Stat(im).mean
    plate = clean.point([min(255, max(0, round(v + (s[c] - c_stat[c])))) for c in range(3) for v in range(256)])
    mask = bird_mask(im, plate.convert('L'), 11).filter(ImageFilter.GaussianBlur(4))
    Image.composite(plate, im, mask).save(f.replace('/band/', '/bandp/'))
print('patched', len(fs))
