# Correct on input, grade on output

Gaussian Splatting bakes appearance into the model: colour lives in the
gaussians. So a client rotating a splat in a browser sees whatever colour the
model was trained with, and no later pass can change it. That makes "make it
look professional" pull in two directions at once, because the most impressive
deliverable is the one that cannot be treated in post.

We split the work in two, by purpose rather than by timing.

**Correction** runs on the input images, before Structure from Motion. Exposure
consistency, white balance, lens profile: deterministic, technical, and not a
matter of taste. It is not done for looks — inconsistent exposure across a
flight degrades feature matching and produces visible seams — so it earns its
place in the pipeline on reconstruction quality alone, and improving appearance
is a side effect.

**Grading** runs on rendered output: video and stills, per deliverable. It is
aesthetic, cheap, reversible, and never touches the model.

The interactive embed therefore shows a corrected model — neutral, clean,
technically sound — while cinematic deliverables carry a full graded look on
top. We stop trying to bake a look into something the client can rotate.

## Consequences

Correction is irreversible in practice. Changing it means retraining, which
costs hours, so its parameters should be conservative and defensible rather than
stylistic. Anything that is a matter of taste belongs in Grading by definition,
and the test for which side a given adjustment falls on is whether a reasonable
person could disagree about it.

Two deliverables from one Reconstruction can differ in Grading but never in
Correction. If a client ever needs the interactive embed itself to carry a
distinct look, that is a retrain, and should be priced as one.
