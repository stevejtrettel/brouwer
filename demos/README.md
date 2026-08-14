# Demos

One folder = one demo = one `main.ts`. Folder name is the build name.

## Two worlds

The repo does two different jobs, and the dev server serves one at a time:

```bash
npm run dev:demos        the interactive pages that go online
npm run dev:figures      the pages where paper figures are set up and traced
npm run dev              both, behind a chooser
npm run dev <name>       one demo on its own
npm run build <name>     → dist/<name>/  (standalone, upload as-is)
```

Story demos: `graphs`, `brouwer`, `borsuk`, `poincare`, `disk`.
Each also has `<name>-lab` (every knob) and `<name>-render` (a figure page,
below), except `disk` which has only `disk-lab`.

`scene.ts` inside a story demo's folder is the shared assembly its lab and
render siblings import.

**`site/` is strictly public-facing.** The Astro companion site reads the same
figure manifest, but it is not where anything is developed, and a demo appears
there only when it is explicitly included — one at a time, as each is judged
ready. Nothing here should be shaped by what the site currently ships.

## Editing gestures

Two idioms, and an entry picks ONE:

- **modal** (the labs): a `✂`/sculpt toggle owns the whole drag while it is on,
  via `SphereView.setOrbitGate(() => !mode.on)`.
- **split by button** (the poincaré website): the brush takes the primary button
  and the first finger, OrbitControls keeps the secondary button and two-finger
  gestures. An entry doing this MUST replace the scene's default gate — the
  scene ships the modal one — with `setOrbitGate(() => !comb.active)`, or the
  sphere will refuse to turn at all.

## Paper figures

`scripts/figures.manifest.mjs` is the single source of truth: the paper's figures,
numbered and grouped, each with its panels. A panel names an existing
`?figpreset=` on a `<name>-render` page, its output filename, its aspect and its
caption. Panels are composed into a figure in LaTeX, not baked into one render.

Each `<name>-render` page is a **figure workbench** (`src/app/FigureWorkbench.ts`):
configurations as tabs, the figure inset at its true aspect, every control in a
drawer marked "not in the figure", and save/render. **Save settings** writes the
camera, scene state, output size and quality to `figure-settings/<page>.json`,
which is re-applied on load — including by the headless pass, so a saved setting
is what gets rendered. `?figpreset=<id>` opens the workbench on that tab;
`&trace=1` skips it and goes straight to the tracer.

`npm run figures` traces the set and writes `figures/<file>.png` plus a contact
sheet.

```bash
npm run figures                  # final: 768 spp @ 2× → figures/
npm run figures -- --draft       # fast review pass → figures/draft/
npm run figures -- brouwer       # just the matching figures
npm run figures:sheet -- --draft  # rebuild the page without re-rendering
npm run figures:sheet -- --embed  # self-contained copy to send to coauthors
```

Renders carry no labels: they go on in LaTeX over the image, which is why poses
are pinned in `src/app/figurePose.ts` — an overlay's coordinates have to survive a
re-render.

## Tests

`npm test` covers the math and the pointer machinery (node, seconds).
`npm run test:ui` drives these demos in Chrome (~2½ min) and asserts on rendered
canvas pixels and the kit's DOM readouts. It is sensitive to machine load — a run
immediately after a big `npm run figures` pass has failed with a dead browser
(several tests failing in 1–2 ms is that signature, not a code regression) and
passed on a clean re-run. **The demos carry no test hooks and
must not grow any**: a browser test that needs to see scene state should find a
panel whose pixels change, or a meter that already displays it.
