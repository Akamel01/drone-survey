"""Fetch CC0 Poly Haven assets into ~/hero3d/assets/<id>/ (blend + textures, HDRI)."""
import json, os, sys, urllib.request

ROOT = os.path.expanduser("~/hero3d/assets")
MODELS = ["moss_01", "grass_medium_01", "grass_medium_02", "flower_heliophila", "fir_sapling_medium", "rock_moss_set_01"]
TEXTURES = ["cliff_side", "excavated_soil_wall", "aerial_rocks_02", "forest_ground_04", "lichen_rock"]
HDRIS = ["kloofendal_overcast_puresky"]
RES = "2k"

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hero3d-fetch"})).read()

def save(url, path):
    if os.path.exists(path):
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = get(url)
    with open(path, "wb") as f:
        f.write(data)
    print(f"  {os.path.relpath(path, ROOT)} {len(data)/1e6:.1f} MB", flush=True)

for aid in MODELS:
    files = json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
    b = files["blend"][RES]["blend"]
    save(b["url"], f"{ROOT}/{aid}/{aid}.blend")
    for rel, inc in b.get("include", {}).items():
        save(inc["url"], f"{ROOT}/{aid}/{rel}")
for aid in TEXTURES:
    files = json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
    for m in ["Diffuse", "nor_gl", "Rough", "Displacement", "AO"]:
        if m in files and RES in files[m]:
            fmt = "jpg" if "jpg" in files[m][RES] else "png"
            save(files[m][RES][fmt]["url"], f"{ROOT}/{aid}/{aid}_{m}_{RES}.{fmt}")
for aid in HDRIS:
    files = json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
    save(files["hdri"]["4k"]["hdr"]["url"], f"{ROOT}/{aid}/{aid}_4k.hdr")
print("done")
