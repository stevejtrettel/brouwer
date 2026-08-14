---
title: The Brouwer Fixed Point Theorem
shortTitle: Brouwer
blurb: Every continuous map from the disk to itself leaves some point exactly where it started.
order: 1
demo: brouwer
---

## The problem

Take the unit disk $D^2$ — a filled-in circle — and any continuous map
$f\colon D^2 \to D^2$ from the disk to itself. The theorem says that some
point must end up exactly where it began: there is always a **fixed point**,
a point $x$ with

$$
f(x) = x.
$$

A down-to-earth demonstration: take a map of the world, and a second copy of
the same map. Crumple the second copy (without tearing!) and smush it down
on top of the first. No matter how you do it, some point of the crumpled map
lies directly above the same point on the flat one.

Nothing about the map is assumed beyond continuity — no smoothness, no
formula — which is what makes the theorem both powerful and stubborn to prove.

## The proof idea: linking

In one dimension the theorem is easy to *see*: any continuous
$f\colon [0,1] \to [0,1]$ has a graph that starts on or above the diagonal
and ends on or below it, so the graph of $f$ must cross the graph of the
identity map, and a crossing is a fixed point. We want a two-dimensional
version of "the graphs must cross" — but the graph of $f\colon D^2 \to D^2$
lives in four-dimensional space, where we can't see it.

Taking a cue from *Flatland*, we look at one slice at a time. Restrict $f$
to the circle of radius $r$; its graph — the points $(\theta, f_r(\theta))$
— is a closed curve in the **solid torus** $S^1 \times D^2$, passing through
each disk slice $\theta \times D^2$ exactly once. The identity map gives a
second curve, the graph of $i_r$. If these two curves ever intersect, they
do so in some slice $\theta$, meaning $f_r(\theta) = i_r(\theta)$ — a fixed
point on that circle.

So suppose they never intersect, and watch how they sit as $r$ varies:

- **For very small $r$**, the graph of $i_r$ hugs the core curve of the
  solid torus, while the graph of $f_r$ stays near the constant curve at
  $f(0)$ (we may assume $f(0) \neq 0$ — otherwise we already have our fixed
  point). The two curves are disjoint circles that can be pulled apart: they
  are **unlinked**.
- **At $r = 1$**, the graph of $i_1$ is the $(1,1)$-curve on the boundary of
  the solid torus. Since the graphs never touch, we can push each point of
  the graph of $f_1$ straight toward the center of its disk slice, deforming
  it onto the core curve without ever crossing the graph of $i_1$. The core
  curve is visibly linked with the $(1,1)$-curve — so the graphs at $r = 1$
  are **linked**.

Two curves cannot pass from unlinked to linked while deforming continuously
without touching — that only happens in magic tricks. So at some radius the
graphs intersect after all, and that intersection is a fixed point.

## Playing with it

In the interactive version you can sculpt the map $f$ yourself, sweep the
radius $r$, and watch the two graph curves in the solid torus until the
collision is forced to happen.
