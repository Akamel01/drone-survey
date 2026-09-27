# Hero in Blender 5.2 on a 12 GB card: techniques, free assets, and what each costs to render

Research for issue #221, on branch `research/hero-blender-techniques`. Desk
research over primary sources (the Blender 5.2 manual and release notes, the
Blender Open Data benchmark, Poly Haven and Blender Studio licence pages, NVIDIA
and board-vendor spec sheets), plus what the existing Blender passes v1–v5
already do. Nothing here was rendered on `akamel-linux`; no number below is a
measurement of the hero scene on the RTX 4070 SUPER unless it says so.

**How numbers are marked.** Every claim is tagged:

- **[sourced]** — a URL I read on 2026-09-27, or a first-party doc;
- **[repo]** — read directly from this repository, with `file:line`;
- **[cmd]** — a command and its output, run here on 2026-09-27;
- **[measured]** — an actual run, with the machine named;
- **[estimate]** / **INFERRED** — my arithmetic or judgement, not measured.

Everything in this document that is arithmetic on top of a sourced number is
**[estimate]**. Anything I could not verify against a primary source is marked
**INFERRED** in place.

The target is still the approved "Higgsfield hero": a floating slice of turf
over layered soil, pebble strata and dark basalt, three small conifers, moss
spilling over the edge, tiny white wildflowers, drifting low clouds, a barely
noticeable breeze, the island turning once in 40 s with the camera still
**[repo, `docs/ui-theme/hero-pipeline.md:24-37`]**. The one hard constraint is
the machine: Blender 5.2.2 on an RTX 4070 SUPER with **12 GB** of VRAM
**[repo, ticket #219; `scripts/hero/hero.py:547-552`]**.

---

## 0. The findings that change how the next passes are built

1. **The look the operator wants needs Cycles, not EEVEE Next — EEVEE cannot
   render the clouds or the true global illumination the reference shows.
   [sourced]** EEVEE's manual lists, for volumetrics: only single scattering;
   volumetrics rendered only for camera rays, never in reflections or probes;
   volumetric shadows only for volumes inside the view frustum. It also uses
   several 3D textures at "high video memory usage" **[sourced, EEVEE
   Limitations and Volumes]**. Cycles will render the drifting volumetric clouds
   properly; EEVEE is a fast iteration viewport only. Verdict: **Cycles for
   hero, EEVEE for previews.**

2. **Volumetric clouds are the single biggest render-cost switch, and the
   manual is explicit that they are expensive. [sourced]** Cycles defaults to
   **zero volume bounces** (single scattering); the manual says cloud and smoke
   "look best with many scattering bounces, but in practice one might have to
   limit the number of bounces to keep render times acceptable" **[sourced,
   Cycles material volume]**. A world-volume fog is also called a *bad*
   assumption for atmosphere; the manual says to use a **volume object
   surrounding the scene** instead **[sourced, Cycles material volume]**. This
   is the difference between v1–v5's flat composited haze and the atmospheric
   depth of the reference.

3. **The current hero hides the whole atmosphere in post, not in the render.
   [repo]** `grade.py` applies haze, a soft glow and a shadow lift to the already
   rendered RGBA frame with Pillow **[repo, `scripts/hero/grade.py:4-22`]**. That
   is why v1–v5 read as "cheap 3D": there is no volumetric cloud, no mist pass,
   and no light interaction with the air. The next passes should move haze into
   the scene and keep the grade only for the filmic finish.

4. **Every moving element can be made to loop, but by different means, and the
   cheap means are the safe ones. [estimate, from the documented behaviour]**
   The island turning 360° over the loop is seamless by construction (frame N =
   frame 0); a still camera means the island's own motion never breaks the loop.
   Clouds and breeze are the parts that need care, and shape keys / a periodic
   noise offset are far easier to loop than cloth or soft body, whose simulation
   state does not return to its start. Details and verdicts in §3 and §4.

5. **The shippable asset set is already the safe one. [sourced + repo]** Every
   asset the hero uses today is Poly Haven, which is **CC0 1.0** — commercial
   use, redistribution, no attribution required **[sourced, Poly Haven licence;
   repo, `scripts/hero/fetch_assets.py:5-8`]**. Blender Studio is **CC BY 4.0**,
   safe commercially but requiring attribution **[sourced]**. Anything generated
   on Higgsfield still has an unresolved commercial-use question on the trial
   plan **[repo, `docs/ui-theme/hero-pipeline.md:333`]**.

---

## 1. What Blender version this is, and what v1–v5 actually did

Blender **5.2 LTS** was released 2026-07-14 and is supported until July 2028; the
latest patch in this series is **5.2.2 LTS** (2026-09-15) **[sourced,
blender.org/releases/5-2 and the 5.2 LTS release notes]**. The worktree's own
Blender checks as 5.2.1 LTS (build 2026-08-25) **[cmd, `blender --version`]**, so
the class of techniques below is available. Version-specific 5.2 facts used
later:

- **Cycles texture cache** (`.tx` tiles, loads only the tiles/mips a render
  needs; small render-time cost, more disk) — new in 5.2 **[sourced, 5.2 Cycles
  release notes]**.
- **Thin Wall** mode on Principled BSDF (both engines) — useful for single-sided
  leaves and petals **[sourced, 5.2 press release]**.
- **Node-based hair and cloth physics** (couples a new **XPBD Solver** node),
  marked **experimental** and "cannot yet replace the existing simulation tools"
  **[sourced, 5.2 press release + heise 2026-07-16]**.
- **EEVEE Screen-Space Raytracing overhaul** including a Backface option
  **[sourced, 5.2 EEVEE developer notes]**.

What the procedural island already does, from the one source of truth:

| Element | What hero.py does | Where |
|---|---|---|
| Island body | Built ring-by-ring in `bmesh`: 160 verts around, 22 top rings, 72 strata rings, 30 underside rings | `scripts/hero/hero.py:57,67-113` |
| Strata | 8 hand-tuned layers (thickness, tint, protrusion, gravel flag) as object-Z ramps multiplied by a scanned cliff texture | `:33-42`, `:293-323` |
| Basalt underside | Lichen-rock texture darkened, Voronoi + texture displacement | `:325-343` |
| Turf / moss / grass / flowers | Geometry-Nodes `DistributePointsOnFaces` over carrier copies of the top surface | `:363-419`, `:443-466` |
| Conifers | Poly Haven `fir_sapling_medium`, three copies rotated about the trunk per spot | `:492-503` |
| Underside boulders | 20 rocks scattered and dark-tinted | `:479-490` |
| Sky | Poly Haven `kloofendal_overcast_puresky` HDRI, darkened below the horizon | `:505-520` |
| Render | Cycles, GPU, **OptiX** device, **OIDN** denoiser, 128 samples, 608×1080, AgX Medium-High Contrast | `:540-554` |

The operator's verdict on v1–v5 was that it was "promising, but needed 5–10 more
passes to reach the generated look" **[repo, `docs/ui-theme/hero-pipeline.md:362`]**.
Everything below is aimed at those passes.

---

## 2. The island

### 2.1 Strata and the basalt underside

Three ways to get the layered cut and the wet-dark underside. They are not
mutually exclusive, but they trade authoring time against render cost against
fidelity.

| Technique | What it is | Render / compute cost | Licence | Verdict |
|---|---|---|---|---|
| **Procedural strata (current)** | Object-Z color-ramp bands multiplied by a scanned cliff texture; a Displace/Bump for the ledge relief | **Low.** Shader evaluation only; `displacement_method` Bump costs nothing geometric. One 2k texture set. | Poly Haven textures CC0 | **Adopt as the base.** Fast to iterate; it is the only method that lets the operator re-tune strata in one file. |
| **Sculpted high-poly cut** | Sculpt the whole side once; multires; bake normal/displacement to a low mesh | **High authoring**, moderate render (dense mesh or baked maps). Multires/subdiv multiplies vertex memory | Sculpt is yours; textures CC0 | **Conditional.** Adopt only for the *basalt underside* after the shape is frozen; the strata themselves stay procedural. |
| **Displacement (real geometry)** | Feed the same strata/noise into a Displace modifier (or Material Displacement set to *Displacement Only*) | **Higher.** True displacement "gives the best quality results, if the mesh is finely subdivided. As a result, this method is also the most memory intensive" **[sourced, Cycles material displacement / Displace modifier]** | Yours + CC0 | **Conditional.** Adopt at the *silhouette* only (strata ledges, boulder relief) with Subdivision Surface; never at hero detail across the whole body on 12 GB. |

**Cost note on displacement.** A displacement height map is sampled per vertex;
with real subdivision the vertex count and its acceleration structure grow, which
is where the 12 GB card will bind. Multiplying 160×~120 rings by a Subdivision
Surface of 3 (as `hero.py` already does, `:440`) is the current balance. Raising
subdivision to chase sculpt-like detail is the expensive direction **[estimate]**.

**Verdict for §2.1:** keep the procedural strata; add a *baked* normal map from a
one-off sculpt of the basalt underside rather than real displacement, so the
render stays cheap and the look is sculpted. This is the smallest change that
moves v1–v5 toward the reference.

### 2.2 Sculpted versus procedural — how to choose

- **Procedural** wins wherever the operator wants to re-tune: strata thickness,
  tint, erosion. It is what a "scene code is the source of truth" pipeline wants
  **[repo, `scripts/hero/hero.py:1-7`]**.
- **Sculpted** wins only where a specific, non-repeating silhouette matters: the
  basalt's lumps and the overhung turf lip. The manual's sculpt-and-remesh path
  exists for this; 5.2's voxel remesher now interpolates vertex colors so
  painted detail survives a remesh **[sourced, 5.2 press release]**.
- **Hybrid (recommended):** procedural body; sculpt only the underside, bake to
  normal + AO, discard the high mesh. **Cost:** one bake pass; no render-time
  penalty beyond larger textures. **Licence:** your own. **Verdict: adopt.**

### 2.3 Displacement versus geometry

| Route | Mechanism | Cost | Verdict |
|---|---|---|---|
| **Bump only** (material) | Perturbs the normal at shading time | **Cheapest**: no geometry, no extra memory | Adopt for fine strata grain and lichen bump |
| **Displacement + Bump** (material) | Real displacement plus bump, requires fine subdivision | Medium–high VRAM and build time | Use only on the strata ledges / boulder relief |
| **Displace modifier** | Texture displaces real vertices; supports X/Y/Z, normal, or **RGB→XYZ vector displacement** **[sourced, Displace modifier]** | Displaces before render; vertex count is the limit | Use for the turf dome and the underside lumps where silhouette matters |
| **Geometry Nodes (real geometry)** | Noise → Set Position / Extrude, evaluated on the modifier stack | Re-evaluates per frame if animated; can be baked | Adopt for the underside boulders' irregularity |
| **Geometry as drawn detail** (scatter real rocks) | Instance existing meshes | Instance count is cheap; the source mesh's polycount is the cost | Already in use `hero.py:479-490`; keep |

**Verdict:** bump for grain; real displacement only where the silhouette reads;
GN for anything that must re-generate. Do **not** turn on real displacement
across the whole island — that is the fastest way to exceed 12 GB with a
Subdivision Surface stack **[estimate]**.

### 2.4 Moss and grass: Geometry Nodes versus particle hair

| Technique | Notes | Cost | Verdict |
|---|---|---|---|
| **GN instancing on points** (current) | `DistributePointsOnFaces` → instance real Poly Haven grass/moss/tuft meshes **[sourced, manual; repo `hero.py:363-419`]** | Instances are cheap to place; the cost is the count of real meshes and their polycount. Renders as ordinary geometry | **Adopt.** It is what v1–v5 uses and it scales by density. |
| **Particle-system hair** (legacy) | Emitter hair, children, Hair Dynamics, texture influence; still in the 5.2 manual | Dynamics needs a bake; strand rendering costs; clumping/texture control exists **[sourced, Particle System manual]** | **Reject** for moss/grass. Hair strands are for fur-like density, not for a handful of wildflowers and clumps of moss; it is heavier to author and to bake. |
| **GN hair curves** (curves object) | Generate/Interpolate hair curves, frizz, clump, noise; 5.2 adds **node-based hair dynamics** (experimental) **[sourced, Hair Nodes manual]** | Baked dynamics; curve count × points per curve | **Reject for grass.** Adopt only if a tuft must actually bend in the breeze and no instanced mesh can fake it. |
| **Scanned ground-cover meshes (Poly Haven)** | `moss_01`, `grass_medium_01` are real scanned meshes **designed with geometry nodes** (tags say so) **[cmd, Poly Have API info]** | Each mesh's polycount | **Adopt** — this is the current pipeline and the reference look is surgical detail, not simulated fuzz. |

**Verdict for §2.4:** GN instancing over real scanned meshes. Particle hair and
hair curves are the wrong tool for this scale and this card.

### 2.5 Conifers: Poly Haven versus Blender Studio, and licences

| Source | What it has | Licence (exact) | Ship-safe? | Verdict |
|---|---|---|---|---|
| **Poly Haven — `fir_sapling_medium`** (what the hero uses), plus `fir_tree_01`, `fir_sapling`, `pine_sapling_medium`, `pine_sapling_small`, `pine_tree_01` | Scanned fir/pine meshes, geometry-node foliage, blend files at 1k–8k; `fir_tree_01` polycount 7,853,731 and `pine_sapling_medium` 9,784,670 **[cmd, Poly Haven API]** | **CC0 1.0 Universal (Public Domain Dedication)** — https://creativecommons.org/publicdomain/zero/1.0/ **[sourced, dev.polyhaven.com/license]** | **Yes.** "any purpose, including commercial"; no attribution; may redistribute and include in a product you sell **[sourced, Poly Haven licence + FAQ]** | **Adopt.** The whole hero tree set is Poly Haven; keep it. |
| **Blender Studio** | Production files and asset libraries from the open movies (e.g. Overgrown, Wing It!), each with its own licence snippet; **not** a standalone conifer/tree library | **Generally CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/ ; attribution "**(CC) Blender Foundation | studio.blender.org**" **[sourced, studio.blender.org/remixing]** | **Yes, commercially, with attribution.** "reuse and distribute this content, also commercially, as long you include proper attribution" **[sourced]** | **Conditional.** Only if a *specific* Blender Studio asset beats Poly Haven's fir; carry the attribution into the Delivery Bundle. Do not assume "Blender Studio" means CC0. |

**INFERRED / open:** Blender Studio does not appear to publish a named
conifer/tree model library the way Poly Haven does; its assets are project files
whose licence is stated per asset. Confirm the exact snippet for any specific
asset before using it. The safe default is Poly Haven.

**Polycount is the cost.** `fir_tree_01` at ~7.85 M triangles is a heavy
individual mesh; the hero's `fir_sapling_medium` is the right size, and the pass
places **three copies per tree, nine total** (`hero.py:493-503`), which multiplies
that count. On 12 GB, prefer the sapling meshes and instancing over a full-size
fir **[estimate]**.

### 2.6 Wildflowers

- Current: Poly Haven `flower_heliophila`, small white wildflower, scattered at
  a fixed count per area (`hero.py:450,463-466`). Tagged `wildflower`, `white`,
  `tiny` **[cmd, Poly Haven API]**.
- Licence: **CC0 1.0** **[sourced]**. **Ship-safe yes.**
- Cost: trivial — a few dozen instances. **Verdict: adopt**, raise the count and
  vary scale/rotation for the reference's scattered look.
- **Thin Wall** (5.2 Principled BSDF) is the right mode for the petals so they
  read as single-sided without shadow artefacts **[sourced, 5.2 press release]**.

---

## 3. The atmosphere

The reference's depth comes from drifted low clouds, haze between the island and
the background, and light in the air. Today the hero fakes all of it in
`grade.py`. The options below move it into the render, which is where the cost
is.

### 3.1 Volumetric clouds in Cycles versus rendered cloud plates

| Technique | Mechanism | Render cost | Licence | Verdict |
|---|---|---|---|---|
| **Cycles volumetric clouds** | A volume object (box/domain) with Volume Scatter + noise density, lit by the HDRI/sun; set **volume bounces > 0** for multiple scattering | **High and tunable.** Manual: clouds "look best with many scattering bounces… in practice one might have to limit the number of bounces" **[sourced]**; step size and Max Steps bound cost **[sourced, Cycles Volumes]**; Biased ray-marching is cheaper than the default null-scattering **[sourced]** | Yours; noise is procedural | **Adopt for the hero**, but start at 1–2 volume bounces with a bound box, and only raise if the operator asks. This is the look. |
| **Rendered cloud plates (alpha-matted 2D)** | Render a cloud layer once (or a short loop) with alpha; composite behind the island | **Very low per frame** (compositing only); authoring/one-off render cost | Your render; CC0 if built from Poly Haven sky | **Conditional.** Adopt as the fallback if a 4K frame with volumetrics cost too much, or as a *distant* layer behind a thin volumetric one. |
| **World volume as fog** | Volume Scatter on the World output | Manual warns this is a *bad* assumption for atmosphere; use a volume object instead **[sourced]**; also the hero's world is its HDR **background**, and a world volume and an HDRI fight over the same slot **[sourced, World Environment]** | Yours | **Reject** as the primary haze; use a scene volume object. |

**The 12 GB issue.** EEVEE uses several high-VRAM 3D textures for volumes
**[sourced, EEVEE Volumes]**; Cycles' volumes are ray-marched and scale with
step count and domain size, not a fixed texture, but bounce count and step size
are the knobs. On 12 GB the safe configuration is a **bounded volume box around
the island**, 1–2 bounces, Biased algorithm, moderate step size **[estimate]**.

### 3.2 World haze

| Technique | Cost | Loop-safe? | Verdict |
|---|---|---|---|
| **Distance haze via the Mist pass** (see §3.3) | Free–low; a 0–1 depth image used in the Compositor **[sourced, World Settings / Passes]** | Yes (derived from geometry) | **Adopt** for the aerial perspective between island and horizon |
| **Volume object haze** (thin Volume Scatter shell) | Medium; adds volume steps to every camera ray | Yes if static or periodic | **Adopt thin, behind the island**, if the operator wants light shafts |
| **Post-process haze (current `grade.py`)** | Cheapest | Yes | **Keep as the final filmic touch**, not as the only haze **[repo, `grade.py:10-16`]** |

### 3.3 Mist passes

The mist pass is a render-layer depth map in 0–1 with Start/Depth/Falloff,
consumed in the Compositor to fade distant objects toward the background
**[sourced, Cycles World Settings + Passes]**. It is distinct from and cleaner
than the Depth pass for this **[sourced, Passes]**. **Cost:** negligible; one
extra pass. **Licence:** yours. **Verdict: adopt.** It gives the aerial
perspective the reference has without the cost of a scattering volume.

### 3.4 Seamless 360° loop, per atmosphere option

| Option | How it loops | Risk |
|---|---|---|
| **Static volumetric clouds** (camera still, island turns) | Trivially — nothing in the clouds moves; the loop is the island's rotation, closed by frame N = frame 0 | None |
| **Drifting volumetric clouds** | The cloud domain's animation must be **periodic over the loop**. A procedural 3D noise translated by `d(t)` must satisfy `d(0) ≡ d(1)` modulo the noise domain size, or the domain must rotate a whole 360° over the loop; a plain linear translation does not loop and will visibly jump **[estimate]** | Medium: needs authoring care, not physics |
| **Cloud plates** | Pan the plate horizontally by exactly one tile width per loop and wrap; or render a plate loop with first frame = last | Low, if authored as a tiling layer |
| **World haze / volume shell (static)** | Trivially — static | None |
| **Mist pass** | Derived from depth; as the island turns under a fixed camera the mist is essentially static in screen space | None |

**Verdict:** make the atmosphere loop by **keeping the loud clouds static and
letting the island turn**, and if clouds must drift, make the drift *periodic* by
construction. This keeps the loop guarantee cheap. If the operator wants genuine
drifting volumetric clouds, budget an authoring pass to make the noise offset
periodic before committing to a 4K render **[estimate]**.

---

## 4. The breeze

The reference has "a barely noticeable breeze" moving trees, grass and flowers
**[repo, `docs/ui-theme/hero-pipeline.md:28-29`]**. Three implementations:

| Technique | Mechanism | Cost | Loop | Verdict |
|---|---|---|---|---|
| **Shape keys** | Key a bend/lean on a low-poly tree canopy; key frame 0 = frame N | **Cheapest.** No simulation; blends a small vertex delta at render time **[sourced, Shape Keys manual]** | **Guaranteed** if the keys are set equal at loop ends | **Adopt for trees and flowers.** |
| **Geometry Nodes noise** | `Scene Time` → periodic noise (sin/cos of `2πt`) → offset/direction on instanced grass | Low–medium: the node graph re-evaluates per frame; heavier with high instance counts | Yes, if the phase is built periodic (`sin`/`cos` or a looping noise) **[estimate]** | **Adopt for grass and moss** — the current scatter is already GN (`hero.py:363-419`), so adding a time-driven offset is a small change. |
| **Cloth / soft body** | Simulate a thin canopy or grass card as cloth with a wind force | **High:** bake once, then per-frame reads from cache; sim state does not return to its start, so the loop must be forced closed by settling or by simulating a cycle and trimming **[sourced, Cloth / Soft Body / Baking manual]** | **Hard.** Needs deliberate loop closure, not physics | **Reject** for a 40 s loop on 12 GB. Soft body is "best for simple cloth objects and closed meshes"; cloth's own solver is better for cloth but neither is periodic **[sourced]** |
| **5.2 node-based physics (XPBD)** | New experimental GN hair/cloth dynamics with effectors | Experimental; new; not yet a replacement for the simulation tools **[sourced, 5.2 press release]** | Theoretically periodic if driven by Scene Time and a periodic wind field | **Reject for now**, revisit when it leaves experimental |

**Verdict for §4:** shape keys for trees and flowers, a periodic GN noise offset
for grass and moss. Both loop by construction, both are cheap, and neither needs
a bake. Cloth/soft body cannot be made to loop cheaply and is the wrong tool for
a "barely noticeable" breeze **[estimate]**.

---

## 5. Engine and denoising

### 5.1 Cycles versus EEVEE Next

| Criterion | Cycles | EEVEE Next (5.2) | Source |
|---|---|---|---|
| Volumetric clouds | Full path-traced volumes, configurable bounces | Single scattering only; camera rays only; not in reflections/probes; high-VRAM 3D textures | **[sourced]** EEVEE Limitations + Volumes |
| Global illumination | Physically based, all bounces | Screen-space raytracing + light probes; screen-space limitations (occluded and blended geometry not considered) | **[sourced]** EEVEE Limitations |
| GPU backends | CUDA / **OptiX** (hardware RT on RTX) | Raster + screen-trace | **[sourced]** Cycles GPU Rendering |
| Denoising | OIDN (GPU accel on all RTX) and OptiX | Its own ray-trace denoise | **[sourced]** |
| Speed per frame | Slow, tunable, correct | Fast, approximate | **[estimate]** |

**Verdict:** **Cycles for every hero render**; EEVEE Next for fast look
iteration in the viewport only. EEVEE cannot produce the reference's volumetric
cloud depth or the true GI that separates "dreamy cinematic" from "cheap 3D".

### 5.2 Denoising: OIDN versus OptiX

| Denoiser | Notes | Cost | Verdict |
|---|---|---|---|
| **OpenImageDenoise (OIDN)** | Intel AI denoiser; "typically provides the highest quality" **[sourced, Sampling manual]**; GPU acceleration available on compute capability ≥ 7.0, i.e. all RTX cards **[sourced, GPU Rendering]**; the hero already uses it (`hero.py:546`) | CPU or GPU; GPU accel on the 4070 | **Adopt for final hero frames.** Pair with the Denoising Albedo/Normal passes for the sharpest result **[sourced, Denoise node]** |
| **OptiX AI denoiser** | NVIDIA GPU denoiser; "supports GPU acceleration on some older NVIDIA GPUs where OpenImageDenoise does not" **[sourced, Sampling]** | Fast on the 4070 | **Adopt for previews/iteration**; compare once on the hero — OptiX is faster, OIDN usually cleaner at low samples |

Both are available on the 4070 SUPER. Enable **Denoising Data** passes and use
the **Denoise node** in the Compositor if the raw render must be preserved for
re-grading **[sourced, Denoise node / Passes]**.

### 5.3 The 5.2 texture cache

Enable **Performance → Texture Cache + Auto Generate** to convert image textures
to `.tx` tiles and load only what the render needs; the 5.2 notes call it a
"significant" memory and startup reduction at a small render-time cost and more
disk **[sourced, 5.2 Cycles release notes]**. On a 12 GB card with Poly Haven 2k
(and any 4k) texture sets, **this is the cheapest way to buy VRAM headroom**.
**Verdict: adopt.** Run `blender scene.blend --command maketx` once per scene
**[sourced]**.

---

## 6. Render cost per 4K frame on a 12 GB card

There is **no measured 4K hero frame anywhere in this repository**, and I could
not produce a trustworthy one here (this worktree is a Mac; the card is on
`akamel-linux`). What follows is therefore **[estimate]**, anchored to sourced
facts, and section 6.1 is how to replace it with a real number.

**Anchors.**

- RTX 4070 SUPER: 12 GB GDDR6X, 7168 CUDA cores, 220 W, 504 GB/s, Ada Lovelace
  **[sourced, NVIDIA / MSI / PNY spec sheets]**.
- Blender Open Data **median score 6,149.62** over **2,562** submitted benchmarks
  for the card **[sourced, opendata.blender.org device page]**. This is a
  *relative* score, not seconds.
- The hero preview is **608×1080 = 0.657 MP** at 128 samples; a 4K UHD frame is
  **3840×2160 = 8.29 MP**, i.e. **12.6×** the pixels **[repo `hero.py:542` +
  estimate]**.

**Estimates, per 4K UHD frame, Cycles GPU (OptiX) + OIDN, small bounded scene:**

| Configuration | Samples | Volume bounces | Denoise | Est. seconds / frame | Basis |
|---|---|---|---|---|---|
| Preview, no volumes (as v1–v5) | 128 | 0 | OIDN | **20–60 s** | 12.6× the preview's pixel count at the same sample count; no volume rays **[estimate]** |
| Final, thin volume haze | 128 | 1 | OIDN | **45–120 s** | one scattering bounce adds a second ray family per camera ray **[estimate]** |
| Final, full volumetric clouds | 128 | 2–3 | OIDN | **2–8 min** | manual: multiple scattering is the expensive case and is usually limited **[sourced]** |
| At 512 samples (noise for grade room) | 512 | 1–2 | OIDN | roughly **4× the 128-sample row** | sample cost is roughly linear; denoiser lets you stop earlier **[estimate]** |

**Frames per turn.** The loop is **40 s per turn** at the operator's chosen
speed **[repo]**; the master is 120 fps, but the 4070 will not render 120 fps
natively for this look. If the hero is rendered at 30 fps and slowed or
interpolated (RIFE, already in the pipeline) the count is **1,200 frames per
turn**; at 60 fps, **2,400**. At the "full volumetric clouds" estimate that is
**40–160 hours per turn** on one card **[estimate]** — which is exactly why
§0 finding 2 and §3.1 matter: keep bounces low, keep the cloud domain small, and
render overnights in `tmux` on `akamel-linux` **[repo, ticket #219]**.

**Verdict:** the look is reachable on 12 GB, but a *fully volumetric, 120 fps,
native 4K* turn is not a single-night render. Plan for **30–60 fps native +
RIFE interpolation** (already the pipeline's approach) and start with **1 volume
bounce and a bounded cloud box**, raising only if the operator rejects the look.

### 6.1 Experiments that replace the estimates with measurements

Run these on `akamel-linux` (Blender 5.2.2, `--cycles-print-stats` to log time
and memory). Each is a few frames, not a whole turn.

- **H1 — sample curve.** One framed 4K still, no volumes, 64/128/256 samples;
  record seconds and peak VRAM. Fits the estimate row 1.
- **H2 — volume bounce curve.** Same frame, 1/2/3 volume bounces, bounded cloud
  box, Biased algorithm; record seconds and peak VRAM. Finds the knee.
- **H3 — texture cache on/off.** Same frame with the cache generated; record
  startup, peak VRAM and seconds. Confirms the 12 GB headroom gain.
- **H4 — denoiser shoot-out.** Same noisy frame through OIDN-GPU and OptiX;
  record seconds and inspect for detail loss.
- **H5 — full 40 s turn** at the winning settings and 30 fps; extrapolate to
  120 fps or measure the RIFE path.

The EEVEE row (preview only) can be timed the same way and is expected to be
much faster, but it cannot be the final render **[sourced, limitations]**.

---

## 7. Licences: what is safe to ship

| Asset / tool | Exact licence | Commercial? | Attribution? | Ship in a product? | Source |
|---|---|---|---|---|---|
| Poly Haven models, textures, HDRIs (all the hero's plants, rocks, sky) | **CC0 1.0 Universal** https://creativecommons.org/publicdomain/zero/1.0/ | Yes | Not required | **Yes** — may redistribute and include in a product you sell | **[sourced]** dev.polyhaven.com/license, docs.polyhaven.com/en/faq |
| Poly Haven **live API** (only if you fetch at runtime) | Free for any use | Yes | "Powered by Poly Haven" credit requested | Yes for downloaded assets; the API credit applies to building on the API | **[sourced]** polyhaven.com/our-api |
| Blender Studio production files / libraries | **CC BY 4.0** (generally; per-asset snippets) https://creativecommons.org/licenses/by/4.0/ | Yes | Required: "(CC) Blender Foundation \| studio.blender.org" | **Yes with attribution** in the Delivery Bundle credits | **[sourced]** studio.blender.org/remixing |
| Blender itself (the tool) | GNU GPL | — | — | Tool, never shipped | **[sourced]** blender.org/about/license |
| **Your renders** made with Blender | Yours | Yes | — | Yes | **[sourced]** "What you create with Blender is your sole property" |
| Higgsfield trial outputs (stills, clips) | Unresolved | **Unknown on the trial plan** | — | **Not until confirmed** | **[repo]** `docs/ui-theme/hero-pipeline.md:333` |
| numpy/Pillow/RIFE/Real-ESRGAN/ffmpeg (pipeline tools) | permissive/GPL | — | — | Tools, never shipped; ffmpeg is GPL **[repo, `hero-pipeline.md:325-332`]** | — |

**The shippable set is:** Poly Haven (CC0, no strings) as the base for every
plant, rock, texture and sky; Blender Studio only where a specific asset earns
its attribution line; nothing generated, until the Higgsfield trial terms are
confirmed in writing. **Verdict: adopt Poly Haven CC0 as the default kit for the
Showcase island, and carry a credits file in the Delivery Bundle for any CC BY
asset.**

---

## 8. Rolled-up verdicts

| # | Decision | Verdict |
|---|---|---|
| 1 | Engine for the hero | **Cycles**, OptiX device, OIDN denoise, texture cache on |
| 2 | Engine for iteration | EEVEE Next viewport only |
| 3 | Island strata | Procedural shader bands (keep) + baked normal from a one-off basalt sculpt |
| 4 | Displacement | Bump for grain; real displacement only on silhouette edges |
| 5 | Moss/grass | Geometry-Nodes instancing of scanned CC0 meshes (keep); reject particle hair |
| 6 | Conifers | Poly Haven fir/pine saplings (CC0); Blender Studio only with CC BY attribution |
| 7 | Wildflowers | Poly Haven `flower_heliophila` (CC0), Thin Wall petals, more instances |
| 8 | Clouds | Cycles volumetric clouds, bounded box, 1–2 bounces; plates only as fallback |
| 9 | Haze | Mist pass + thin scene volume; keep `grade.py` glow/lift as the filmic finish |
| 10 | Loop | Island rotates 360°, camera still; keep loud clouds static; drift must be periodic |
| 11 | Breeze | Shape keys (trees/flowers) + periodic GN noise (grass/moss); reject cloth/soft body |
| 12 | Denoise | OIDN-GPU for finals, OptiX for previews |
| 13 | Render budget | 30–60 fps native + RIFE; measure H1–H5 before committing to a full turn |
| 14 | Shipping | Poly Haven CC0 default; Blender Studio CC BY with credits; nothing generated until confirmed |

---

## 9. Open questions

Recorded rather than answered; none block the build.

1. **Blender Studio conifer, exactly.** Does a specific Blender Studio asset
   rival Poly Haven's fir for this look, and what is that asset's own licence
   snippet? The remixing page states CC BY "generally", per asset. **INFERRED
   and unresolved.**
2. **Drifting clouds versus a static sky.** The operator's reference has low
   clouds drifting **[repo]**. If that must be genuine volumetric motion, the
   procedural offset needs a periodic construction; that is an authoring
   decision, not a render setting.
3. **Native frame rate.** Is 30 fps native + RIFE acceptable for the final, or
   does the operator require genuinely rendered 60/120 fps? This decides whether
   a turn is an overnight or a multi-day render **[estimate]**.
4. **Real 4K hero time.** Only experiments H1–H5 on the 4070 can replace §6's
   estimates.
5. **Higgsfield trial terms.** Still unresolved for shipping the existing stills
   and clips **[repo]**; the Blender path in this document is deliberately
   independent of it.
6. **EEVEE for previews only?** Confirm the operator is happy that the final is
   Cycles and EEVEE is not a deliverable path; EEVEE's volumetrics cannot match
   the reference.

---

## 10. Sources

All URLs read 2026-09-27 unless noted.

**Blender version and 5.2 features**
- Blender 5.2 LTS release page (initial release 2026-07-14; 5.2.2 LTS
  2026-09-15; supported to July 2028) — <https://www.blender.org/releases/5-2/>
- Blender 5.2 LTS release notes (texture cache, Thin Wall, node-based hair/cloth
  physics, EEVEE raytracing overhaul) —
  <https://developer.blender.org/docs/release_notes/5.2/>
- Blender 5.2 Cycles release notes (texture cache detail, `maketx`) —
  <https://developer.blender.org/docs/release_notes/5.2/cycles>
- Blender 5.2 EEVEE & Viewport release notes —
  <https://developer.blender.org/docs/release_notes/5.2/eevee/>
- Blender 5.2 LTS press release (Thin Wall, experimental physics) —
  <https://www.blender.org/press/blender-5-2-lts-release/>
- heise, "Blender 5.2 LTS: New Simulations and Eevee Improvements", 2026-07-16 —
  <https://www.heise.de/en/news/Blender-5-2-LTS-New-Simulations-and-Eevee-Improvements-11366897.html>

**Blender 5.2 manual**
- Cycles introduction — <https://docs.blender.org/manual/en/5.2/render/cycles/index.html>
- GPU Rendering (OptiX driver ≥ 575; OIDN GPU accel compute ≥ 7.0) —
  <https://docs.blender.org/manual/en/5.2/render/cycles/gpu_rendering.html>
- Sampling (denoiser choices: OIDN highest quality, OptiX NVIDIA GPU) —
  <https://docs.blender.org/manual/en/5.2/render/cycles/render_settings/sampling.html>
- Cycles Volumes (Biased vs null-scattering; step size; Max Steps) —
  <https://docs.blender.org/manual/en/5.2/render/cycles/render_settings/volumes.html>
- Materials / Volume (world volume poor for fog; use a volume object; multiple
  scattering best but limited by cost) —
  <https://docs.blender.org/manual/en/5.2/render/materials/components/volume.html>
- World Settings (Mist pass) —
  <https://docs.blender.org/manual/en/5.2/render/cycles/world_settings.html>
- World Environment (HDRI vs world volume) —
  <https://docs.blender.org/manual/en/5.2/render/lights/world.html>
- Passes (Mist, Denoising Data) —
  <https://docs.blender.org/manual/en/5.2/render/layers/passes.html>
- Denoise Node (OIDN; albedo/normal passes) —
  <https://docs.blender.org/manual/en/5.2/compositing/types/filter/denoise.html>
- Displace Modifier (texture/strength/midlevel/direction/RGB→XYZ) —
  <https://docs.blender.org/manual/en/5.2/modeling/modifiers/deform/displace.html>
- Displacement (true vs bump; true is most memory intensive) —
  <https://docs.blender.org/manual/en/5.2/render/materials/components/displacement.html>
- Geometry Nodes: Hair Nodes —
  <https://docs.blender.org/manual/en/5.2/modeling/geometry_nodes/hair/index.html>
- Particle System (legacy hair, Hair Dynamics) —
  <https://docs.blender.org/manual/en/5.2/physics/particles/index.html>
- Shape Keys — <https://docs.blender.org/manual/en/5.2/animation/shape_keys/index.html>
- Cloth — <https://docs.blender.org/manual/en/5.2/physics/cloth/index.html>
- Soft Body — <https://docs.blender.org/manual/en/5.2/physics/soft_body/index.html>
- Baking Physics Simulations — <https://docs.blender.org/manual/en/5.2/physics/baking.html>
- EEVEE Limitations (single-scattering volumetrics; camera-ray only; screen-space
  limits) — <https://docs.blender.org/manual/en/5.2/render/eevee/limitations/limitations.html>
- EEVEE Volumes (3D textures, high VRAM; Resolution/Steps) —
  <https://docs.blender.org/manual/en/5.2/render/eevee/render_settings/volumes.html>
- EEVEE Raytracing (method, screen-trace, fast GI) —
  <https://docs.blender.org/manual/en/5.2/render/eevee/render_settings/raytracing.html>

**Assets and licences**
- Poly Haven licence (all assets CC0 1.0; commercial; no attribution; may
  redistribute) — <https://dev.polyhaven.com/license>
- Poly Haven FAQ (commercial use; include in a product you sell) —
  <https://docs.polyhaven.com/en/faq>
- Poly Haven API (free for commercial use) — <https://polyhaven.com/our-api>
- Poly Haven asset data, via the public API **[cmd]** —
  `https://api.polyhaven.com/info/fir_tree_01`,
  `.../pine_sapling_medium`, `.../fir_sapling_medium`,
  `.../flower_heliophila`, `.../grass_medium_01`, `.../moss_01`,
  `.../rock_moss_set_01`
- Blender Studio remixing/licensing (generally CC BY; attribution wording;
  per-asset snippets) — <https://studio.blender.org/remixing>
- Blender licence (your artwork is your sole property) —
  <https://www.blender.org/about/license/>

**Hardware and benchmarks**
- Blender Open Data, RTX 4070 SUPER (median score 6,149.62; 2,562 benchmarks) —
  <https://opendata.blender.org/devices/NVIDIA%20GeForce%20RTX%204070%20SUPER>
- MSI RTX 4070 SUPER 12G spec sheet (7168 CUDA cores, 12 GB GDDR6X, 220 W) —
  <https://www.msi.com/Graphics-Card/GeForce-RTX-4070-SUPER-12G-GAMING-X-SLIM/Specification>
- NVIDIA RTX 40-series specs — <https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/>

**Repository**
- `scripts/hero/hero.py`, `grade.py`, `fetch_assets.py` (what v1–v5 did).
- `docs/ui-theme/hero-pipeline.md` (the approved look, the 40 s turn, the
  "Tried and dropped" table, the Higgsfield open item).
- `docs/ui-theme/plan.md` (decision 4: a pre-rendered hero, no second engine).
- `docs/research/4070-full-quality-techniques-2026-09-14.md` (format precedent;
  the OpenSplat measurements are for splat fitting, not this render).
