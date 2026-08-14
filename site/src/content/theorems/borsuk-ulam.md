---
title: The Borsuk–Ulam Theorem
shortTitle: Borsuk–Ulam
blurb: Any continuous map from the sphere to the plane sends some pair of antipodal points to the same place.
order: 2
demo: borsuk
---

## The problem

Take the sphere $S^2$ and any continuous map $f\colon S^2 \to \mathbb{R}^2$
into the plane. The theorem says there is always a pair of **antipodal
points** — a point $x$ and its opposite $-x$ — that land on the same spot:

$$
f(x) = f(-x).
$$

The classic demonstration: at any given moment there is a pair of antipodal
points on Earth where the temperature *and* the atmospheric pressure are
both equal.

## The proof idea: linking

Introduce the auxiliary map $\bar f(x) = f(-x)$; we must find a point where
$f(x) = \bar f(x)$. As in the proof of the Brouwer theorem, we do this by
slicing the domain into circles and showing the resulting graphs must cross.
Here the slices are the **latitudes** of the sphere, described by the polar
angle $\varphi$, running from near the north pole ($\varphi$ small) to the
equator ($\varphi = \pi/2$). Restricting $f$ and $\bar f$ to each latitude
gives two graph curves in the solid torus, and a crossing at some angle
$\theta$ is exactly an antipodal coincidence.

Suppose the graphs never cross, and compare the two ends of the family:

- **Near the pole**, the latitude and its antipodal circle sit near the two
  poles, so the graphs hover near the constant curves at $f(N)$ and $f(S)$
  (which we may assume are distinct). They are two disjoint circles, plainly
  **unlinked**.
- **At the equator**, the latitude *is* its own antipodal circle, traversed
  half a turn out of phase: $\bar f_{eq}(\theta) = f_{eq}(\theta + \pi)$.
  Since the graphs never touch, in each disk slice we can draw the segment
  $\ell_\theta$ joining $\bar f_{eq}(\theta)$ to $f_{eq}(\theta)$. As
  $\theta$ goes around, these segments sweep out a strip whose two edges are
  the graphs. The half-turn phase shift means $\ell_\pi$ is $\ell_0$ with
  its endpoints reversed, so the segment rotates by an *odd* multiple of
  $\pi$ over half the trip — and by the same amount again over the second
  half. The strip therefore closes up with a nonzero number of full twists,
  and the two edge curves of such a twisted strip are **linked**. (Take a
  paper strip, put in some full twists, tape a string to each edge, and try
  to pull the strings apart.)

Unlinked near the pole, linked at the equator, deforming continuously in
between: the graphs must cross at some latitude, and that crossing is an
antipodal pair with the same image.

## Playing with it

In the interactive version you can sculpt the sphere's image in the plane,
sweep the latitude from pole to equator, and watch the strip between the two
graph curves acquire its forced twist.
