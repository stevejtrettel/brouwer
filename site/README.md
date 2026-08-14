# Fixed Points & Linking — the website

Companion website for a paper by Thomas Banchoff and Dan Margalit proving the
Brouwer fixed point theorem, Borsuk–Ulam, and the hairy ball theorem via
linking numbers in a solid torus. Prose + interactive demos.

Astro, static, no client framework. Deployed to GitHub Pages by
`.github/workflows/pages.yml` on every push to `main`.

## Structure

- Homepage: short pitch, paper link, one card per theorem.
- `/<theorem>/` — statement of the problem and the proof idea, written as
  markdown in `src/content/theorems/` (KaTeX enabled).
- `/<theorem>/play/` — full-viewport interactive demo, embedded in an iframe.

## The demos

The demos are the rest of this repo — `demos/<name>/` over the components in
`src/`. This directory only embeds them; it never builds or copies their source.

Where an iframe points depends on how you are running things, which
`src/lib/paths.ts` decides:

- **dev** — `localhost:5173/d/<name>/`, served by the repo's own demo hub. So
  a demo edit hot-reloads inside the page you are writing.
- **build** — `/d/<name>/`, where `scripts/site.mjs` puts the built bundles.

Adding a theorem = one markdown file in `src/content/theorems/` with a `demo:`
field naming a folder under `demos/`.

## Commands

Run these from the **repo root**, not from here:

```sh
npm install && (cd site && npm install)

npm run dev          # terminal 1 — the demo hub on :5173
npm run dev:site     # terminal 2 — this site on :4321

npm run build:site   # demos + pages → site/dist
npm run preview:site
```

`npm run dev:site` serves the pages only. Without the hub in terminal 1 the
pages all work, but the play routes show an empty frame.

Do not run `astro build` directly — it produces the pages without the demos.

## Notes

- The paper's figures (`figures/`, `npm run figures`) are not part of the site.
  Nothing here shows one, so `scripts/site.mjs` does not copy them.
- An earlier standalone version of this site is at `~/Websites/brouwer-site`
  (Netlify, demo bundles synced in and committed). This supersedes it.
