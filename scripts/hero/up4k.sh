#!/bin/bash
# up4k.sh <in.mp4> <name> <W> <H>
# 1. Real-ESRGAN x4 on every source frame, straight back down to W x H (batched, so the huge
#    4x frames never pile up on the shared disk).
# 2. RIFE 16x, closing the loop across the last->first frame: 243 frames -> 3888 at 120 fps.
# 3. 4K/120 masters: HEVC (Safari, hardware decode) and AV1 (Chrome), plus poster and blurred still.
set -e
T=~/hero3d/tools; in=$1; name=$2; W=$3; H=$4; k=16; fps=120
work=~/hero3d/interp/$name; out=~/hero3d/web4k
rm -rf $work; mkdir -p $work/src $work/up $work/batch $work/batchx $work/out $out
$T/ffmpeg -v error -i "$in" -vsync 0 $work/src/%08d.png
n=$(ls $work/src | wc -l)
echo "$(date +%T) $name: upscaling $n frames"
i=0
for f in $work/src/*.png; do
  mv "$f" $work/batch/
  i=$((i + 1))
  if [ $((i % 12)) -eq 0 ] || [ $i -eq $n ]; then
    $T/realesrgan/realesrgan-ncnn-vulkan -i $work/batch -o $work/batchx -n realesrgan-x4plus -m $T/realesrgan/models -t 256 -f png >/dev/null 2>&1
    for g in $work/batchx/*.png; do
      $T/ffmpeg -v error -y -i "$g" -vf "scale=${W}:${H}:flags=lanczos" $work/up/$(basename "$g")
    done
    rm -f $work/batch/* $work/batchx/*
    echo "$(date +%T)   $i/$n upscaled"
  fi
done
cp $work/up/00000001.png $work/up/$(printf %08d $((n + 1))).png
echo "$(date +%T) $name: interpolating to $((n * k)) frames"
$T/rife-ncnn-vulkan-20221029-ubuntu/rife-ncnn-vulkan -i $work/up -o $work/out -m $T/rife-ncnn-vulkan-20221029-ubuntu/rife-v4.6 -n $((n * k + 1)) -u -f %08d.jpg >/dev/null 2>&1
rm $work/out/$(printf %08d $((n * k + 1))).jpg
rm -rf $work/up
echo "$(date +%T) $name: encoding"
$T/ffmpeg -v error -y -framerate $fps -i $work/out/%08d.jpg -c:v libx265 -crf 22 -preset medium -tag:v hvc1 -pix_fmt yuv420p -x265-params log-level=error -movflags +faststart $out/$name-4k120-hevc.mp4
$T/ffmpeg -v error -y -framerate $fps -i $work/out/%08d.jpg -c:v libaom-av1 -crf 34 -b:v 0 -cpu-used 6 -row-mt 1 -tiles 4x4 -pix_fmt yuv420p -movflags +faststart $out/$name-4k120-av1.mp4
$T/ffmpeg -v error -y -i $work/out/00000001.jpg -q:v 2 $out/$name-poster.jpg
$T/ffmpeg -v error -y -i $work/out/00000001.jpg -vf "scale=iw/2:-2,gblur=sigma=28,eq=brightness=-0.06:saturation=0.85" -q:v 4 $out/$name-blur.jpg
rm -rf $work
echo "$(date +%T) $name: done"; ls -la $out/$name*
