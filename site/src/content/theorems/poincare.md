---
title: The Can't-Comb-a-Coconut Theorem
shortTitle: Poincaré
blurb: Every continuous field of tangent vectors on the sphere must vanish somewhere — you can't comb a coconut.
order: 3
demo: poincare
---

## The problem

A **vector field** on the sphere $S^2$ is a choice, at each point, of a
vector tangent to the sphere there — think of it as a way of combing (and
trimming) the hair on a coconut. The theorem, proved by Poincaré in 1885
and often called the *hairy ball theorem*, says that there is no way to do
this continuously without trimming some hair down to nothing: every
continuous tangent vector field $v$ on $S^2$ has a **zero**, a point where

$$
v(x) = 0.
$$

As a down-to-earth consequence, there is always a place on Earth where the
wind is not blowing.

## The proof idea: linking

Suppose $v$ never vanishes (and, giving the coconut a haircut, that its
vectors have length at most $1$). For any unit-speed loop $\gamma$ on the
sphere, we can read the field along the loop: place the tangent plane at
$\gamma(\theta)$ onto the unit disk so that the direction of travel
$\gamma'(\theta)$ points along $(1,0)$, and record where $v(\gamma(\theta))$
lands. This gives a loop of vectors in the disk — a graph curve in the
solid torus, one point in each slice. The **core** of the torus corresponds
to the zero vector, so if $v$ never vanishes, the graph of every loop must
avoid the core.

Now take $\gamma$ to be a small circle just below the north pole, traversed
to the east. Zoomed in that far, the field looks nearly constant — but read
against the frame carried by a traveler going around the loop, a constant
field appears to make exactly one full turn. The graph is therefore
(close to) a $(1,1)$-curve: it **links the core once**.

Here is the ace up the sleeve: *the loop $\gamma$ can be continuously
deformed to its own reverse*. Stretch it south over the equator until it is
a small loop below the south pole, then slide it back up a longitude and
over the north pole to where it started — it returns traversed the opposite
way. The reversed loop reads the same field against a reversed frame, so
its graph is a $(1,-1)$-curve, which links the core in the **opposite**
direction.

But a curve cannot change how it links the core while deforming
continuously without crossing it — you cannot flip over one of two linked
metal rings without moving the other. So at some moment of the deformation
the graph crosses the core: at that point the field is zero after all.
Ta&nbsp;da!

## Playing with it

In the interactive version you can comb the field yourself with a brush and
hunt for its zeros. The demo also keeps a census of the zeros and their
indices — however you comb, they always add up to $2$.
