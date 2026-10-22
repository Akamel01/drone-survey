#!/usr/bin/env python3
"""Shared quality protocol for every run (gsplat .pt checkpoint or OpenSplat/INRIA .ply).

Renders every held-out view (gsplat Parser split: sorted names, index % 8 == 0) at full
resolution with gsplat's rasterizer on a black background, and scores it with the same
torchmetrics PSNR / SSIM / LPIPS(alex, normalize=True) that gsplat's simple_trainer uses.

  eval_splat.py --data /data --splat /out/x.ply --out /out/eval.json [--normalize] [--antialiased]

--normalize must match how the splat was trained: gsplat's simple_trainer normalizes world
space by default; OpenSplat .ply files are written back in the input CRS (keepCrs).
"""
import argparse
import json
import math
import sys

import numpy as np
import torch

sys.path.insert(0, "/gsplat/examples")
from datasets.colmap import Dataset, Parser  # noqa: E402
from gsplat.rendering import rasterization  # noqa: E402
from torchmetrics.image import PeakSignalNoiseRatio, StructuralSimilarityIndexMeasure  # noqa: E402
from torchmetrics.image.lpip import LearnedPerceptualImagePatchSimilarity  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--data", required=True)
ap.add_argument("--splat", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--normalize", action="store_true")
ap.add_argument("--antialiased", action="store_true")
ap.add_argument("--save-render", default="", help="write the first held-out render + GT side by side (downsampled) here")
a = ap.parse_args()
dev = "cuda"


def load(path):
    if path.endswith(".pt"):
        s = torch.load(path, map_location=dev)["splats"]
        return {k: s[k].float() for k in ("means", "quats", "scales", "opacities", "sh0", "shN")}
    from plyfile import PlyData
    v = PlyData.read(path)["vertex"]
    col = lambda n: np.asarray(v[n], dtype=np.float32)  # noqa: E731
    names = v.data.dtype.names
    rest = sorted([n for n in names if n.startswith("f_rest_")], key=lambda n: int(n[7:]))
    N = len(v.data)
    t = lambda x: torch.from_numpy(np.ascontiguousarray(x)).to(dev)  # noqa: E731
    shN = np.stack([col(n) for n in rest], 1).reshape(N, 3, -1).transpose(0, 2, 1) if rest else np.zeros((N, 0, 3), np.float32)
    return {
        "means": t(np.stack([col("x"), col("y"), col("z")], 1)),
        "quats": t(np.stack([col(f"rot_{i}") for i in range(4)], 1)),
        "scales": t(np.stack([col(f"scale_{i}") for i in range(3)], 1)),
        "opacities": t(col("opacity")),
        "sh0": t(np.stack([col(f"f_dc_{i}") for i in range(3)], 1)[:, None, :]),
        "shN": t(shN),
    }


splats = load(a.splat)
N = splats["means"].shape[0]
colors = torch.cat([splats["sh0"], splats["shN"]], 1)
sh_degree = int(math.isqrt(colors.shape[1])) - 1

parser = Parser(a.data, factor=1, normalize=a.normalize, test_every=8)
valset = Dataset(parser, split="val")
psnr = PeakSignalNoiseRatio(data_range=1.0).to(dev)
ssim = StructuralSimilarityIndexMeasure(data_range=1.0).to(dev)
lpips = LearnedPerceptualImagePatchSimilarity(net_type="alex", normalize=True).to(dev)

per = []
with torch.no_grad():
    for i in range(len(valset)):
        d = valset[i]
        gt = d["image"].to(dev)[None] / 255.0
        H, W = gt.shape[1:3]
        c2w = d["camtoworld"].to(dev)[None]
        # render in 2048 px blocks and stitch (identical pixels, bounded tile-intersection memory at 45 MP)
        rgb = torch.zeros_like(gt)
        K = d["K"].to(dev)
        for y0 in range(0, H, 2048):
            for x0 in range(0, W, 2048):
                h, w = min(2048, H - y0), min(2048, W - x0)
                Kt = K.clone()
                Kt[0, 2] -= x0
                Kt[1, 2] -= y0
                part, _, _ = rasterization(
                    splats["means"], splats["quats"], torch.exp(splats["scales"]), torch.sigmoid(splats["opacities"]),
                    colors, torch.linalg.inv(c2w), Kt[None], w, h, sh_degree=sh_degree,
                    near_plane=0.01, far_plane=1e10, packed=True,
                    rasterize_mode="antialiased" if a.antialiased else "classic",
                )
                rgb[:, y0:y0 + h, x0:x0 + w] = part
        rgb = rgb.clamp(0, 1)
        p, g = rgb.permute(0, 3, 1, 2), gt.permute(0, 3, 1, 2)
        # 45 MP does not fit through SSIM or LPIPS whole on a 12 GB card (wave 4 ran
        # out of memory in SSIM after 55 min of training). PSNR is exact from the
        # whole-image MSE; SSIM is the pixel-weighted mean over 2048 px tiles (its
        # window is 11 px, so only the tile seams differ); full-image LPIPS is only
        # taken where it fits, and lpips_tiles1024 is the one to compare at 45 MP.
        big = H * W > 2048 * 2048
        mse = torch.mean((p - g) ** 2).item()
        if big:
            num = den = 0.0
            for y in range(0, H, 2048):
                for x in range(0, W, 2048):
                    pt, gtl = p[..., y:y + 2048, x:x + 2048], g[..., y:y + 2048, x:x + 2048]
                    if min(pt.shape[-2:]) < 32:
                        continue
                    n = pt.shape[-2] * pt.shape[-1]
                    num += ssim(pt, gtl).item() * n
                    den += n
            ssim_v, lpips_v = num / den, None
        else:
            ssim_v, lpips_v = ssim(p, g).item(), lpips(p, g).item()
        m = {"image": parser.image_names[valset.indices[i]], "width": W, "height": H,
             "metric_method": "tiled-2048" if big else "whole-image",
             "psnr": 10 * math.log10(1.0 / max(mse, 1e-12)), "ssim": ssim_v, "lpips": lpips_v,
             # research doc 4.0 variant: LPIPS over non-overlapping 1024 px tiles, averaged
             "lpips_tiles1024": float(np.mean([lpips(p[..., y:y + 1024, x:x + 1024], g[..., y:y + 1024, x:x + 1024]).item()
                                               for y in range(0, H - 1023, 1024) for x in range(0, W - 1023, 1024)]))}
        per.append(m)
        print(json.dumps(m), flush=True)
        if i == 0 and a.save_render:
            import imageio.v2 as imageio
            canvas = torch.cat([g, p], 3)[0].permute(1, 2, 0)[::4, ::4].mul(255).byte().cpu().numpy()
            imageio.imwrite(a.save_render, canvas)
        del rgb, p, g, gt

res = {k: (float(np.mean([m[k] for m in per])) if all(m[k] is not None for m in per) else None)
       for k in ("psnr", "ssim", "lpips", "lpips_tiles1024")}
res["metric_method"] = per[0]["metric_method"] if per else None
res.update({"num_gaussians": N, "sh_degree": sh_degree, "num_val_images": len(per), "per_image": per,
            "splat": a.splat, "normalize": a.normalize, "antialiased": a.antialiased})
json.dump(res, open(a.out, "w"), indent=1)
print(f"EVAL psnr={res['psnr']:.3f} ssim={res['ssim']:.4f} lpips_tiles1024={res['lpips_tiles1024']:.4f} "
      f"lpips={res['lpips']} method={res['metric_method']} N={N}")
