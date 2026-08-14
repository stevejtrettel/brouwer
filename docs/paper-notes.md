# Paper notes — `fpt (2).pdf`

Working notes on the paper itself (the code side lives in `roadmap.md` and
`architecture-spec.md`). Banchoff & Margalit, *Linking proofs of Brouwer,
Borsuk–Ulam, and Poincaré*, draft dated March 22 2025.

## Corrections to send to the authors

Found while reading the paper against the figure set (2026-08-11). None affect
the mathematics; all four are editorial.

1. **p. 6, twice — wrong figure reference.** "the graphs of f_r and i_r are
   disjoint planar circles lying in parallel planes, as in the left-hand side of
   Figure 4" and "If we can show that the graphs of i₁ and f₁ are linked—as
   suggested in Figure 4". Both are about Brouwer and both mean **Figure 1**;
   Figure 4 is the Borsuk ribbon.
2. **p. 9 — direction reversed.** "Since f_φ and f̄_φ go from linked to unlinked
   as φ varies from a very small positive number to π/2…". It is the other way
   round: small φ is *unlinked* (both graphs near S¹ × f(N), S¹ × f(S)) and the
   equator is *linked* (the odd twist). The Brouwer analogue on p. 7 states its
   own direction correctly, so the two sections currently disagree in form.
   The `borsuk-polar-ribbon` / `borsuk-equator-ribbon` pair makes the correct
   direction visible at a glance.
3. **Figure 4 — in-figure labels don't match the caption.** The labels read
   f_{θ/2} and f̄_{θ/2}, but the caption names the curves f_eq and f̄_eq, and θ/2
   is not a defined object in §3 (φ is the latitude, θ the longitude). Looks
   like a leftover from an earlier parametrisation.
4. **p. 8 — wording.** "the ℓ_θ changes in a continuous way" wants "the segments
   ℓ_θ".

## What the figure set is for

The paper carries five numbered figures in three visual idioms (wireframe 3D
line art, flat schematics, a hand sketch from *Flatland*). The replacement set is
one style throughout — 3D path traced — and fills the gaps a close read turned
up:

- **The forced event is never drawn.** In all three proofs the punchline is a
  moment: the r where Γ_f meets Γ_i, the φ where the two curves touch, the
  instant the graph crosses the core. The paper shows before and after, never the
  crossing. → `brouwer-crossing`, `borsuk-pair`, `poincare-crossing`.
- **§4 is starved.** The Poincaré section is the "final flourish" and carries one
  flat schematic; the construction of f_γ and the whole γ → γ̄ manoeuvre are
  unillustrated. → `poincare-frame`, `poincare-loop-family`.
- **No anatomy figure**, though all five figures assume the reader can already
  read one. → `setup-anatomy`.
- **Linking is never certified visually.** p. 6's disk-pierced-once argument is
  the paper's only actual argument for linking. → `brouwer-linking-disk`, whose
  claim is also pinned by tests in `test/linking.test.ts`.

## Open question: which figures actually go in

**22 renders exist; a paper this length wants fewer.** The full proposal was
built out so each candidate could be judged as an image rather than a
description — the selection is still to be made, with the authors. Two notes for
that conversation:

- Several are *alternatives*, not additions. `brouwer-sweep` overlaps the
  `brouwer-unlinked` / `brouwer-linked` pair; `setup-anatomy` and
  `setup-graphing` both introduce the solid torus. Cutting is mostly choosing
  between siblings.
- When the decision is made, record it in `scripts/figures.manifest.mjs` (e.g. a
  `status` field) rather than by deleting entries, so `npm run figures` can render
  just the paper set while the rest stay alive for talks.

Two figures I'd flag as weakest as staged: `setup-anatomy`'s fibre disk is faint
for something whose job is to *name* that part, and `brouwer-sweep` reads as
continuity rather than as the linking change (its caption says so).

## Conventions settled with the author

- **Colour roles are fixed across all three proofs** (`src/components/theme.ts`):
  coral = identity / γ / slice, blue = f, violet = f̄, teal = the field, gold =
  the forced event, charcoal = core, plate putty = auxiliary surfaces. This
  deliberately diverges from the paper, where red means *i* in Fig 1 but f̄ in
  Fig 3, and blue means *f* in §2–3 but the field in Fig 5 — worth raising with
  the coauthors, since it changes the existing figures' colours.
- **Renders carry no labels.** Labels go on in LaTeX (TikZ/`overpic`) over the
  image, which is why poses are pinned in `src/app/figurePose.ts`: an overlay's
  coordinates have to survive a re-render.
- **Colour only** — greyscale robustness is not a requirement.
