# Solid-Torus Linking Visualization Spec

## Project Context

This document specifies an adaptable visualization system for illustrating three related topological proofs from the draft paper by Tom Banchoff and Dan Margalit:

1. Brouwer fixed point theorem in dimension 2
2. Borsuk--Ulam theorem in dimension 2
3. Poincare / hairy-ball theorem on \(S^2\)

The shared visual idea is:

> Slice the source space into circles, graph each restricted map as a loop in the solid torus \(S^1 \times D^2\), and visualize the topological obstruction as linking, twisting, or crossing the core.

The system should support both paper-quality static figures and interactive / animated exploratory demos.

---

# 1. Shared Mathematical Model

## 1.1 Solid torus coordinates

Use abstract coordinates

\[
(\theta,p) \in S^1 \times D^2,
\]

where

\[
p=(u,v), \qquad u^2+v^2\le 1.
\]

Embed this in \(\mathbb R^3\) for rendering by

\[
E(\theta,u,v)
=
\big((R+a u)\cos\theta,\ (R+a u)\sin\theta,\ a v\big).
\]

Recommended defaults:

```ts
const TORUS_MAJOR_RADIUS = 2.0;
const TORUS_MINOR_RADIUS = 0.65;
```

The **core curve** is

\[
S^1\times\{0\},
\]

rendered as

\[
E(\theta,0,0).
\]

The **meridional disk** at angle \(\theta\) is

\[
\{\theta\}\times D^2.
\]

Every graph curve in these proofs intersects each meridional disk exactly once.

---

## 1.2 Graph curves

A graph curve is not a general knot parameterized arbitrarily. It has the special form

\[
\Gamma(\theta)=(\theta,p(\theta)).
\]

In code:

```ts
interface GraphCurve {
  theta: Float32Array;       // length N
  diskPoints: Float32Array;  // [u0,v0,u1,v1,...]
  xyz: Float32Array;         // embedded tube centerline
  role: 'identity' | 'map' | 'antipodal-map' | 'core' | 'vector-field';
  label?: string;
}
```

The curve should be rendered as a tube, but all intersection logic should be done in the **fiber disk** \(D^2\), not by general 3D tube collision.

Because two graph curves intersect iff they have the same \(\theta\) and the same disk point, intersection tests reduce to:

\[
|p_1(\theta)-p_2(\theta)| < \varepsilon.
\]

---

## 1.3 Core rendering modes

Every proof scene should support these common views.

### A. Domain view

Shows the original object:

- disk \(D^2\) for Brouwer,
- sphere \(S^2\) for Borsuk--Ulam,
- sphere with tangent vector field for Poincare.

This view should show the current slice: circle, latitude, or loop.

### B. Solid-torus graph view

Shows the graph loops in \(S^1\times D^2\).

Required elements:

- semi-transparent solid torus shell,
- visible meridional disks, optionally only a few sampled disks,
- core curve,
- graph curves as thick tubes,
- optional ribbons or swept surfaces.

### C. Slice-inspector view

Shows one meridional disk \(\{\theta\}\times D^2\) in 2D.

This is crucial for explaining:

- Brouwer: \(f_r(\theta)\) versus \(i_r(\theta)\),
- Borsuk--Ulam: \(f_{\mathrm{eq}}(\theta)\), \(\bar f_{\mathrm{eq}}(\theta)\), and the connecting segment \(\ell_\theta\),
- Poincare: the tangent vector \(v(\gamma(\theta))\) as a point in the disk.

### D. Timeline / proof-step controller

Each proof should have a storyboard mode with discrete steps and an animation slider.

---

# 2. Proof 1: Brouwer Fixed Point Theorem

## 2.1 Mathematical setup

Input:

\[
f:D^2\to D^2.
\]

Use polar coordinates on the domain disk:

\[
x=r(\cos\theta,\sin\theta).
\]

For each radius \(r\in(0,1]\), define:

\[
f_r(\theta)=f(r\cos\theta,r\sin\theta).
\]

The graph of \(f_r\) is

\[
\Gamma_f(r,\theta)=(\theta,f_r(\theta)).
\]

The identity map \(i(x)=x\) gives

\[
i_r(\theta)=r(\cos\theta,\sin\theta),
\]

and graph

\[
\Gamma_i(r,\theta)=(\theta,i_r(\theta)).
\]

A fixed point occurs exactly when

\[
\Gamma_f(r,\theta)=\Gamma_i(r,\theta).
\]

Equivalently,

\[
f(r\cos\theta,r\sin\theta)=r(\cos\theta,\sin\theta).
\]

---

## 2.2 Required Brouwer visualizations

### Brouwer Scene 1: Disk map playground

Show the source disk and the map \(f:D^2\to D^2\).

Rendering ideas:

- draw a deformed grid,
- draw arrows \(x\mapsto f(x)\),
- draw the displacement vector \(f(x)-x\),
- show fixed points as highlighted dots.

Interactive requirements:

- user can drag handles to deform the map,
- user can add local folds, twists, compressions, and swirls,
- the map must always be projected back into \(D^2\).

A simple safety projection:

\[
\operatorname{project}(y)=
\begin{cases}
y,& |y|\le 1,\\
y/|y|,& |y|>1.
\end{cases}
\]

For smoother behavior, use a soft radial clamp instead of a hard projection.

---

### Brouwer Scene 2: Radius sweep

Animate \(r\) from a small value \(\epsilon\) to \(1\).

At each \(r\), show two graph curves:

- \(\Gamma_f(r)\),
- \(\Gamma_i(r)\).

For small \(r\):

- \(\Gamma_i(r)\) lies near the core,
- \(\Gamma_f(r)\) lies near \(S^1\times f(0)\),
- assuming \(f(0)\ne 0\), these are visually unlinked parallel-ish loops.

At \(r=1\):

- \(\Gamma_i(1)\) is the \((1,1)\)-curve on the boundary torus,
- \(\Gamma_f(1)\) is some graph loop in the solid torus.

The animation should show that the two curves must pass through one another somewhere during the sweep.

---

### Brouwer Scene 3: Boundary push-to-core

This is the key explanatory visual.

At \(r=1\), assuming \(\Gamma_f(1)\) and \(\Gamma_i(1)\) are disjoint, show a deformation of \(\Gamma_f(1)\) to the core curve:

\[
H_s(\theta)
=
(\theta,(1-s)f_1(\theta)),
\qquad s\in[0,1].
\]

This is radial contraction inside each meridional disk.

Important visual rule:

- \(\Gamma_i(1)\) lies on the boundary of each meridional disk.
- If \(\Gamma_f(1)\) is disjoint from \(\Gamma_i(1)\), then radial contraction avoids \(\Gamma_i(1)\).

At the end:

- \(\Gamma_f(1)\) becomes the core curve,
- the core curve is visibly linked with \(\Gamma_i(1)\),
- therefore \(\Gamma_f(1)\) was linked with \(\Gamma_i(1)\).

---

## 2.3 Brouwer collision detector

For each sampled \((r,\theta)\), compute:

```ts
const eTheta = vec2(Math.cos(theta), Math.sin(theta));
const x = scale(r, eTheta);
const error = length(sub(f(x), x));
```

Track:

```ts
minError(r) = min_theta error(r, theta);
```

When `minError(r) < epsilon`, show:

- bright intersection point in the solid torus,
- corresponding point in the source disk,
- text label: “fixed point.”

This detector is illustrative, not a proof engine.

---

# 3. Proof 2: Borsuk--Ulam

## 3.1 Mathematical setup

Input:

\[
f:S^2\to D^2.
\]

Define the antipodal companion map:

\[
\bar f(x)=f(-x).
\]

Use spherical coordinates:

\[
x(\phi,\theta)
=
(\sin\phi\cos\theta,\sin\phi\sin\theta,\cos\phi),
\]

where:

- \(\phi=0\) is the north pole,
- \(\phi=\pi/2\) is the equator,
- \(\phi=\pi\) is the south pole.

For \(0<\phi\le \pi/2\), define graph curves:

\[
\Gamma_f(\phi,\theta)
=
(\theta,f(x(\phi,\theta))),
\]

and

\[
\Gamma_{\bar f}(\phi,\theta)
=
(\theta,f(-x(\phi,\theta))).
\]

Since

\[
-x(\phi,\theta)=x(\pi-\phi,\theta+\pi),
\]

we can compute

\[
\Gamma_{\bar f}(\phi,\theta)
=
(\theta,f(x(\pi-\phi,\theta+\pi))).
\]

A Borsuk--Ulam point occurs exactly when

\[
\Gamma_f(\phi,\theta)=\Gamma_{\bar f}(\phi,\theta),
\]

that is,

\[
f(x)=f(-x).
\]

---

## 3.2 Required Borsuk--Ulam visualizations

### Borsuk Scene 1: Sphere with paired latitudes

Show \(S^2\), the latitude \(\phi\), and the antipodal latitude \(\pi-\phi\).

For small \(\phi\):

- \(f_\phi\) is close to \(f(N)\),
- \(\bar f_\phi\) is close to \(f(S)\),
- if \(f(N)\ne f(S)\), the graph curves are unlinked.

At \(\phi=\pi/2\):

- both curves come from the equator,
- the antipodal map acts by \(\theta\mapsto\theta+\pi\).

---

### Borsuk Scene 2: Equator graph comparison

At the equator define:

\[
f_{\mathrm{eq}}(\theta)=f(x(\pi/2,\theta)).
\]

Then

\[
\bar f_{\mathrm{eq}}(\theta)
=
f_{\mathrm{eq}}(\theta+\pi).
\]

Render the two graph curves:

- \(\Gamma_f(\pi/2)\),
- \(\Gamma_{\bar f}(\pi/2)\).

If they intersect, highlight the Borsuk--Ulam pair immediately.

If they do not intersect, proceed to the twisted-ribbon visualization.

---

### Borsuk Scene 3: Segment ribbon

For every \(\theta\), draw the segment

\[
\ell_\theta
=
\text{line segment from }
\bar f_{\mathrm{eq}}(\theta)
\text{ to }
f_{\mathrm{eq}}(\theta)
\]

inside the meridional disk \(\{\theta\}\times D^2\).

As \(\theta\) varies, these segments sweep out a ribbon in the solid torus.

The two boundary curves of this ribbon are:

- the graph of \(f_{\mathrm{eq}}\),
- the graph of \(\bar f_{\mathrm{eq}}\).

Key fact to visualize:

\[
\ell_{\theta+\pi}
\]

is the same segment as \(\ell_\theta\), but with endpoints reversed.

So from \(\theta=0\) to \(\theta=\pi\), the segment rotates by an odd multiple of \(\pi\). From \(\theta=\pi\) to \(2\pi\), it does the same again. The total twist is a nonzero full twist.

---

## 3.3 Borsuk twist meter

Let

\[
d(\theta)=f_{\mathrm{eq}}(\theta)-\bar f_{\mathrm{eq}}(\theta).
\]

If there is no intersection, then \(d(\theta)\ne 0\) for all \(\theta\). Define

\[
\alpha(\theta)=\arg d(\theta).
\]

Numerically unwrap \(\alpha\), then compute

\[
\operatorname{twist}
=
\frac{\alpha(2\pi)-\alpha(0)}{2\pi}.
\]

The visualization should show this as a “twist meter.”

Expected topological behavior:

- the twist should be an odd integer,
- in particular, nonzero,
- nonzero twist indicates the two boundary curves of the ribbon are linked.

Do not overstate numerical precision. This is for explanatory visualization.

---

## 3.4 Borsuk collision detector

For each sampled \((\phi,\theta)\), compute:

```ts
const x = spherePoint(phi, theta);
const error = length(sub(f(x), f(neg(x))));
```

Track:

```ts
minError(phi) = min_theta error(phi, theta);
```

When `minError(phi) < epsilon`, show:

- the point \(x\) on the sphere,
- its antipode \(-x\),
- the shared value \(f(x)=f(-x)\) in the disk,
- the intersection point of the graph curves in the solid torus.

---

# 4. Proof 3: Poincare / Hairy-Ball Theorem

## 4.1 Mathematical setup

Input:

A tangent vector field

\[
v:S^2\to \mathbb R^3
\]

satisfying

\[
v(x)\perp x.
\]

Assume for visualization that

\[
|v(x)|\le 1.
\]

Given a unit-speed loop

\[
\gamma:S^1\to S^2,
\]

define an orthonormal frame along \(\gamma\):

\[
e_1(\theta)=\gamma'(\theta),
\]

and

\[
e_2(\theta)=\gamma(\theta)\times e_1(\theta).
\]

Then convert the tangent vector \(v(\gamma(\theta))\) into disk coordinates:

\[
p_\gamma(\theta)
=
\big(
\langle v(\gamma(\theta)),e_1(\theta)\rangle,
\langle v(\gamma(\theta)),e_2(\theta)\rangle
\big).
\]

This gives a graph curve

\[
\Gamma_\gamma(\theta)
=
(\theta,p_\gamma(\theta))
\in S^1\times D^2.
\]

The core curve corresponds to zero vectors:

\[
p_\gamma(\theta)=0.
\]

Therefore, the graph crosses the core iff the vector field has a zero along \(\gamma\).

---

## 4.2 Required Poincare visualizations

### Poincare Scene 1: Sphere with tangent vector field

Show:

- sphere \(S^2\),
- tangent arrows \(v(x)\),
- current loop \(\gamma\),
- the moving tangent frame \((e_1,e_2)\) along \(\gamma\).

The loop should be animated.

Recommended first example:

- a small eastward latitude circle around the north pole.

Near the north pole, a nonzero continuous vector field looks approximately constant in the ambient plane, but relative to the rotating tangent frame, it winds once.

---

### Poincare Scene 2: Graph of a small north-pole loop

For a sufficiently small loop \(\gamma\) around the north pole:

- the graph \(\Gamma_\gamma\) should look like a \((1,1)\)-curve on a radius-\(R\) torus around the core,
- \(R\) is approximately \(|v(N)|\).

The exact sign depends on orientation conventions. The implementation should choose conventions so that the default north-pole loop agrees with the paper’s narrative:

- \(\gamma\) gives a \((1,1)\)-type curve,
- the reversed loop \(\bar\gamma(\theta)=\gamma(-\theta)\) gives a \((1,-1)\)-type curve.

Add a unit test for this convention.

---

### Poincare Scene 3: Loop homotopy to its reverse

Animate a continuous deformation of \(\gamma\) to its reverse \(\bar\gamma\).

Storyboard version:

1. Start with a small loop around the north pole.
2. Enlarge and move it to the Tropic of Cancer.
3. Move it to the equator.
4. Move it to the Tropic of Capricorn.
5. Shrink it to a small loop around the south pole.
6. Move the small loop up along a longitude and over the north pole.
7. End at the original loop, but with reversed orientation.

At every frame, compute the graph curve \(\Gamma_{\gamma_t}\).

The proof idea is:

- \(\Gamma_\gamma\) begins with winding type \((1,1)\),
- \(\Gamma_{\bar\gamma}\) ends with winding type \((1,-1)\),
- to change from one to the other while avoiding the core is impossible,
- therefore some intermediate graph crosses the core,
- hence \(v\) has a zero.

---

## 4.3 Poincare winding meter

For a loop \(\gamma\), compute

\[
p_\gamma(\theta)
=
(u(\theta),v(\theta)).
\]

If the graph avoids the core, then \(p_\gamma(\theta)\ne 0\). Define

\[
\alpha(\theta)=\arg p_\gamma(\theta).
\]

Numerically unwrap \(\alpha\), then compute winding:

\[
w(\gamma)
=
\frac{\alpha(2\pi)-\alpha(0)}{2\pi}.
\]

The visualization should show:

- \(w=+1\) for the initial small loop,
- \(w=-1\) for the reversed loop,
- a warning/crossing event when \(p_\gamma(\theta)=0\).

Again: numerical winding is explanatory, not a formal proof engine.

---

## 4.4 Poincare zero detector

For each sampled loop point:

```ts
const p = tangentVectorInMovingFrame(gamma(theta), gammaPrime(theta), v);
const error = length(p);
```

Track:

```ts
minError(loop) = min_theta error(theta);
```

When `minError < epsilon`, show:

- the zero of the vector field on the sphere,
- the graph crossing the core in the solid torus,
- the corresponding point in the slice-inspector disk.

---

# 5. Function and Field Generators

The system should support hand-coded examples and interactive generated examples.

## 5.1 Disk maps for Brouwer

Interface:

```ts
interface DiskMap {
  id: string;
  name: string;
  evalDisk(x: Vec2, time: number): Vec2;
  shaderSource?: string;
  params: Record<string, number>;
}
```

Suggested generators:

### Identity-plus-displacement

\[
f(x)=\operatorname{project}_{D^2}(x+V(x)).
\]

Here \(V\) is built from user-editable handles.

### Radial contraction

\[
f(x)=a x,\qquad 0\le a\le 1.
\]

### Twist map

In polar coordinates:

\[
(r,\theta)\mapsto (r,\theta+\tau(r)).
\]

Then optionally add displacement and clamp to disk.

### Swirl/fold map

Allow users to drag a crease-like control curve and push points across it.

Important: a true continuous disk-to-disk map should remain continuous. Avoid discontinuous folds unless explicitly marked as “non-proof toy mode.”

---

## 5.2 Sphere-to-disk maps for Borsuk--Ulam

Interface:

```ts
interface SphereDiskMap {
  id: string;
  name: string;
  evalSphere(x: Vec3, time: number): Vec2;
  shaderSource?: string;
  params: Record<string, number>;
}
```

Suggested generators:

### Projection map

\[
f(x,y,z)=(x,y).
\]

### Height-distorted projection

\[
f(x,y,z)=a(z)(x,y),
\]

with \(a(z)\) user-controlled.

### Spherical harmonic toy maps

Use low-frequency modes to make visually interesting maps:

\[
f(x,y,z)=
\operatorname{project}_{D^2}
\big(
P_1(x,y,z),
P_2(x,y,z)
\big).
\]

---

## 5.3 Tangent vector fields on \(S^2\)

Interface:

```ts
interface TangentVectorField {
  id: string;
  name: string;
  evalSphereTangent(x: Vec3, time: number): Vec3;
  shaderSource?: string;
  params: Record<string, number>;
}
```

Every vector field must be projected tangent:

```ts
function tangentProject(x: Vec3, w: Vec3): Vec3 {
  return sub(w, scale(dot(w, x), x));
}
```

Then normalize or clamp length to \(\le 1\).

Suggested generators:

### Projected constant field

\[
v(x)=a-\langle a,x\rangle x.
\]

This has two zeros at \(\pm a/|a|\), so it is a good canonical hairy-ball example.

### Rotational field

\[
v(x)=\omega\times x.
\]

This has zeros at the poles of the rotation axis.

### User-painted field

Let user place vector handles on the sphere. Interpolate ambient vectors, then tangent-project.

---

# 6. Rendering Requirements

## 6.1 Solid torus graph renderer

Must render:

- core curve,
- graph curves as tubes,
- optional meridional disks,
- optional semi-transparent torus boundary,
- optional ribbon surfaces,
- intersection markers.

Recommended curve rendering:

- sample \(N=512\) or \(1024\) values of \(\theta\),
- build a tube mesh along the embedded curve,
- use screen-space antialiasing,
- support high-resolution export.

---

## 6.2 Ribbon renderer

Needed mainly for Borsuk--Ulam.

For each \(\theta_i\), create two points:

\[
p_0(\theta_i)=\bar f_{\mathrm{eq}}(\theta_i),
\]

\[
p_1(\theta_i)=f_{\mathrm{eq}}(\theta_i).
\]

Build a strip mesh with vertices:

\[
E(\theta_i,p_0(\theta_i)),
\qquad
E(\theta_i,p_1(\theta_i)).
\]

Add cross-stripes along the ribbon so the twist is legible.

---

## 6.3 Slice-inspector disk

Render a 2D disk for a selected \(\theta\).

It should support:

- points \(f_r(\theta)\), \(i_r(\theta)\),
- points \(f_{\mathrm{eq}}(\theta)\), \(\bar f_{\mathrm{eq}}(\theta)\),
- segment \(\ell_\theta\),
- vector-field point \(p_\gamma(\theta)\),
- core point at the disk center,
- distance/error label.

This view is pedagogically important because it explains why graph intersections encode fixed points, antipodal equal values, or zeros of a vector field.

---

# 7. Analysis Helpers

## 7.1 Graph-graph intersection

Use same-\(\theta\) comparison:

```ts
function graphDistanceAtTheta(curveA: GraphCurve, curveB: GraphCurve, i: number): number {
  const ax = curveA.diskPoints[2 * i + 0];
  const ay = curveA.diskPoints[2 * i + 1];
  const bx = curveB.diskPoints[2 * i + 0];
  const by = curveB.diskPoints[2 * i + 1];
  return Math.hypot(ax - bx, ay - by);
}
```

For better accuracy, after finding the closest sampled \(\theta_i\), refine using local 1D minimization.

---

## 7.2 Core crossing

For a graph curve \(\Gamma(\theta)=(\theta,p(\theta))\), core crossing is:

```ts
length(p(theta)) < epsilon
```

Used for Poincare.

---

## 7.3 Winding number in a fiber disk

For a nonzero disk-valued loop \(p(\theta)\):

```ts
const angle = Math.atan2(p.y, p.x);
const unwrappedAngle = unwrap(angle);
const winding = (unwrappedAngle[N - 1] - unwrappedAngle[0]) / (2 * Math.PI);
```

Used for:

- Borsuk ribbon twist,
- Poincare graph winding around the core.

---

## 7.4 Linking number, optional

For display only, implement an approximate linking-number estimator.

Two options:

### Option A: special solid-torus invariants

Since these curves are graphs over \(S^1\), many relevant examples can be diagnosed by winding in the fiber disk relative to another reference curve.

### Option B: Gauss linking integral

For two disjoint closed polygonal curves \(C_1,C_2\), approximate:

\[
\operatorname{Lk}(C_1,C_2)
=
\frac{1}{4\pi}
\int_{C_1}\int_{C_2}
\frac{(r_1-r_2)\cdot(dr_1\times dr_2)}
{|r_1-r_2|^3}.
\]

This is useful for visual feedback, but do not rely on it as a formal certifier.

---

# 8. Storyboard Mode

Each theorem should have a guided proof mode.

## 8.1 Brouwer storyboard

1. Show disk map \(f:D^2\to D^2\).
2. Show circular slice \(S_r\).
3. Graph \(f_r\) and \(i_r\) in the solid torus.
4. For small \(r\), show unlinked loops.
5. Increase \(r\) to \(1\).
6. Show \(i_1\) as the \((1,1)\)-curve.
7. Radially push \(f_1\) to the core.
8. Show core linked with \(i_1\).
9. Conclude some intermediate \(r\) forced an intersection.
10. Highlight the fixed point.

---

## 8.2 Borsuk--Ulam storyboard

1. Show \(f:S^2\to D^2\).
2. Show latitude \(\phi\) and antipodal latitude \(\pi-\phi\).
3. Graph \(f_\phi\) and \(\bar f_\phi\).
4. For small \(\phi\), show unlinked loops near \(f(N)\) and \(f(S)\).
5. Move to the equator.
6. Show \(\bar f_{\mathrm{eq}}(\theta)=f_{\mathrm{eq}}(\theta+\pi)\).
7. Draw connecting segments \(\ell_\theta\).
8. Sweep the segments into a twisted ribbon.
9. Show that the ribbon edges are linked.
10. Conclude some earlier \(\phi\) forced an intersection.
11. Highlight antipodal points \(x,-x\) with equal \(f\)-value.

---

## 8.3 Poincare storyboard

1. Show tangent vector field \(v\) on \(S^2\).
2. Choose a small loop \(\gamma\) around the north pole.
3. Convert \(v(\gamma(\theta))\) into moving-frame disk coordinates.
4. Graph \(\Gamma_\gamma\) in the solid torus.
5. Show \(\Gamma_\gamma\) winding once around the core.
6. Deform \(\gamma\) continuously to its reverse.
7. Show the graph changing from \((1,1)\)-type to \((1,-1)\)-type.
8. Explain that this cannot happen while avoiding the core.
9. Highlight the moment where the graph crosses the core.
10. Show the corresponding zero of \(v\) on the sphere.

---

# 9. MVP Implementation Plan

## Phase 1: Static core

Implement:

- solid torus embedding,
- graph curve sampling,
- tube rendering,
- core curve,
- meridional slice inspector.

Hard-code one example for each theorem.

## Phase 2: Brouwer interactive demo

Implement:

- editable disk map,
- radius slider \(r\),
- graph curves \(\Gamma_f(r)\), \(\Gamma_i(r)\),
- fixed-point detector,
- boundary push-to-core animation.

## Phase 3: Borsuk--Ulam ribbon demo

Implement:

- sphere-to-disk map,
- latitude slider \(\phi\),
- antipodal graph curve,
- equator ribbon,
- twist meter,
- antipodal-equality detector.

## Phase 4: Poincare loop demo

Implement:

- tangent vector fields on \(S^2\),
- loop editor / loop homotopy,
- moving frame along loop,
- graph curve in solid torus,
- winding meter,
- core-crossing detector.

## Phase 5: paper-quality export

Implement:

- fixed cameras,
- high-res PNG/SVG export,
- transparent background option,
- labeled diagrams,
- presets matching the paper’s figures,
- animation export as video or image sequence.

---

# 10. Important Conceptual Guardrails for the Coding LLM

1. **Do not treat the solid-torus curves as arbitrary knots.**  
   They are graphs over \(S^1\), so same-\(\theta\) comparisons are meaningful and should drive intersection detection.

2. **Keep mathematical coordinates separate from rendering coordinates.**  
   Store curves as \((\theta,u,v)\). Only convert to \(\mathbb R^3\) for display.

3. **The numerical detectors illustrate the theorem; they do not prove it.**  
   The proof is topological. The code should expose the topology visually.

4. **Continuity matters.**  
   Interactive maps should remain continuous unless explicitly placed in a “toy/non-proof” mode.

5. **The core curve has different meanings in different proofs.**  
   - Brouwer: deformation target for \(f_1\).
   - Borsuk--Ulam: not central except as part of the solid-torus visual language.
   - Poincare: zero vectors; crossing the core is the theorem.

6. **The slice-inspector is essential.**  
   Without it, the viewer sees pretty knots but may not understand why intersections in the solid torus correspond to fixed points, antipodal equalities, or zeros of a vector field.

7. **The Borsuk--Ulam ribbon is the main new visual object.**  
   It should look like an actual twisted strip whose two boundary loops are linked.

8. **The Poincare proof depends on the moving tangent frame.**  
   The visualization must show that the vector field is converted into disk coordinates relative to \(\gamma'(\theta)\), not relative to a fixed ambient frame.

---

# 11. Recommended Presets

## Brouwer presets

- identity map,
- radial contraction,
- rotation plus contraction,
- swirl map,
- user-deformed map with draggable handles.

## Borsuk--Ulam presets

- projection \(f(x,y,z)=(x,y)\),
- distorted projection,
- low-frequency spherical harmonic map,
- user-painted sphere-to-disk map.

## Poincare presets

- projected constant vector field,
- rotational vector field,
- two-zero field with obvious poles,
- user-painted tangent field.

---

# 12. Desired Final Experience

The finished system should let a viewer do the following:

- choose one of the three proofs,
- manipulate a function or vector field,
- see the source-space picture,
- see the corresponding graph loops inside the solid torus,
- animate the proof parameter,
- watch a linking/twisting obstruction appear,
- see the forced event highlighted:
  - fixed point,
  - antipodal pair with equal value,
  - zero of a tangent vector field.

The main aesthetic goal is that the visuals should feel like **mathematical linked-ring magic**: the proof should become visible as an impossible unlinking, untwisting, or core-avoidance problem.
